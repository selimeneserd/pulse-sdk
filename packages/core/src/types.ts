export type Environment = 'production' | 'staging' | 'development' | 'test';
export type Outcome = 'tool_success' | 'tool_error' | 'handler_exception' | 'input_required' | 'cancelled' | 'unknown';
export type ClientSource = 'handshake' | 'configured' | 'reported_metadata';
export type Locale = 'en' | 'tr';

export interface PulseCoreOptions {
  /** No implicit exporter or network destination is selected. */
  exporter?: PulseExporter;
  /** Receives only safe aggregate state; callback failures are isolated. */
  onDiagnostics?: (diagnostics: PulseDiagnostics) => void;
  environment: Environment;
  enabled?: boolean;
  release?: string;
  identity?: { secret: string; projectNamespace: string; epoch: string };
  queue?: {
    maxEvents?: number;
    maxBytes?: number;
    batchMaxEvents?: number;
    batchMaxBytes?: number;
    flushIntervalMs?: number;
    requestTimeoutMs?: number;
    maxRetries?: number;
    retryBaseMs?: number;
    retryMaxMs?: number;
  };
}

export interface Completion {
  toolName: string;
  durationMs: number;
  outcome: Outcome;
  client?: { name: string; version?: string; source: ClientSource };
  adapter?: { name: string; version: string };
}

/** Numeric usage returned by a provider for ONE model invocation. Caller attests
 * the source; Pulse never estimates tokens from prompts/results or host traffic.
 * Detail counters are subsets, not additional tokens. Missing stays unknown. */
export interface UsageRecord {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningOutputTokens?: number;
  toolName?: string;
}

/** Application-declared tool scope; unrelated async scopes remain isolated. */
export interface PulseToolContext {
  toolName: string;
  client?: Completion['client'];
  adapter?: Completion['adapter'];
}

export interface PulseContext {
  actorId?: string | null;
  conversationId?: string | null;
}

import type { PulseEvent } from './event.generated.js';
export type { PulseEvent, PulseHandlerEvent, PulseUsageEvent } from './event.generated.js';

export interface PulseDiagnostics {
  readonly status: 'disabled' | 'ready' | 'paused' | 'blocked' | 'closing' | 'shutdown';
  readonly blockReason: 'missing_exporter' | 'auth' | 'exporter_timeout' | null;
  readonly lastAcceptedAt: string | null;
  readonly retryAttempt: number;
  readonly missingExporter: number;
  readonly droppedPaused: number;
  readonly droppedTimeout: number;
  readonly observed: number;
  readonly observedUsage: number;
  readonly queued: number;
  readonly inFlight: number;
  readonly pendingBytes: number;
  readonly accepted: number;
  readonly duplicates: number;
  readonly rejected: number;
  readonly requests: number;
  readonly retries: number;
  readonly exporterFailures: number;
  readonly droppedOverflow: number;
  readonly droppedOversize: number;
  readonly droppedRetries: number;
  readonly droppedAuth: number;
  readonly droppedQuota: number;
  readonly droppedInvalid: number;
  readonly droppedShutdown: number;
}

export interface PulseCore {
  readonly enabled: boolean;
  /** Best effort; never throws a telemetry error into the observed handler. */
  complete(completion: Completion): void;
  /** Best effort. Every call reports a separate model invocation; call once. */
  recordUsage(usage: UsageRecord): void;
  withContext<T>(context: PulseContext, fn: () => T): T;
  /** Generates a local invocation UUID for usage/completion correlation. */
  withToolContext<T>(context: PulseToolContext, fn: () => T): T;
  /** Waits at most timeoutMs; remaining export work stays bounded in this instance. */
  flush(options?: { timeoutMs?: number }): Promise<void>;
  pause(): void;
  resume(): void;
  reconfigure(options: { exporter: PulseExporter }): void;
  shutdown(options?: { timeoutMs?: number }): Promise<void>;
  getDiagnostics(): PulseDiagnostics;
}

/** Result IDs must be unique, non-conflicting members of the submitted batch.
 * Omitted IDs and retryable rejections remain pending within the dispatcher budget. */
export interface PulseExportResult {
  readonly accepted: readonly string[];
  readonly duplicates: readonly string[];
  readonly rejected: readonly { readonly event_id: string; readonly code: string; readonly retryable: boolean }[];
  readonly retryAfterMs?: number;
  readonly blocked?: 'auth';
  /** The dispatcher alone splits and retries a collector-rejected oversized batch. */
  readonly batchTooLarge?: boolean;
}
export interface PulseExportContext { readonly signal: AbortSignal }
/** Exporters perform one delivery attempt. Retries and queue ownership stay in core. */
export interface PulseExporter {
  export(events: readonly PulseEvent[], context: PulseExportContext): PulseExportResult | Promise<PulseExportResult>;
  shutdown?(context: PulseExportContext): void | Promise<void>;
}
