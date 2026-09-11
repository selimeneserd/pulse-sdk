import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { afterEach, describe, expect, it } from 'vitest';
import { createPulseCore, PulseConfigurationError, type Completion, type PulseCore, type PulseCoreOptions, type PulseEvent } from '../packages/core/src/index.js';
import { createHttpExporter } from '../packages/core/src/http.js';
import { createMemoryExporter, createNoopExporter } from '../packages/core/src/memory.js';

type Batch = { schema_version: 1; events: PulseEvent[] };
type Received = { body: Batch; wire: string; authorization: string | undefined; at: number };
type Responder = (request: Received, response: ServerResponse, incoming: IncomingMessage) => unknown;
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function collector(responder?: Responder) {
  const received: Received[] = [];
  let current = 0;
  let maximum = 0;
  const server = createServer(async (request, response) => {
    current++; maximum = Math.max(maximum, current);
    response.once('close', () => current--);
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const wire = Buffer.concat(chunks).toString('utf8');
    const entry = { body: JSON.parse(wire) as Batch, wire, authorization: request.headers.authorization, at: performance.now() };
    received.push(entry);
    expect(request.method).toBe('POST');
    expect(request.url).toBe('/v1/batch');
    if (responder) await responder(entry, response, request);
    else acknowledge(response, entry.body.events);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('FIXTURE_ADDRESS_UNAVAILABLE');
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  return { endpoint: `http://127.0.0.1:${address.port}/v1/batch`, received, maxConcurrent: () => maximum };
}

function acknowledge(response: ServerResponse, events: readonly PulseEvent[], extra: Record<string, unknown> = {}) {
  response.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({ accepted: events.map(event => event.event_id), duplicates: [], rejected: [], server_time: new Date().toISOString(), ...extra }));
}

function core(endpoint: string, overrides: Partial<PulseCoreOptions> = {}): PulseCore {
  const instance = createPulseCore({
    exporter: createHttpExporter({ endpoint, authorization: 'Bearer isolated-test-write-key' }), environment: 'test', enabled: true,
    ...overrides,
    queue: { flushIntervalMs: 60_000, requestTimeoutMs: 500, retryBaseMs: 5, retryMaxMs: 100, ...overrides.queue },
  });
  cleanup.push(() => instance.shutdown());
  return instance;
}

function complete(instance: PulseCore, toolName = 'fixture.tool', extra: Partial<Completion> = {}) {
  instance.complete({ toolName, durationMs: 4.25, outcome: 'tool_success', ...extra });
}

async function until(condition: () => boolean, timeout = 1000) {
  const deadline = performance.now() + timeout;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error('FIXTURE_CONDITION_TIMEOUT');
    await sleep(2);
  }
}

describe('strict source events and request context', () => {
  it('exports only immutable allowlisted contract fields; never args, results, errors, headers or raw identities', async () => {
    const fixture = await collector();
    const pulse = core(fixture.endpoint);
    const input = {
      toolName: 'fixture.tool', durationMs: 12.5, outcome: 'handler_exception' as const,
      client: { name: 'ChatGPT', version: '1.2.3', source: 'handshake' as const },
      args: { email: 'private@example.test' }, result: 'secret result', error: new Error('secret error message'),
      headers: { authorization: 'secret header' }, actor_id: 'private@example.test', properties: { secret: true },
    };
    pulse.withContext({ actorId: 'private@example.test' }, () => pulse.complete(input));
    input.toolName = 'changed_after_completion';
    input.client.name = 'secret edited client';
    await pulse.flush();
    const event = fixture.received[0]!.body.events[0]!;
    expect(event).toMatchObject({ tool_name: 'fixture.tool', duration_ms: 12.5, outcome: 'handler_exception', error_code: 'HANDLER_EXCEPTION', actor_id: null, identity_source: 'none', client_name: 'chatgpt', client_version: '1.2.3', client_source: 'handshake', release: null });
    expect(Math.abs(Date.now() - Date.parse(event.occurred_at))).toBeLessThan(2000);
    expect(event.event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(fixture.received[0]!.wire).not.toMatch(/private@|secret|changed_after|args|result|headers|properties/);
    const schema = JSON.parse(await readFile(new URL('../contracts/event-v1.schema.json', import.meta.url), 'utf8'));
    const ajv = new Ajv2020({ allErrors: true });
    (addFormats as unknown as (instance: Ajv2020) => void)(ajv);
    expect(ajv.validate(schema, event), JSON.stringify(ajv.errors)).toBe(true);
    expect(fixture.received[0]!.authorization).toBe('Bearer isolated-test-write-key');
    expect(pulse.getDiagnostics()).toMatchObject({ status: 'ready', blockReason: null, missingExporter: 0 });
  });

  it('isolates concurrent identities, separates actor/conversation domains, and restores nested context', async () => {
    const fixture = await collector();
    const pulse = core(fixture.endpoint, { identity: { secret: 'a-strong-isolated-identity-test-secret-12345', projectNamespace: 'fixture-project', epoch: 'epoch1' } });
    await Promise.all(['account-a', 'account-b'].map((actorId, index) => pulse.withContext({ actorId, conversationId: actorId }, async () => {
      await sleep(index ? 1 : 10);
      complete(pulse, `before.${index}`);
      await pulse.withContext({ actorId: 'nested' }, async () => { await sleep(1); complete(pulse, `nested.${index}`); });
      complete(pulse, `after.${index}`);
    })));
    complete(pulse, 'outside');
    await pulse.flush();
    const events = fixture.received.flatMap(request => request.body.events);
    const byTool = new Map(events.map(event => [event.tool_name, event]));
    expect(byTool.get('before.0')!.actor_id).toMatch(/^h1_[a-f0-9]{64}$/);
    expect(byTool.get('before.0')!.actor_id).toBe(byTool.get('after.0')!.actor_id);
    expect(byTool.get('before.0')!.actor_id).not.toBe(byTool.get('before.1')!.actor_id);
    expect(byTool.get('nested.0')!.actor_id).toBe(byTool.get('nested.1')!.actor_id);
    expect(byTool.get('before.0')!.actor_id).not.toBe(byTool.get('before.0')!.conversation_id);
    expect(byTool.get('outside')).toMatchObject({ actor_id: null, identity_source: 'none', identity_epoch: null, conversation_id: null });
    expect(JSON.stringify(events)).not.toMatch(/account-a|account-b|fixture-project|identity-test-secret/);
  });

  it('separates project/epoch/secret pseudonyms and ignores conversation without an authenticated account', async () => {
    const fixture = await collector();
    for (const [projectNamespace, epoch, secret] of [
      ['project-a', 'epoch1', 'strong-isolated-identity-fixture-secret-a'],
      ['project-b', 'epoch1', 'strong-isolated-identity-fixture-secret-a'],
      ['project-a', 'epoch2', 'strong-isolated-identity-fixture-secret-a'],
      ['project-a', 'epoch1', 'strong-isolated-identity-fixture-secret-b'],
    ] as const) {
      const pulse = core(fixture.endpoint, { identity: { projectNamespace, epoch, secret } });
      pulse.withContext({ actorId: 'same-account' }, () => complete(pulse));
      await pulse.flush();
    }
    const ids = fixture.received.map(request => request.body.events[0]!.actor_id);
    expect(new Set(ids).size).toBe(4);
    const pulse = core(fixture.endpoint, { identity: { projectNamespace: 'project-a', epoch: 'epoch1', secret: 'strong-isolated-identity-fixture-secret-a' } });
    pulse.withContext({ conversationId: 'session-only' }, () => complete(pulse));
    await pulse.flush();
    expect(fixture.received.at(-1)!.body.events[0]).toMatchObject({ identity_source: 'none', conversation_id: null });
  });

  it('normalizes unknown client names and unsafe versions to missing values', async () => {
    const fixture = await collector();
    const pulse = core(fixture.endpoint);
    complete(pulse, 'unknown', { client: { name: 'alice@example.test', version: 'private', source: 'handshake' } });
    complete(pulse, 'known', { client: { name: 'Cursor', version: 'alice@example.test', source: 'reported_metadata' } });
    await pulse.flush();
    expect(fixture.received[0]!.body.events).toMatchObject([
      { client_name: null, client_version: null, client_source: 'unknown' },
      { client_name: 'cursor', client_version: null, client_source: 'reported_metadata' },
    ]);
    expect(fixture.received[0]!.wire).not.toContain('alice');
  });

  it('drops invalid inputs and local getter errors without disrupting the caller', async () => {
    const fixture = await collector();
    const pulse = core(fixture.endpoint);
    for (const input of [
      { toolName: 'email@example.test', durationMs: 1, outcome: 'tool_success' },
      { toolName: 'tool', durationMs: NaN, outcome: 'tool_success' },
      { toolName: 'tool', durationMs: -1, outcome: 'tool_success' },
      { toolName: 'tool', durationMs: 86_400_001, outcome: 'tool_success' },
      { toolName: 'tool', durationMs: 1, outcome: 'not-supported' },
      { get toolName(): string { throw new Error('secret getter'); }, durationMs: 1, outcome: 'tool_success' },
    ]) expect(() => pulse.complete(input as Completion)).not.toThrow();
    await pulse.flush();
    expect(fixture.received).toHaveLength(0);
    expect(pulse.getDiagnostics().droppedInvalid).toBe(6);
    const original = new Error('customer error');
    expect(() => pulse.withContext({}, () => { throw original; })).toThrow(original);
  });

  it('snapshots accessors once so validated labels and outcomes cannot change before serialization', async () => {
    const fixture = await collector();
    const pulse = core(fixture.endpoint);
    let labelReads = 0;
    let outcomeReads = 0;
    const input = {
      get toolName() { return ++labelReads === 1 ? 'safe.label' : 'private@example.test'; },
      get outcome() { return ++outcomeReads === 1 ? 'tool_success' : 'secret.error.message'; },
      durationMs: 1,
    };
    pulse.complete(input as Completion);
    await pulse.flush();
    expect(fixture.received[0]!.body.events[0]).toMatchObject({ tool_name: 'safe.label', outcome: 'tool_success' });
    expect(fixture.received[0]!.wire).not.toMatch(/private@|secret.error/);
    expect(labelReads).toBe(1);
    expect(outcomeReads).toBe(1);
  });
});

describe('bounded HTTP exporter', () => {
  it('retries a real outage with exactly the same event UUID and serialized payload', async () => {
    let calls = 0;
    const fixture = await collector((request, response) => {
      if (++calls <= 2) response.writeHead(503).end('{}');
      else acknowledge(response, request.body.events);
    });
    const pulse = core(fixture.endpoint);
    complete(pulse);
    await pulse.flush();
    expect(fixture.received).toHaveLength(3);
    expect(new Set(fixture.received.map(request => request.wire)).size).toBe(1);
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 1, retries: 2, exporterFailures: 2, queued: 0, inFlight: 0, pendingBytes: 0 });
  });

  it('bounds permanent outages to one request plus three retries', async () => {
    const fixture = await collector((_request, response) => response.writeHead(503).end('{}'));
    const pulse = core(fixture.endpoint);
    complete(pulse);
    await pulse.flush();
    expect(fixture.received).toHaveLength(4);
    expect(pulse.getDiagnostics()).toMatchObject({ retries: 3, droppedRetries: 1, queued: 0, inFlight: 0, pendingBytes: 0 });
  });

  it('does not replay accepted, duplicate, or explicitly rejected subsets', async () => {
    let calls = 0;
    const fixture = await collector((request, response) => {
      if (++calls === 1) acknowledge(response, request.body.events.slice(0, 1), {
        duplicates: [request.body.events[1]!.event_id],
        rejected: [{ event_id: request.body.events[2]!.event_id, code: 'INVALID_EVENT', retryable: false }],
      });
      else acknowledge(response, request.body.events);
    });
    const pulse = core(fixture.endpoint);
    for (let i = 0; i < 4; i++) complete(pulse, `tool.${i}`);
    await pulse.flush();
    expect(fixture.received.map(request => request.body.events.length)).toEqual([4, 1]);
    expect(fixture.received[1]!.body.events[0]!.event_id).toBe(fixture.received[0]!.body.events[3]!.event_id);
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 2, duplicates: 1, rejected: 1, retries: 1, pendingBytes: 0 });
  });

  it('ignores malformed acknowledgement IDs and retries the original batch', async () => {
    let calls = 0;
    const fixture = await collector((request, response) => {
      if (++calls === 1) acknowledge(response, [], { accepted: ['not-a-sent-event'] });
      else acknowledge(response, request.body.events);
    });
    const pulse = core(fixture.endpoint);
    complete(pulse);
    await pulse.flush();
    expect(fixture.received).toHaveLength(2);
    expect(fixture.received[1]!.wire).toBe(fixture.received[0]!.wire);
    expect(pulse.getDiagnostics().accepted).toBe(1);
  });

  it.each(['2026-02-30T12:00:00Z','2026-09-11T99:00:00Z','2026-09-11T12:00:00Z EXTRA'])('retries acknowledgements with invalid server_time %s', async serverTime => {
    let calls=0;
    const fixture=await collector((request,response)=>{if(++calls===1)acknowledge(response,request.body.events,{server_time:serverTime});else acknowledge(response,request.body.events);});
    const pulse=core(fixture.endpoint);complete(pulse);await pulse.flush();
    expect(fixture.received).toHaveLength(2);expect(pulse.getDiagnostics()).toMatchObject({accepted:1,retries:1});
  });

  it('splits 413 batches without modifying or duplicating event IDs', async () => {
    const fixture = await collector((request, response) => {
      if (request.body.events.length > 1) response.writeHead(413).end('{}');
      else acknowledge(response, request.body.events);
    });
    const pulse = core(fixture.endpoint);
    for (let i = 0; i < 3; i++) complete(pulse, `tool.${i}`);
    await pulse.flush();
    expect(fixture.received.map(request => request.body.events.length)).toEqual([3, 2, 1, 1, 1]);
    expect(new Set(fixture.received.flatMap(request => request.body.events.map(event => event.event_id))).size).toBe(3);
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 3, droppedOversize: 0, pendingBytes: 0 });
  });

  it('drops a single event rejected with 413', async () => {
    const fixture = await collector((_request, response) => response.writeHead(413).end('{}'));
    const pulse = core(fixture.endpoint);
    complete(pulse);
    await pulse.flush();
    expect(fixture.received).toHaveLength(1);
    expect(pulse.getDiagnostics().droppedOversize).toBe(1);
  });

  it('preserves the consumed per-event retry budget when 413 splits a retried batch', async () => {
    let calls = 0;
    const fixture = await collector((request, response) => {
      calls++;
      if (calls === 2 && request.body.events.length === 2) response.writeHead(413).end('{}');
      else response.writeHead(503).end('{}');
    });
    const pulse = core(fixture.endpoint, { queue: { maxRetries: 1 } });
    complete(pulse, 'one'); complete(pulse, 'two');
    await pulse.flush();
    expect(fixture.received.map(request => request.body.events.length)).toEqual([2, 2, 1, 1]);
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 0, retries: 1, droppedRetries: 2, pendingBytes: 0 });
  });

  it.each([401, 403])('stops retrying and future requests after HTTP %i', async status => {
    const fixture = await collector((_request, response) => response.writeHead(status).end('{}'));
    const pulse = core(fixture.endpoint);
    complete(pulse);
    await pulse.flush();
    complete(pulse);
    await pulse.flush();
    expect(fixture.received).toHaveLength(1);
    expect(pulse.getDiagnostics()).toMatchObject({ droppedAuth: 2, retries: 0, pendingBytes: 0 });
  });

  it('treats quota as generic retryable 429 and respects rate-limit Retry-After within a bounded horizon', async () => {
    const quota = await collector((_request, response) => response.writeHead(429).end(JSON.stringify({ code: 'QUOTA_EXCEEDED' })));
    const quotaPulse = core(quota.endpoint);
    complete(quotaPulse); await quotaPulse.flush(); complete(quotaPulse); await quotaPulse.flush();
    expect(quota.received).toHaveLength(8);
    expect(quotaPulse.getDiagnostics()).toMatchObject({ droppedQuota: 0, droppedRetries: 2, status: 'ready' });
    let calls = 0;
    const rate = await collector((request, response) => {
      if (++calls === 1) response.writeHead(429, { 'retry-after': '0.04' }).end(JSON.stringify({ code: 'RATE_LIMITED' }));
      else acknowledge(response, request.body.events);
    });
    const ratePulse = core(rate.endpoint);
    complete(ratePulse); await ratePulse.flush();
    expect(rate.received[1]!.at - rate.received[0]!.at).toBeGreaterThanOrEqual(35);
    expect(ratePulse.getDiagnostics().accepted).toBe(1);
    const far = await collector((_request, response) => response.writeHead(429, { 'retry-after': '3600' }).end('{}'));
    const farPulse = core(far.endpoint);
    complete(farPulse); await farPulse.flush();
    expect(far.received).toHaveLength(1);
    expect(farPulse.getDiagnostics().droppedRetries).toBe(1);
  });

  it('keeps concurrent flush single-flight and includes the in-flight batch in count and byte bounds', async () => {
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    const fixture = await collector(async (request, response) => {
      if (++calls === 1) await hold;
      acknowledge(response, request.body.events);
    });
    const pulse = core(fixture.endpoint, { queue: { maxEvents: 3, maxBytes: 4000, batchMaxEvents: 2 } });
    complete(pulse, 'one'); complete(pulse, 'two');
    const first = pulse.flush();
    await until(() => fixture.received.length === 1);
    complete(pulse, 'oldest.unsent'); complete(pulse, 'newest.unsent');
    expect(pulse.getDiagnostics()).toMatchObject({ queued: 1, inFlight: 2, droppedOverflow: 1 });
    expect(pulse.getDiagnostics().pendingBytes).toBeLessThanOrEqual(4000);
    const second = pulse.flush();
    release();
    await Promise.all([first, second]);
    await pulse.flush();
    expect(fixture.maxConcurrent()).toBe(1);
    expect(fixture.received.flatMap(request => request.body.events.map(event => event.tool_name))).toEqual(['one', 'two', 'newest.unsent']);
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 3, pendingBytes: 0 });
  });

  it('drops oldest unsent events at the byte cap and rejects events larger than one batch', async () => {
    const fixture = await collector();
    const pulse = core(fixture.endpoint, { queue: { maxBytes: 1500 } });
    for (let i = 0; i < 10; i++) complete(pulse, `bounded.${i}`);
    expect(pulse.getDiagnostics().pendingBytes).toBeLessThanOrEqual(1500);
    expect(pulse.getDiagnostics().droppedOverflow).toBeGreaterThan(0);
    await pulse.flush();
    const names = fixture.received.flatMap(request => request.body.events.map(event => event.tool_name));
    expect(names.at(-1)).toBe('bounded.9');
    expect(names).not.toContain('bounded.0');
    const tiny = core(fixture.endpoint, { queue: { batchMaxBytes: 100 } });
    complete(tiny);
    await tiny.flush();
    expect(tiny.getDiagnostics()).toMatchObject({ droppedOversize: 1, requests: 0 });
  });

  it.each(['flush', 'shutdown'] as const)('drains the caller snapshot when %s joins an older in-flight flush', async operation => {
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    const fixture = await collector(async (request, response) => {
      if (++calls === 1) await hold;
      acknowledge(response, request.body.events);
    });
    const pulse = core(fixture.endpoint);
    complete(pulse, 'before.first.flush');
    const first = pulse.flush();
    await until(() => fixture.received.length === 1);
    complete(pulse, 'before.second.flush');
    const second = pulse[operation]();
    release();
    await Promise.all([first, second]);
    expect(fixture.received.flatMap(request => request.body.events.map(event => event.tool_name))).toEqual(['before.first.flush', 'before.second.flush']);
    expect(fixture.maxConcurrent()).toBe(1);
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 2, droppedShutdown: 0, queued: 0, inFlight: 0, pendingBytes: 0 });
  });

  it('respects count and wire-byte batch limits for 201 events', async () => {
    const fixture = await collector();
    const pulse = core(fixture.endpoint);
    for (let i = 0; i < 201; i++) complete(pulse, `batch.${i}`);
    await pulse.flush();
    expect(fixture.received.map(request => request.body.events.length)).toEqual([100, 100, 1]);
    expect(fixture.received.every(request => Buffer.byteLength(request.wire) <= 256 * 1024)).toBe(true);
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 201, pendingBytes: 0 });
  });

  it('bounds oversized or invalid response bodies and preserves the original event on retry', async () => {
    let calls = 0;
    const fixture = await collector((request, response) => {
      if (++calls === 1) response.writeHead(202).end('x'.repeat(128 * 1024));
      else acknowledge(response, request.body.events);
    });
    const pulse = core(fixture.endpoint);
    complete(pulse); await pulse.flush();
    expect(fixture.received).toHaveLength(2);
    expect(fixture.received[0]!.wire).toBe(fixture.received[1]!.wire);
    expect(pulse.getDiagnostics().accepted).toBe(1);
  });

  it('retries cooperative HTTP timeouts without marking the exporter unresponsive', async () => {
    const fixture = await collector(() => {});
    const pulse = core(fixture.endpoint, {queue:{requestTimeoutMs:10,maxRetries:1}});
    complete(pulse);await pulse.flush();
    expect(fixture.received).toHaveLength(2);
    expect(pulse.getDiagnostics()).toMatchObject({requests:2,retries:1,droppedRetries:1,droppedTimeout:0,blockReason:null,status:'ready'});
  });

  it('bounds request timeout, explicit flush wait, and shutdown without process hooks', async () => {
    const fixture = await collector(() => { /* Explicit hanging local collector fixture. */ });
    const pulse = core(fixture.endpoint, { queue: { requestTimeoutMs: 40 } });
    const beforeListeners = ['beforeExit', 'exit', 'SIGINT', 'SIGTERM'].map(event => process.listenerCount(event));
    complete(pulse);
    const start = performance.now();
    await pulse.flush({ timeoutMs: 5 });
    expect(performance.now() - start).toBeLessThan(100);
    await until(() => fixture.received.length > 0);
    const closing = performance.now();
    await Promise.all([pulse.shutdown(), pulse.shutdown()]);
    expect(performance.now() - closing).toBeLessThan(200);
    expect(pulse.getDiagnostics()).toMatchObject({ queued: 0, inFlight: 0, pendingBytes: 0 });
    complete(pulse);
    expect(pulse.getDiagnostics().droppedShutdown).toBeGreaterThan(0);
    expect(['beforeExit', 'exit', 'SIGINT', 'SIGTERM'].map(event => process.listenerCount(event))).toEqual(beforeListeners);
  });

  it('honors explicit disable with no requests or telemetry queue', async () => {
    const fixture = await collector();
    for (const environment of ['development', 'test'] as const) {
      const pulse = createPulseCore({ environment, enabled: false, exporter: createHttpExporter({endpoint: fixture.endpoint}), queue: { flushIntervalMs: 1 } });
      expect(pulse.enabled).toBe(false);
      complete(pulse);
      await pulse.flush();
      await pulse.shutdown();
      expect(pulse.getDiagnostics()).toMatchObject({ observed: 0, queued: 0, requests: 0, pendingBytes: 0 });
    }
    await sleep(10);
    expect(fixture.received).toHaveLength(0);
    expect(createPulseCore({ environment: 'test' }).enabled).toBe(false);
  });

  it('automatically flushes a live Node queue on the configured timer', async () => {
    const fixture = await collector();
    const pulse = core(fixture.endpoint, { queue: { flushIntervalMs: 5 } });
    complete(pulse);
    await until(() => pulse.getDiagnostics().accepted === 1);
    expect(fixture.received).toHaveLength(1);
  });
});

describe('configuration validation', () => {
  const invalidConfigurations: unknown[] = [
    { environment: 'not-supported' },
    { environment: 'production', exporter: {} },
    { environment: 'test', enabled: 'true' },
    { environment: 'production', writeKey: 'key', endpoint: 'http://example.test/v1/batch' },
    { environment: 'production', writeKey: 'key', endpoint: 'https://private:secret@example.test/v1/batch' },
    { environment: 'production', writeKey: 'key', endpoint: 'https://example.test/v1/batch?secret=value' },
    { environment: 'test', release: 'private@example.test' },
    { environment: 'test', identity: { secret: 'short', projectNamespace: 'project', epoch: 'epoch1' } },
    { environment: 'test', queue: { maxEvents: 1001 } },
    { environment: 'test', queue: { batchMaxEvents: 101 } },
    { environment: 'test', queue: { batchMaxBytes: 262145 } },
    { environment: 'test', queue: { maxRetries: 4 } },
    { environment: 'test', queue: { requestTimeoutMs: Number.POSITIVE_INFINITY } },
    { environment: 'test', queue: { flushIntervalMs: NaN } },
    { environment: 'test', queue: { maxBytes: -1 } },
    { environment: 'test', queue: { retryBaseMs: 0 } },
    { environment: 'test', queue: { constructor: 5 } },
  ];
  for (const [index, options] of invalidConfigurations.entries()) it(`rejects invalid options using non-sensitive localized code errors ${index}`, () => {
    let error: unknown;
    try { createPulseCore(options as PulseCoreOptions); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(PulseConfigurationError);
    expect((error as PulseConfigurationError).message).toBe('PULSE_INVALID_CONFIGURATION');
    expect((error as PulseConfigurationError).getMessage('en')).toContain('configuration');
    expect((error as PulseConfigurationError).getMessage('tr')).toContain('yapılandırma');
    expect(JSON.stringify(error)).not.toContain('secret');
  });

  it('validates nonfinite and negative flush deadlines', async () => {
    const pulse = createPulseCore({ environment: 'test' });
    await expect(pulse.flush({ timeoutMs: -1 })).rejects.toBeInstanceOf(PulseConfigurationError);
    await expect(pulse.flush({ timeoutMs: NaN })).rejects.toBeInstanceOf(PulseConfigurationError);
    await pulse.shutdown();
  });
});
