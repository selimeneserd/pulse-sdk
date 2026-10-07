import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { createPulseCore, type PulseUsageEvent, type UsageRecord } from '../packages/core/src/index.js';
import { createMemoryExporter } from '../packages/core/src/memory.js';
import { createJsonlExporter } from '../packages/core/src/jsonl.js';
import { createHttpExporter } from '../packages/core/src/http.js';
import { validatePulseEvent, snapshotPulseEvent } from '../packages/core/src/conformance.js';
import { createOtelExporter } from '../packages/otel/src/index.js';
import { runCli } from '../packages/mcp/src/cli.js';
import { startReferenceCollector } from '../examples/reference-collector.js';
import schema from '../contracts/event-v1.schema.json' with { type: 'json' };
import positives from './fixtures/usage-events.json' with { type: 'json' };
import negatives from './fixtures/negative-usage-events.json' with { type: 'json' };
const usage: UsageRecord = { provider: 'fixture-provider', model: 'fixture-model', inputTokens: 100, outputTokens: 40, cachedInputTokens: 25, reasoningOutputTokens: 10 };
const pause = () => new Promise<void>(resolve => setImmediate(resolve));

describe('explicit provider-reported usage, independent from a dashboard', () => {
  it('publishes matching golden fixtures; schema and canonical validator enforce separate strict alternatives', () => {
    const ajv = new Ajv2020({ strict: true }); (addFormats as unknown as (ajv: Ajv2020) => void)(ajv);
    const valid = ajv.compile(schema);
    for (const event of positives.events) { expect(valid(event), JSON.stringify(valid.errors)).toBe(true); expect(validatePulseEvent(event)).toBe(true); }
    for (const test of negatives) { expect(valid(test.event), test.name).toBe('schema_valid' in test && test.schema_valid === true); expect(validatePulseEvent(test.event), test.name).toBe(false); }
    for (const name of ['usage-events.json', 'negative-usage-events.json']) expect(JSON.parse(readFileSync(new URL('../contracts/fixtures/' + name, import.meta.url), 'utf8'))).toEqual(JSON.parse(readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8')));
  });
  it('preserves missing fields, zero and per-invocation separation without changing observed handlers', async () => {
    const sink = createMemoryExporter(), pulse = createPulseCore({ environment: 'test', exporter: sink });
    try {
      pulse.recordUsage({ provider: usage.provider, model: usage.model, inputTokens: 0 });
      pulse.recordUsage(usage); pulse.recordUsage(usage);
      pulse.complete({ toolName: 'fixture.tool', durationMs: 4, outcome: 'tool_success' });
      await pulse.flush();
      expect(sink.getEvents()).toHaveLength(4); expect(new Set(sink.getEvents().map(event => event.event_id)).size).toBe(4);
      expect(sink.getEvents()[0]).toMatchObject({ kind: 'model_usage.recorded', input_tokens: 0, output_tokens: null, cached_input_tokens: null, reasoning_output_tokens: null, tool_name: null, invocation_id: null, usage_source: 'provider_reported' });
      expect(pulse.getDiagnostics()).toMatchObject({ observed: 1, observedUsage: 3, accepted: 4 });
    } finally { await pulse.shutdown(); }
  });
  it('rejects invalid numbers, labels and inconsistent subsets; exporter failures stay fail-open', async () => {
    const pulse = createPulseCore({ environment: 'test', exporter: { export() { throw new Error('PRIVATE_EXPORT_ERROR'); } }, queue: { maxRetries: 0 } });
    const invalid = [{}, { inputTokens: NaN }, { inputTokens: Infinity }, { inputTokens: -1 }, { inputTokens: 1.5 }, { inputTokens: 2147483648 }, { inputTokens: '100' }, { inputTokens: null }, { provider: 'user@example.test' }, { model: 'private prompt' }, { inputTokens: 1, cachedInputTokens: 2 }, { outputTokens: 1, reasoningOutputTokens: 2 }, { inputTokens: undefined, cachedInputTokens: 1 }, { outputTokens: undefined, reasoningOutputTokens: 1 }, { toolName: 'private@example.test' }];
    try {
      for (const bad of invalid) expect(() => pulse.recordUsage({ provider: usage.provider, model: usage.model, ...(Object.keys(bad).length ? usage : {}), ...bad } as UsageRecord)).not.toThrow();
      expect(pulse.getDiagnostics().droppedInvalid).toBe(invalid.length);
      expect(() => pulse.recordUsage(usage)).not.toThrow(); await pulse.flush(); expect(pulse.getDiagnostics()).toMatchObject({ observed: 0, observedUsage: 1, droppedRetries: 1, exporterFailures: 1 });
    } finally { await pulse.shutdown(); }
  });
  it('isolates concurrent identity/tool scopes and safely handles explicit association and nested contexts', async () => {
    const sink = createMemoryExporter(), pulse = createPulseCore({ environment: 'test', exporter: sink, identity: { secret: 'public-fixture-identity-key-32bytes-long', projectNamespace: 'usage-test', epoch: 'one' } });
    try {
      await Promise.all(['alpha', 'beta'].map(toolName => pulse.withContext({ actorId: toolName }, () => pulse.withToolContext({ toolName }, async () => {
        pulse.recordUsage(usage); await pause(); pulse.recordUsage(usage); pulse.complete({ toolName, durationMs: 1, outcome: 'tool_success' });
      }))));
      pulse.withToolContext({ toolName: 'outer' }, () => {
        pulse.withToolContext({ toolName: 'inner' }, () => pulse.recordUsage(usage));
        pulse.recordUsage({ ...usage, toolName: 'different' }); pulse.recordUsage(usage);
      });
      pulse.recordUsage({ ...usage, toolName: 'explicit' }); pulse.recordUsage(usage);
      await pulse.flush(); const events = sink.getEvents();
      for (const name of ['alpha', 'beta']) { const group = events.filter(event => event.tool_name === name); expect(group).toHaveLength(3); expect(new Set(group.map(event => event.invocation_id)).size).toBe(1); expect(new Set(group.map(event => event.actor_id)).size).toBe(1); expect(group[0]!.invocation_id).toMatch(/^[0-9a-f-]{36}$/); }
      expect(events.find(event => event.tool_name === 'alpha')!.invocation_id).not.toBe(events.find(event => event.tool_name === 'beta')!.invocation_id);
      expect(events.find(event => event.tool_name === 'alpha')!.actor_id).not.toBe(events.find(event => event.tool_name === 'beta')!.actor_id);
      expect(events.find(event => event.tool_name === 'different')!.invocation_id).toBeNull(); expect(events.find(event => event.tool_name === 'explicit')!.invocation_id).toBeNull(); expect(events.at(-1)!.tool_name).toBeNull();
    } finally { await pulse.shutdown(); }
  });
  it('never reads forbidden raw accessors, snapshots allowed accessors once, and keeps diagnostics raw-free', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pulse-usage-')), file = join(dir, 'usage.jsonl'), diagnostics: unknown[] = [];
    const pulse = createPulseCore({ environment: 'test', exporter: createJsonlExporter({ path: file }), onDiagnostics: value => diagnostics.push(value) });
    let providerReads = 0, rawReads = 0;
    try {
      const candidate = { ...usage, get provider() { return ++providerReads === 1 ? 'safe' : 'PRIVATE_SECOND_READ'; }, get prompt() { rawReads++; throw Error('PRIVATE_PROMPT'); }, get response() { rawReads++; throw Error('PRIVATE_RESPONSE'); } };
      pulse.recordUsage(candidate);
      pulse.recordUsage({ ...usage, get model(): string { throw Error('PRIVATE_MODEL'); } });
      await pulse.flush(); expect(providerReads).toBe(1); expect(rawReads).toBe(0); expect(await readFile(file, 'utf8')).not.toMatch(/PRIVATE_|prompt|response/); expect(JSON.stringify(diagnostics)).not.toContain('PRIVATE_');
      const base = positives.events[0] as PulseUsageEvent;
      expect(snapshotPulseEvent({ ...base, get prompt() { rawReads++; throw Error('PRIVATE_PROMPT'); } })).toBeNull(); expect(rawReads).toBe(0);
    } finally { await pulse.shutdown(); await rm(dir, { recursive: true, force: true }); }
  });
  it('keeps usage within existing disable/pause/queue/shutdown lifecycle bounds', async () => {
    const sink = createMemoryExporter(), disabled = createPulseCore({ environment: 'test', exporter: sink, enabled: false });
    disabled.recordUsage(usage); await disabled.shutdown(); expect(disabled.getDiagnostics()).toMatchObject({ observed: 0, observedUsage: 0 });
    const pulse = createPulseCore({ environment: 'test', exporter: sink, queue: { maxEvents: 1 } });
    pulse.pause(); pulse.recordUsage(usage); pulse.resume(); pulse.recordUsage(usage); pulse.recordUsage(usage); await pulse.shutdown(); pulse.recordUsage(usage);
    expect(sink.getEvents()).toHaveLength(1); expect(pulse.getDiagnostics()).toMatchObject({ observed: 0, observedUsage: 4, droppedPaused: 1, droppedOverflow: 1, droppedShutdown: 1 });
  });
  it('works through independent HTTP collector with replay and subset negatives', async () => {
    const collector = await startReferenceCollector(), pulse = createPulseCore({ environment: 'test', exporter: createHttpExporter({ endpoint: collector.endpoint }), queue: { maxRetries: 0 } });
    try {
      pulse.recordUsage(usage); await pulse.flush(); expect(pulse.getDiagnostics()).toMatchObject({ observed: 0, observedUsage: 1, accepted: 1 });
      const exporter = createHttpExporter({ endpoint: collector.endpoint }), context = { signal: new AbortController().signal }, event = positives.events[0] as PulseUsageEvent;
      expect((await exporter.export([event], context)).accepted).toHaveLength(1); expect((await exporter.export([event], context)).duplicates).toHaveLength(1);
      const invalid = negatives.filter(item => 'schema_valid' in item).map(item => ({ ...item.event, event_id: crypto.randomUUID() }));
      const result = await (await fetch(collector.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schema_version: 1, events: invalid }) })).json(); expect(result.rejected).toHaveLength(2); expect(result.accepted).toEqual([]);
    } finally { await pulse.shutdown(); await collector.close(); }
  });
  it('exports safe usage OTel attributes without manufacturing handler duration or totals', async () => {
    const sink = new InMemorySpanExporter(), provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(sink)] });
    try {
      const exporter = createOtelExporter({ tracer: provider.getTracer('usage-test') }), event = positives.events[1] as PulseUsageEvent;
      await exporter.export([event], { signal: new AbortController().signal }); await provider.forceFlush();
      expect(sink.getFinishedSpans()).toHaveLength(1); const span = sink.getFinishedSpans()[0]!;
      expect(span).toMatchObject({ name: 'pulse.model_usage', duration: [0, 0], attributes: { 'pulse.measurement.scope': 'model_usage', 'gen_ai.response.model': 'fixture-model', 'gen_ai.usage.output_tokens': 40 } });
      expect(span.attributes).not.toHaveProperty('gen_ai.request.model');
      expect(span.attributes).not.toHaveProperty('gen_ai.usage.input_tokens'); expect(JSON.stringify(span.attributes)).not.toMatch(/duration|outcome|prompt|actor|conversation|total/);
    } finally { await provider.shutdown(); }
  });
  it('CLI keeps handler metrics separate and sums only complete totals without adding detail subsets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pulse-usage-cli-')), file = join(dir, 'events.jsonl');
    try {
      await writeFile(file, [positives.events[0], positives.events[1], positives.events[0], positives.events[3]].map(event => JSON.stringify(event)).join('\n'));
      let output = ''; expect(await runCli(['dev', '--file', file], value => { output += value; })).toBe(0);
      expect(JSON.parse(output)).toMatchObject({ events: 0, usageEvents: 3, duplicates: 1, tools: [], usage: [{ calls: 3, input_known_calls: 2, output_known_calls: 3, complete_calls: 2, input_tokens: 100, output_tokens: 80, complete_total_tokens: 140, cached_input_tokens: 25, reasoning_output_tokens: 20 }] });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
