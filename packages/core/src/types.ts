export type Environment = 'production' | 'staging' | 'development' | 'test';
export type Outcome = 'tool_success' | 'tool_error' | 'handler_exception' | 'input_required' | 'cancelled' | 'unknown';
export type ClientSource = 'handshake' | 'configured' | 'reported_metadata';
export type Locale = 'en' | 'tr';

export interface PulseCoreOptions {
  writeKey?: string;
  /** Full /v1/batch URL; HTTPS outside loopback development fixtures. */
  endpoint?: string;
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
}

export interface PulseContext {
  actorId?: string | null;
  conversationId?: string | null;
}

export interface PulseEvent {
  readonly schema_version: 1;
  readonly event_id: string;
  readonly kind: 'tool_handler.completed';
  readonly occurred_at: string;
  readonly tool_name: string;
  readonly duration_ms: number;
  readonly outcome: Outcome;
  readonly identity_source: 'none' | 'app_account';
  readonly identity_epoch: string | null;
  readonly actor_id: string | null;
  readonly conversation_id: string | null;
  readonly client_name: string | null;
  readonly client_version: string | null;
  readonly client_source: ClientSource | 'unknown';
  readonly environment: Environment;
  readonly release: string | null;
  readonly error_code: 'TOOL_ERROR' | 'HANDLER_EXCEPTION' | 'CANCELLED' | 'UNSUPPORTED_RESULT' | null;
  readonly sdk_name: '@pulse-sdk/core';
  readonly sdk_version: '0.0.0-m0';
  readonly adapter: 'mcp-typescript-2';
}

export interface PulseDiagnostics {
  readonly observed: number;
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
  withContext<T>(context: PulseContext, fn: () => T): T;
  /** Waits at most timeoutMs; remaining export work stays bounded in this instance. */
  flush(options?: { timeoutMs?: number }): Promise<void>;
  shutdown(): Promise<void>;
  getDiagnostics(): PulseDiagnostics;
}
