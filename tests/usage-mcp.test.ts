import { expect, it } from 'vitest';
import { createPulse } from '@reviseflow/pulse';
import { createMemoryExporter } from '@reviseflow/pulse-core/memory';
import { startMcpFixture } from '../examples/fixture.js';
import { runUsageExample } from '../examples/usage.js';

it('offline core example requires no MCP server, Cloud key or network destination', async () => {
  const result = await runUsageExample();
  expect(result.events).toHaveLength(2); expect(result.diagnostics).toMatchObject({ observed: 1, observedUsage: 1, accepted: 2 });
  expect(result.events[0]!.invocation_id).toBe(result.events[1]!.invocation_id);
});
it('real MCP 2.0.0 handler associates multiple model invocations and preserves result/error through exporter failure', async () => {
  const sink = createMemoryExporter();
  const pulse = createPulse({ environment: 'test', exporter: sink, captureClient: true, mapToolName: name => 'safe.' + name });
  const fixture = await startMcpFixture(server => {
    server.registerTool('fixture', {}, async () => {
      pulse.recordUsage({ provider: 'fixture-provider', model: 'fixture-model', inputTokens: 10 });
      await new Promise<void>(resolve => setImmediate(resolve));
      pulse.recordUsage({ provider: 'fixture-provider', model: 'fixture-model', inputTokens: 20, outputTokens: 3 });
      return { content: [{ type: 'text', text: 'PRIVATE_RESULT_SENTINEL' }] };
    });
  }, { pulse });
  try {
    const client = await fixture.connect({ clientInfo: { name: 'Claude desktop', version: '1.2.3' } });
    const result = await client.callTool({ name: 'fixture' }); expect(result.content).toEqual([{ type: 'text', text: 'PRIVATE_RESULT_SENTINEL' }]);
    await pulse.flush(); const events = sink.getEvents(); expect(events).toHaveLength(3);
    expect(events.map(event => event.kind)).toEqual(['model_usage.recorded', 'model_usage.recorded', 'tool_handler.completed']);
    expect(events.every(event => event.tool_name === 'safe.fixture')).toBe(true); expect(new Set(events.map(event => event.invocation_id)).size).toBe(1);
    expect(events[0]).toMatchObject({ adapter: 'mcp-typescript-2', client_source: 'reported_metadata' });
    expect(JSON.stringify(events)).not.toContain('PRIVATE_RESULT_SENTINEL'); expect(pulse.getDiagnostics()).toMatchObject({ observed: 1, observedUsage: 2 });
    pulse.reconfigure({ exporter: { export() { throw Error('PRIVATE_EXPORT_SENTINEL'); } } });
    expect((await client.callTool({ name: 'fixture' })).content).toEqual(result.content);
    await pulse.flush(); expect(pulse.getDiagnostics().exporterFailures).toBeGreaterThan(0);
  } finally { await pulse.shutdown(); await fixture.close(); }
});
