import { describe, it, expect } from 'vitest';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor, AlwaysOffSampler } from '@opentelemetry/sdk-trace-base';
import { SpanKind } from '@opentelemetry/api';
import { runOtelExample } from '../examples/otel.js';
import { createOtelExporter } from '../packages/otel/src/index.js';
import events from '../contracts/fixtures/events.json' with {type:'json'};
import type { PulseEvent } from '../packages/core/src/types.js';
describe('optional real OTel handoff',()=>{
 it('real MCP -> handler -> one INTERNAL span, no request-latency or client/delegation counts',async()=>{
  const result=await runOtelExample(); expect(result.spans).toHaveLength(1);expect(result.diagnostics.accepted).toBe(1);
  expect(result.spans[0]).toMatchObject({name:'pulse.tool_handler',kind:SpanKind.INTERNAL,attributes:{'pulse.measurement.scope':'handler_completion','pulse.coverage':'unknown','gen_ai.tool.name':'health'}});
  expect(JSON.stringify(result.spans)).not.toMatch(/mcp\.request\.duration|rpc\.duration|arguments|exception|prompt|actor_id|conversation_id|content/);
 });
 it('stable-ID replay duplicates locally, does not re-import own spans',async()=>{
  const sink=new InMemorySpanExporter();const provider=new BasicTracerProvider({spanProcessors:[new SimpleSpanProcessor(sink)]});
  try {const exporter=createOtelExporter({tracer:provider.getTracer('test')});const batch=[events.events[0] as PulseEvent];const ctx={signal:new AbortController().signal};
   expect((await exporter.export(batch,ctx)).accepted).toHaveLength(1);expect((await exporter.export(batch,ctx)).duplicates).toHaveLength(1);await provider.forceFlush();expect(sink.getFinishedSpans()).toHaveLength(1);
   expect(sink.getFinishedSpans()[0]!.attributes['pulse.origin']).toBe('pulse-exporter');
  }finally{await provider.shutdown();}
 });
 it('sampled-away local handoff never claims known coverage or exact remote totals',async()=>{
  const sink=new InMemorySpanExporter();const provider=new BasicTracerProvider({sampler:new AlwaysOffSampler(),spanProcessors:[new SimpleSpanProcessor(sink)]});
  try{const exporter=createOtelExporter({tracer:provider.getTracer('test')});const result=await exporter.export([events.events[0] as PulseEvent],{signal:new AbortController().signal});await provider.forceFlush();expect(result.accepted).toHaveLength(1);expect(sink.getFinishedSpans()).toHaveLength(0);}finally{await provider.shutdown();}
 });
 it('rejects injected raw fields before OTel attribute creation',async()=>{
  const sink=new InMemorySpanExporter();const provider=new BasicTracerProvider({spanProcessors:[new SimpleSpanProcessor(sink)]});
  try{const exporter=createOtelExporter({tracer:provider.getTracer('test')});const malicious={...events.events[0],properties:{prompt:'PRIVATE_OTEL_SENTINEL'}} as unknown as PulseEvent;expect((await exporter.export([malicious],{signal:new AbortController().signal})).rejected).toHaveLength(1);expect(sink.getFinishedSpans()).toHaveLength(0);}finally{await provider.shutdown();}
 });
});

describe('OTel acknowledgement integrity and foreign metadata boundary',()=>{
 it('exposes localized bounded configuration errors without raw input',()=>{
  for(const options of [{tracer:null},{tracer:{startSpan(){}},deduplicationMaxEvents:0}]){
   let caught:unknown;
   try{createOtelExporter(options as unknown as Parameters<typeof createOtelExporter>[0]);}catch(error){caught=error;}
   expect(caught).toMatchObject({code:'PULSE_INVALID_CONFIGURATION'});
   const error=caught as {getMessage(locale:'en'|'tr'):string};
   expect(error.getMessage('en')).toContain('configuration');expect(error.getMessage('tr')).toContain('yapılandırması');
  }
 });
 it('fingerprints all long wire timestamp text even when its fraction rounds to the same millisecond',async()=>{
  const sink=new InMemorySpanExporter();const provider=new BasicTracerProvider({spanProcessors:[new SimpleSpanProcessor(sink)]});
  try{
   const exporter=createOtelExporter({tracer:provider.getTracer('test'),deduplicationMaxEvents:1}),context={signal:new AbortController().signal};
   const prefix=`2026-01-01T12:00:00.${'0'.repeat(32768)}`;
   const event={...events.events[0],occurred_at:prefix+'1Z'} as PulseEvent,changed={...event,occurred_at:prefix+'2Z'};
   expect(Date.parse(event.occurred_at)).toBe(Date.parse(changed.occurred_at));
   expect((await exporter.export([event],context)).accepted).toEqual([event.event_id]);
   expect((await exporter.export([event],context)).duplicates).toEqual([event.event_id]);
   expect((await exporter.export([changed],context)).rejected).toEqual([{event_id:event.event_id,code:'EVENT_ID_CONFLICT',retryable:false}]);
   await provider.forceFlush();expect(sink.getFinishedSpans()).toHaveLength(1);
  }finally{await provider.shutdown();}
 });
 it('preserves historical epoch timestamps and fractional handler duration without relative-clock inference',async()=>{
  const sink=new InMemorySpanExporter();const provider=new BasicTracerProvider({spanProcessors:[new SimpleSpanProcessor(sink)]});
  try{
   const exporter=createOtelExporter({tracer:provider.getTracer('test')});
   await exporter.export([{...events.events[0],occurred_at:'1970-01-01T00:00:01.000Z',duration_ms:123.5} as PulseEvent],{signal:new AbortController().signal});
   await provider.forceFlush();expect(sink.getFinishedSpans()[0]).toMatchObject({startTime:[0,876500000],endTime:[1,0],duration:[0,123500000]});
  }finally{await provider.shutdown();}
 });
 it('rejects conflicting bodies for one immutable ID while key-order-only replay remains a duplicate',async()=>{
  const sink=new InMemorySpanExporter();const provider=new BasicTracerProvider({spanProcessors:[new SimpleSpanProcessor(sink)]});
  try{
   const exporter=createOtelExporter({tracer:provider.getTracer('test')}),event=events.events[0] as PulseEvent,context={signal:new AbortController().signal};
   expect((await exporter.export([event],context)).accepted).toEqual([event.event_id]);
   expect((await exporter.export([Object.fromEntries(Object.entries(event).reverse()) as unknown as PulseEvent],context)).duplicates).toEqual([event.event_id]);
   expect((await exporter.export([{...event,duration_ms:event.duration_ms+1}],context)).rejected).toEqual([{event_id:event.event_id,code:'EVENT_ID_CONFLICT',retryable:false}]);
   await provider.forceFlush();expect(sink.getFinishedSpans()).toHaveLength(1);
  }finally{await provider.shutdown();}
 });
 it('does not invent a successful duplicate receipt after foreign tracer failure',async()=>{
  let attempts=0;const tracer={startSpan(){attempts++;throw Error('PRIVATE_TRACER_SENTINEL');}} as unknown as Parameters<typeof createOtelExporter>[0]['tracer'];
  const exporter=createOtelExporter({tracer}),event=events.events[0] as PulseEvent,context={signal:new AbortController().signal};
  for(let i=0;i<2;i++)expect(await exporter.export([event],context)).toEqual({accepted:[],duplicates:[],rejected:[{event_id:event.event_id,code:'OTEL_LOCAL_FAILURE',retryable:false}]});
  expect(attempts).toBe(1);
 });
 it('rejects unrepresentable wire timestamps before calling a tracer or substituting its clock',async()=>{
  const sink=new InMemorySpanExporter();const provider=new BasicTracerProvider({spanProcessors:[new SimpleSpanProcessor(sink)]});
  try{
   const exporter=createOtelExporter({tracer:provider.getTracer('test')});
   for(const occurred_at of ['2026-01-01T23:59:60Z','2026-01-01T12:00:00+03']){
    const event={...events.events[0],occurred_at} as PulseEvent;
    expect(await exporter.export([event],{signal:new AbortController().signal})).toEqual({accepted:[],duplicates:[],rejected:[{event_id:event.event_id,code:'INVALID_EVENT',retryable:false}]});
   }
   expect(sink.getFinishedSpans()).toHaveLength(0);
  }finally{await provider.shutdown();}
 });
 it('snapshots foreign accessors once before constructing any attributes',async()=>{
  const sink=new InMemorySpanExporter();const provider=new BasicTracerProvider({spanProcessors:[new SimpleSpanProcessor(sink)]});let reads=0;
  try{
   const exporter=createOtelExporter({tracer:provider.getTracer('test')});
   const event={...events.events[0],get tool_name(){return ++reads===1?'fixture.safe':'PRIVATE_TOOL_SENTINEL@example.test';}} as PulseEvent;
   expect((await exporter.export([event],{signal:new AbortController().signal})).accepted).toHaveLength(1);await provider.forceFlush();
   expect(reads).toBe(1);expect(sink.getFinishedSpans()[0]!.attributes['gen_ai.tool.name']).toBe('fixture.safe');expect(JSON.stringify(sink.getFinishedSpans().map(span=>span.attributes))).not.toContain('PRIVATE_TOOL_SENTINEL');
  }finally{await provider.shutdown();}
 });
});
