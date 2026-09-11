// Generated from contracts/event-v1.schema.json; do not edit.
export type PulseEvent = {
  readonly schema_version: 1;
  readonly event_id: string;
  readonly kind: "tool_handler.completed";
  readonly occurred_at: string;
  readonly tool_name: string;
  readonly duration_ms: number;
  readonly outcome: "tool_success" | "tool_error" | "handler_exception" | "input_required" | "cancelled" | "unknown";
  readonly identity_source: "none" | "app_account" | "host_subject";
  readonly identity_epoch?: string | null;
  readonly actor_id: string | null;
  readonly conversation_id?: string | null;
  readonly client_name: string | null;
  readonly client_version?: string | null;
  readonly client_source: "unknown" | "handshake" | "reported_metadata" | "configured";
  readonly environment: "production" | "staging" | "development" | "test";
  readonly release: string | null;
  readonly error_code?: "TOOL_ERROR" | "HANDLER_EXCEPTION" | "CANCELLED" | "UNSUPPORTED_RESULT" | null;
  readonly sdk_name?: string;
  readonly sdk_version?: string;
  readonly adapter?: string;
  readonly adapter_version?: string;
};
