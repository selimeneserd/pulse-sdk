import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPulseCore, type PulseCore, type PulseCoreOptions, type PulseEvent, type PulseExporter, type PulseExportResult } from '../packages/core/src/index.js';
import { createMemoryExporter, createNoopExporter } from '../packages/core/src/memory.js';
import { createJsonlExporter } from '../packages/core/src/jsonl.js';
import { createHttpExporter } from '../packages/core/src/http.js';

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close(); });
const acknowledge = (events: readonly PulseEvent[]): PulseExportResult => ({ accepted: events.map(event => event.event_id), duplicates: [], rejected: [] });
function core(exporter?: PulseExporter, options: Partial<PulseCoreOptions> = {}) {
  const pulse = createPulseCore({ environment: 'development', ...(exporter ? { exporter } : {}), ...options, queue: { flushIntervalMs: 60_000, requestTimeoutMs: 100, retryBaseMs: 1, retryMaxMs: 10, ...options.queue } });
  cleanup.push(() => pulse.shutdown());
  return pulse;
}
function complete(pulse: PulseCore, toolName = 'fixture.tool') { pulse.complete({ toolName, durationMs: 1, outcome: 'tool_success' }); }
async function until(condition: () => boolean) { for (let i = 0; i < 200; i++) { if (condition()) return; await sleep(2); } throw new Error('FIXTURE_WAIT_EXPIRED'); }

describe('explicit exporter and safe lifecycle', () => {
  it('distinguishes missing exporter, intentional disable and explicit no-op without network requests', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('NO_NETWORK_EXPECTED'));
    const missing = core();
    const disabled = core(undefined, { enabled: false });
    const noop = core(createNoopExporter());
    complete(missing); complete(disabled); complete(noop);
    await Promise.all([missing.flush(), disabled.flush(), noop.flush()]);
    expect(missing.enabled).toBe(false);
    expect(missing.getDiagnostics()).toMatchObject({ status: 'disabled', blockReason: 'missing_exporter', missingExporter: 1, observed: 0 });
    expect(disabled.getDiagnostics()).toMatchObject({ status: 'disabled', blockReason: null, missingExporter: 0 });
    expect(noop.enabled).toBe(true);
    expect(noop.getDiagnostics()).toMatchObject({ status: 'ready', missingExporter: 0, accepted: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('starts missing-exporter instance after explicit reconfigure, while explicit disable stays disabled', async () => {
    const memory = createMemoryExporter();
    const pulse = core();
    pulse.reconfigure({ exporter: memory });
    complete(pulse); await pulse.flush();
    expect(memory.getEvents()).toHaveLength(1);
    expect(pulse.getDiagnostics()).toMatchObject({ status: 'ready', missingExporter: 0 });
    const disabled = core(undefined, { enabled: false });
    disabled.reconfigure({ exporter: memory }); complete(disabled); await disabled.flush();
    expect(disabled.enabled).toBe(false);
    expect(memory.getEvents()).toHaveLength(1);
  });

  it('bounds retained memory and returns immutable snapshots', async () => {
    const memory = createMemoryExporter({ maxEvents: 2 });
    const pulse = core(memory);
    complete(pulse, 'one'); complete(pulse, 'two'); complete(pulse, 'three'); await pulse.flush();
    const events = memory.getEvents();
    expect(events.map(event => event.tool_name)).toEqual(['two', 'three']);
    expect(Object.isFrozen(events)).toBe(true);
    expect(Object.isFrozen(events[0])).toBe(true);
    memory.clear();
    expect(memory.getEvents()).toHaveLength(0);
    expect(events).toHaveLength(2);
  });

  it('drops observations made while paused, retains prior bounded queue, and resumes without rewrapping', async () => {
    const memory = createMemoryExporter(); const pulse = core(memory);
    complete(pulse, 'before.pause'); pulse.pause(); complete(pulse, 'while.paused');
    await pulse.flush({ timeoutMs: 5 });
    expect(memory.getEvents()).toHaveLength(0);
    expect(pulse.getDiagnostics()).toMatchObject({ status: 'paused', queued: 1, droppedPaused: 1 });
    pulse.resume(); complete(pulse, 'after.resume'); await pulse.flush();
    expect(memory.getEvents().map(event => event.tool_name)).toEqual(['before.pause', 'after.resume']);
  });

  it('recovers auth blocks by resume and exporter replacement; discarded observations stay discarded', async () => {
    let authorized = false;
    const pulse = core({ export: events => authorized ? acknowledge(events) : { accepted: [], duplicates: [], rejected: [], blocked: 'auth' } });
    complete(pulse, 'bad.key'); await pulse.flush(); complete(pulse, 'blocked');
    expect(pulse.getDiagnostics()).toMatchObject({ status: 'blocked', blockReason: 'auth', droppedAuth: 2 });
    authorized = true; pulse.resume(); complete(pulse, 'fixed.key'); await pulse.flush();
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 1, droppedAuth: 2, blockReason: null });
    authorized = false; complete(pulse, 'revoked'); await pulse.flush();
    const memory = createMemoryExporter(); pulse.reconfigure({ exporter: memory });
    complete(pulse, 'reconfigured'); await pulse.flush();
    expect(memory.getEvents().map(event => event.tool_name)).toEqual(['reconfigured']);
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 2, droppedAuth: 3 });
  });

  it('does not let stale in-flight auth failure block a newly configured exporter', async () => {
    let finish!: (result: PulseExportResult) => void;
    let started = false;
    const pulse = core({ export() { started = true; return new Promise(resolve => { finish = resolve; }); } });
    complete(pulse, 'during.rotation'); const flushing = pulse.flush(); await until(() => started);
    const memory = createMemoryExporter(); pulse.reconfigure({exporter:memory});
    finish({accepted:[],duplicates:[],rejected:[],blocked:'auth'}); await flushing;
    complete(pulse, 'after.rotation'); await pulse.flush();
    expect(memory.getEvents().map(event => event.tool_name)).toEqual(['during.rotation','after.rotation']);
    expect(pulse.getDiagnostics()).toMatchObject({status:'ready',blockReason:null,accepted:2,droppedAuth:0});
  });

  it('snapshots configuration accessors once before passing events to custom exporters', async () => {
    let releaseReads=0; let epochReads=0; const events:PulseEvent[]=[];
    const pulse=createPulseCore({environment:'test',exporter:{export(batch){events.push(...batch);return acknowledge(batch);}},
      get release(){releaseReads++;return releaseReads===1?'safe.release':'PRIVATE_CONFIG_SENTINEL';},
      identity:{secret:'public-long-enough-identity-fixture-secret',projectNamespace:'test',get epoch(){epochReads++;return epochReads===1?'safe_epoch':'PRIVATE_CONFIG_SENTINEL';}},
    });
    cleanup.push(()=>pulse.shutdown());
    pulse.withContext({actorId:'public-test-account'},()=>complete(pulse));await pulse.flush();
    expect(releaseReads).toBe(1);expect(epochReads).toBe(1);expect(events[0]).toMatchObject({release:'safe.release',identity_epoch:'safe_epoch'});
    expect(JSON.stringify(events)).not.toContain('PRIVATE_CONFIG_SENTINEL');
  });

  it('isolates throwing diagnostics callbacks and exposes only safe aggregate state', async () => {
    const snapshots: unknown[] = [];
    const pulse = core(createNoopExporter(), { onDiagnostics(snapshot) { snapshots.push(snapshot); throw new Error('PRIVATE_DIAGNOSTIC_SENTINEL'); } });
    expect(() => complete(pulse)).not.toThrow(); await pulse.flush();
    expect(snapshots.length).toBeGreaterThan(0);
    expect(pulse.getDiagnostics().lastAcceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(snapshots)).not.toMatch(/PRIVATE|fixture.tool|event_id/);
  });

  it('bounds flush and concurrent shutdown even when exporter ignores abort forever, with at most one invocation', async () => {
    let calls = 0; let signal: AbortSignal | undefined;
    const pulse = core({ export(_events, context) { calls++; signal = context.signal; return new Promise(() => {}); } }, { queue: { requestTimeoutMs: 15 } });
    complete(pulse); const started = performance.now();
    await pulse.flush({ timeoutMs: 5 });
    expect(performance.now() - started).toBeLessThan(150);
    await until(() => pulse.getDiagnostics().blockReason === 'exporter_timeout');
    pulse.resume(); complete(pulse); await pulse.flush({ timeoutMs: 5 });
    const closing = performance.now(); await Promise.all([pulse.shutdown({ timeoutMs: 10 }), pulse.shutdown({ timeoutMs: 10 })]);
    expect(performance.now() - closing).toBeLessThan(150);
    expect(calls).toBe(1); expect(signal?.aborted).toBe(true);
    expect(pulse.getDiagnostics()).toMatchObject({ queued: 0, inFlight: 0, pendingBytes: 0, status: 'shutdown', droppedTimeout: 2 });
  });

  it('permits explicit resume after an abort-ignoring exporter finally settles, without overlapping attempts', async () => {
    let finish!: (result: PulseExportResult) => void;
    let calls = 0;
    const pulse = core({ export() { calls++; return new Promise(resolve => { finish = resolve; }); } }, { queue: { requestTimeoutMs: 5 } });
    complete(pulse); await pulse.flush();
    const memory = createMemoryExporter(); pulse.reconfigure({ exporter: memory });
    complete(pulse, 'still.blocked'); expect(memory.getEvents()).toHaveLength(0);
    finish({ accepted: [], duplicates: [], rejected: [] }); await sleep(0);
    pulse.resume(); complete(pulse, 'recovered'); await pulse.flush();
    expect(calls).toBe(1); expect(memory.getEvents().map(event => event.tool_name)).toEqual(['recovered']);
  });

  it('bounds a hostile exporter shutdown hook and isolates rejection', async () => {
    const pulse = core({ export: acknowledge, shutdown() { return new Promise(() => {}); } });
    complete(pulse); await pulse.flush(); const closing = performance.now();
    await pulse.shutdown({ timeoutMs: 10 });
    expect(performance.now() - closing).toBeLessThan(150);
    expect(pulse.getDiagnostics().status).toBe('shutdown');
  });
});

describe('batch triggers, budgets and result contract', () => {
  it('starts a full count batch in a microtask without waiting for the interval or synchronously invoking I/O', async () => {
    const spy = vi.fn(acknowledge); const pulse = core({ export: spy }, { queue: { batchMaxEvents: 2 } });
    complete(pulse, 'one'); complete(pulse, 'two'); expect(spy).not.toHaveBeenCalled();
    await until(() => spy.mock.calls.length === 1);
    expect(spy.mock.calls[0]![0]).toHaveLength(2);
  });

  it('starts when queued bytes fill a batch, while each transmitted batch respects its byte cap', async () => {
    const memory = createMemoryExporter(); const sample = core(memory); complete(sample); await sample.flush();
    const eventBytes = Buffer.byteLength(JSON.stringify(memory.getEvents()[0]));
    const limit = eventBytes + 50;
    const batches: readonly PulseEvent[][] = [];
    const mutable = batches as PulseEvent[][];
    const pulse = core({ export(events) { mutable.push([...events]); return acknowledge(events); } }, { queue: { batchMaxBytes: limit } });
    complete(pulse); complete(pulse);
    await until(() => pulse.getDiagnostics().accepted === 2);
    expect(batches).toHaveLength(2);
    expect(batches.every(events => Buffer.byteLength(JSON.stringify({ schema_version: 1, events })) <= limit)).toBe(true);
  });

  it('does not spin threshold microtasks while one exporter attempt remains pending', async () => {
    let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    const pulse = core({ async export(events) { calls++; if (calls === 1) await hold; return acknowledge(events); } }, { queue: { batchMaxEvents: 1 } });
    complete(pulse); await until(() => calls === 1); complete(pulse);
    await sleep(10); expect(calls).toBe(1);
    release(); await pulse.flush(); expect(calls).toBe(2);
  });

  it.each([
    { accepted: ['foreign'], duplicates: [], rejected: [] },
    { accepted: [], duplicates: [], rejected: [], extra: 'PRIVATE_SENTINEL' },
    { accepted: [], duplicates: [], rejected: [], retryAfterMs: NaN },
  ])('never counts malformed exporter acknowledgements as acceptance', async bad => {
    const calls: string[][] = [];
    const pulse = core({ export(events) { calls.push(events.map(event => event.event_id)); return calls.length === 1 ? bad as PulseExportResult : acknowledge(events); } });
    complete(pulse); await pulse.flush();
    expect(calls).toHaveLength(2); expect(calls[1]).toEqual(calls[0]);
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 1, retries: 1, exporterFailures: 1 });
  });

  it('rejects conflicting IDs and retries only unconfirmed and explicitly retryable subsets', async () => {
    let calls = 0; const sizes: number[] = [];
    const pulse = core({ export(events) {
      sizes.push(events.length); calls++;
      if (calls === 1) return { accepted: [events[0]!.event_id], duplicates: [events[0]!.event_id], rejected: [] };
      if (calls === 2) return { accepted: [events[0]!.event_id], duplicates: [events[1]!.event_id], rejected: [{ event_id: events[2]!.event_id, code: 'TEMPORARY', retryable: true }, { event_id: events[3]!.event_id, code: 'INVALID', retryable: false }] };
      return acknowledge(events);
    } });
    for (let i = 0; i < 5; i++) complete(pulse, `tool.${i}`);
    await pulse.flush(); expect(sizes).toEqual([5, 5, 2]);
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 3, duplicates: 1, rejected: 1, retries: 2 });
  });

  it('snapshots acknowledgement accessors once before accepting IDs', async () => {
    let reads = 0;
    const pulse = core({ export(events) { return { get accepted() { reads++; return reads === 1 ? [events[0]!.event_id] : ['PRIVATE_ACK_SENTINEL']; }, duplicates: [], rejected: [] }; } });
    complete(pulse); await pulse.flush();
    expect(reads).toBe(1); expect(pulse.getDiagnostics()).toMatchObject({ accepted: 1, retries: 0 });
    expect(JSON.stringify(pulse.getDiagnostics())).not.toContain('PRIVATE_ACK_SENTINEL');
  });

  it('bounds exporter exceptions and never retains raw exception content in diagnostics', async () => {
    const pulse = core({ export() { throw new Error('PRIVATE_EXPORTER_SENTINEL'); } });
    complete(pulse); await pulse.flush();
    expect(pulse.getDiagnostics()).toMatchObject({ requests: 4, retries: 3, droppedRetries: 1, pendingBytes: 0 });
    expect(JSON.stringify(pulse.getDiagnostics())).not.toContain('PRIVATE_EXPORTER_SENTINEL');
  });
});

describe('local JSONL and HTTP configuration boundaries', () => {
  it('rotates bounded JSONL files containing only safe observed event fields', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulse-jsonl-')); cleanup.push(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, 'events.jsonl');
    const pulse = core(createJsonlExporter({ path, maxBytes: 1500, maxFiles: 2 }));
    for (let i = 0; i < 8; i++) pulse.complete({ toolName: `tool.${i}`, durationMs: 1, outcome: 'tool_success', properties: { token: 'PRIVATE_JSONL_SENTINEL' } } as Parameters<PulseCore['complete']>[0]);
    await pulse.flush();
    const files = await readdir(directory);
    expect(files.sort()).toEqual(['events.jsonl', 'events.jsonl.1']);
    const contents = await Promise.all(files.map(file => readFile(join(directory, file), 'utf8')));
    expect(contents.join('')).not.toContain('PRIVATE_JSONL_SENTINEL');
    expect((await Promise.all(files.map(file => stat(join(directory, file))))).every(file => file.size <= 1500)).toBe(true);
    const events = contents.flatMap(content => content.trim().split('\n').map(line => JSON.parse(line) as PulseEvent));
    expect(events.some(event => event.tool_name === 'tool.7')).toBe(true);
    expect(events.every(event => event.kind === 'tool_handler.completed')).toBe(true);
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 8, rejected: 0 });
  });

  it('validates direct exporter callers and rejects unknown fields before memory, disk or HTTP output', async () => {
    const memory = createMemoryExporter(); const source = core(memory); complete(source); await source.flush();
    const sourceEvent = memory.getEvents()[0]!;
    memory.clear();
    const directory = await mkdtemp(join(tmpdir(), 'pulse-jsonl-')); cleanup.push(() => rm(directory, { recursive: true, force: true }));
    const exporters = [memory, createNoopExporter(), createJsonlExporter({path: join(directory, 'events.jsonl')}), createHttpExporter({endpoint:'http://127.0.0.1:1/v1/batch'})];
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('NETWORK_FORBIDDEN'));
    let forbiddenReads = 0;
    const bad = { ...sourceEvent, get properties() { forbiddenReads++; throw new Error('PRIVATE_DIRECT_SENTINEL'); } };
    const signal = new AbortController().signal;
    for (const exporter of exporters) {
      const result = await exporter.export([bad], {signal});
      expect(result).toEqual({accepted:[],duplicates:[],rejected:[{event_id:sourceEvent.event_id,code:'INVALID_EVENT',retryable:false}]});
      expect(JSON.stringify(result)).not.toContain('PRIVATE_DIRECT_SENTINEL');
    }
    expect(memory.getEvents()).toHaveLength(0); expect(await readdir(directory)).toHaveLength(0); expect(fetch).not.toHaveBeenCalled(); expect(forbiddenReads).toBe(0);
  });

  it('permanently rejects a JSONL event above its per-file cap and isolates filesystem failures', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulse-jsonl-')); cleanup.push(() => rm(directory, { recursive: true, force: true }));
    const tiny = core(createJsonlExporter({ path: join(directory, 'tiny.jsonl'), maxBytes: 1 }));
    complete(tiny); await tiny.flush(); expect(tiny.getDiagnostics()).toMatchObject({ rejected: 1, retries: 0 });
    const invalid = core(createJsonlExporter({ path: directory })); complete(invalid); await invalid.flush();
    expect(invalid.getDiagnostics()).toMatchObject({ droppedRetries: 1, requests: 4 });
  });

  it.each([
    { endpoint: 'http://collector.example.test/v1/batch' },
    { endpoint: 'https://user:secret@collector.example.test/v1/batch' },
    { endpoint: 'https://collector.example.test/v1/batch?token=secret' },
    { endpoint: 'https://collector.example.test/v1/batch', authorization: 'Bearer x\nPRIVATE_HEADER' },
    { endpoint: 'https://collector.example.test/v1/batch', headers: { Authorization: 'PRIVATE_HEADER' } },
  ])('rejects unsafe HTTP configuration without including its contents in errors', options => {
    let error: unknown; try { createHttpExporter(options); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error); expect(String(error)).toBe('PulseConfigurationError: PULSE_INVALID_CONFIGURATION');
    expect(JSON.stringify(error)).not.toMatch(/PRIVATE|secret|collector/);
  });
});
