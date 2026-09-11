/** Real MCP call with no sockets, Cloud account or key. / Ağsız gerçek MCP çağrısı. */
import { Client } from '@modelcontextprotocol/client';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { createPulse } from '@reviseflow/pulse';
import { createMemoryExporter } from '@reviseflow/pulse-core/memory';
import { createJsonlExporter } from '@reviseflow/pulse-core/jsonl';
import type { PulseExporter } from '@reviseflow/pulse-core';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

export async function runLocalExample(exporter: PulseExporter = createMemoryExporter()) {
  const pulse = createPulse({ environment: 'development', exporter });
  const server = pulse.wrapServer(new McpServer({ name: 'pulse-local-example', version: '1' }));
  server.registerTool('sum', { inputSchema: z.object({ a: z.number(), b: z.number() }) }, ({ a, b }) => ({
    content: [{ type: 'text', text: String(a + b) }], structuredContent: { sum: a + b },
  }));
  const client = new Client({ name: 'pulse-local-example', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({ name: 'sum', arguments: { a: 2, b: 3 } });
    await pulse.flush();
    return { result, diagnostics: pulse.getDiagnostics() };
  } finally {
    await client.close(); await server.close(); await pulse.shutdown();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const locale = process.env.PULSE_LOCALE === 'tr' ? 'tr' : 'en';
  try {
    const exporter = createJsonlExporter({ path: process.argv[2] ?? 'pulse-events.jsonl', maxBytes: 1_048_576, maxFiles: 2 });
    const { diagnostics } = await runLocalExample(exporter);
    process.stderr.write(JSON.stringify({
      code: 'LOCAL_MCP_COMPLETE',
      message: locale === 'tr' ? 'Gerçek MCP çağrısı yerel JSONL dosyasına kaydedildi. pulse dev --file pulse-events.jsonl ile inceleyin.' : 'A real MCP call was recorded in local JSONL. Inspect with pulse dev --file pulse-events.jsonl.',
      observed: diagnostics.observed, accepted: diagnostics.accepted,
    }) + '\n');
  } catch {
    process.stderr.write(JSON.stringify({ code: 'LOCAL_MCP_FAILED', message: locale === 'tr' ? 'Yerel örnek başarısız.' : 'Local example failed.' }) + '\n');
    process.exitCode = 1;
  }
}
