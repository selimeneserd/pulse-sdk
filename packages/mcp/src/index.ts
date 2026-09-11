import { performance } from 'node:perf_hooks';
import { CLIENT_INFO_META_KEY, type McpServer, type RegisteredTool, type ServerContext } from '@modelcontextprotocol/server';
import { createPulseCore, type PulseCoreOptions, type Outcome } from '@reviseflow/pulse-core';
import { PACKAGE_VERSION } from './version.js';

export type { PulseCoreOptions, Outcome } from '@reviseflow/pulse-core';
export const SUPPORTED_MCP_VERSION = '2.0.0';

const messages = {
  en: {
    UNSUPPORTED_MCP_VERSION: 'The public MCP registration interface is unsupported.',
    INSTRUMENTATION_FAILED: 'Instrumentation could not be installed; the server remains available.',
    SERVER_ALREADY_WRAPPED: 'This server is already instrumented.',
    WRAP_BEFORE_REGISTRATION: 'Wrap a fresh server before tool registration and connection.',
  },
  tr: {
    UNSUPPORTED_MCP_VERSION: 'Public MCP kayıt arayüzü desteklenmiyor.',
    INSTRUMENTATION_FAILED: 'Ölçüm kurulamadı; sunucu kullanılabilir durumda.',
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
  /** Opt into setup exceptions in development. Production setup defaults to fail-open. */
  strict?: boolean;
  /** Self-reported label only. No host certification, headers or raw metadata capture. */
  captureClient?: boolean;
  /** Return null to exclude a tool. Mapping happens locally; thrown mapper errors drop telemetry. */
  mapToolName?: (name: string) => string | null;
}

// A marker on our own public hook prevents double wrapping across duplicate SDK
// copies or bundles. It contains no identity, runtime state or customer data.
const hookMarker = Symbol.for('@reviseflow/pulse/register-tool/v1');
function isInstrumented(register: unknown): boolean {
  return typeof register === 'function' && Reflect.get(register, hookMarker) === true;
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
  const core = createPulseCore(options);
  let excluded = 0;
  let mapperErrors = 0;
  let instrumentationFailures = 0;
  let lastInstrumentationError: CompatibilityCode | null = null;

  function install<T extends McpServer>(target: T): T {
    if (!target || typeof target.registerTool !== 'function' || typeof target.isConnected !== 'function'
      || typeof target.server?.getCapabilities !== 'function') throw new PulseCompatibilityError('UNSUPPORTED_MCP_VERSION');
    if (isInstrumented(target.registerTool)) {
      if (options.strict) throw new PulseCompatibilityError('SERVER_ALREADY_WRAPPED');
      return target;
    }
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
          try {
            core.complete({ toolName, durationMs: performance.now() - started, outcome, adapter: { name: 'mcp-typescript-2', version: PACKAGE_VERSION }, ...(client ? { client } : {}) });
          } catch { /* Telemetry must never replace the handler outcome. */ }
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
        } catch { finish('unknown'); return result; }
        if (typeof then === 'function') {
          // Adopt the public then method once, including foreign-realm promises.
          return new Promise((resolve, reject) => {
            // Promise resolution calls a thenable's method in a later job, never
            // synchronously inside the application handler's return path.
            queueMicrotask(() => {
              try { Reflect.apply(then as Callback, result, [resolve, reject]); }
              catch (error) { reject(error); }
            });
          }).then(value => { finish(outcomeOf(value)); return value; }, failed);
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
      // This is the returned public registration handle itself, with its identity preserved.
      // No hidden registry, executor, handler field or prototype is inspected or patched.
      try {
        const update = handle.update;
        handle.update = (updates) => {
        const next = updates.callback
          ? { ...updates, callback: instrument(updates.callback as Callback, () => currentName) as typeof updates.callback }
          : updates;
        Reflect.apply(update, handle, [next]);
          if (typeof updates.name === 'string' && updates.name) currentName = updates.name;
        };
      } catch {
        instrumentationFailures++;
        lastInstrumentationError = 'INSTRUMENTATION_FAILED';
        // Registration already succeeded. Never replace the public return value.
      }
      return handle;
    }) as T['registerTool'];

    // Instance-local PUBLIC registration hook: a bound subclass method that calls
    // this.registerTool() must use the same instrumentation path as the facade.
    // The prototype and other server instances are never changed.
    Object.defineProperty(register, hookMarker, { value: true });
    target.registerTool = register;
    const bindings = new Map<PropertyKey, { original: unknown; bound: unknown }>();
    const facade = new Proxy(target, {
      get(object, key) {
        if (key === 'registerTool') return Reflect.get(object, key, object);
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
    return facade;
  }

  function wrapServer<T extends McpServer>(target: T): T {
    // Exact identity, no patch/capability check: disabled means no instrumentation.
    if (options.enabled === false) return target;
    try { return install(target); }
    catch (error) {
      instrumentationFailures++;
      lastInstrumentationError = error instanceof PulseCompatibilityError ? error.code : 'INSTRUMENTATION_FAILED';
      if (options.strict) throw new PulseCompatibilityError(lastInstrumentationError);
      return target;
    }
  }

  return {
    ...core,
    get enabled() { return core.enabled; },
    wrapServer,
    getDiagnostics: () => ({ ...core.getDiagnostics(), excludedTools: excluded, mapperErrors, instrumentationFailures, lastInstrumentationError }),
  };
}
