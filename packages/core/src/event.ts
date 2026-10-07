import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, randomUUID } from 'node:crypto';
import { PACKAGE_VERSION } from './version.js';
import type { ResolvedOptions } from './config.js';
import type { Completion, Outcome, PulseContext, PulseHandlerEvent, PulseUsageEvent, PulseToolContext, UsageRecord } from './types.js';

type HashedContext = Readonly<{ actor: string; conversation: string | null }> | null;
const clients: Readonly<Record<string, string>> = Object.freeze({
  chatgpt: 'chatgpt', 'claude-desktop': 'claude-desktop', 'claude desktop': 'claude-desktop',
  'claude-code': 'claude-code', 'claude code': 'claude-code', cursor: 'cursor', codex: 'codex',
  vscode: 'vscode', 'visual studio code': 'vscode', windsurf: 'windsurf', 'mcp-inspector': 'mcp-inspector',
});
const errors: Record<Outcome, Exclude<PulseHandlerEvent['error_code'], undefined>> = {
  tool_success: null, tool_error: 'TOOL_ERROR', handler_exception: 'HANDLER_EXCEPTION',
  input_required: null, cancelled: 'CANCELLED', unknown: 'UNSUPPORTED_RESULT',
};
function safeLabel(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= maximum && /^[A-Za-z0-9_.:/-]+$/.test(value);
}
function adapterFields(input: Completion['adapter']) {
  if (input === undefined) return { adapter: 'custom' };
  const { name, version } = input;
  if (!safeLabel(name, 80) || typeof version !== 'string' || version.length > 40 || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,20})?$/.test(version)) return null;
  return { adapter: name, adapter_version: version };
}
function clientFields(input: Completion['client']) {
  let client_name: string | null = null, client_version: string | null = null;
  let client_source: PulseHandlerEvent['client_source'] = 'unknown';
  const name = input?.name, source = input?.source, version = input?.version;
  if (typeof name === 'string' && name.length <= 80 && source && ['handshake', 'configured', 'reported_metadata'].includes(source)) {
    client_name = Object.hasOwn(clients, name.toLowerCase()) ? clients[name.toLowerCase()]! : null;
    if (client_name) {
      client_source = source;
      if (typeof version === 'string' && version.length <= 40 && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,20})?$/.test(version)) client_version = version;
    }
  }
  return { client_name, client_version, client_source };
}
type ToolScope = Readonly<{ toolName: string; invocationId: string; client: ReturnType<typeof clientFields>; adapter: NonNullable<ReturnType<typeof adapterFields>> }> | null;

export function createEventFactory(options: ResolvedOptions) {
  // Raw identifiers are hashed before entering the async context store.
  const context = new AsyncLocalStorage<HashedContext>();
  const toolContext = new AsyncLocalStorage<ToolScope>();
  function hash(value: string, domain: 'actor' | 'conversation'): string {
    const identity = options.identity!;
    const material = JSON.stringify(['pulse.identity.v1', identity.projectNamespace, domain, 'app_account', identity.epoch, value]);
    return `h1_${createHmac('sha256', identity.secret).update(material).digest('hex')}`;
  }
  function safeId(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 4096;
  }
  function common() {
    const identity = context.getStore();
    return {
      schema_version: 1 as const, event_id: randomUUID(), occurred_at: new Date().toISOString(),
      identity_source: identity ? 'app_account' as const : 'none' as const,
      identity_epoch: identity ? options.identity!.epoch : null, actor_id: identity?.actor ?? null,
      conversation_id: identity?.conversation ?? null, environment: options.environment, release: options.release,
      sdk_name: '@reviseflow/pulse-core', sdk_version: PACKAGE_VERSION,
    };
  }
  return {
    withContext<T>(input: PulseContext, fn: () => T): T {
      let hashed: HashedContext = null;
      try {
        if (options.enabled && options.identity) {
          const actorId = input?.actorId, conversationId = input?.conversationId;
          if (safeId(actorId)) hashed = Object.freeze({ actor: hash(actorId, 'actor'), conversation: safeId(conversationId) ? hash(conversationId, 'conversation') : null });
        }
      } catch { /* Context failure must not fail customer execution. */ }
      return context.run(hashed, fn);
    },
    withToolContext<T>(input: PulseToolContext, fn: () => T): T {
      if (!options.enabled) return fn();
      let scope: ToolScope = null;
      try {
        const { toolName, client, adapter } = input;
        const safeAdapter = adapterFields(adapter);
        if (options.enabled && safeLabel(toolName, 128) && safeAdapter) scope = Object.freeze({ toolName, invocationId: randomUUID(), client: Object.freeze(clientFields(client)), adapter: Object.freeze(safeAdapter) });
      } catch { /* Malformed telemetry scope cannot interrupt customer code. */ }
      return toolContext.run(scope, fn);
    },
    make(input: Completion): PulseHandlerEvent | null {
      if (!input) return null;
      // Read each candidate once: accessors cannot replace a validated value.
      const { toolName, durationMs, outcome, client, adapter } = input;
      const scope = toolContext.getStore();
      const matchingScope = scope?.toolName === toolName ? scope : null;
      const safeAdapter = adapter === undefined && matchingScope ? matchingScope.adapter : adapterFields(adapter);
      if (!safeAdapter || !safeLabel(toolName, 128)) return null;
      if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 86_400_000) return null;
      if (typeof outcome !== 'string' || !Object.hasOwn(errors, outcome)) return null;
      return Object.freeze({
        ...common(), kind: 'tool_handler.completed', tool_name: toolName, duration_ms: durationMs, outcome,
        ...(client === undefined && matchingScope ? matchingScope.client : clientFields(client)), error_code: errors[outcome], ...safeAdapter,
        ...(scope?.toolName === toolName ? { invocation_id: scope.invocationId } : {}),
      });
    },
    makeUsage(input: UsageRecord): PulseUsageEvent | null {
      if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
      // Read only scalar fields once; never inspect raw content or provider response objects.
      const { provider, model, inputTokens, outputTokens, cachedInputTokens, reasoningOutputTokens, toolName } = input;
      if (!safeLabel(provider, 80) || !safeLabel(model, 128)) return null;
      const tokens = [inputTokens, outputTokens, cachedInputTokens, reasoningOutputTokens];
      if (tokens.some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647))) return null;
      if (inputTokens === undefined && outputTokens === undefined) return null;
      if (cachedInputTokens !== undefined && (inputTokens === undefined || cachedInputTokens > inputTokens)) return null;
      if (reasoningOutputTokens !== undefined && (outputTokens === undefined || reasoningOutputTokens > outputTokens)) return null;
      if (toolName !== undefined && !safeLabel(toolName, 128)) return null;
      const scope = toolContext.getStore();
      const associatedTool = toolName ?? scope?.toolName ?? null;
      const sameScope = scope && associatedTool === scope.toolName ? scope : null;
      return Object.freeze({
        ...common(), kind: 'model_usage.recorded', usage_source: 'provider_reported', provider, model,
        tool_name: associatedTool, invocation_id: sameScope?.invocationId ?? null,
        input_tokens: inputTokens ?? null, output_tokens: outputTokens ?? null,
        cached_input_tokens: cachedInputTokens ?? null, reasoning_output_tokens: reasoningOutputTokens ?? null,
        ...(sameScope?.client ?? clientFields(undefined)), ...(sameScope?.adapter ?? adapterFields(undefined)!),
      });
    },
  };
}
