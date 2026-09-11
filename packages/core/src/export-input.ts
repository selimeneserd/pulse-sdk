import schema from '../contracts/event-v1.schema.json' with { type: 'json' };
import { validatePulseEvent } from './conformance.js';
import type { PulseEvent, PulseExportResult } from './types.js';

const allowedFields = new Set(Object.keys(schema.properties));

/** Revalidate public exporter input, including callers bypassing the event factory.
 * Snapshot once to prevent accessors/toJSON/mutation from replacing checked values. */
export function snapshotExportInput(input: readonly PulseEvent[]): { events: readonly PulseEvent[]; rejected: PulseExportResult['rejected'] } {
  const events: PulseEvent[] = [];
  const rejected: { event_id: string; code: string; retryable: boolean }[] = [];
  if (!Array.isArray(input) || input.length > 100) return { events, rejected };
  const seen = new Set<string>();
  for (const candidate of input) {
    let eventId: string | undefined;
    try {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
      const keys = Object.keys(candidate);
      if (keys.length > allowedFields.size || keys.some(key => !allowedFields.has(key))) {
        // Never invoke forbidden raw-field accessors merely to discover invalid input.
        const id = Object.getOwnPropertyDescriptor(candidate, 'event_id')?.value as unknown;
        if (typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) rejected.push({event_id:id,code:'INVALID_EVENT',retryable:false});
        continue;
      }
      const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const key of keys) snapshot[key] = (candidate as unknown as Record<string, unknown>)[key];
      const id = snapshot.event_id;
      if (typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) eventId = id;
      if (eventId && seen.has(eventId)) return { events: [], rejected: [] };
      if (eventId) seen.add(eventId);
      if (validatePulseEvent(snapshot)) events.push(Object.freeze(snapshot));
      else if (eventId) rejected.push({ event_id: eventId, code: 'INVALID_EVENT', retryable: false });
    } catch {
      if (eventId) rejected.push({ event_id: eventId, code: 'INVALID_EVENT', retryable: false });
    }
  }
  return { events: Object.freeze(events), rejected: Object.freeze(rejected) };
}
