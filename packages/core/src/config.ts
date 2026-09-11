import type { Locale, PulseCoreOptions, PulseExporter } from './types.js';

export const configurationMessages = Object.freeze({
  en: 'Pulse configuration is invalid. Check the documented configuration requirements.',
  tr: 'Pulse yapılandırması geçersiz. Belgelenen yapılandırma gereksinimlerini kontrol edin.',
});

export class PulseConfigurationError extends Error {
  readonly code = 'PULSE_INVALID_CONFIGURATION';
  constructor() {
    super('PULSE_INVALID_CONFIGURATION');
    this.name = 'PulseConfigurationError';
  }
  getMessage(locale: Locale): string {
    return configurationMessages[locale];
  }
}

export interface QueueSettings {
  maxEvents: number;
  maxBytes: number;
  batchMaxEvents: number;
  batchMaxBytes: number;
  flushIntervalMs: number;
  requestTimeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
  retryMaxMs: number;
}

export interface ResolvedOptions {
  enabled: boolean;
  requestedEnabled: boolean;
  exporter: PulseExporter | null;
  onDiagnostics: PulseCoreOptions['onDiagnostics'];
  environment: PulseCoreOptions['environment'];
  release: string | null;
  identity: Readonly<NonNullable<PulseCoreOptions['identity']>> | null;
  queue: QueueSettings;
}

const defaults: QueueSettings = {
  maxEvents: 1000,
  maxBytes: 1024 * 1024,
  batchMaxEvents: 100,
  batchMaxBytes: 256 * 1024,
  flushIntervalMs: 2000,
  requestTimeoutMs: 2000,
  maxRetries: 3,
  retryBaseMs: 100,
  retryMaxMs: 2000,
};

const limits: Record<keyof QueueSettings, readonly [number, number]> = {
  maxEvents: [1, 1000],
  maxBytes: [1, 16 * 1024 * 1024],
  batchMaxEvents: [1, 100],
  batchMaxBytes: [1, 256 * 1024],
  flushIntervalMs: [1, 60_000],
  requestTimeoutMs: [1, 60_000],
  maxRetries: [0, 3],
  retryBaseMs: [1, 60_000],
  retryMaxMs: [1, 60_000],
};

function invalid(): never { throw new PulseConfigurationError(); }

export function resolveOptions(input: PulseCoreOptions): ResolvedOptions {
  try { return resolveSnapshot(input); } catch { throw new PulseConfigurationError(); }
}
function resolveSnapshot(input: PulseCoreOptions): ResolvedOptions {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  if (Object.hasOwn(input, 'endpoint') || Object.hasOwn(input, 'writeKey')) invalid();
  const { environment, enabled, release, exporter, onDiagnostics, identity: identityInput, queue: queueInput } = input;
  // Snapshot every user accessor once before validation. No later read can substitute raw labels/identity.
  const identity = identityInput === undefined ? undefined : !identityInput || typeof identityInput !== 'object' ? invalid() : { secret: identityInput.secret, projectNamespace: identityInput.projectNamespace, epoch: identityInput.epoch };
  const queue = queueInput === undefined ? undefined : !queueInput || typeof queueInput !== 'object' || Array.isArray(queueInput) ? invalid() : Object.fromEntries(Object.keys(queueInput).map(key => [key, (queueInput as Record<string, unknown>)[key]]));
  const options = { environment, enabled, release, exporter, onDiagnostics, identity, queue } as PulseCoreOptions;
  return resolveValidatedSnapshot(options);
}
function resolveValidatedSnapshot(options: PulseCoreOptions): ResolvedOptions {
  if (!options || !['production', 'staging', 'development', 'test'].includes(options.environment)) invalid();
  if (options.enabled !== undefined && typeof options.enabled !== 'boolean') invalid();
  const requestedEnabled = options.enabled ?? true;
  const exporter = options.exporter === undefined ? null : validateExporter(options.exporter);
  const enabled = requestedEnabled && exporter !== null;
  if (options.onDiagnostics !== undefined && typeof options.onDiagnostics !== 'function') invalid();
  if (Object.hasOwn(options, 'endpoint') || Object.hasOwn(options, 'writeKey')) invalid();
  if (options.release !== undefined && (typeof options.release !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$/.test(options.release))) invalid();
  let identity: ResolvedOptions['identity'] = null;
  if (options.identity !== undefined) {
    const candidate = options.identity;
    if (!candidate || typeof candidate.secret !== 'string' || Buffer.byteLength(candidate.secret) < 32 || Buffer.byteLength(candidate.secret) > 4096) invalid();
    if (typeof candidate.projectNamespace !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(candidate.projectNamespace)) invalid();
    if (typeof candidate.epoch !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(candidate.epoch)) invalid();
    identity = Object.freeze({ secret: candidate.secret, projectNamespace: candidate.projectNamespace, epoch: candidate.epoch });
  }
  if (options.queue !== undefined && (!options.queue || typeof options.queue !== 'object' || Array.isArray(options.queue))) invalid();
  const queue = { ...defaults };
  for (const key of Object.keys(options.queue ?? {})) {
    if (!Object.hasOwn(defaults, key)) invalid();
    const name = key as keyof QueueSettings;
    const value = options.queue![name];
    if (value === undefined) continue;
    const [minimum, maximum] = limits[name];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) invalid();
    queue[name] = value;
  }
  if (queue.retryBaseMs > queue.retryMaxMs) invalid();
  return { enabled, requestedEnabled, exporter, onDiagnostics: options.onDiagnostics, environment: options.environment, release: options.release ?? null, identity, queue };
}

export function validateExporter(exporter: PulseExporter): PulseExporter {
  try {
    if (!exporter || typeof exporter.export !== 'function' || (exporter.shutdown !== undefined && typeof exporter.shutdown !== 'function')) invalid();
  } catch { invalid(); }
  return exporter;
}
