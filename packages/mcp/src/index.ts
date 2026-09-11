import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { CLIENT_INFO_META_KEY, McpServer, type RegisteredTool, type ServerContext } from '@modelcontextprotocol/server';
import { createPulseCore, type PulseCoreOptions, type Outcome } from '@reviseflow/pulse-core';

export type { PulseCoreOptions, Outcome } from '@reviseflow/pulse-core';
export const SUPPORTED_MCP_VERSION = '2.0.0';

const messages = {
  en: {
    UNSUPPORTED_MCP_VERSION: 'This adapter requires the tested MCP server version 2.0.0.',
    SERVER_ALREADY_WRAPPED: 'This server is already instrumented.',
    WRAP_BEFORE_REGISTRATION: 'Wrap a fresh server before tool registration and connection.',
  },
  tr: {
    UNSUPPORTED_MCP_VERSION: 'Bu adaptör test edilmiş MCP server 2.0.0 sürümünü gerektirir.',
    SERVER_ALREADY_WRAPPED: 'Bu sunucu zaten ölçümleniyor.',
    WRAP_BEFORE_REGISTRATION: 'Yeni sunucuyu araç kaydından ve bağlantıdan önce sarmalayın.',
  },
} as const;
type CompatibilityCode = keyof typeof messages.en;
export class PulseCompatibilityError extends Error {
  constructor(readonly code: CompatibilityCode) { super(code); this.name = 'PulseCompatibilityError'; }
  getMessage(locale: 'en' | 'tr' = 'en'): string { return messages[locale][this.code]; }
}

export interface PulseOptions extends PulseCoreOptions {
  /** Self-reported label only. No host certification, headers or raw metadata capture. */
  captureClient?: boolean;
  /** Return null to exclude a tool. Mapping happens locally; thrown mapper errors drop telemetry. */
  mapToolName?: (name: string) => string | null;
}

// Per-module WeakSet, never a current-user global or an upstream private registry.
const instrumented = new WeakSet<McpServer>();
const require = createRequire(import.meta.url);
function assertVersion(): void {
  try {
    // Read published package metadata only. No private SDK runtime fields.
    const entry = require.resolve('@modelcontextprotocol/server');
    const pkg = JSON.parse(readFileSync(resolve(dirname(entry), '../package.json'), 'utf8')) as { name?: unknown; version?: unknown };
    if (pkg.name !== '@modelcontextprotocol/server' || pkg.version !== SUPPORTED_MCP_VERSION) throw new Error();
  } catch { throw new PulseCompatibilityError('UNSUPPORTED_MCP_VERSION'); }
}

/** Inspect envelope discriminants only; never parse/copy/traverse tool content. */
function outcomeOf(result: unknown): Outcome {
  try {
    if (typeof result !== 'object' || result === null || Array.isArray(result)) return 'unknown';
    const value = result as Record<string, unknown>;
    if (value.resultType === 'input_required') return 'input_required';
    if (value.resultType !== undefined && value.resultType !== 'complete') return 'unknown';
    if (value.isError === true) return 'tool_error';
    if (value.isError !== undefined && value.isError !== false) return 'unknown';
    return Array.isArray(value.content) ? 'tool_success' : 'unknown';
  } catch { return 'unknown'; }
}

type Callback = (this: unknown, ...args: unknown[]) => unknown;
type Core = ReturnType<typeof createPulseCore>;
type ClientHint = NonNullable<Parameters<Core['complete']>[0]['client']>;

export function createPulse(options: PulseOptions) {
  assertVersion();
  const core = createPulseCore(options);
  let excluded = 0;
  let mapperErrors = 0;

  function wrapServer<T extends McpServer>(target: T): T {
    if (instrumented.has(target)) throw new PulseCompatibilityError('SERVER_ALREADY_WRAPPED');
    if (!(target instanceof McpServer)) throw new PulseCompatibilityError('UNSUPPORTED_MCP_VERSION');
    // Public capability check conservatively rejects even manually pre-advertised tools.
    if (target.isConnected() || target.server.getCapabilities().tools !== undefined) {
      throw new PulseCompatibilityError('WRAP_BEFORE_REGISTRATION');
    }

    const clientHint = (ctx: ServerContext | undefined): ClientHint | undefined => {
      if (!options.captureClient) return undefined;
      try {
        const envelope = ctx?.mcpReq?.envelope;
        // 2.0.0's generated RequestMetaEnvelope type is empty; validate the
        // documented public wire key at runtime rather than trusting a type cast.
        const reported: unknown = envelope ? (envelope as Record<string, unknown>)[CLIENT_INFO_META_KEY] : undefined;
        const candidate: unknown = reported ?? target.server.getClientVersion();
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined;
        const info = candidate as Record<string, unknown>;
        if (typeof info.name !== 'string') return undefined;
        return {
          name: info.name,
          ...(typeof info.version === 'string' ? { version: info.version } : {}),
          source: reported ? 'reported_metadata' : 'handshake',
        };
      } catch { return undefined; }
    };

    function instrument(callback: Callback, currentName: () => string): Callback {
      return function (this: unknown, ...args: unknown[]) {
        if (!core.enabled) return Reflect.apply(callback, this, args);
        let toolName: string | null;
        try { toolName = options.mapToolName ? options.mapToolName(currentName()) : currentName(); }
        catch { mapperErrors++; return Reflect.apply(callback, this, args); }
        if (toolName === null) { excluded++; return Reflect.apply(callback, this, args); }
        // Upstream invokes no-schema handlers with (ctx), schema handlers with (args,ctx).
        const ctx = args[args.length - 1] as ServerContext | undefined;
        const client = clientHint(ctx);
        const started = performance.now();
        const finish = (outcome: Outcome) => {
          // Only the request's public signal can establish cancellation. Exporter
          // timeouts never touch it. A handler may throw any error after observing it.
          try { if (ctx?.mcpReq?.signal?.aborted) outcome = 'cancelled'; } catch { /* Invalid local context stays unknown. */ }
          core.complete({ toolName, durationMs: performance.now() - started, outcome, ...(client ? { client } : {}) });
        };
        const failed = (error: unknown): never => {
          finish('handler_exception');
          throw error;
        };
        let result: unknown;
        try { result = Reflect.apply(callback, this, args); }
        catch (error) { return failed(error); }
        // Preserve synchronous values and thrown-error identity. Promises keep their resolved value.
        let then: unknown;
        try {
          if (result !== null && (typeof result === 'object' || typeof result === 'function')) {
            then = Reflect.get(result, 'then');
          }
        } catch (error) { return failed(error); }
        if (typeof then === 'function') {
          // Promise.resolve adopts foreign-realm Promises and PromiseLike results.
          return Promise.resolve(result).then(value => { finish(outcomeOf(value)); return value; }, failed);
        }
        finish(outcomeOf(result));
        return result;
      };
    }

    // The upstream overloads remain the public type surface. Only the callback is replaced.
    const original = target.registerTool as unknown as (name: string, config: unknown, cb: Callback) => RegisteredTool;
    const register = ((name: string, config: unknown, callback: Callback): RegisteredTool => {
      let currentName = name;
      const handle = Reflect.apply(original, target, [name, config, instrument(callback, () => currentName)]) as RegisteredTool;
      const update = handle.update;
      // This is the returned public registration handle itself, with its identity preserved.
      // No hidden registry, executor, handler field or prototype is inspected or patched.
      handle.update = (updates) => {
        const next = updates.callback
          ? { ...updates, callback: instrument(updates.callback as Callback, () => currentName) as typeof updates.callback }
          : updates;
        Reflect.apply(update, handle, [next]);
        if (typeof updates.name === 'string' && updates.name) currentName = updates.name;
      };
      return handle;
    }) as T['registerTool'];

    // Instance-local PUBLIC registration hook: a bound subclass method that calls
    // this.registerTool() must use the same instrumentation path as the facade.
    // The prototype and other server instances are never changed.
    target.registerTool = register;
    const bindings = new Map<PropertyKey, { original: unknown; bound: unknown }>();
    const facade = new Proxy(target, {
      get(object, key) {
        if (key === 'registerTool') return register;
        const value: unknown = Reflect.get(object, key, object);
        if (typeof value !== 'function') return value;
        const cached = bindings.get(key);
        if (cached?.original === value) return cached.bound;
        const bound: unknown = value.bind(object);
        bindings.set(key, { original: value, bound });
        return bound;
      },
      set(object, key, value) { return Reflect.set(object, key, value, object); },
    });
    instrumented.add(target);
    instrumented.add(facade);
    return facade;
  }

  return {
    ...core,
    wrapServer,
    getDiagnostics: () => ({ ...core.getDiagnostics(), excludedTools: excluded, mapperErrors }),
  };
}
