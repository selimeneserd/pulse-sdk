import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { createPulseCore } from '../packages/core/src/index.js';
import { createMemoryExporter } from '../packages/core/src/memory.js';
import { createJsonlExporter } from '../packages/core/src/jsonl.js';
import { validatePulseEvent, runExporterConformance } from '../packages/core/src/conformance.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../contracts/event-v1.schema.json' with {type:'json'};
it('Node HMAC matches independent Python UTF-8 vectors, no normalization or raw fallback',async()=>{
 const vectors=JSON.parse(readFileSync(new URL('../contracts/fixtures/identity-vectors.json',import.meta.url),'utf8'));
 for(const vector of vectors) {
  const memory=createMemoryExporter(); const pulse=createPulseCore({environment:'test',exporter:memory,identity:{secret:vector.secret,projectNamespace:vector.projectNamespace,epoch:vector.epoch}});
  pulse.withContext({actorId:vector.value,conversationId:vector.value},()=>pulse.complete({toolName:'fixture.tool',durationMs:1,outcome:'tool_success'}));
  await pulse.flush();const event=memory.getEvents()[0]!;expect(vector.domain==='actor'?event.actor_id:event.conversation_id).toBe(vector.expected);await pulse.shutdown();
 }
});
it('raw sentinels/cycles/throwing accessors never reach local files or diagnostics',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pulse-privacy-'));const file=join(dir,'events.jsonl');const snapshots:unknown[]=[];
 const pulse=createPulseCore({environment:'test',exporter:createJsonlExporter({path:file}),onDiagnostics:d=>{snapshots.push(d);throw new Error('PRIVATE_DIAGNOSTIC_SENTINEL');}});
 try {
  const cyclic:Record<string,unknown>={secret:'PRIVATE_ARGUMENT_SENTINEL'};cyclic.self=cyclic;
  const completion={toolName:'fixture.safe',durationMs:1,outcome:'handler_exception' as const,args:cyclic,result:'PRIVATE_RESULT_SENTINEL',error:new Error('PRIVATE_ERROR_SENTINEL'),prompt:'PRIVATE_PROMPT_SENTINEL',headers:{authorization:'PRIVATE_HEADER_SENTINEL'},properties:{user:'PRIVATE_ID_SENTINEL'}};
  pulse.withContext({actorId:'PRIVATE_ID_SENTINEL'},()=>pulse.complete(completion));
  pulse.complete({get toolName():string {throw new Error('PRIVATE_GETTER_SENTINEL');},durationMs:1,outcome:'tool_success'});
  await pulse.flush();const output=await readFile(file,'utf8');expect(output).not.toMatch(/PRIVATE_|args|properties|prompt|headers|result/);expect(JSON.stringify(snapshots)).not.toMatch(/PRIVATE_/);expect(pulse.getDiagnostics().droppedInvalid).toBe(1);
  expect(validatePulseEvent(JSON.parse(output))).toBe(true);
 }finally{await pulse.shutdown();await rm(dir,{recursive:true,force:true});}
});
it('canonical validator agrees with Ajv for field mutations and rejects extra/cyclic/raw fields',()=>{
 const ajv=new Ajv2020({strict:true});(addFormats as unknown as (ajv:Ajv2020)=>void)(ajv);const valid=ajv.compile(schema);
 const base=JSON.parse(readFileSync(new URL('../contracts/fixtures/events.json',import.meta.url),'utf8')).events[0];
 for(const field of Object.keys(schema.properties)) for(const value of [null,undefined,0,-1,NaN,Infinity,'','PRIVATE_SENTINEL','x'.repeat(5000),{},[],true]) {
   const candidate={...base,[field]:value};if(value===undefined)delete candidate[field];expect(validatePulseEvent(candidate),field).toBe(Boolean(valid(candidate)));
 }
 expect(validatePulseEvent({...base,properties:{secret:'PRIVATE_SENTINEL'}})).toBe(false);
});
it('independent exporter can run bounded public conformance with stable replay IDs',async()=>{
 const base=JSON.parse(readFileSync(new URL('../contracts/fixtures/events.json',import.meta.url),'utf8')).events[0];
 const seen=new Set<string>();const result=await runExporterConformance({export(batch){const accepted:string[]=[];const duplicates:string[]=[];for(const item of batch){(seen.has(item.event_id)?duplicates:accepted).push(item.event_id);seen.add(item.event_id);}return{accepted,duplicates,rejected:[]};}},base);
 expect(result).toEqual({passed:true,checks:2});
});
it('conformance snapshots getter-backed fields once before handing them to a foreign exporter',async()=>{
 const base=JSON.parse(readFileSync(new URL('../contracts/fixtures/events.json',import.meta.url),'utf8')).events[0];
 let reads=0;const forwarded:unknown[]=[];
 const event={...base,get tool_name(){if(++reads>1)throw Error('PRIVATE_SECOND_READ_SENTINEL');return 'fixture.safe';}};
 const result=await runExporterConformance({export(batch){forwarded.push(...batch);return{accepted:batch.map(item=>item.event_id),duplicates:[],rejected:[]};}},event);
 expect(result).toEqual({passed:true,checks:2});expect(reads).toBe(1);expect(JSON.stringify(forwarded)).not.toContain('PRIVATE_');
});
it('conformance never reports terminal rejection or contradictory blocked acknowledgements as success',async()=>{
 const base=JSON.parse(readFileSync(new URL('../contracts/fixtures/events.json',import.meta.url),'utf8')).events[0];
 for(const exporter of [
  {export:()=>({accepted:[],duplicates:[],rejected:[{event_id:base.event_id,code:'INVALID_EVENT',retryable:false}]})},
  {export:()=>({accepted:[base.event_id],duplicates:[],rejected:[],blocked:'auth' as const})},
  {export:()=>({accepted:[base.event_id],duplicates:[],rejected:[],batchTooLarge:true})},
 ])expect(await runExporterConformance(exporter,base)).toEqual({passed:false,checks:0});
 for(const field of ['accepted','duplicates','rejected']){
  const malformed={accepted:[base.event_id],duplicates:[],rejected:[],[field]:''};
  expect(await runExporterConformance({export:()=>malformed} as unknown as Parameters<typeof runExporterConformance>[0],base)).toEqual({passed:false,checks:0});
 }
});
it('calendar, offset and leap-second fixtures agree with the installed public schema validator',()=>{
 const ajv=new Ajv2020({strict:true});(addFormats as unknown as (ajv:Ajv2020)=>void)(ajv);const valid=ajv.compile(schema);
 const base=JSON.parse(readFileSync(new URL('../contracts/fixtures/events.json',import.meta.url),'utf8')).events[0];
 for(const occurred_at of ['2024-02-29T23:59:59Z','2026-02-29T23:59:59Z','2026-04-31T00:00:00Z','2026-01-01T24:00:00Z','2026-01-01T23:59:60Z','2026-01-01T00:59:60+01:00','2026-01-01T22:59:60-01:00','2026-01-01T00:00:60+00:01','2026-01-01T23:59:61Z','2026-01-01T12:00:00+03','2026-01-01 12:00:00+0300','2026-01-01T12:00:00+24:00',`2026-01-01T12:00:00.${'1'.repeat(101)}Z`]){
  const candidate={...base,occurred_at};expect(validatePulseEvent(candidate),occurred_at).toBe(Boolean(valid(candidate)));
 }
});
