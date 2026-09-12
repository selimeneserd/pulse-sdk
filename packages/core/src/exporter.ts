import type { ResolvedOptions } from './config.js';
import { snapshotExportResult } from './export-result.js';
import type { PulseDiagnostics, PulseEvent, PulseExporter, PulseExportResult } from './types.js';

type Entry = Readonly<{ event: PulseEvent; bytes: number; sequence: number }>;
type Counter = 'observed' | 'accepted' | 'duplicates' | 'rejected' | 'requests' | 'retries' | 'exporterFailures' | 'droppedOverflow' | 'droppedOversize' | 'droppedRetries' | 'droppedAuth' | 'droppedQuota' | 'droppedInvalid' | 'droppedShutdown' | 'droppedPaused' | 'droppedTimeout';
// Byte accounting covers the public JSON HTTP envelope, even for local exporters.
const envelopeBytes = Buffer.byteLength('{"schema_version":1,"events":[]}');
const encoder = new TextEncoder();
/** This module owns all queues, timeout deadlines, batching, and retries; it performs no I/O. */
export function createDispatcher(options: ResolvedOptions) {
  const settings = options.queue;
  const queue: Entry[] = [];
  let inFlight: Entry[] = [];
  let pendingBytes = 0;
  let queuedBytes = 0;
  let sequence = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let microtaskScheduled = false;
  let active: Promise<void> | undefined;
  let activeRequest: AbortController | undefined;
  let closing = false;
  let stopped = false;
  let paused = false;
  let blocked: 'auth' | 'exporter_timeout' | null = null;
  let unsettledExporter = false;
  let lastAcceptedAt: string | null = null;
  let retryAttempt = 0;
  let exporterGeneration = 0;
  const retryAbort = new AbortController();
  let shutdownTask: Promise<void> | undefined;
  let notifying = false;
  const counts: Record<Counter, number> = {
    observed: 0, accepted: 0, duplicates: 0, rejected: 0, requests: 0, retries: 0,
    exporterFailures: 0, droppedOverflow: 0, droppedOversize: 0, droppedRetries: 0,
    droppedAuth: 0, droppedQuota: 0, droppedInvalid: 0, droppedShutdown: 0,
    droppedPaused: 0, droppedTimeout: 0,
  };
  function getDiagnostics(): PulseDiagnostics {
    return Object.freeze({
      ...counts, queued: queue.length, inFlight: inFlight.length,
      pendingBytes: pendingBytes > 0 ? pendingBytes + envelopeBytes : 0,
      status: stopped ? 'shutdown' : closing ? 'closing' : !options.enabled ? 'disabled' : blocked ? 'blocked' : paused ? 'paused' : 'ready',
      blockReason: options.requestedEnabled && !options.exporter ? 'missing_exporter' : blocked,
      missingExporter: options.requestedEnabled && !options.exporter ? 1 : 0,
      lastAcceptedAt, retryAttempt,
    });
  }
  function notify() {
    if (!options.onDiagnostics || notifying) return;
    notifying = true;
    try { options.onDiagnostics(getDiagnostics()); } catch { /* Diagnostics must be fail-open. */ }
    finally { notifying = false; }
  }
  function clearFlushTimer() {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
  }
  function discardQueue(counter: Counter) {
    for (const entry of queue) { pendingBytes -= entry.bytes; counts[counter]++; }
    queue.length = 0;
    queuedBytes = 0;
  }
  function remove(entries: readonly Entry[], count: Counter) {
    const ids = new Set(entries.map(entry => entry.event.event_id));
    inFlight = inFlight.filter(entry => {
      if (!ids.has(entry.event.event_id)) return true;
      pendingBytes -= entry.bytes;
      counts[count]++;
      return false;
    });
    if ((count === 'accepted' || count === 'duplicates') && entries.length) lastAcceptedAt = new Date().toISOString();
  }
  function canRun() { return options.enabled && !stopped && !paused && !blocked && !unsettledExporter; }
  function thresholdReached() { return queue.length >= settings.batchMaxEvents || queuedBytes + envelopeBytes >= settings.batchMaxBytes; }
  function schedule() {
    if (!canRun() || closing || !queue.length) return;
    if (thresholdReached()) {
      clearFlushTimer();
      if (!microtaskScheduled) {
        microtaskScheduled = true;
        queueMicrotask(() => { microtaskScheduled = false; void start(); });
      }
    } else if (timer === undefined) {
      timer = setTimeout(() => { timer = undefined; void start(); }, settings.flushIntervalMs);
      timer.unref();
    }
  }
  function delay(ms: number): Promise<void> {
    if (retryAbort.signal.aborted) return Promise.resolve();
    return new Promise(resolve => {
      const finish = () => { clearTimeout(handle); retryAbort.signal.removeEventListener('abort', finish); resolve(); };
      const handle = setTimeout(finish, ms);
      retryAbort.signal.addEventListener('abort', finish, { once: true });
    });
  }
  async function request(entries: readonly Entry[]): Promise<PulseExportResult | null> {
    const controller = new AbortController();
    activeRequest = controller;
    counts.requests++;
    const events = Object.freeze(entries.map(entry => entry.event));
    let settled = false;
    const exporter = options.exporter!;
    const attempt = Promise.resolve().then(() => exporter.export(events, { signal: controller.signal })).then(
      result => { settled = true; return result; },
      () => { settled = true; return null; },
    );
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const expired = Symbol('expired');
    let abort!: () => void;
    const interruption = new Promise<typeof expired>(resolve => {
      abort = () => resolve(expired);
      controller.signal.addEventListener('abort', abort, { once: true });
      timeout = setTimeout(() => controller.abort(), settings.requestTimeoutMs);
    });
    try {
      const result = await Promise.race([attempt, interruption]);
      if (result === expired) {
        // Cooperative exporters settle when aborted. An exporter ignoring its signal must not
        // accumulate concurrent attempts; block until it settles and the owner explicitly resumes.
        // Give abort-supporting exporters one event-loop turn to settle their promise chains.
        // This grace is bounded; a never-settling exporter still cannot start a second attempt.
        let grace: ReturnType<typeof setTimeout> | undefined;
        try { await Promise.race([attempt, new Promise<void>(resolve => { grace = setTimeout(resolve, 0); })]); }
        finally { if (grace !== undefined) clearTimeout(grace); }
        if (!settled) {
          unsettledExporter = true;
          blocked = 'exporter_timeout';
          void attempt.then(() => { unsettledExporter = false; notify(); });
        }
        return null;
      }
      return snapshotExportResult(result, events);
    } catch { return null; }
    finally {
      if (timeout !== undefined) clearTimeout(timeout);
      controller.signal.removeEventListener('abort', abort);
      if (activeRequest === controller) activeRequest = undefined;
    }
  }
  async function send(initial: readonly Entry[], consumedRetries = 0): Promise<void> {
    let entries = [...initial];
    let attempt = consumedRetries;
    while (entries.length) {
      if (stopped) { remove(entries, 'droppedShutdown'); return; }
      if (paused) { remove(entries, 'droppedPaused'); return; }
      if (blocked) { remove(entries, blocked === 'auth' ? 'droppedAuth' : 'droppedTimeout'); return; }
      retryAttempt = attempt;
      const sendingGeneration = exporterGeneration;
      let result = await request(entries);
      // A superseded exporter's auth failure cannot block freshly configured credentials.
      if (result?.blocked === 'auth' && sendingGeneration !== exporterGeneration) result = null;
      if (stopped) { remove(entries, 'droppedShutdown'); return; }
      if (blocked === 'exporter_timeout') {
        counts.exporterFailures++;
        remove(entries, 'droppedTimeout'); discardQueue('droppedTimeout'); clearFlushTimer(); return;
      }
      if (result?.blocked === 'auth') {
        blocked = 'auth';
        remove(entries, 'droppedAuth'); discardQueue('droppedAuth'); clearFlushTimer(); return;
      }
      if (result?.batchTooLarge) {
        if (entries.length === 1) { remove(entries, 'droppedOversize'); return; }
        const midpoint = Math.ceil(entries.length / 2);
        await send(entries.slice(0, midpoint), attempt);
        await send(entries.slice(midpoint), attempt);
        return;
      }
      if (result) {
        const accepted = new Set(result.accepted), duplicates = new Set(result.duplicates);
        const rejected = new Set(result.rejected.filter(item => !item.retryable).map(item => item.event_id));
        remove(entries.filter(entry => accepted.has(entry.event.event_id)), 'accepted');
        remove(entries.filter(entry => duplicates.has(entry.event.event_id)), 'duplicates');
        remove(entries.filter(entry => rejected.has(entry.event.event_id)), 'rejected');
        entries = entries.filter(entry => !accepted.has(entry.event.event_id) && !duplicates.has(entry.event.event_id) && !rejected.has(entry.event.event_id));
        if (!entries.length) return;
      }
      counts.exporterFailures++;
      if (attempt >= settings.maxRetries || (result?.retryAfterMs ?? 0) > settings.retryMaxMs) {
        remove(entries, 'droppedRetries'); return;
      }
      const exponential = Math.min(settings.retryMaxMs, settings.retryBaseMs * 2 ** attempt);
      const jittered = exponential * (0.5 + Math.random() * 0.5);
      notify();
      // Node truncates fractional timer delays; round up to preserve the server minimum.
      await delay(Math.ceil(Math.max(jittered, result?.retryAfterMs ?? 0)));
      if (stopped) { remove(entries, 'droppedShutdown'); return; }
      if (paused) { remove(entries, 'droppedPaused'); return; }
      attempt++; counts.retries++;
    }
  }
  async function drain(cutoff: number) {
    try {
      while (canRun() && queue.length && queue[0]!.sequence <= cutoff) {
        const batch: Entry[] = [];
        let bytes = envelopeBytes;
        while (queue.length && queue[0]!.sequence <= cutoff && batch.length < settings.batchMaxEvents) {
          const next = queue[0]!;
          if (batch.length && bytes + next.bytes > settings.batchMaxBytes) break;
          queue.shift(); queuedBytes -= next.bytes;
          if (bytes + next.bytes > settings.batchMaxBytes) { pendingBytes -= next.bytes; counts.droppedOversize++; continue; }
          batch.push(next); bytes += next.bytes;
        }
        if (!batch.length) continue;
        inFlight = batch;
        await send(batch);
      }
    } catch {
      counts.exporterFailures++;
      remove(inFlight, 'droppedRetries');
    } finally { retryAttempt = 0; notify(); }
  }
  function start(cutoff = sequence): Promise<void> {
    if (active) return active;
    if (!canRun() || !queue.length) return Promise.resolve();
    clearFlushTimer();
    active = drain(cutoff).finally(() => { active = undefined; schedule(); });
    return active;
  }
  async function drainThrough(cutoff: number): Promise<void> {
    while (canRun() && ((queue[0]?.sequence ?? Infinity) <= cutoff || inFlight.some(entry => entry.sequence <= cutoff))) await start(cutoff);
  }
  async function waitFor(task: Promise<unknown>, timeoutMs: number) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([task, new Promise<void>(resolve => { timeout = setTimeout(resolve, timeoutMs); })]); }
    finally { if (timeout !== undefined) clearTimeout(timeout); }
  }
  notify();
  return {
    invalid() { counts.droppedInvalid++; notify(); },
    enqueue(event: PulseEvent) {
      if (!options.enabled) return;
      counts.observed++;
      if (closing || stopped) { counts.droppedShutdown++; notify(); return; }
      if (blocked) { counts[blocked === 'auth' ? 'droppedAuth' : 'droppedTimeout']++; notify(); return; }
      if (paused) { counts.droppedPaused++; notify(); return; }
      const bytes = encoder.encode(JSON.stringify(event)).byteLength + 1;
      if (bytes + envelopeBytes > settings.batchMaxBytes || bytes + envelopeBytes > settings.maxBytes) { counts.droppedOversize++; notify(); return; }
      while (queue.length && (queue.length + inFlight.length >= settings.maxEvents || pendingBytes + bytes + envelopeBytes > settings.maxBytes)) {
        const oldest = queue.shift()!;
        pendingBytes -= oldest.bytes; queuedBytes -= oldest.bytes; counts.droppedOverflow++;
      }
      if (queue.length + inFlight.length >= settings.maxEvents || pendingBytes + bytes + envelopeBytes > settings.maxBytes) { counts.droppedOverflow++; notify(); return; }
      queue.push(Object.freeze({ event, bytes, sequence: ++sequence }));
      pendingBytes += bytes; queuedBytes += bytes;
      schedule(); notify();
    },
    async flush(timeoutMs: number) {
      if (!options.enabled || stopped) return;
      await waitFor(drainThrough(sequence), timeoutMs);
    },
    pause() { if (stopped || closing) return; paused = true; clearFlushTimer(); notify(); },
    resume() { if (stopped || closing || unsettledExporter) return; paused = false; blocked = null; schedule(); notify(); },
    reconfigure(exporter: PulseExporter) {
      if (stopped || closing) return;
      exporterGeneration++;
      options.exporter = exporter;
      options.enabled = options.requestedEnabled;
      paused = false;
      if (!unsettledExporter) blocked = null;
      schedule(); notify();
    },
    shutdown(timeoutMs: number): Promise<void> {
      if (shutdownTask) return shutdownTask;
      closing = true; clearFlushTimer();
      const deadline = performance.now() + timeoutMs;
      const cutoff = sequence;
      shutdownTask = (async () => {
        await waitFor(drainThrough(cutoff), Math.max(0, deadline - performance.now()));
        stopped = true; retryAbort.abort(); activeRequest?.abort();
        discardQueue('droppedShutdown'); remove(inFlight, 'droppedShutdown');
        const exporter = options.exporter;
        if (!unsettledExporter && !activeRequest && performance.now() < deadline && exporter?.shutdown) {
          const controller = new AbortController();
          const remaining = Math.max(0, deadline - performance.now());
          const timeout = setTimeout(() => controller.abort(), remaining);
          try { await waitFor(Promise.resolve().then(() => exporter.shutdown!({ signal: controller.signal })).catch(() => { counts.exporterFailures++; }), remaining); }
          finally { controller.abort(); clearTimeout(timeout); }
        }
        notify();
      })();
      return shutdownTask;
    },
    getDiagnostics,
  };
}
