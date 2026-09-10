import { PulseConfigurationError, resolveOptions } from './config.js';
import { createEventFactory } from './event.js';
import { createExporter } from './exporter.js';
import type { PulseCore, PulseCoreOptions } from './types.js';

export { PulseConfigurationError, configurationMessages } from './config.js';
export type { ClientSource, Completion, Environment, Locale, Outcome, PulseContext, PulseCore, PulseCoreOptions, PulseDiagnostics, PulseEvent } from './types.js';

export function createPulseCore(options: PulseCoreOptions): PulseCore {
  const settings = resolveOptions(options);
  const events = createEventFactory(settings);
  const exporter = createExporter(settings);
  return Object.freeze({
    enabled: settings.enabled,
    complete(input) {
      if (!settings.enabled) return;
      try {
        const event = events.make(input);
        if (event) exporter.enqueue(event);
        else exporter.invalid();
      } catch { exporter.invalid(); }
    },
    withContext: events.withContext,
    async flush(options = {}) {
      const timeoutMs = options.timeoutMs ?? 2000;
      if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 60_000) throw new PulseConfigurationError();
      await exporter.flush(timeoutMs);
    },
    shutdown: exporter.shutdown,
    getDiagnostics: exporter.getDiagnostics,
  } satisfies PulseCore);
}
