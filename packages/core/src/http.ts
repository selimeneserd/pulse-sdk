import { isWireDateTime } from './conformance.js';
import { snapshotExportInput } from './export-input.js';
import { PulseConfigurationError } from './config.js';
import { validResult } from './exporter.js';
import type { PulseEvent, PulseExporter, PulseExportResult, PulseExportContext } from './types.js';

export interface HttpExporterOptions {
  /** Complete collector URL. HTTPS, or explicit HTTP loopback, without credentials/query/fragment. */
  endpoint: string;
  /** Full transport authorization value, e.g. Bearer plus a collector-issued token. */
  authorization?: string;
  headers?: Readonly<Record<string, string>>;
}
const responseByteLimit = 64 * 1024;
const retry = (): PulseExportResult => ({ accepted: [], duplicates: [], rejected: [] });
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > responseByteLimit) { void reader.cancel().catch(() => {}); return null; }
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch { return null; }
  finally { reader.releaseLock(); }
}
function retryAfter(value: string | null): number | undefined {
  if (value === null || value.length > 100) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const delay = Number(value) * 1000;
    return Number.isFinite(delay) ? Math.min(60_000, Math.max(0, delay)) : undefined;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(60_000, Math.max(0, date - Date.now())) : undefined;
}
function acknowledgement(body: unknown, events: readonly PulseEvent[]): PulseExportResult | null {
  if (!object(body) || Object.keys(body).some(key => !['accepted', 'duplicates', 'rejected', 'server_time', 'next_retry_after_ms'].includes(key))) return null;
  if (!isWireDateTime(body.server_time)) return null;
  if (body.next_retry_after_ms !== undefined && (typeof body.next_retry_after_ms !== 'number' || !Number.isFinite(body.next_retry_after_ms) || body.next_retry_after_ms < 0 || body.next_retry_after_ms > 60_000)) return null;
  const result = {
    accepted: body.accepted, duplicates: body.duplicates, rejected: body.rejected,
    ...(body.next_retry_after_ms === undefined ? {} : { retryAfterMs: body.next_retry_after_ms }),
  };
  return validResult(result, events) ? result : null;
}

/** One HTTP delivery attempt. No queue, retry, default endpoint, or product-plan policy. */
export function createHttpExporter(options: HttpExporterOptions): PulseExporter {
  let endpoint: string;
  let headers: Headers;
  try {
    if (!options || typeof options.endpoint !== 'string' || options.endpoint.length > 2048) throw 0;
    const url = new URL(options.endpoint);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) throw 0;
    endpoint = url.href;
    headers = new Headers();
    if (options.headers !== undefined) {
      if (!object(options.headers) || Object.keys(options.headers).length > 16) throw 0;
      for (const [name, value] of Object.entries(options.headers)) {
        if (!/^[A-Za-z0-9-]{1,64}$/.test(name) || typeof value !== 'string' || value.length > 2048 || /[\r\n]/.test(value) || ['host', 'content-length', 'content-type', 'authorization', 'connection', 'cookie', 'set-cookie'].includes(name.toLowerCase())) throw 0;
        headers.set(name, value);
      }
    }
    if (options.authorization !== undefined) {
      if (typeof options.authorization !== 'string' || options.authorization.length < 1 || options.authorization.length > 2048 || /[^\x20-\x7E]/.test(options.authorization)) throw 0;
      headers.set('authorization', options.authorization);
    }
    headers.set('content-type', 'application/json');
  } catch { throw new PulseConfigurationError(); }
  return Object.freeze({
    async export(input: readonly PulseEvent[], context: PulseExportContext) {
      const { events, rejected } = snapshotExportInput(input);
      if (!events.length || context.signal.aborted) return { ...retry(), rejected };
      let abort!: () => void;
      const aborted = new Promise<PulseExportResult>(resolve => {
        abort = () => resolve(retry());
        context.signal.addEventListener('abort', abort, { once: true });
      });
      const attempt = (async (): Promise<PulseExportResult> => {
        try {
          const response = await fetch(endpoint, {
            method: 'POST', redirect: 'error', headers,
            body: JSON.stringify({ schema_version: 1, events }), signal: context.signal,
          });
          // Error bodies are intentionally discarded, never inspected for Cloud-specific codes.
          if (response.status !== 202) {
            void response.body?.cancel().catch(() => {});
            if (response.status === 401 || response.status === 403) return { ...retry(), blocked: 'auth' };
            if (response.status === 413) return { ...retry(), batchTooLarge: true };
            if ([408, 425, 429].includes(response.status) || response.status >= 500) {
              const retryAfterMs = retryAfter(response.headers.get('retry-after'));
              return { ...retry(), ...(retryAfterMs === undefined ? {} : { retryAfterMs }) };
            }
            return { accepted: [], duplicates: [], rejected: events.map(event => ({ event_id: event.event_id, code: 'HTTP_REJECTED', retryable: false })) };
          }
          const parsed = acknowledgement(await readBoundedJson(response), events);
          if (!parsed) return retry();
          const headerDelay = retryAfter(response.headers.get('retry-after'));
          return headerDelay === undefined ? parsed : { ...parsed, retryAfterMs: Math.max(headerDelay, parsed.retryAfterMs ?? 0) };
        } catch { return retry(); }
      })();
      try {
        const result = await Promise.race([attempt, aborted]);
        // Block/split controls apply to the submitted batch and cannot mix with acknowledgements.
        return result.blocked || result.batchTooLarge ? result : { ...result, rejected: [...result.rejected, ...rejected] };
      }
      finally { context.signal.removeEventListener('abort', abort); }
    },
  });
}
