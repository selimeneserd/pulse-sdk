import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpServer, type RegisteredTool, type ServerContext } from '@modelcontextprotocol/server';
import { createPulse, PulseCompatibilityError } from '@pulse-sdk/mcp';
import { startFixtureCollector, startMcpFixture } from '../examples/fixture.js';
import { z } from 'zod';
import { runInNewContext } from 'node:vm';
import { performance } from 'node:perf_hooks';

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
const invoke = (handle: RegisteredTool, receiver: unknown, ...args: unknown[]): unknown => Reflect.apply(handle.handler, receiver, args);
const context = (signal = new AbortController().signal) => ({ mcpReq: { signal } }) as ServerContext;

async function setup() {
  const collector = await startFixtureCollector();
  cleanups.push(collector.close);
  const pulse = createPulse({ writeKey: collector.writeKey, endpoint: collector.endpoint, environment: 'test', enabled: true, queue: { flushIntervalMs: 60_000 } });
  cleanups.push(() => pulse.shutdown());
  return { collector, pulse };
}

describe('public registration facade', () => {
  it('preserves public method binding, subclass types, registration metadata and synchronous result identity', async () => {
    const { pulse, collector } = await setup();
    class Customer extends McpServer { #marker = 7; marker() { return this.#marker; } }
    const target = new Customer({ name: 'fixture', version: '1' });
    const facade = pulse.wrapServer(target);
    expect(facade).toBeInstanceOf(Customer);
    expect(facade.server).toBe(target.server);
    const detached = facade.marker;
    expect(detached()).toBe(7);
    expect(facade.marker).toBe(facade.marker);
    const originalResult = Object.freeze({ content: [{ type: 'text' as const, text: 'private-result-canary' }] });
    const receiver = { marker: 42 };
    let receivedThis: unknown;
    let receivedContext: unknown;
    const metadata = { custom: 'private-metadata-canary' };
    const annotations = { readOnlyHint: true };
    const handle = facade.registerTool('bound', { title: 'Bound', description: 'Original', _meta: metadata, annotations }, function(this: unknown, ctx) {
      receivedThis = this; receivedContext = ctx;
      return originalResult;
    });
    const ctx = context();
    expect(invoke(handle, receiver, ctx)).toBe(originalResult);
    expect(receivedThis).toBe(receiver);
    expect(receivedContext).toBe(ctx);
    expect(handle._meta).toBe(metadata);
    expect(handle.annotations).toBe(annotations);
    await pulse.flush();
    expect(collector.events).toHaveLength(1);
    expect(collector.events[0]?.outcome).toBe('tool_success');
    expect(collector.requests.join('')).not.toContain('private-');
  });

  it('rethrows identical synchronous and asynchronous errors with one event each', async () => {
    const { pulse, collector } = await setup();
    const server = pulse.wrapServer(new McpServer({ name: 'fixture', version: '1' }));
    const original = new Error('raw-error-canary');
    const sync = server.registerTool('sync', {}, () => { throw original; });
    const asyncHandle = server.registerTool('async', {}, async () => { throw original; });
    try { invoke(sync, undefined, context()); throw new Error('EXPECTED_THROW'); } catch (error) { expect(error).toBe(original); }
    await expect(invoke(asyncHandle, undefined, context())).rejects.toBe(original);
    await pulse.flush();
    expect(collector.events.map(event => event.outcome)).toEqual(['handler_exception', 'handler_exception']);
    expect(collector.requests.join('')).not.toContain('raw-error-canary');
  });

  it('preserves async resolved object identity and arguments without mutation', async () => {
    const { pulse, collector } = await setup();
    const server = pulse.wrapServer(new McpServer({ name: 'fixture', version: '1' }));
    const args = Object.freeze({ value: 'sensitive-args-canary' });
    const result = Object.freeze({ content: [] });
    let observedArgs: unknown;
    const handle = server.registerTool('promise', { inputSchema: z.object({ value: z.string() }) }, async value => { observedArgs = value; return result; });
    expect(await invoke(handle, undefined, args, context())).toBe(result);
    expect(observedArgs).toBe(args);
    await pulse.flush();
    expect(collector.requests.join('')).not.toContain('sensitive-args-canary');
  });

  it('observes foreign-realm promise settlement and preserves its rejection identity', async () => {
    const { pulse, collector } = await setup();
    const server = pulse.wrapServer(new McpServer({ name: 'fixture', version: '1' }));
    const result = { content: [] };
    const error = new Error('cross-realm-private-canary');
    const foreignResolve = runInNewContext('Promise.resolve(value)', { value: result }) as Promise<typeof result>;
    const foreignReject = () => runInNewContext('Promise.reject(error)', { error }) as Promise<never>;
    expect(foreignResolve).not.toBeInstanceOf(Promise);
    const good = server.registerTool('foreign_good', {}, () => foreignResolve);
    const bad = server.registerTool('foreign_bad', {}, foreignReject);
    expect(await invoke(good, undefined, context())).toBe(result);
    await expect(invoke(bad, undefined, context())).rejects.toBe(error);
    await pulse.flush();
    expect(collector.events.map(e => e.outcome)).toEqual(['tool_success', 'handler_exception']);
  });

  it('observes subclass registration helpers without changing the prototype or another server', async () => {
    const { pulse, collector } = await setup();
    class Customer extends McpServer {
      #label = 'from_helper';
      addTool() { return this.registerTool(this.#label, {}, () => ({ content: [] })); }
    }
    const untouched = new Customer({ name: 'other', version: '1' });
    const originalMethod = untouched.registerTool;
    const target = new Customer({ name: 'fixture', version: '1' });
    const server = pulse.wrapServer(target);
    const handle = server.addTool();
    expect(untouched.registerTool).toBe(originalMethod);
    expect(Customer.prototype.registerTool).toBe(originalMethod);
    await invoke(handle, undefined, context());
    await pulse.flush();
    expect(collector.events.map(e => e.tool_name)).toEqual(['from_helper']);
  });

  it('rejects double wrapping, prior registrations and pre-advertised tools', () => {
    const pulse = createPulse({ enabled: false, environment: 'test' });
    const original = new McpServer({ name: 'fixture', version: '1' });
    const wrapped = pulse.wrapServer(original);
    expect(() => pulse.wrapServer(wrapped)).toThrow('SERVER_ALREADY_WRAPPED');
    expect(() => pulse.wrapServer(original)).toThrow('SERVER_ALREADY_WRAPPED');
    const late = new McpServer({ name: 'fixture', version: '1' });
    late.registerTool('before', {}, () => ({ content: [] }));
    expect(() => pulse.wrapServer(late)).toThrow('WRAP_BEFORE_REGISTRATION');
    const advertised = new McpServer({ name: 'fixture', version: '1' }, { capabilities: { tools: {} } });
    expect(() => pulse.wrapServer(advertised)).toThrow('WRAP_BEFORE_REGISTRATION');
    expect(() => pulse.wrapServer({} as McpServer)).toThrow('UNSUPPORTED_MCP_VERSION');
  });

  it('measures duration monotonically while recording a separate wall-clock completion time', async () => {
    const { pulse, collector } = await setup();
    const server = pulse.wrapServer(new McpServer({ name: 'fixture', version: '1' }));
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
      const handle = server.registerTool('clock', {}, () => {
        vi.setSystemTime(new Date('2026-09-09T12:00:00Z'));
        const start = performance.now();
        while (performance.now() - start < 2) { /* bounded local CPU work */ }
        return { content: [] };
      });
      await invoke(handle, undefined, context());
    } finally { vi.useRealTimers(); }
    await pulse.flush();
    expect(collector.events[0]?.occurred_at).toBe('2026-09-09T12:00:00.000Z');
    expect(collector.events[0]?.duration_ms).toBeGreaterThanOrEqual(2);
    expect(collector.events[0]?.duration_ms).toBeLessThan(1000);
  });

  it('keeps handle identity and updates, rename, enabled state and removal through the public API', async () => {
    const { pulse, collector } = await setup();
    const original = new McpServer({ name: 'fixture', version: '1' });
    let upstreamHandle: RegisteredTool | undefined;
    const originalRegister = original.registerTool.bind(original);
    original.registerTool = ((...args: unknown[]) => {
      upstreamHandle = Reflect.apply(originalRegister, original, args) as RegisteredTool;
      return upstreamHandle;
    }) as typeof original.registerTool;
    const server = pulse.wrapServer(original);
    const handle = server.registerTool('initial', { inputSchema: z.object({ n: z.number() }) }, () => ({ content: [] }));
    expect(handle).toBe(upstreamHandle);
    await invoke(handle, undefined, { n: 1 }, context());
    handle.update({ name: 'renamed', title: 'Changed', callback: () => ({ content: [], isError: true }) });
    await invoke(handle, undefined, { n: 1 }, context());
    handle.disable(); expect(handle.enabled).toBe(false);
    handle.enable(); expect(handle.enabled).toBe(true);
    expect(handle.title).toBe('Changed');
    handle.remove();
    // Registering the same name proves actual upstream removal, without reading its registry.
    const replacement = server.registerTool('renamed', {}, () => ({ content: [] }));
    expect(replacement).not.toBe(handle);
    await pulse.flush();
    expect(collector.events.map(e => [e.tool_name, e.outcome])).toEqual([['initial', 'tool_success'], ['renamed', 'tool_error']]);
  });

  it('executes updated and renamed handlers through a real HTTP client', async () => {
    const { pulse, collector } = await setup();
    const fixture = await startMcpFixture(server => {
      const handle = server.registerTool('initial', { inputSchema: z.object({ n: z.number() }) }, () => ({ content: [] }));
      handle.update({ name: 'renamed', title: 'Updated tool', callback: () => ({ content: [{ type: 'text', text: 'updated' }] }) });
      const removed = server.registerTool('removed', {}, () => ({ content: [] }));
      removed.remove();
      const disabled = server.registerTool('disabled', {}, () => ({ content: [] }));
      disabled.disable();
    }, { pulse });
    cleanups.push(fixture.close);
    const client = await fixture.connect();
    const listing = await client.listTools();
    expect(listing.tools.map(t => t.name)).toEqual(['renamed']);
    expect(listing.tools[0]?.title).toBe('Updated tool');
    const output = await client.callTool({ name: 'renamed', arguments: { n: 1 } });
    expect(output.content).toEqual([{ type: 'text', text: 'updated' }]);
    await pulse.flush();
    expect(collector.events.map(e => e.tool_name)).toEqual(['renamed']);
  });

  it('excludes/maps sensitive tool names and isolates mapper errors', async () => {
    const collector = await startFixtureCollector(); cleanups.push(collector.close);
    const pulse = createPulse({ enabled: true, environment: 'test', endpoint: collector.endpoint, writeKey: collector.writeKey, queue: { flushIntervalMs: 60_000 }, mapToolName: name => {
      if (name === 'excluded') return null;
      if (name === 'throws') throw new Error('mapper-secret');
      return 'safe_tool';
    } }); cleanups.push(() => pulse.shutdown());
    const server = pulse.wrapServer(new McpServer({ name: 'fixture', version: '1' }));
    const result = { content: [] };
    for (const name of ['excluded', 'throws', 'sensitive_business_tool']) {
      const handle = server.registerTool(name, {}, () => result);
      expect(invoke(handle, undefined, context())).toBe(result);
    }
    await pulse.flush();
    expect(collector.events.map(e => e.tool_name)).toEqual(['safe_tool']);
    expect(pulse.getDiagnostics()).toMatchObject({ excludedTools: 1, mapperErrors: 1 });
    expect(collector.requests.join('')).not.toContain('sensitive_business_tool');
    expect(collector.requests.join('')).not.toContain('mapper-secret');
  });

  it('provides EN/TR for every compatibility error without exposing input', () => {
    for (const code of ['UNSUPPORTED_MCP_VERSION', 'SERVER_ALREADY_WRAPPED', 'WRAP_BEFORE_REGISTRATION'] as const) {
      const error = new PulseCompatibilityError(code);
      expect(error.getMessage('en')).not.toBe(error.getMessage('tr'));
      expect(error.message).toBe(code);
    }
  });
});
