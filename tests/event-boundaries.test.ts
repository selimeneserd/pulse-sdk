import { it,expect } from 'vitest';
import { createPulseCore } from '../packages/core/src/index.js';
import { createMemoryExporter } from '../packages/core/src/memory.js';
it('snapshots identity getters once before byte bounds and native HMAC',async()=>{
 const sink=createMemoryExporter();const pulse=createPulseCore({environment:'test',exporter:sink,identity:{secret:'public-fixture-identity-key-32bytes-long',projectNamespace:'fixture',epoch:'one'}});
 let actors=0,conversations=0;
 try{
  pulse.withContext({get actorId(){return ++actors===1?'account':'x'.repeat(5000);},get conversationId(){return ++conversations===1?'conversation':'x'.repeat(5000);}},()=>pulse.complete({toolName:'fixture.tool',durationMs:1,outcome:'tool_success'}));
  await pulse.flush();expect(actors).toBe(1);expect(conversations).toBe(1);expect(sink.getEvents()[0]!.actor_id).toMatch(/^h1_/);
 }finally{await pulse.shutdown();}
});
