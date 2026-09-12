import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createPulseCore, type PulseCore, type PulseEvent, type PulseExporter, type PulseExportResult } from '../packages/core/src/index.js';
import { runExporterConformance } from '../packages/core/src/conformance.js';
import { snapshotExportResult } from '../packages/core/src/export-result.js';
import { createPulse } from '../packages/mcp/src/index.js';
import { McpServer, type ServerContext } from '@modelcontextprotocol/server';

const event = JSON.parse(readFileSync(new URL('../contracts/fixtures/events.json', import.meta.url), 'utf8')).events[0] as PulseEvent;
const instances: PulseCore[] = [];
afterEach(async () => { for (const pulse of instances.splice(0)) await pulse.shutdown(); });
function core(exporter: PulseExporter) {
  const pulse = createPulseCore({ environment: 'test', exporter, queue: { maxRetries: 0, flushIntervalMs: 60_000 } });
  instances.push(pulse);
  return pulse;
}
const accepted = (events: readonly PulseEvent[]) => ({ accepted: events.map(item => item.event_id), duplicates: [], rejected: [] });

describe('export result contract through conformance and dispatcher', () => {
  it.each([
    ['negative retry minimum', { retryAfterMs: -1 }],
    ['NaN retry minimum', { retryAfterMs: NaN }],
    ['infinite retry minimum', { retryAfterMs: Infinity }],
    ['non-numeric retry minimum', { retryAfterMs: '0' }],
    ['unknown result field', { privateValue: 'PRIVATE_RESULT_SENTINEL' }],
  ])('rejects %s consistently', async (_name, extra) => {
    const exporter: PulseExporter = { export: events => ({ ...accepted(events), ...extra }) as PulseExportResult };
    const pulse = core(exporter);
    pulse.complete({ toolName: 'fixture.result', durationMs: 1, outcome: 'tool_success' });
    await pulse.flush();
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 0, requests: 1, exporterFailures: 1, droppedRetries: 1 });
    expect(await runExporterConformance(exporter, event)).toEqual({ passed: false, checks: 0 });
  });

  it.each([0, 0.5, 60_000, Number.MAX_VALUE])('accepts a finite retry minimum %s when all IDs are delivered', async retryAfterMs => {
    const exporter: PulseExporter = { export: events => ({ ...accepted(events), retryAfterMs, batchTooLarge: false }) };
    const pulse = core(exporter);
    pulse.complete({ toolName: 'fixture.result', durationMs: 1, outcome: 'tool_success' });
    await pulse.flush();
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 1, retries: 0, exporterFailures: 0 });
    expect(await runExporterConformance(exporter, event)).toEqual({ passed: true, checks: 2 });
  });

  const invalidResults: Array<[string, (id: string) => unknown]> = [
    ['batch-external ID', () => ({ accepted: ['00000000-0000-4000-8000-000000000000'], duplicates: [], rejected: [] })],
    ['conflicting ID categories', id => ({ accepted: [id], duplicates: [id], rejected: [] })],
    ['repeated accepted ID', id => ({ accepted: [id, id], duplicates: [], rejected: [] })],
    ['malformed rejection', () => ({ accepted: [], duplicates: [], rejected: [null] })],
    ['invalid rejection code', id => ({ accepted: [], duplicates: [], rejected: [{ event_id: id, code: 'PRIVATE_secret', retryable: false }] })],
    ['invalid retryable type', id => ({ accepted: [], duplicates: [], rejected: [{ event_id: id, code: 'INVALID', retryable: 0 }] })],
    ['unknown rejection field', id => ({ accepted: [], duplicates: [], rejected: [{ event_id: id, code: 'INVALID', retryable: false, raw: 'PRIVATE_RESULT_SENTINEL' }] })],
    ['contradictory auth control', id => ({ accepted: [id], duplicates: [], rejected: [], blocked: 'auth' })],
    ['contradictory split control', id => ({ accepted: [id], duplicates: [], rejected: [], batchTooLarge: true })],
    ['conflicting controls', () => ({ accepted: [], duplicates: [], rejected: [], blocked: 'auth', batchTooLarge: true })],
    ['invalid block value', id => ({ accepted: [id], duplicates: [], rejected: [], blocked: false })],
    ['invalid split value', id => ({ accepted: [id], duplicates: [], rejected: [], batchTooLarge: 0 })],
    ['throwing result getter', id => ({ accepted: [id], duplicates: [], rejected: [], get retryAfterMs() { throw Error('PRIVATE_GETTER_SENTINEL'); } })],
    ['throwing rejection getter', id => ({ accepted: [], duplicates: [], rejected: [{ event_id: id, get code() { throw Error('PRIVATE_GETTER_SENTINEL'); }, retryable: false }] })],
    ['throwing object access', () => new Proxy({}, { ownKeys() { throw Error('PRIVATE_OBJECT_SENTINEL'); } })],
  ];
  it.each(invalidResults)('fails safely for %s on both public paths', async (_name, make) => {
    const exporter: PulseExporter = { export: events => make(events[0]!.event_id) as PulseExportResult };
    const pulse = core(exporter);
    pulse.complete({ toolName: 'fixture.result', durationMs: 1, outcome: 'tool_success' });
    await pulse.flush();
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 0, duplicates: 0, rejected: 0, exporterFailures: 1, droppedRetries: 1 });
    expect(await runExporterConformance(exporter, event)).toEqual({ passed: false, checks: 0 });
    expect(JSON.stringify(pulse.getDiagnostics())).not.toContain('PRIVATE_');
  });

  it('rejects unknown fields before invoking their getters on both paths', async () => {
    let reads = 0;
    const exporter: PulseExporter = { export: events => ({ ...accepted(events), get raw() { reads++; throw Error('PRIVATE_UNKNOWN_SENTINEL'); } }) };
    const pulse = core(exporter);
    pulse.complete({ toolName: 'fixture.result', durationMs: 1, outcome: 'tool_success' });
    await pulse.flush();
    expect(await runExporterConformance(exporter, event)).toEqual({ passed: false, checks: 0 });
    expect(reads).toBe(0);
    expect(pulse.getDiagnostics().droppedRetries).toBe(1);
  });

  it('reads changing accessors once before smoke criteria and runtime consumption', async () => {
    const reads: number[] = [];
    const exporter: PulseExporter = { export(events) {
      const index = reads.push(0) - 1;
      return { ...accepted(events), get retryAfterMs() { return ++reads[index]! === 1 ? 0 : -1; } };
    } };
    const pulse = core(exporter);
    pulse.complete({ toolName: 'fixture.result', durationMs: 1, outcome: 'tool_success' });
    await pulse.flush();
    expect(await runExporterConformance(exporter, event)).toEqual({ passed: true, checks: 2 });
    expect(reads).toEqual([1, 1, 1]);
    expect(pulse.getDiagnostics().accepted).toBe(1);
  });

  it('owns arrays and nested rejection fields after validation, without requiring every ID', () => {
    const second = { ...event, event_id: '00000000-0000-4000-8000-000000000002' };
    const third = { ...event, event_id: '00000000-0000-4000-8000-000000000003' };
    const result = { accepted: [event.event_id], duplicates: [] as string[], rejected: [{ event_id: second.event_id, code: 'INVALID', retryable: false }] };
    const snapshot = snapshotExportResult(result, [event, second, third]);
    expect(snapshot).toEqual(result);
    result.accepted[0] = third.event_id;
    result.rejected[0]!.event_id = third.event_id;
    result.rejected[0]!.retryable = true;
    expect(snapshot).toEqual({ accepted: [event.event_id], duplicates: [], rejected: [{ event_id: second.event_id, code: 'INVALID', retryable: false }] });
    expect(Object.isFrozen(snapshot?.accepted)).toBe(true);
    expect(Object.isFrozen(snapshot?.rejected[0])).toBe(true);
  });

  it('keeps runtime delivery decisions when later rejection access mutates exporter-owned arrays', async () => {
    const pulse = core({ export(events) {
      const ids = [events[0]!.event_id];
      return { accepted: ids, duplicates: [], rejected: [{ event_id: events[1]!.event_id, get code() { ids[0] = 'PRIVATE_MUTATION_SENTINEL'; return 'INVALID'; }, retryable: false }] };
    } });
    for (let index = 0; index < 2; index++) pulse.complete({ toolName: 'fixture.result', durationMs: 1, outcome: 'tool_success' });
    await pulse.flush();
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 1, rejected: 1, exporterFailures: 0 });
  });

  it('separates structurally valid partial/rejection/control results from smoke delivery success', async () => {
    for (const result of [
      { accepted: [], duplicates: [], rejected: [] },
      { accepted: [], duplicates: [], rejected: [{ event_id: event.event_id, code: 'INVALID', retryable: false }] },
      { accepted: [], duplicates: [], rejected: [{ event_id: event.event_id, code: 'TEMPORARY', retryable: true }] },
      { accepted: [], duplicates: [], rejected: [], blocked: 'auth' as const },
      { accepted: [], duplicates: [], rejected: [], batchTooLarge: true },
    ]) {
      expect(snapshotExportResult(result, [event])).not.toBeNull();
      expect(await runExporterConformance({ export: () => result }, event)).toEqual({ passed: false, checks: 0 });
    }
  });

  it.each(['throw', 'reject'] as const)('isolates exporter %s from original MCP result, error, context and sync/async behavior', async mode => {
    const exporter: PulseExporter = { export() {
      const error = Error('PRIVATE_EXPORTER_SENTINEL');
      if (mode === 'throw') throw error;
      return Promise.reject(error);
    } };
    const pulse = createPulse({ environment: 'test', exporter, queue: { maxRetries: 0, flushIntervalMs: 60_000 } });
    instances.push(pulse);
    const server = pulse.wrapServer(new McpServer({ name: 'fixture', version: '1' }));
    const result = Object.freeze({ content: [] });
    const originalError = Error('PRIVATE_HANDLER_SENTINEL');
    const receiver = {};
    const context = { mcpReq: { signal: new AbortController().signal } } as ServerContext;
    const sync = server.registerTool('sync', {}, function(this: unknown, ctx) { expect(this).toBe(receiver); expect(ctx).toBe(context); return result; });
    const asyncHandle = server.registerTool('async', {}, async () => result);
    const failure = server.registerTool('failure', {}, () => { throw originalError; });
    expect(Reflect.apply(sync.handler, receiver, [context])).toBe(result);
    await expect(Reflect.apply(asyncHandle.handler, receiver, [context])).resolves.toBe(result);
    try { Reflect.apply(failure.handler, receiver, [context]); expect.fail('EXPECTED_HANDLER_ERROR'); } catch (error) { expect(error).toBe(originalError); }
    await pulse.flush();
    expect(pulse.getDiagnostics()).toMatchObject({ observed: 3, accepted: 0, droppedRetries: 3 });
    expect(await runExporterConformance(exporter, event)).toEqual({ passed: false, checks: 0 });
    expect(JSON.stringify(pulse.getDiagnostics())).not.toContain('PRIVATE_');
    await server.close();
  });
});
