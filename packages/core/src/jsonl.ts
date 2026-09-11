import { snapshotExportInput } from './export-input.js';
import { mkdir, stat, rename, rm, appendFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PulseConfigurationError } from './config.js';
import type { PulseEvent, PulseExporter, PulseExportResult, PulseExportContext } from './types.js';

export interface JsonlExporterOptions {
  /** Dedicated file path; one exporter/process must own it. */
  path: string;
  /** Per-file cap. Includes complete UTF-8 JSON event lines. Default 1 MiB. */
  maxBytes?: number;
  /** Total retained files, including the active file. Default 3. */
  maxFiles?: number;
}
/** Local bounded inspection, not an fsync-backed durable ledger or exactly-once sink. */
export function createJsonlExporter(options: JsonlExporterOptions): PulseExporter {
  const maximum = options?.maxBytes ?? 1024 * 1024;
  const files = options?.maxFiles ?? 3;
  if (!options || typeof options.path !== 'string' || !options.path || options.path.length > 4096 || options.path.includes('\0') || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > 64 * 1024 * 1024 || !Number.isSafeInteger(files) || files < 1 || files > 100) throw new PulseConfigurationError();
  const path = resolve(options.path);
  let busy = false;
  let initialized = false;
  let size = 0;
  return Object.freeze({
    async export(input: readonly PulseEvent[], { signal }: PulseExportContext): Promise<PulseExportResult> {
      const { events, rejected } = snapshotExportInput(input);
      const result: { accepted: string[]; duplicates: string[]; rejected: { event_id: string; code: string; retryable: boolean }[] } = { accepted: [], duplicates: [], rejected: [...rejected] };
      // Independent direct calls are refused rather than creating an unbounded file-operation queue.
      if (busy || signal.aborted || !events.length) return result;
      busy = true;
      try {
        if (!initialized) {
          await mkdir(dirname(path), { recursive: true, mode: 0o700 });
          try { size = (await stat(path)).size; }
          catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
          initialized = true;
        }
        for (const event of events) {
          if (signal.aborted) break;
          const line = JSON.stringify(event) + '\n';
          const bytes = Buffer.byteLength(line);
          if (bytes > maximum) { result.rejected.push({ event_id: event.event_id, code: 'JSONL_EVENT_TOO_LARGE', retryable: false }); continue; }
          if (size + bytes > maximum) {
            await rm(files === 1 ? path : `${path}.${files - 1}`, { force: true });
            for (let index = files - 2; index >= 0; index--) {
              try { await rename(index === 0 ? path : `${path}.${index}`, `${path}.${index + 1}`); }
              catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
            }
            size = 0;
          }
          if (signal.aborted) break;
          await appendFile(path, line, { encoding: 'utf8', mode: 0o600 });
          size += bytes;
          result.accepted.push(event.event_id);
        }
      } catch { initialized = false; /* Return only safe confirmed subset; unconfirmed IDs may retry. */ }
      finally { busy = false; }
      return result;
    },
  });
}
