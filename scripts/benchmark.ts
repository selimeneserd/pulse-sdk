/** Local repeatable measurements. No production endpoints, keys, or customer tools. */
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus, totalmem, platform, arch, release } from 'node:os';
import { dirname, resolve } from 'node:path';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { McpServer, type ServerContext } from '@modelcontextprotocol/server';
import { createPulse } from '@reviseflow/pulse';
import { createMemoryExporter } from '@reviseflow/pulse-core/memory';
import { createHttpExporter } from '@reviseflow/pulse-core/http';
import type { PulseDiagnostics, PulseEvent } from '@reviseflow/pulse-core';
import { startMcpFixture } from '../examples/fixture.ts';

type Mode = 'absent' | 'disabled' | 'memory' | 'http_healthy' | 'http_slow' | 'http_unreachable' | 'http_stalled';
type Workload = 'burst' | 'sustained' | 'full_queue' | 'shutdown';
type Case = { mode: Mode; identity: boolean; workload: Workload; calls: number };
const repetitions = 3;
const warmupCalls = 100;
const output = resolve(process.argv[2] ?? 'docs/evidence/benchmark-20260911.json');
const identity = { secret: 'public-benchmark-only-identity-vector-not-production', projectNamespace: 'benchmark', epoch: 'v1' };
const ctx = { mcpReq: { signal: new AbortController().signal } } as ServerContext;
const originalResult = Object.freeze({ content: [] });
const callback = () => originalResult;
const percentile = (values: readonly number[], p: number): number | null => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)]! : null;
const counters = ['observed','accepted','duplicates','rejected','requests','retries','exporterFailures','droppedOverflow','droppedOversize','droppedRetries','droppedAuth','droppedQuota','droppedInvalid','droppedShutdown','droppedPaused','droppedTimeout'] as const;
async function listen(server: Server): Promise<string> {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('BENCHMARK_LOCAL_BIND_FAILED');
  return `http://127.0.0.1:${address.port}/v1/batch`;
}
async function collector(mode: Mode) {
  let received = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    if (mode === 'http_stalled') return;
    const events = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { events: PulseEvent[] }).events;
    const acknowledge = () => {
      received += events.length;
      response.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({ accepted: events.map(event => event.event_id), duplicates: [], rejected: [], server_time: new Date().toISOString() }));
    };
    if (mode === 'http_slow') {
      const timer = setTimeout(() => { timers.delete(timer); acknowledge(); }, 15); timers.add(timer);
    } else acknowledge();
  });
  const endpoint = await listen(server);
  let closed = false;
  const close = async () => {
    if (closed) return; closed = true;
    for (const timer of timers) clearTimeout(timer); timers.clear();
    server.closeAllConnections(); await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  };
  if (mode === 'http_unreachable') await close();
  return { endpoint, close, received: () => received };
}
function diagnosticDifference(before: PulseDiagnostics | undefined, after: PulseDiagnostics | undefined) {
  return after ? Object.fromEntries(counters.map(key => [key, after[key] - (before?.[key] ?? 0)])) : null;
}
async function measure(test: Case) {
  const sink = test.mode.startsWith('http_') ? await collector(test.mode) : undefined;
  const exporter = sink ? createHttpExporter({ endpoint: sink.endpoint }) : createMemoryExporter({ maxEvents: 1000 });
  const queue = { maxEvents: test.workload === 'full_queue' ? 64 : 1000, maxBytes: 1024 * 1024, batchMaxEvents: 100, batchMaxBytes: 256 * 1024, flushIntervalMs: 10, requestTimeoutMs: test.mode === 'http_stalled' ? 20 : 100, maxRetries: 1, retryBaseMs: 2, retryMaxMs: 20 };
  const pulse = test.mode === 'absent' ? undefined : createPulse({ environment: 'test', enabled: test.mode !== 'disabled', exporter, queue, ...(test.identity ? { identity } : {}) });
  const original = new McpServer({ name: 'pulse-benchmark-only', version: '1' });
  const server = pulse ? pulse.wrapServer(original) : original;
  // handler is an exported RegisteredTool public property in installed MCP2.0.0;
  // hidden executor and registries are never inspected. Full MCP requests are measured separately.
  const handle = server.registerTool('benchmark_tool', {}, callback);
  const invoke = () => Reflect.apply(handle.handler, undefined, [ctx]);
  const call = test.identity && pulse ? () => pulse.withContext({ actorId: 'public-benchmark-account', conversationId: 'public-benchmark-session' }, invoke) : invoke;
  try {
    for (let index = 0; index < warmupCalls; index++) if (call() !== originalResult) throw new Error('BENCHMARK_HANDLER_CHANGED');
    await pulse?.flush({ timeoutMs: 2000 });
    const before = pulse?.getDiagnostics();
    const receivedBefore = sink?.received() ?? 0;
    const latencies: number[] = [];
    const loop = monitorEventLoopDelay({ resolution: 1 });
    loop.enable(); await sleep(2); loop.reset();
    const rssBefore = process.memoryUsage().rss;
    const heapBefore = process.memoryUsage().heapUsed;
    let peakRss = rssBefore, peakQueue = 0, peakPendingBytes = 0;
    const sample = () => {
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
      const d = pulse?.getDiagnostics(); peakQueue = Math.max(peakQueue, (d?.queued ?? 0) + (d?.inFlight ?? 0)); peakPendingBytes = Math.max(peakPendingBytes, d?.pendingBytes ?? 0);
    };
    const cpuBefore = process.cpuUsage();
    const began = performance.now();
    for (let index = 0; index < test.calls; index++) {
      const start = performance.now();
      const returned = call();
      latencies.push((performance.now() - start) * 1000);
      if (returned !== originalResult) throw new Error('BENCHMARK_HANDLER_CHANGED');
      if (index % 25 === 0) sample();
      if (test.workload === 'sustained' && (index + 1) % 25 === 0) await sleep(1);
    }
    sample();
    const invocationLoopMs = performance.now() - began;
    const cpuInvocation = process.cpuUsage(cpuBefore);
    const finishing = performance.now();
    if (test.workload === 'shutdown') await pulse?.shutdown({ timeoutMs: 10 });
    else await pulse?.flush({ timeoutMs: 2000 });
    const lifecycleMs = performance.now() - finishing;
    sample(); await sleep(2); loop.disable();
    const cpuTotal = process.cpuUsage(cpuBefore);
    const after = pulse?.getDiagnostics();
    return {
      latencies,
      run: {
        calls: test.calls, queueSettings: queue, invocationLoopMs, lifecycleMs, wallThroughputCallsPerSecond: test.calls / (invocationLoopMs / 1000),
        synchronousInvocation: { meanUs: latencies.reduce((sum, value) => sum + value, 0) / latencies.length, p50Us: percentile(latencies, .5), p95Us: percentile(latencies, .95), p99Us: percentile(latencies, .99), minUs: Math.min(...latencies), maxUs: Math.max(...latencies) },
        cpu: { invocationUserMs: cpuInvocation.user / 1000, invocationSystemMs: cpuInvocation.system / 1000, totalUserMs: cpuTotal.user / 1000, totalSystemMs: cpuTotal.system / 1000 },
        memory: { rssBeforeBytes: rssBefore, peakRssBytes: peakRss, rssAfterBytes: process.memoryUsage().rss, heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore, peakPendingEvents: peakQueue, peakEncodedPendingBytes: peakPendingBytes },
        eventLoop: { samples: loop.count, p95Ms: loop.count ? loop.percentile(95) / 1e6 : null, p99Ms: loop.count ? loop.percentile(99) / 1e6 : null, maxMs: loop.count ? loop.max / 1e6 : null },
        diagnostics: diagnosticDifference(before, after), finalPendingEvents: (after?.queued ?? 0) + (after?.inFlight ?? 0), finalStatus: after?.status ?? null,
        collectorObservedAfterWarmup: sink ? sink.received() - receivedBefore : null,
      },
    };
  } finally { await pulse?.shutdown({timeoutMs:100}); await original.close(); await sink?.close(); }
}
async function realMcp() {
  const results = [];
  for (const mode of ['absent', 'disabled', 'memory', 'http_healthy'] as const) {
    const runs = [];
    const allLatencies: number[] = [];
    for (let repetition = 0; repetition < repetitions; repetition++) {
      const sink = mode === 'http_healthy' ? await collector(mode) : undefined;
      const pulse = mode === 'absent' ? undefined : createPulse({environment:'test',enabled:mode!=='disabled',exporter:sink?createHttpExporter({endpoint:sink.endpoint}):createMemoryExporter(),queue:{flushIntervalMs:10}});
      const fixture = await startMcpFixture(server => {server.registerTool('benchmark_tool',{},callback);}, pulse ? {pulse} : {});
      try {
        const client = await fixture.connect();
        for(let index=0;index<10;index++) await client.callTool({name:'benchmark_tool',arguments:{}});
        await pulse?.flush(); const before=pulse?.getDiagnostics(); const started=performance.now(); const cpu=process.cpuUsage(); const samples:number[]=[];
        for(let index=0;index<50;index++) {
          const begin=performance.now(); const result=await client.callTool({name:'benchmark_tool',arguments:{}}); samples.push((performance.now()-begin)*1000);
          if(result.isError) throw new Error('BENCHMARK_MCP_FAILED');
        }
        const elapsed=performance.now()-started; await pulse?.flush(); const used=process.cpuUsage(cpu); allLatencies.push(...samples);
        runs.push({calls:50,elapsedMs:elapsed,throughputCallsPerSecond:50/(elapsed/1000),p95Us:percentile(samples,.95),p99Us:percentile(samples,.99),cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,diagnostics:diagnosticDifference(before,pulse?.getDiagnostics())});
      } finally {await fixture.close();await pulse?.shutdown();await sink?.close();}
    }
    results.push({mode,identity:false,scope:'real Streamable HTTP MCP request latency, including local HTTP protocol and handler',runs,pooled:{p95Us:percentile(allLatencies,.95),p99Us:percentile(allLatencies,.99)}});
  }
  return results;
}
const sourceFiles=['scripts/benchmark.ts','packages/core/dist/config.js','packages/core/dist/index.js','packages/core/dist/export-input.js','packages/core/dist/conformance.js','packages/core/dist/exporter.js','packages/core/dist/event.js','packages/core/dist/http.js','packages/core/dist/memory.js','packages/mcp/dist/index.js'];
async function fingerprint(){return Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));}
const initialFingerprints=await fingerprint();
const cases: Case[] = [];
for(const mode of ['absent','disabled'] as const) for(const workload of ['burst','sustained'] as const) cases.push({mode,identity:false,workload,calls:workload==='burst'?1500:600});
for(const mode of ['memory','http_healthy','http_slow','http_unreachable'] as const) for(const enabled of [false,true]) for(const workload of ['burst','sustained'] as const) cases.push({mode,identity:enabled,workload,calls:workload==='burst'?1500:600});
for(const mode of ['memory','http_slow'] as const) cases.push({mode,identity:false,workload:'full_queue',calls:2000});
cases.push({mode:'memory',identity:false,workload:'shutdown',calls:200},{mode:'http_stalled',identity:false,workload:'shutdown',calls:200});
const results = [];
for(const test of cases) {
  const runs=[];const samples:number[]=[];
  for(let repetition=0;repetition<repetitions;repetition++){const measured=await measure(test);runs.push(measured.run);samples.push(...measured.latencies);}
  const meanUs=samples.reduce((sum,value)=>sum+value,0)/samples.length;
  results.push({...test,runs,pooled:{meanUs,p95Us:percentile(samples,.95),p99Us:percentile(samples,.99)},ratioToAbsentMean:null as number|null});
}
for(const result of results){const baseline=results.find(candidate=>candidate.mode==='absent'&&candidate.workload===(result.workload==='sustained'?'sustained':'burst'));if(baseline)result.ratioToAbsentMean=result.pooled.meanUs/baseline.pooled.meanUs;}
const realMcpRequests=await realMcp();
const dependencyVersions=Object.fromEntries(await Promise.all(['packages/core/package.json','packages/mcp/package.json','node_modules/@modelcontextprotocol/server/package.json','node_modules/@modelcontextprotocol/client/package.json','node_modules/@modelcontextprotocol/node/package.json'].map(async file=>{const manifest=JSON.parse(await readFile(file,'utf8')) as {name:string;version:string};return [manifest.name,manifest.version];})));
const fingerprints=await fingerprint();
if(JSON.stringify(fingerprints)!==JSON.stringify(initialFingerprints)) throw new Error('BENCHMARK_BUILD_CHANGED_DURING_RUN');
const document={
  schemaVersion:1,recordedAt:new Date().toISOString(),environment:{node:process.version,dependencyVersions,platform:platform(),arch:arch(),osRelease:release(),cpuModel:cpus()[0]?.model??null,logicalCpus:cpus().length,memoryBytes:totalmem(),gitSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTreeDirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim().length>0,sourceSha256:fingerprints},
  methodology:{repetitions,warmupCallsPerMicrobenchRun:warmupCalls,fullRequestWarmupCalls:10,fullRequestCallsPerRun:50,randomizedOrder:false,explicitGc:false,percentileMethod:'nearest-rank over pooled individual observations, never averages of percentiles',sustainedPacing:'25 synchronous invocations then a 1 ms timer yield',localSlowCollectorDelayMs:15,shutdownDeadlineMs:10,scope:'public MCP registered handler direct invocation microbench; full HTTP MCP request samples reported separately',queuePolicy:'encoded-byte/count bounded; queued oldest evicted, in-flight retained; burst intentionally exceeds default1000 queue',rssSampling:'before/after and every25 invocations, not a process-isolated exact peak',notes:['Local public fixture identifiers only; no production requests.','Synchronous mean includes timer-sampling overhead and optional identity context, excludes async export I/O.','Invocation loop CPU includes concurrently executed exporter and local collector work; totalCPU includes flush/shutdown. HTTP process CPU is not isolated SDK CPU.','Sequential cases share one process; JIT/GC/system contention influence ratios.','Absent and disabled load SDK modules in the process but do not execute instrumentation; no import/startup cost claim.','Microbench ratios are to the matching absent workload; stress cases use absent burst reference.']},
  microbenchmarks:results,realMcpRequests,
};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(document,null,2)+'\n');
process.stderr.write(JSON.stringify({code:'BENCHMARK_COMPLETE',microbenchmarkCases:results.length,repetitions,realMcpModes:4,output})+'\n');
