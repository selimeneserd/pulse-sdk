import { createHash } from 'node:crypto';
import { ROOT_CONTEXT, SpanKind, SpanStatusCode, type HrTime, type Tracer } from '@opentelemetry/api';
import { PulseConfigurationError, type PulseExporter } from '@reviseflow/pulse-core';
import { snapshotPulseEvent } from '@reviseflow/pulse-core/conformance';

function epochTime(milliseconds: number): HrTime {
  const seconds = Math.floor(milliseconds / 1000);
  const nanos = Math.round((milliseconds - seconds * 1000) * 1_000_000);
  return nanos === 1_000_000_000 ? [seconds + 1,0] : [seconds,nanos];
}

/** Emits a local INTERNAL span per handler completion. Acceptance means handed
 * to the supplied tracer, not durable OTLP delivery. Configure/flush the OTel
 * provider independently. No inbound span processing or global provider setup. */
export function createOtelExporter(options: { tracer: Tracer; deduplicationMaxEvents?: number }): PulseExporter {
  const maximum = options.deduplicationMaxEvents ?? 1000;
  if (!options.tracer || typeof options.tracer.startSpan !== 'function' || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > 10000) throw new PulseConfigurationError();
  const seen = new Map<string, { fingerprint: string; accepted: boolean }>();
  return {
    export(events, { signal }) {
      const accepted: string[] = []; const duplicates: string[] = [];
      const rejected: { event_id: string; code: string; retryable: boolean }[] = [];
      for (const candidate of events) {
        const event = snapshotPulseEvent(candidate);
        if (!event) {
          let id: unknown; try { id = candidate.event_id; } catch { /* no raw diagnostics */ }
          if (typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) rejected.push({event_id:id,code:'INVALID_EVENT',retryable:false});
          continue;
        }
        if (signal.aborted) { rejected.push({event_id:event.event_id,code:'CANCELLED',retryable:true}); continue; }
        const end = Date.parse(event.occurred_at);
        // Some valid wire timestamps (for example leap seconds) have no JS Date
        // representation. Never let the tracer substitute its current clock.
        if (!Number.isFinite(end)) { rejected.push({event_id:event.event_id,code:'INVALID_EVENT',retryable:false}); continue; }
        const id = event.event_id.toLowerCase();
        // Retain a fixed-size fingerprint, not arbitrary timestamp text from
        // direct exporter callers outside the dispatcher's event-byte bounds.
        const fingerprint = createHash('sha256').update(JSON.stringify(Object.keys(event).sort().map(key => [key,event[key as keyof typeof event]]))).digest('hex');
        const previous = seen.get(id);
        if (previous) {
          if (previous.fingerprint !== fingerprint) rejected.push({event_id:event.event_id,code:'EVENT_ID_CONFLICT',retryable:false});
          else if (previous.accepted) duplicates.push(event.event_id);
          else rejected.push({event_id:event.event_id,code:'OTEL_LOCAL_FAILURE',retryable:false});
          continue;
        }
        // Mark before invoking foreign tracer code: an ambiguous local throw must
        // not manufacture duplicate tool spans on a dispatcher retry.
        const receipt = {fingerprint,accepted:false};
        seen.set(id,receipt); if (seen.size > maximum) seen.delete(seen.keys().next().value!);
        try {
          const span = options.tracer.startSpan('pulse.tool_handler', {
            kind: SpanKind.INTERNAL,
            // HrTime is unambiguously epoch-based; numeric inputs can be treated
            // by OTel as performance.now() for historical timestamps.
            startTime: epochTime(end - event.duration_ms),
            attributes: {
              'pulse.origin': 'pulse-exporter',
              'pulse.measurement.scope': 'handler_completion',
              'pulse.coverage': 'unknown',
              'pulse.event.id': event.event_id,
              'pulse.schema.version': event.schema_version,
              'pulse.handler.duration_ms': event.duration_ms,
              'pulse.handler.outcome': event.outcome,
              'gen_ai.tool.name': event.tool_name,
              'deployment.environment.name': event.environment,
            },
          }, ROOT_CONTEXT);
          if (event.outcome === 'handler_exception' || event.outcome === 'tool_error') span.setStatus({code:SpanStatusCode.ERROR});
          span.end(epochTime(end));
          receipt.accepted = true;
          accepted.push(event.event_id);
        } catch { rejected.push({event_id:event.event_id,code:'OTEL_LOCAL_FAILURE',retryable:false}); }
      }
      return {accepted,duplicates,rejected};
    },
  };
}
