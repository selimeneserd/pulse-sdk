import type { ResolvedOptions } from './config.js';
import type { PulseDiagnostics, PulseEvent } from './types.js';

type Entry = Readonly<{ event: PulseEvent; json: string; bytes: number; sequence: number }>;
type Counters = { -readonly [K in Exclude<keyof PulseDiagnostics, 'queued' | 'inFlight' | 'pendingBytes'>]: number };
type DropCounter = 'droppedOverflow' | 'droppedOversize' | 'droppedRetries' | 'droppedAuth' | 'droppedQuota' | 'droppedShutdown';
const prefix = '{"schema_version":1,"events":[';
const suffix = ']}';
const envelopeBytes = Buffer.byteLength(prefix + suffix);
const responseByteLimit = 64 * 1024;

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > responseByteLimit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch { return null; }
  finally { reader.releaseLock(); }
}

function retryAfter(value: string | null): number | null {
  if (value === null || value.length > 100) return null;
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const delay = Number(value) * 1000;
    return Number.isFinite(delay) ? Math.max(0, delay) : null;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function parseAcknowledgement(body: unknown, entries: readonly Entry[]) {
  if (!object(body) || !Array.isArray(body.accepted) || !Array.isArray(body.duplicates) || !Array.isArray(body.rejected) || typeof body.server_time !== 'string' || !Number.isFinite(Date.parse(body.server_time))) return null;
  const valid = new Set(entries.map(entry => entry.event.event_id));
  const seen = new Set<string>();
  const accepted = new Set<string>();
  const duplicates = new Set<string>();
  const rejected = new Set<string>();
  for (const [values, target] of [[body.accepted, accepted], [body.duplicates, duplicates]] as const) {
    if (values.length > entries.length) return null;
    for (const id of values) {
      if (typeof id !== 'string' || !valid.has(id) || seen.has(id)) return null;
      seen.add(id); target.add(id);
    }
  }
  if (body.rejected.length > entries.length) return null;
  for (const rejection of body.rejected) {
    if (!object(rejection) || typeof rejection.event_id !== 'string' || !valid.has(rejection.event_id) || seen.has(rejection.event_id) || rejection.retryable !== false || typeof rejection.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(rejection.code)) return null;
    seen.add(rejection.event_id); rejected.add(rejection.event_id);
  }
  if (body.next_retry_after_ms !== undefined && (typeof body.next_retry_after_ms !== 'number' || !Number.isFinite(body.next_retry_after_ms) || body.next_retry_after_ms < 0)) return null;
  return { accepted, duplicates, rejected, delay: typeof body.next_retry_after_ms === 'number' ? body.next_retry_after_ms : null };
}

export function createExporter(options: ResolvedOptions) {
  const settings = options.queue;
  const queue: Entry[] = [];
  let inFlight: Entry[] = [];
  let pendingBytes = 0;
  let sequence = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  let activeRequest: AbortController | undefined;
  let closing = false;
  let stopped = false;
  let blocked: 'droppedAuth' | 'droppedQuota' | null = null;
  const retryAbort = new AbortController();
  let shutdownTask: Promise<void> | undefined;
  const counts: Counters = {
    observed: 0, accepted: 0, duplicates: 0, rejected: 0, requests: 0, retries: 0,
    exporterFailures: 0, droppedOverflow: 0, droppedOversize: 0, droppedRetries: 0,
    droppedAuth: 0, droppedQuota: 0, droppedInvalid: 0, droppedShutdown: 0,
  };

  function clearFlushTimer() {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
  }
  function discardQueue(counter: DropCounter) {
    for (const entry of queue) { pendingBytes -= entry.bytes; counts[counter]++; }
    queue.length = 0;
  }
  function remove(entries: readonly Entry[], count: keyof Counters) {
    const ids = new Set(entries.map(entry => entry.event.event_id));
    inFlight = inFlight.filter(entry => {
      if (!ids.has(entry.event.event_id)) return true;
      pendingBytes -= entry.bytes;
      counts[count]++;
      return false;
    });
  }
  function schedule() {
    if (!options.enabled || stopped || closing || blocked || timer !== undefined || !queue.length) return;
    timer = setTimeout(() => { timer = undefined; void start(); }, settings.flushIntervalMs);
    timer.unref();
  }
  function delay(ms: number): Promise<void> {
    if (retryAbort.signal.aborted) return Promise.resolve();
    return new Promise(resolve => {
      const finish = () => { clearTimeout(handle); retryAbort.signal.removeEventListener('abort', finish); resolve(); };
      const handle = setTimeout(finish, ms);
      retryAbort.signal.addEventListener('abort', finish, { once: true });
    });
  }
  async function request(entries: readonly Entry[]) {
    const controller = new AbortController();
    activeRequest = controller;
    const timeout = setTimeout(() => controller.abort(), settings.requestTimeoutMs);
    counts.requests++;
    try {
      const response = await fetch(options.endpoint!, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${options.writeKey!}` },
        body: prefix + entries.map(entry => entry.json).join(',') + suffix,
        signal: controller.signal,
      });
      const body = await readBoundedJson(response);
      return { status: response.status, body, delay: retryAfter(response.headers.get('retry-after')) };
    } catch {
      // No raw network error, URL, authorization header, or response is retained.
      return { status: 0, body: null, delay: null };
    } finally {
      clearTimeout(timeout);
      if (activeRequest === controller) activeRequest = undefined;
    }
  }
  async function send(initial: readonly Entry[], consumedRetries = 0): Promise<void> {
    let entries = [...initial];
    let attempt = consumedRetries;
    while (entries.length) {
      if (stopped) { remove(entries, 'droppedShutdown'); return; }
      if (blocked) { remove(entries, blocked); return; }
      const response = await request(entries);
      if (stopped) { remove(entries, 'droppedShutdown'); return; }
      let minimumDelay = response.delay;
      if (response.status === 202) {
        const acknowledgement = parseAcknowledgement(response.body, entries);
        if (acknowledgement) {
          remove(entries.filter(entry => acknowledgement.accepted.has(entry.event.event_id)), 'accepted');
          remove(entries.filter(entry => acknowledgement.duplicates.has(entry.event.event_id)), 'duplicates');
          remove(entries.filter(entry => acknowledgement.rejected.has(entry.event.event_id)), 'rejected');
          entries = entries.filter(entry => !acknowledgement.accepted.has(entry.event.event_id) && !acknowledgement.duplicates.has(entry.event.event_id) && !acknowledgement.rejected.has(entry.event.event_id));
          minimumDelay = Math.max(minimumDelay ?? 0, acknowledgement.delay ?? 0);
          if (!entries.length) return;
        }
      } else if (response.status === 401 || response.status === 403) {
        blocked = 'droppedAuth';
        remove(entries, blocked); discardQueue(blocked); clearFlushTimer();
        return;
      } else if (response.status === 429 && object(response.body) && ['QUOTA_EXCEEDED', 'QUOTA_EXHAUSTED'].includes(String(response.body.code))) {
        // Resume by recreating an instance after the owner resolves quota; no hot retry queue.
        blocked = 'droppedQuota';
        remove(entries, blocked); discardQueue(blocked); clearFlushTimer();
        return;
      } else if (response.status === 413) {
        if (entries.length === 1) { remove(entries, 'droppedOversize'); return; }
        const midpoint = Math.ceil(entries.length / 2);
        await send(entries.slice(0, midpoint), attempt);
        await send(entries.slice(midpoint), attempt);
        return;
      } else if (response.status !== 0 && response.status !== 408 && response.status !== 425 && response.status !== 429 && response.status < 500) {
        remove(entries, 'rejected');
        return;
      }
      counts.exporterFailures++;
      if (attempt >= settings.maxRetries || (minimumDelay !== null && minimumDelay > settings.retryMaxMs)) {
        remove(entries, 'droppedRetries');
        return;
      }
      const exponential = Math.min(settings.retryMaxMs, settings.retryBaseMs * (2 ** attempt));
      const jittered = Math.min(settings.retryMaxMs, exponential * (0.5 + Math.random() * 0.5));
      await delay(Math.max(jittered, minimumDelay ?? 0));
      if (stopped) { remove(entries, 'droppedShutdown'); return; }
      attempt++;
      counts.retries++;
    }
  }
  async function drain(cutoff: number) {
    try {
      while (!stopped && queue.length && queue[0]!.sequence <= cutoff) {
        const batch: Entry[] = [];
        let bytes = envelopeBytes;
        while (queue.length && queue[0]!.sequence <= cutoff && batch.length < settings.batchMaxEvents) {
          const next = queue[0]!;
          if (batch.length && bytes + next.bytes > settings.batchMaxBytes) break;
          if (bytes + next.bytes > settings.batchMaxBytes) {
            queue.shift(); pendingBytes -= next.bytes; counts.droppedOversize++;
            continue;
          }
          batch.push(queue.shift()!); bytes += next.bytes;
        }
        if (!batch.length) continue;
        inFlight = batch;
        await send(batch);
      }
    } catch {
      // Unexpected local exporter errors are isolated from application execution.
      counts.exporterFailures++;
      remove(inFlight, 'droppedRetries');
    }
  }
  function start(cutoff = sequence): Promise<void> {
    if (active) return active;
    if (!options.enabled || stopped || blocked || !queue.length) return Promise.resolve();
    clearFlushTimer();
    const task = drain(cutoff);
    active = task.finally(() => { active = undefined; schedule(); });
    return active;
  }
  async function drainThrough(cutoff: number): Promise<void> {
    // Each caller owns a finite snapshot, even when it joins an older flush.
    while (!stopped && !blocked && ((queue[0]?.sequence ?? Infinity) <= cutoff || inFlight.some(entry => entry.sequence <= cutoff))) {
      await start(cutoff);
    }
  }
  async function waitFor(task: Promise<void>, timeoutMs: number) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([task, new Promise<void>(resolve => { timeout = setTimeout(resolve, timeoutMs); })]);
    } finally { if (timeout !== undefined) clearTimeout(timeout); }
  }
  return {
    invalid() { counts.droppedInvalid++; },
    enqueue(event: PulseEvent) {
      if (!options.enabled) return;
      counts.observed++;
      if (closing || stopped) { counts.droppedShutdown++; return; }
      if (blocked) { counts[blocked]++; return; }
      const json = JSON.stringify(event);
      const bytes = Buffer.byteLength(json) + 1;
      if (bytes + envelopeBytes > settings.batchMaxBytes || bytes + envelopeBytes > settings.maxBytes) { counts.droppedOversize++; return; }
      while (queue.length && (queue.length + inFlight.length >= settings.maxEvents || pendingBytes + bytes + envelopeBytes > settings.maxBytes)) {
        pendingBytes -= queue.shift()!.bytes;
        counts.droppedOverflow++;
      }
      if (queue.length + inFlight.length >= settings.maxEvents || pendingBytes + bytes + envelopeBytes > settings.maxBytes) { counts.droppedOverflow++; return; }
      queue.push(Object.freeze({ event, json, bytes, sequence: ++sequence }));
      pendingBytes += bytes;
      schedule();
    },
    async flush(timeoutMs: number) {
      if (!options.enabled || stopped) return;
      await waitFor(drainThrough(sequence), timeoutMs);
    },
    shutdown(): Promise<void> {
      if (shutdownTask) return shutdownTask;
      closing = true;
      clearFlushTimer();
      const cutoff = sequence;
      shutdownTask = (async () => {
        if (options.enabled) await waitFor(drainThrough(cutoff), settings.requestTimeoutMs);
        stopped = true;
        retryAbort.abort();
        activeRequest?.abort();
        discardQueue('droppedShutdown');
        if (active) await active;
      })();
      return shutdownTask;
    },
    getDiagnostics(): PulseDiagnostics {
      return Object.freeze({ ...counts, queued: queue.length, inFlight: inFlight.length, pendingBytes: pendingBytes > 0 ? pendingBytes + envelopeBytes : 0 });
    },
  };
}
