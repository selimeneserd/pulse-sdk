import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPulseCore, type PulseCore, type PulseCoreOptions, type PulseEvent } from '../packages/core/src/index.js';
import { createHttpExporter } from '../packages/core/src/http.js';

const now = Date.parse('2026-09-12T12:00:00.000Z');
const sample = (JSON.parse(readFileSync(new URL('./fixtures/golden-events.json', import.meta.url), 'utf8')) as { events: PulseEvent[] }).events[0]!;
const instances: PulseCore[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(now);
  vi.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(async () => {
  try {
    const closing = instances.splice(0).map(pulse => pulse.shutdown({ timeoutMs: 0 }));
    await vi.advanceTimersByTimeAsync(0);
    await Promise.all(closing);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});

function retryResponse(header: string | null): Response {
  return new Response(null, { status: 429, headers: header === null ? {} : { 'retry-after': header } });
}
function acceptedResponse(events: readonly PulseEvent[], extra: Record<string, unknown> = {}): Response {
  return Response.json({ accepted: events.map(event => event.event_id), duplicates: [], rejected: [], server_time: new Date().toISOString(), ...extra }, { status: 202 });
}
function fixture(header: string | null, queue: PulseCoreOptions['queue'] = {}, first?: (events: readonly PulseEvent[]) => Response) {
  const attempts: Array<{ at: number; ids: string[] }> = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const { events } = JSON.parse(init!.body as string) as { events: PulseEvent[] };
    attempts.push({ at: Date.now() - now, ids: events.map(event => event.event_id) });
    return attempts.length === 1 ? first?.(events) ?? retryResponse(header) : acceptedResponse(events);
  });
  const pulse = createPulseCore({ environment: 'test', enabled: true,
    exporter: createHttpExporter({ endpoint: 'http://127.0.0.1:1/v1/batch' }),
    queue: { flushIntervalMs: 60_000, requestTimeoutMs: 1000, retryBaseMs: 10, retryMaxMs: 60_000, maxRetries: 1, ...queue },
  });
  instances.push(pulse);
  return { pulse, attempts };
}
function complete(pulse: PulseCore, toolName = 'retry.fixture') {
  pulse.complete({ toolName, durationMs: 1, outcome: 'tool_success' });
}

describe('HTTP Retry-After minimum through the real exporter and dispatcher', () => {
  it.each([
    ['numeric seconds', '120', 120_000],
    ['HTTP-date', new Date(now + 120_000).toUTCString(), 120_000],
    ['large numeric seconds', '9'.repeat(100), Number('9'.repeat(100)) * 1000],
    ['far future HTTP-date', 'Fri, 31 Dec 9999 23:59:59 GMT', Date.parse('Fri, 31 Dec 9999 23:59:59 GMT') - now],
  ])('preserves %s beyond the local per-delay cap in its public result', async (_name, header, expected) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(retryResponse(header));
    const exporter = createHttpExporter({ endpoint: 'http://127.0.0.1:1/v1/batch' });
    const result = await exporter.export([sample], { signal: new AbortController().signal });
    expect(result.retryAfterMs).toBe(expected);
  });

  it.each([
    ['numeric seconds', '120'],
    ['HTTP-date', new Date(now + 120_000).toUTCString()],
    ['large numeric seconds', '9'.repeat(100)],
    ['far future HTTP-date', 'Fri, 31 Dec 9999 23:59:59 GMT'],
  ])('drops %s beyond 60 seconds without starting an early second request', async (_name, header) => {
    const { pulse, attempts } = fixture(header);
    complete(pulse);
    const flushing = pulse.flush({ timeoutMs: 60_000 });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(attempts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await flushing;
    expect(attempts).toHaveLength(1);
    expect(pulse.getDiagnostics()).toMatchObject({ requests: 1, retries: 0, accepted: 0, droppedRetries: 1, pendingBytes: 0 });
  });

  it.each([
    ['numeric seconds', '0.04', 40, 100],
    ['fractional millisecond seconds', '0.0405', 41, 100],
    ['HTTP-date', new Date(now + 1000).toUTCString(), 1000, 2000],
    ['exact configured maximum', '60', 60_000, 60_000],
  ])('does not retry before the %s minimum and allows the exact boundary', async (_name, header, minimum, retryMaxMs) => {
    const { pulse, attempts } = fixture(header, { retryMaxMs });
    complete(pulse);
    const flushing = pulse.flush({ timeoutMs: 60_000 });
    await vi.advanceTimersByTimeAsync(minimum - 1);
    expect(attempts.map(attempt => attempt.at)).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1);
    await flushing;
    expect(attempts.map(attempt => attempt.at)).toEqual([0, minimum]);
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 1, retries: 1, droppedRetries: 0, pendingBytes: 0 });
  });

  it.each([
    ['zero', '0', 0],
    ['past date', new Date(now - 1000).toUTCString(), 0],
    ['missing header', null, undefined],
    ['invalid header', 'not-a-date', undefined],
    ['overlength header', '9'.repeat(101), undefined],
  ])('keeps %s bounded by the ordinary backoff and maxRetries', async (_name, header, expected) => {
    const { pulse, attempts } = fixture(header, { retryMaxMs: 10, maxRetries: 3 });
    vi.mocked(globalThis.fetch).mockImplementation(async (_url, init) => {
      const { events } = JSON.parse(init!.body as string) as { events: PulseEvent[] };
      attempts.push({ at: Date.now() - now, ids: events.map(event => event.event_id) });
      return retryResponse(header);
    });
    // Exercise parser semantics via the exporter, without exporting a private parser helper.
    const direct = await createHttpExporter({ endpoint: 'http://127.0.0.1:1/v1/batch' }).export([sample], { signal: new AbortController().signal });
    expect(direct.retryAfterMs).toBe(expected);
    attempts.length = 0;
    complete(pulse);
    const flushing = pulse.flush();
    await vi.advanceTimersByTimeAsync(4);
    expect(attempts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(11);
    await flushing;
    expect(attempts.map(attempt => attempt.at)).toEqual([0, 5, 10, 15]);
    expect(pulse.getDiagnostics()).toMatchObject({ requests: 4, retries: 3, droppedRetries: 1, pendingBytes: 0 });
  });

  it.each([
    ['header', '0.04', 30],
    ['body', '0.03', 40],
  ])('retains accepted and duplicate decisions while retrying only the remaining event after the larger %s minimum', async (_name, header, bodyDelay) => {
    const { pulse, attempts } = fixture(header, { retryMaxMs: 100 }, events => {
      const response = acceptedResponse(events, { accepted: [events[0]!.event_id], duplicates: [events[1]!.event_id], next_retry_after_ms: bodyDelay });
      response.headers.set('retry-after', header);
      return response;
    });
    complete(pulse, 'accepted'); complete(pulse, 'duplicate'); complete(pulse, 'unconfirmed');
    const flushing = pulse.flush();
    await vi.advanceTimersByTimeAsync(39);
    expect(attempts).toHaveLength(1);
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 1, duplicates: 1, inFlight: 1 });
    await vi.advanceTimersByTimeAsync(1);
    await flushing;
    expect(attempts.map(attempt => attempt.ids.length)).toEqual([3, 1]);
    expect(attempts[1]!.ids).toEqual([attempts[0]!.ids[2]]);
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 2, duplicates: 1, retries: 1, pendingBytes: 0 });
  });

  it('drops only unconfirmed events when a valid 202 Retry-After exceeds the delay cap', async () => {
    const { pulse, attempts } = fixture('120', {}, events => {
      const response = acceptedResponse(events, { accepted: [events[0]!.event_id], duplicates: [events[1]!.event_id] });
      response.headers.set('retry-after', '120');
      return response;
    });
    complete(pulse, 'accepted'); complete(pulse, 'duplicate'); complete(pulse, 'unconfirmed');
    const flushing = pulse.flush({ timeoutMs: 60_000 });
    await vi.advanceTimersByTimeAsync(60_000);
    await flushing;
    expect(attempts).toHaveLength(1);
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 1, duplicates: 1, retries: 0, droppedRetries: 1, pendingBytes: 0 });
  });

  it('preserves a valid Retry-After minimum while rejecting a malformed 202 acknowledgement', async () => {
    const { pulse, attempts } = fixture('120', {}, events => {
      const response = acceptedResponse(events, { unexpected: true });
      response.headers.set('retry-after', '120');
      return response;
    });
    complete(pulse);
    const flushing = pulse.flush();
    await vi.advanceTimersByTimeAsync(60_000);
    await flushing;
    expect(attempts).toHaveLength(1);
    expect(pulse.getDiagnostics()).toMatchObject({ accepted: 0, retries: 0, droppedRetries: 1, pendingBytes: 0 });
  });

  it('aborts an active retry wait at the shutdown deadline without starting another HTTP request', async () => {
    const { pulse, attempts } = fixture('1', { retryMaxMs: 2000 });
    complete(pulse);
    const flushing = pulse.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toHaveLength(1);
    const closing = pulse.shutdown({ timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    await closing;
    await flushing;
    await vi.advanceTimersByTimeAsync(1000);
    expect(attempts).toHaveLength(1);
    expect(pulse.getDiagnostics()).toMatchObject({ status: 'shutdown', requests: 1, retries: 0, droppedShutdown: 1, pendingBytes: 0 });
  });
});
