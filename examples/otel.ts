import { pathToFileURL } from 'node:url';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { createPulse } from '@reviseflow/pulse';
import { createOtelExporter } from '@reviseflow/pulse-otel';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
export async function runOtelExample() {
  const sink = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({spanProcessors:[new SimpleSpanProcessor(sink)]});
  const pulse = createPulse({environment:'development',exporter:createOtelExporter({tracer:provider.getTracer('pulse-example','0.2.0')})});
  const server = pulse.wrapServer(new McpServer({name:'local-otel-example',version:'1.0.0'}));
  server.registerTool('health',{},()=>({content:[{type:'text',text:'ok'}]}));
  const client = new Client({name:'local-example',version:'1.0.0'});
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(serverTransport),client.connect(clientTransport)]);
    await client.callTool({name:'health',arguments:{}});
    await pulse.flush(); await provider.forceFlush();
    const spans = sink.getFinishedSpans();
    return {spans:spans.map(span=>({name:span.name,kind:span.kind,attributes:span.attributes})),diagnostics:pulse.getDiagnostics()};
  } finally {await client.close();await server.close();await pulse.shutdown();await provider.shutdown();}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runOtelExample();
  process.stderr.write(JSON.stringify({message:'Local OTel example / Yerel OTel örneği',spans:result.spans.length,accepted:result.diagnostics.accepted})+'\n');
}
