import { PulseConfigurationError, resolveOptions, validateExporter } from './config.js';
import { createEventFactory } from './event.js';
import { createDispatcher } from './exporter.js';
import type { PulseCore, PulseCoreOptions } from './types.js';

export { PulseConfigurationError, configurationMessages } from './config.js';
export type { ClientSource, Completion, Environment, Locale, Outcome, PulseContext, PulseCore, PulseCoreOptions, PulseDiagnostics, PulseEvent, PulseExporter, PulseExportResult, PulseExportContext } from './types.js';

function timeout(value: number | undefined, fallback = 2000): number {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result < 0 || result > 60_000) throw new PulseConfigurationError();
  return result;
}
export function createPulseCore(options: PulseCoreOptions): PulseCore {
  const settings = resolveOptions(options);
  const events = createEventFactory(settings);
  const dispatcher = createDispatcher(settings);
  return Object.freeze({
    get enabled() { return settings.enabled; },
    complete(input) {
      if (!settings.enabled) return;
      try {
        const event = events.make(input);
        if (event) dispatcher.enqueue(event);
        else dispatcher.invalid();
      } catch { dispatcher.invalid(); }
    },
    withContext: events.withContext,
    async flush(options = {}) { await dispatcher.flush(timeout(options.timeoutMs)); },
    pause: dispatcher.pause,
    resume: dispatcher.resume,
    reconfigure(options) { dispatcher.reconfigure(validateExporter(options.exporter)); },
    async shutdown(options = {}) { await dispatcher.shutdown(timeout(options.timeoutMs, settings.queue.requestTimeoutMs)); },
    getDiagnostics: dispatcher.getDiagnostics,
  } satisfies PulseCore);
}
