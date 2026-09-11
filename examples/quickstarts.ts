import { McpServer } from '@modelcontextprotocol/server';
import { createPulse } from '@reviseflow/pulse';
import { createJsonlExporter } from '@reviseflow/pulse-core/jsonl';
import { createHttpExporter } from '@reviseflow/pulse-core/http';
export function localQuickstart(path:string) {
 const pulse=createPulse({environment:'development',exporter:createJsonlExporter({path})});
 const server=pulse.wrapServer(new McpServer({name:'my-mcp',version:'1.0.0'}));
 server.registerTool('health',{},()=>({content:[{type:'text',text:'ok'}]}));return{pulse,server};
}
export function managedQuickstart(endpoint:string,writeKey:string){
 return createPulse({environment:'production',exporter:createHttpExporter({endpoint,authorization:`Bearer ${writeKey}`})});
}
