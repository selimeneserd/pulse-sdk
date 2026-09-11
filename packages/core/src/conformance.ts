import schema from '../contracts/event-v1.schema.json' with { type: 'json' };
import type { PulseEvent } from './event.generated.js';
import type { PulseExporter } from './types.js';

type Schema = { const?: unknown; enum?: unknown[]; anyOf?: Schema[]; allOf?: Schema[]; if?: Schema; then?: Schema; else?: Schema; type?: string; required?: string[]; properties?: Record<string, Schema>; additionalProperties?: boolean; pattern?: string; format?: string; minLength?: number; maxLength?: number; minimum?: number; maximum?: number };
function matches(value: unknown, rule: Schema): boolean {
  if ('const' in rule && value !== rule.const) return false;
  if (rule.enum && !rule.enum.includes(value)) return false;
  if (rule.anyOf && !rule.anyOf.some(child => matches(value, child))) return false;
  if (rule.allOf && !rule.allOf.every(child => matches(value, child))) return false;
  if (rule.if && !matches(value, (matches(value, rule.if) ? rule.then : rule.else) ?? {})) return false;
  if (rule.type === 'null' && value !== null) return false;
  if (rule.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) return false;
  if (rule.type === 'string' && typeof value !== 'string') return false;
  if (typeof value === 'number' && ((rule.minimum !== undefined && value < rule.minimum) || (rule.maximum !== undefined && value > rule.maximum))) return false;
  if (typeof value === 'string') {
    if (rule.minLength !== undefined && [...value].length < rule.minLength) return false;
    if (rule.maxLength !== undefined && [...value].length > rule.maxLength) return false;
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) return false;
    if (rule.format === 'uuid' && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) return false;
    if (rule.format === 'date-time' && !isWireDateTime(value)) return false;
  }
  if (rule.type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) return false;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (rule.required?.some(key => !Object.hasOwn(obj, key))) return false;
    if (rule.additionalProperties === false && Object.keys(obj).some(key => !Object.hasOwn(rule.properties ?? {}, key))) return false;
    for (const [key, child] of Object.entries(rule.properties ?? {})) if (Object.hasOwn(obj, key) && !matches(obj[key], child)) return false;
  }
  return true;
}
/** Strict validator for the published event schema subset; no raw failure details. */
export function validatePulseEvent(value: unknown): value is PulseEvent {
  try { return matches(value, schema as Schema); } catch { return false; }
}

/** RFC3339 calendar/time validation; does not silently normalize impossible dates. */
export function isWireDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})[Tt\s](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2})(?::?(\d{2}))?)$/.exec(value);
  if (!parts) return false;
  const [year, month, day, hour, minute, second] = parts.slice(1,7).map(Number) as [number,number,number,number,number,number];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31,30,31,30,31,31,30,31,30,31];
  const offsetHour = Number(parts[8] ?? 0), offsetMinute = Number(parts[9] ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > days[month-1]! || hour > 23 || minute > 59 || offsetHour > 23 || offsetMinute > 59) return false;
  if (second < 60) return true;
  const offset = (offsetHour * 60 + offsetMinute) * (parts[7] === '-' ? -1 : 1);
  return second === 60 && ((hour * 60 + minute - offset) % 1440 + 1440) % 1440 === 1439;
}
/** Read data fields once and validate before any exporter uses them. */
export function snapshotPulseEvent(value: unknown): PulseEvent | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const keys = Object.keys(value);
    if (keys.length > Object.keys(schema.properties).length) return null;
    const copy: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      if (!Object.hasOwn(schema.properties, key)) return null;
      copy[key] = (value as Record<string, unknown>)[key];
    }
    return validatePulseEvent(copy) ? Object.freeze(copy) : null;
  } catch { return null; }
}

/** Bounded smoke contract for third-party exporters; use your own explicitly configured sink. */
export async function runExporterConformance(exporter: PulseExporter, event: PulseEvent): Promise<Readonly<{ passed: boolean; checks: number }>> {
  const frozen = snapshotPulseEvent(event);
  if (!frozen) return { passed: false, checks: 0 };
  let checks = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('CONFORMANCE_TIMEOUT')); }, 1000); });
      const result = await Promise.race([Promise.resolve().then(() => exporter.export(Object.freeze([frozen]), { signal: controller.signal })), timeout]);
      const {accepted,duplicates,rejected} = result;
      if (!Array.isArray(accepted) || !Array.isArray(duplicates) || !Array.isArray(rejected)) return {passed:false,checks};
      const ids = [...accepted, ...duplicates];
      // A collector refusing a valid event has not proved a working handoff.
      // This smoke check permits a duplicate when the caller supplied an ID
      // already held by its destination; it does not promise durable delivery.
      if (ids.length !== 1 || ids[0] !== frozen.event_id || rejected.length !== 0 || result.blocked || result.batchTooLarge) return { passed: false, checks };
      checks++;
    } catch { return { passed: false, checks }; }
    finally { if (timer !== undefined) clearTimeout(timer); }
  }
  return { passed: true, checks };
}
