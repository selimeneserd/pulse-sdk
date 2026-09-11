import { it,expect } from 'vitest';
import { startReferenceCollector } from '../examples/reference-collector.js';
import { createHttpExporter } from '../packages/core/src/http.js';
import { runExporterConformance } from '../packages/core/src/conformance.js';
import fixtures from '../contracts/fixtures/events.json' with {type:'json'};
import type { PulseEvent } from '../packages/core/src/types.js';
it('external reference collector from public JSON Schema supports replay, partial and conflict without Cloud',async()=>{
 const collector=await startReferenceCollector();
 try {
  const event=fixtures.events[0] as PulseEvent;
  expect(await runExporterConformance(createHttpExporter({endpoint:collector.endpoint}),event)).toEqual({passed:true,checks:2});
  const post=(events:unknown[])=>fetch(collector.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({schema_version:1,events})});
  const body=await (await post([{...event,duration_ms:event.duration_ms+1},{...event,event_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',properties:{secret:'PRIVATE_SENTINEL'}}])).json();
  expect(body.accepted).toEqual([]);expect(body.rejected.map((r:{code:string})=>r.code)).toEqual(['EVENT_ID_CONFLICT','INVALID_EVENT']);expect(JSON.stringify(body)).not.toContain('PRIVATE_SENTINEL');expect(collector.retained()).toBe(1);
 }finally{await collector.close();}
});
