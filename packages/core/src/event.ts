import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, randomUUID } from 'node:crypto';
import { PACKAGE_VERSION } from './version.js';
import type { ResolvedOptions } from './config.js';
import type { Completion, Outcome, PulseContext, PulseEvent } from './types.js';

type HashedContext = Readonly<{ actor: string; conversation: string | null }> | null;

const clients: Readonly<Record<string, string>> = Object.freeze({
  chatgpt: 'chatgpt',
  'claude-desktop': 'claude-desktop',
  'claude desktop': 'claude-desktop',
  'claude-code': 'claude-code',
  'claude code': 'claude-code',
  cursor: 'cursor',
  codex: 'codex',
  vscode: 'vscode',
  'visual studio code': 'vscode',
  windsurf: 'windsurf',
  'mcp-inspector': 'mcp-inspector',
});

const errors: Record<Outcome, Exclude<PulseEvent['error_code'], undefined>> = {
  tool_success: null, tool_error: 'TOOL_ERROR', handler_exception: 'HANDLER_EXCEPTION',
  input_required: null, cancelled: 'CANCELLED', unknown: 'UNSUPPORTED_RESULT',
};

export function createEventFactory(options: ResolvedOptions) {
  // Raw identifiers are hashed before entering the async context store.
  const context = new AsyncLocalStorage<HashedContext>();
  function hash(value: string, domain: 'actor' | 'conversation'): string {
    const identity = options.identity!;
    const material = JSON.stringify(['pulse.identity.v1', identity.projectNamespace, domain, 'app_account', identity.epoch, value]);
    return `h1_${createHmac('sha256', identity.secret).update(material).digest('hex')}`;
  }
  function safeId(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 4096;
  }
  return {
    withContext<T>(input: PulseContext, fn: () => T): T {
      let hashed: HashedContext = null;
      // A malformed context omits identity. Customer callback errors remain untouched.
      try {
        if (options.enabled && options.identity) {
          const actorId = input?.actorId;
          const conversationId = input?.conversationId;
          if (safeId(actorId)) hashed = Object.freeze({ actor: hash(actorId, 'actor'), conversation: safeId(conversationId) ? hash(conversationId, 'conversation') : null });
        }
      } catch { /* Context failure must not fail customer execution. */ }
      return context.run(hashed, fn);
    },
    make(input: Completion): PulseEvent | null {
      if (!input) return null;
      // Read each candidate once: accessors cannot replace a validated value.
      const { toolName, durationMs, outcome, client, adapter } = input;
      let adapterName = 'custom';
      let adapterVersion: string | undefined;
      if (adapter !== undefined) {
        const { name, version } = adapter;
        if (typeof name !== 'string' || !/^[A-Za-z0-9_.:/-]{1,80}$/.test(name)) return null;
        if (typeof version !== 'string' || version.length > 40 || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,20})?$/.test(version)) return null;
        adapterName = name; adapterVersion = version;
      }
      if (typeof toolName !== 'string' || !/^[A-Za-z0-9_.:/-]{1,128}$/.test(toolName)) return null;
      if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 86_400_000) return null;
      if (typeof outcome !== 'string' || !Object.hasOwn(errors, outcome)) return null;
      const identity = context.getStore();
      let clientName: string | null = null;
      let clientVersion: string | null = null;
      let clientSource: PulseEvent['client_source'] = 'unknown';
      const name = client?.name;
      const source = client?.source;
      const version = client?.version;
      if (typeof name === 'string' && name.length <= 80 && source && ['handshake', 'configured', 'reported_metadata'].includes(source)) {
        clientName = Object.hasOwn(clients, name.toLowerCase()) ? clients[name.toLowerCase()]! : null;
        if (clientName) {
          clientSource = source;
          if (typeof version === 'string' && version.length <= 40 && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,20})?$/.test(version)) clientVersion = version;
        }
      }
      return Object.freeze({
        schema_version: 1,
        event_id: randomUUID(),
        kind: 'tool_handler.completed',
        occurred_at: new Date().toISOString(),
        tool_name: toolName,
        duration_ms: durationMs,
        outcome,
        identity_source: identity ? 'app_account' : 'none',
        identity_epoch: identity ? options.identity!.epoch : null,
        actor_id: identity?.actor ?? null,
        conversation_id: identity?.conversation ?? null,
        client_name: clientName,
        client_version: clientVersion,
        client_source: clientSource,
        environment: options.environment,
        release: options.release,
        error_code: errors[outcome],
        sdk_name: '@reviseflow/pulse-core',
        sdk_version: PACKAGE_VERSION,
        adapter: adapterName,
        ...(adapterVersion ? { adapter_version: adapterVersion } : {}),
      });
    },
  };
}
