import type { PulseEvent, PulseExportResult } from './types.js';

const resultFields = new Set(['accepted', 'duplicates', 'rejected', 'retryAfterMs', 'blocked', 'batchTooLarge']);
const rejectionFields = new Set(['event_id', 'code', 'retryable']);

/** Internal contract boundary: read foreign fields once, validate and retain only owned data. */
export function snapshotExportResult(value: unknown, events: readonly PulseEvent[]): PulseExportResult | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Object.keys(value).some(key => !resultFields.has(key))) return null;
    const { accepted, duplicates, rejected, retryAfterMs, blocked, batchTooLarge } = value as PulseExportResult;
    if (!Array.isArray(accepted) || !Array.isArray(duplicates) || !Array.isArray(rejected)) return null;
    const lengths = [accepted.length, duplicates.length, rejected.length];
    if (lengths.some(length => !Number.isSafeInteger(length) || length < 0 || length > events.length)
      || lengths.reduce((sum, length) => sum + length, 0) > events.length) return null;
    if (retryAfterMs !== undefined && (typeof retryAfterMs !== 'number' || !Number.isFinite(retryAfterMs) || retryAfterMs < 0)) return null;
    if (blocked !== undefined && blocked !== 'auth') return null;
    if (batchTooLarge !== undefined && typeof batchTooLarge !== 'boolean') return null;

    const ids = new Set(events.map(event => event.event_id));
    const seen = new Set<string>();
    const takeId = (id: unknown): id is string => {
      if (typeof id !== 'string' || !ids.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    };
    const acceptedCopy: string[] = [], duplicatesCopy: string[] = [];
    // Index reads avoid invoking an untrusted array iterator or map override.
    for (let index = 0; index < lengths[0]!; index++) {
      const id: unknown = accepted[index];
      if (!takeId(id)) return null;
      acceptedCopy.push(id);
    }
    for (let index = 0; index < lengths[1]!; index++) {
      const id: unknown = duplicates[index];
      if (!takeId(id)) return null;
      duplicatesCopy.push(id);
    }
    const rejectedCopy: Array<PulseExportResult['rejected'][number]> = [];
    for (let index = 0; index < lengths[2]!; index++) {
      const item = rejected[index];
      if (!item || typeof item !== 'object' || Object.keys(item).some(key => !rejectionFields.has(key))) return null;
      const { event_id, code, retryable } = item;
      if (!takeId(event_id) || typeof retryable !== 'boolean' || typeof code !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(code)) return null;
      rejectedCopy.push(Object.freeze({ event_id, code, retryable }));
    }
    if ((batchTooLarge || blocked) && seen.size > 0) return null;
    if (batchTooLarge && blocked) return null;
    return Object.freeze({
      accepted: Object.freeze(acceptedCopy), duplicates: Object.freeze(duplicatesCopy), rejected: Object.freeze(rejectedCopy),
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      ...(blocked === undefined ? {} : { blocked }),
      ...(batchTooLarge === undefined ? {} : { batchTooLarge }),
    });
  } catch { return null; }
}
