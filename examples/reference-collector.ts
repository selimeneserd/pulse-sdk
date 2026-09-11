// MIT reference/test collector: loopback only, bounded ephemeral memory, no auth.
// Do not deploy as a durable or multi-tenant service.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import eventSchema from '../contracts/event-v1.schema.json' with {type:'json'};
const MAX_BYTES=256*1024, MAX_IDS=1000;
function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}';
 return JSON.stringify(value);
}
/** Implements the documented HTTP contract using only JSON Schema + ordinary Node APIs. */
export async function startReferenceCollector() {
 const ajv=new Ajv2020({strict:true});(addFormats as unknown as (ajv:Ajv2020)=>void)(ajv);const validate=ajv.compile(eventSchema);
 const seen=new Map<string,string>();
 const server=createServer(async(req,res)=>{
  const reply=(status:number,body:unknown)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify(body));};
  if(req.method!=='POST'||req.url!=='/v1/batch')return reply(404,{code:'NOT_FOUND'});
  let bytes=0;const chunks:Buffer[]=[];
  try {
   for await(const chunk of req){bytes+=chunk.length;if(bytes>MAX_BYTES){reply(413,{code:'BODY_TOO_LARGE'});req.resume();return;}chunks.push(Buffer.from(chunk));}
   const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as Record<string,unknown>;
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['events','schema_version'].includes(key))||body.schema_version!==1||!Array.isArray(body.events)||body.events.length<1||body.events.length>100)return reply(400,{code:'INVALID_BATCH'});
   const ids=new Set<string>();
   for(const event of body.events){if(!event||typeof event!=='object'||typeof event.event_id!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(event.event_id)||ids.has(event.event_id))return reply(400,{code:'INVALID_BATCH'});ids.add(event.event_id);}
   const accepted:string[]=[],duplicates:string[]=[],rejected:{event_id:string;code:string;retryable:false}[]=[];
   for(const event of body.events){
    const eventId=event.event_id as string;
    if(!validate(event)){rejected.push({event_id:eventId,code:'INVALID_EVENT',retryable:false});continue;}
    const digest=createHash('sha256').update(canonical(event)).digest('hex');
    if(seen.has(eventId)){if(seen.get(eventId)===digest)duplicates.push(eventId);else rejected.push({event_id:eventId,code:'EVENT_ID_CONFLICT',retryable:false});continue;}
    if(seen.size>=MAX_IDS)seen.delete(seen.keys().next().value!);seen.set(eventId,digest);accepted.push(eventId);
   }
   reply(202,{accepted,duplicates,rejected,server_time:new Date().toISOString()});
  }catch{reply(400,{code:'INVALID_BATCH'});}
 });
 server.requestTimeout=2000;server.headersTimeout=2000;
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const addr=server.address();if(!addr||typeof addr==='string')throw new Error('REFERENCE_ADDRESS_UNAVAILABLE');
 return {endpoint:`http://127.0.0.1:${addr.port}/v1/batch`,retained:()=>seen.size,close:async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const collector=await startReferenceCollector();process.stderr.write(JSON.stringify({message:'LOCAL TEST ONLY, ephemeral collector / YALNIZCA YEREL TEST, geçici toplayıcı',endpoint:collector.endpoint})+'\n');
 process.once('SIGINT',()=>{void collector.close();});process.once('SIGTERM',()=>{void collector.close();});
}
