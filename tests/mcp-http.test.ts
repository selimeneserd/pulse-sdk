import { createHttpExporter } from '@reviseflow/pulse-core/http';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { z } from 'zod';
import { CLIENT_INFO_META_KEY, inputRequired, type McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { createPulse } from '@reviseflow/pulse';
import { startFixtureCollector, startMcpFixture } from '../examples/fixture.js';

const cleanups: Array<() => Promise<void>> = [];
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(complete => { resolve = complete; });
  return { promise, resolve };
}
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function collectorAndPulse(overrides: Partial<Parameters<typeof createPulse>[0]> = {}) {
  const collector = await startFixtureCollector();
  cleanups.push(collector.close);
  const pulse = createPulse({
    exporter: createHttpExporter({ endpoint: collector.endpoint, authorization: `Bearer ${collector.writeKey}` }),
    environment: 'test',
    enabled: true,
    queue: { flushIntervalMs: 60_000, requestTimeoutMs: 50, maxRetries: 0 },
    ...overrides,
  });
  cleanups.push(() => pulse.shutdown());
  return { collector, pulse };
}

async function pair(register: (server: McpServer) => void, pulse: ReturnType<typeof createPulse>) {
  const plain = await startMcpFixture(register);
  const wrapped = await startMcpFixture(register, { pulse });
  cleanups.push(() => plain.close(), () => wrapped.close());
  return { plain: await plain.connect(), wrapped: await wrapped.connect() };
}

describe('official MCP 2.0.0: real Streamable HTTP, protocol 2026-07-28', () => {
  it('preserves caller results and listing metadata; emits one strict sanitized event for each handler', async () => {
    const { collector, pulse } = await collectorAndPulse();
    const originalError = new Error('PRIVATE_ERROR_CANARY');
    const clients = await pair(server => {
      server.registerTool('sum', {
        title: 'Sum / Toplam',
        description: 'Add numbers. / Sayıları topla.',
        inputSchema: z.object({ a: z.number(), b: z.number() }),
        outputSchema: z.object({ sum: z.number() }),
        annotations: { readOnlyHint: true },
        _meta: { 'fixture/documentation': 'not-telemetry' },
      }, ({ a, b }) => ({ content: [{ type: 'text', text: String(a + b) }], structuredContent: { sum: a + b } }));
      server.registerTool('tool_error', {}, () => ({ content: [{ type: 'text', text: 'PRIVATE_RESULT_CANARY' }], isError: true }));
      server.registerTool('exception', {}, () => { throw originalError; });
    }, pulse);
    expect(clients.wrapped.getProtocolEra()).toBe('modern');
    expect(await clients.wrapped.listTools()).toEqual(await clients.plain.listTools());
    expect(pulse.getDiagnostics().observed).toBe(0);
    for (const call of [
      { name: 'sum', arguments: { a: 2, b: 3 } },
      { name: 'tool_error' },
      { name: 'exception' },
    ]) {
      expect(await clients.wrapped.callTool(call)).toEqual(await clients.plain.callTool(call));
    }
    await pulse.flush();
    expect(collector.events.map(event => event.outcome)).toEqual(['tool_success', 'tool_error', 'handler_exception']);
    expect(new Set(collector.events.map(event => event.event_id)).size).toBe(3);
    const validator = new Ajv2020({ strict: true });
    addFormats.default(validator);
    const schema = JSON.parse(await readFile(new URL('../contracts/event-v1.schema.json', import.meta.url), 'utf8'));
    const validate = validator.compile(schema);
    for (const event of collector.events) {
      expect(validate(event), JSON.stringify(validate.errors)).toBe(true);
      expect(event.duration_ms).toBeGreaterThanOrEqual(0);
      expect(event.identity_source).toBe('none');
      expect(event.actor_id).toBeNull();
      expect(event.release).toBeNull();
    }
    const exported = collector.requests.join('');
    expect(exported).not.toContain('PRIVATE_');
    expect(exported).not.toContain('not-telemetry');
  });

  it('leaves unknown tools and rejected input validation outside the observed handler boundary', async () => {
    const { collector, pulse } = await collectorAndPulse();
    const clients = await pair(server => {
      server.registerTool('validated', { inputSchema: z.object({ count: z.number() }) }, () => ({ content: [] }));
    }, pulse);
    const invalid = { name: 'validated', arguments: { count: 'PRIVATE_ARGUMENT_CANARY' } };
    const wrappedResult = await clients.wrapped.callTool(invalid);
    expect(wrappedResult).toEqual(await clients.plain.callTool(invalid));
    expect(wrappedResult.isError).toBe(true);
    for (const client of [clients.wrapped, clients.plain]) {
      await expect(client.callTool({ name: 'does_not_exist' })).rejects.toMatchObject({ code: -32602 });
    }
    await pulse.flush();
    expect(pulse.getDiagnostics().observed).toBe(0);
    expect(collector.requests).toHaveLength(0);
  });

  it('preserves upstream output-schema rejection after a successful handler return', async () => {
    const { collector, pulse } = await collectorAndPulse();
    const clients = await pair(server => {
      server.registerTool('invalid_output', { outputSchema: z.object({ count: z.number() }) }, () => ({
        content: [], structuredContent: { count: 'PRIVATE_OUTPUT_CANARY' },
      }));
    }, pulse);
    const result = await clients.wrapped.callTool({ name: 'invalid_output' });
    expect(result).toEqual(await clients.plain.callTool({ name: 'invalid_output' }));
    expect(result.isError).toBe(true);
    await pulse.flush();
    // This intentionally records the handler return, not a later SDK validation outcome.
    expect(collector.events).toHaveLength(1);
    expect(collector.events[0]?.outcome).toBe('tool_success');
    expect(collector.requests.join('')).not.toContain('PRIVATE_OUTPUT_CANARY');
  });

  it('records input_required separately through the official client manual driver', async () => {
    const { collector, pulse } = await collectorAndPulse();
    const expected = inputRequired({ requestState: 'public-fixture-state' });
    const register = (server: McpServer) => {
      server.registerTool('requires_input', {}, () => expected);
    };
    const plain = await startMcpFixture(register);
    const wrapped = await startMcpFixture(register, { pulse });
    cleanups.push(() => plain.close(), () => wrapped.close());
    const plainClient = await plain.connect({ clientOptions: { inputRequired: { autoFulfill: false } } });
    const wrappedClient = await wrapped.connect({ clientOptions: { inputRequired: { autoFulfill: false } } });
    const call = { name: 'requires_input' };
    const result = await wrappedClient.callTool(call, { allowInputRequired: true });
    expect(result).toEqual(await plainClient.callTool(call, { allowInputRequired: true }));
    expect(result).toMatchObject(expected);
    await pulse.flush();
    expect(collector.events.map(event => event.outcome)).toEqual(['input_required']);
    expect(collector.requests.join('')).not.toContain('public-fixture-state');
  });

  it('preserves unsupported result handling without classifying it as success', async () => {
    const { collector, pulse } = await collectorAndPulse();
    const clients = await pair(server => {
      // Runtime-only fixture: intentionally invalid result exercises the honest boundary.
      server.registerTool('unsupported', {}, () => ({ resultType: 'future_state' }) as unknown as CallToolResult);
    }, pulse);
    const settle = async (client: typeof clients.wrapped) => {
      try { return { result: await client.callTool({ name: 'unsupported' }) }; }
      catch (error) {
        const failure = error as Error & { code?: number };
        return { error: { name: failure.name, message: failure.message, code: failure.code } };
      }
    };
    expect(await settle(clients.wrapped)).toEqual(await settle(clients.plain));
    await pulse.flush();
    expect(collector.events.map(event => event.outcome)).toEqual(['unknown']);
  });

  it('isolates simultaneous identities from server-verified local test authentication', async () => {
    const { collector, pulse } = await collectorAndPulse({
      identity: { secret: 'test-only-identity-secret-32-bytes-long', projectNamespace: 'fixture-project', epoch: 'v1' },
    });
    const fixture = await startMcpFixture(server => {
      for (const name of ['alpha', 'beta']) {
        server.registerTool(name, { inputSchema: z.object({ delay: z.number() }) }, async ({ delay }) => {
          await new Promise(resolve => setTimeout(resolve, delay));
          return { content: [{ type: 'text', text: name }] };
        });
      }
    }, { pulse, testAuth: new Map([
      ['Bearer test_token_alpha', 'PRIVATE_ACCOUNT_ALPHA'],
      ['Bearer test_token_beta', 'PRIVATE_ACCOUNT_BETA'],
    ]) });
    cleanups.push(() => fixture.close());
    const alpha = await fixture.connect({ bearerToken: 'test_token_alpha' });
    const beta = await fixture.connect({ bearerToken: 'test_token_beta' });
    await expect(fixture.connect({ bearerToken: 'invalid_test_token' })).rejects.toBeDefined();
    await Promise.all([
      alpha.callTool({ name: 'alpha', arguments: { delay: 20 } }),
      beta.callTool({ name: 'beta', arguments: { delay: 1 } }),
      alpha.callTool({ name: 'alpha', arguments: { delay: 1 } }),
      beta.callTool({ name: 'beta', arguments: { delay: 15 } }),
    ]);
    await pulse.flush();
    expect(collector.events).toHaveLength(4);
    const alphaIds = new Set(collector.events.filter(event => event.tool_name === 'alpha').map(event => event.actor_id));
    const betaIds = new Set(collector.events.filter(event => event.tool_name === 'beta').map(event => event.actor_id));
    expect(alphaIds.size).toBe(1);
    expect(betaIds.size).toBe(1);
    expect([...alphaIds][0]).toMatch(/^h1_[0-9a-f]{64}$/);
    expect([...alphaIds][0]).not.toBe([...betaIds][0]);
    expect(collector.events.every(event => event.identity_source === 'app_account')).toBe(true);
    expect(collector.requests.join('')).not.toContain('PRIVATE_ACCOUNT_');
    expect(collector.requests.join('')).not.toContain('test_token_');
  });

  it('keeps metadata collection opt-in and unknown self-reported clients unknown', async () => {
    const { collector, pulse } = await collectorAndPulse({ captureClient: true });
    const fixture = await startMcpFixture(server => {
      server.registerTool('ping', {}, () => ({ content: [] }));
    }, { pulse });
    cleanups.push(() => fixture.close());
    const unknown = await fixture.connect({ clientInfo: { name: 'private-client@example.invalid', version: 'PRIVATE_VERSION' } });
    await unknown.callTool({ name: 'ping' });
    const known = await fixture.connect({ clientInfo: { name: 'claude-desktop', version: '1.2.3' } });
    await known.callTool({ name: 'ping' });
    // Explicitly suppress the optional clientInfo key through the official
    // client's documented per-request envelope override, not a forged host.
    await known.callTool({ name: 'ping', _meta: { [CLIENT_INFO_META_KEY]: undefined } });
    // The official client allows user _meta overrides; malformed metadata must be
    // rejected before handler execution instead of being converted into identity.
    await expect(known.callTool({ name: 'ping', _meta: { [CLIENT_INFO_META_KEY]: { name: 42 } } })).rejects.toBeDefined();
    await pulse.flush();
    expect(collector.events).toHaveLength(3);
    expect(collector.events[0]).toMatchObject({ client_name: null, client_source: 'unknown', client_version: null });
    expect(collector.events[1]).toMatchObject({ client_name: 'claude-desktop', client_source: 'reported_metadata', client_version: '1.2.3' });
    expect(collector.events[2]).toMatchObject({ client_name: null, client_source: 'unknown', client_version: null });
    expect(collector.requests.join('')).not.toContain('private-client');
    expect(collector.requests.join('')).not.toContain('PRIVATE_VERSION');
  });

  it('does not inspect or export large argument/result/error payloads or arbitrary metadata', async () => {
    const { collector, pulse } = await collectorAndPulse();
    const canary = 'SECRET_PAYLOAD_CANARY_'.repeat(16_000);
    const clients = await pair(server => {
      server.registerTool('large', { inputSchema: z.object({ payload: z.string() }) }, ({ payload }) => ({
        content: [{ type: 'text', text: payload }], _meta: { private: canary },
      }));
      server.registerTool('large_error', {}, () => { throw new Error(canary); });
    }, pulse);
    const call = { name: 'large', arguments: { payload: canary }, _meta: { private: canary } };
    expect(await clients.wrapped.callTool(call)).toEqual(await clients.plain.callTool(call));
    expect(await clients.wrapped.callTool({ name: 'large_error' })).toEqual(await clients.plain.callTool({ name: 'large_error' }));
    await pulse.flush();
    expect(collector.events).toHaveLength(2);
    expect(collector.requests.join('')).not.toContain('SECRET_PAYLOAD_CANARY_');
    expect(collector.requests.join('').length).toBeLessThan(4_000);
  });

  it('disabled analytics performs no telemetry requests and preserves the original caller result', async () => {
    const { collector, pulse } = await collectorAndPulse({ enabled: false });
    const clients = await pair(server => {
      server.registerTool('disabled', {}, () => ({ content: [{ type: 'text', text: 'same' }] }));
    }, pulse);
    expect(await clients.wrapped.callTool({ name: 'disabled' })).toEqual(await clients.plain.callTool({ name: 'disabled' }));
    await pulse.flush();
    expect(collector.requests).toHaveLength(0);
    expect(pulse.getDiagnostics().observed).toBe(0);
  });

  it('collector outage does not delay or change the tool result', async () => {
    const { collector, pulse } = await collectorAndPulse();
    collector.setStatus(503);
    const clients = await pair(server => {
      server.registerTool('available', {}, () => ({ content: [{ type: 'text', text: 'available' }] }));
    }, pulse);
    expect(await clients.wrapped.callTool({ name: 'available' })).toEqual(await clients.plain.callTool({ name: 'available' }));
    // No exporter request has been made when the result returns; flush is separate.
    expect(collector.requests).toHaveLength(0);
    await pulse.flush();
    expect(collector.events).toHaveLength(0);
    expect(collector.requests).toHaveLength(1);
    expect(pulse.getDiagnostics().exporterFailures).toBeGreaterThan(0);
  });

  it('observes cancellation via the real HTTP request signal exactly once', async () => {
    const { collector, pulse } = await collectorAndPulse();
    async function cancelCall(instrumented: boolean) {
      const started = deferred();
      const aborted = deferred();
      const fixture = await startMcpFixture(server => {
        server.registerTool('cancellable', {}, async context => {
          started.resolve();
          await new Promise<void>((_resolve, reject) => {
            const cancel = () => {
              aborted.resolve();
              reject(new Error('PRIVATE_CANCEL_CANARY'));
            };
            if (context.mcpReq.signal.aborted) cancel();
            else context.mcpReq.signal.addEventListener('abort', cancel, { once: true });
          });
          return { content: [] };
        });
      }, instrumented ? { pulse } : {});
      cleanups.push(() => fixture.close());
      const client = await fixture.connect();
      const controller = new AbortController();
      const pending = client.callTool({ name: 'cancellable' }, { signal: controller.signal }).then(
        () => ({ unexpectedlyResolved: true }),
        (error: unknown) => {
          const failure = error as Error & { code?: number };
          return { name: failure.name, code: failure.code, message: failure.message };
        },
      );
      await started.promise;
      controller.abort();
      const rejection = await pending;
      expect(rejection).not.toHaveProperty('unexpectedlyResolved');
      await aborted.promise;
      return rejection;
    }
    expect(await cancelCall(true)).toEqual(await cancelCall(false));
    await expect.poll(() => pulse.getDiagnostics().observed).toBe(1);
    await pulse.flush();
    expect(collector.events.map(event => event.outcome)).toEqual(['cancelled']);
    expect(collector.requests.join('')).not.toContain('PRIVATE_CANCEL_CANARY');
  });
});
