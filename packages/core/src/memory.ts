import { snapshotExportInput } from './export-input.js';
import { PulseConfigurationError } from './config.js';
import type { PulseEvent, PulseExporter } from './types.js';

/** Explicit discard mode. Acceptance means the selected no-op completed, not storage. */
export function createNoopExporter(): PulseExporter {
  return Object.freeze({ export(input: readonly PulseEvent[]) { const { events, rejected } = snapshotExportInput(input); return { accepted: events.map(event => event.event_id), duplicates: [], rejected }; } });
}

/** Bounded local inspection. Oldest retained events are evicted; clear() releases them. */
export function createMemoryExporter(options: { maxEvents?: number } = {}): PulseExporter & {
  getEvents(): readonly PulseEvent[];
  clear(): void;
} {
  const maximum = options.maxEvents ?? 1000;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 10_000) throw new PulseConfigurationError();
  const retained: PulseEvent[] = [];
  return Object.freeze({
    export(input: readonly PulseEvent[]) {
      const { events, rejected } = snapshotExportInput(input);
      for (const event of events) {
        if (retained.length >= maximum) retained.shift();
        retained.push(event);
      }
      return { accepted: events.map(event => event.event_id), duplicates: [], rejected };
    },
    getEvents() { return Object.freeze([...retained]); },
    clear() { retained.length = 0; },
  });
}
