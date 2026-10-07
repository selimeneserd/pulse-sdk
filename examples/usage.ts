/** Offline usage API example. These scalars are explicit TEST fixtures, not live
 * model usage. Replace them with a provider response's reported usage fields.
 * Çevrimdışı API örneği: bu sayılar açık TEST verileridir, canlı model tüketimi değildir. */
import { createPulseCore } from '@reviseflow/pulse-core';
import { createMemoryExporter } from '@reviseflow/pulse-core/memory';
import { pathToFileURL } from 'node:url';

export async function runUsageExample() {
  const sink = createMemoryExporter();
  const pulse = createPulseCore({ environment: 'test', exporter: sink });
  try {
    await pulse.withToolContext({ toolName: 'fixture.summarize' }, async () => {
      pulse.recordUsage({ provider: 'fixture-provider', model: 'fixture-model', inputTokens: 120, outputTokens: 30, cachedInputTokens: 20 });
      pulse.complete({ toolName: 'fixture.summarize', durationMs: 1, outcome: 'tool_success' });
    });
    await pulse.flush();
    return { events: sink.getEvents(), diagnostics: pulse.getDiagnostics() };
  } finally { await pulse.shutdown(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.stderr.write(JSON.stringify(await runUsageExample()) + '\n');
