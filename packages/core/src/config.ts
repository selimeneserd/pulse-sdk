import type { Locale, PulseCoreOptions } from './types.js';

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
  endpoint: string | null;
  writeKey: string | null;
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

export function resolveOptions(options: PulseCoreOptions): ResolvedOptions {
  if (!options || !['production', 'staging', 'development', 'test'].includes(options.environment)) invalid();
  if (options.enabled !== undefined && typeof options.enabled !== 'boolean') invalid();
  const enabled = options.enabled ?? (options.environment === 'production' || options.environment === 'staging');
  if (options.release !== undefined && (typeof options.release !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$/.test(options.release))) invalid();
  let endpoint: string | null = null;
  if (enabled || options.endpoint !== undefined) {
    if (typeof options.endpoint !== 'string' || options.endpoint.length > 2048) invalid();
    try {
      const url = new URL(options.endpoint);
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) invalid();
      endpoint = url.href;
    } catch { invalid(); }
  }
  if ((enabled || options.writeKey !== undefined) && (typeof options.writeKey !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(options.writeKey))) invalid();
  let identity: ResolvedOptions['identity'] = null;
  if (options.identity !== undefined) {
    const candidate = options.identity;
    if (!candidate || typeof candidate.secret !== 'string' || Buffer.byteLength(candidate.secret) < 32 || Buffer.byteLength(candidate.secret) > 4096 || candidate.secret === options.writeKey) invalid();
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
  return { enabled, endpoint, writeKey: options.writeKey ?? null, environment: options.environment, release: options.release ?? null, identity, queue };
}
