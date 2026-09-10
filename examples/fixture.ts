/**
 * Local compatibility fixture only. The collector below is an ephemeral test
 * sink: it does not provide persistence, tenant authorization, quotas or billing.
 * Yerel uyumluluk düzeneği: aşağıdaki toplayıcı kalıcı bir üretim servisi değildir.
 */
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import {
  Client,
  StreamableHTTPClientTransport,
  type ClientOptions,
} from '@modelcontextprotocol/client';
import { McpServer, createMcpHandler, type Implementation } from '@modelcontextprotocol/server';
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createPulse } from '@pulse-sdk/mcp';
import { z } from 'zod';

type FixturePulse = Pick<ReturnType<typeof createPulse>, 'wrapServer' | 'withContext'>;
export interface McpFixtureOptions {
  pulse?: FixturePulse;
  /** Exact, local TEST tokens mapped to server-verified account identifiers. */
  testAuth?: ReadonlyMap<string, string>;
}
export interface FixtureConnectOptions {
  bearerToken?: string;
  clientInfo?: Implementation;
  clientOptions?: ClientOptions;
}

async function listen(server: Server): Promise<URL> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('FIXTURE_ADDRESS_UNAVAILABLE');
  return new URL(`http://127.0.0.1:${address.port}`);
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

/** Real official MCP client/server, real Streamable HTTP, ephemeral loopback port. */
export async function startMcpFixture(
  register: (server: McpServer) => void,
  options: McpFixtureOptions = {},
) {
  const handler = createMcpHandler(() => {
    const original = new McpServer({ name: 'pulse-local-fixture', version: '0.0.0' });
    const server = options.pulse ? options.pulse.wrapServer(original) : original;
    register(server);
    return server;
  }, { legacy: 'reject', responseMode: 'auto', keepAliveMs: 0 });
  const nodeHandler = toNodeHandler(handler);
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  const http = createServer((request, response) => {
    if (!validateHost(request, response) || !validateOrigin(request, response)) return;
    if (request.url !== '/mcp') {
      response.writeHead(404).end();
      return;
    }
    let actorId: string | undefined;
    if (options.testAuth) {
      actorId = options.testAuth.get(request.headers.authorization ?? '');
      if (!actorId) {
        response.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({
          code: 'FIXTURE_AUTH_REQUIRED',
          message: { en: 'Valid local fixture authentication is required.', tr: 'Geçerli yerel test kimliği gereklidir.' },
        }));
        return;
      }
    }
    // Authentication happens above this request-scoped context; a client-supplied
    // actor header or raw tool argument is never accepted as an identity.
    const run = () => nodeHandler({
      method: request.method ?? 'GET',
      url: request.url ?? '/',
      headers: request.headers,
      [Symbol.asyncIterator]: () => request[Symbol.asyncIterator](),
    }, response);
    const pending = options.pulse && actorId
      ? options.pulse.withContext({ actorId }, run)
      : run();
    void pending.catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  const origin = await listen(http);
  const url = new URL('/mcp', origin);
  const clients = new Set<Client>();
  let closed = false;
  return {
    url,
    async connect(connectOptions: FixtureConnectOptions = {}): Promise<Client> {
      const client = new Client(
        connectOptions.clientInfo ?? { name: 'pulse-fixture-client', version: '0.0.0' },
        {
          ...connectOptions.clientOptions,
          versionNegotiation: { mode: { pin: '2026-07-28' } },
        },
      );
      const transport = new StreamableHTTPClientTransport(url, {
        ...(connectOptions.bearerToken ? { requestInit: { headers: { authorization: `Bearer ${connectOptions.bearerToken}` } } } : {}),
      });
      clients.add(client);
      try {
        await client.connect(transport);
        return client;
      } catch (error) {
        await client.close();
        clients.delete(client);
        throw error;
      }
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await Promise.allSettled([...clients].map(client => client.close()));
      await handler.close();
      await closeServer(http);
    },
  };
}

export interface FixtureEvent {
  event_id: string;
  [key: string]: unknown;
}

/**
 * TEST ONLY. Responds after an in-memory append, not a durable transaction.
 * The fixed token is a public fixture constant, never a production write key.
 */
export async function startFixtureCollector() {
  const events: FixtureEvent[] = [];
  const requests: string[] = [];
  let status = 202;
  const http = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/batch') {
      response.writeHead(404).end();
      return;
    }
    if (request.headers.authorization !== 'Bearer pulse_local_fixture_not_a_secret') {
      response.writeHead(401).end();
      return;
    }
    let raw = '';
    for await (const chunk of request) raw += String(chunk);
    requests.push(raw);
    if (status !== 202) {
      response.writeHead(status).end();
      return;
    }
    const batch = JSON.parse(raw) as { schema_version: number; events: FixtureEvent[] };
    const accepted: string[] = [];
    const duplicates: string[] = [];
    for (const event of batch.events) {
      if (events.some(existing => existing.event_id === event.event_id)) duplicates.push(event.event_id);
      else {
        events.push(event);
        accepted.push(event.event_id);
      }
    }
    response.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({
      accepted, duplicates, rejected: [], server_time: new Date().toISOString(),
    }));
  });
  const origin = await listen(http);
  return {
    endpoint: new URL('/v1/batch', origin).href,
    writeKey: 'pulse_local_fixture_not_a_secret',
    events,
    requests,
    setStatus(value: number) { status = value; },
    close: () => closeServer(http),
  };
}

async function main(): Promise<void> {
  const locale = process.env.PULSE_LOCALE === 'tr' ? 'tr' : 'en';
  const messages = {
    en: { boundary: 'LOCAL TEST ONLY: collector data is in memory and disappears on exit.', result: 'Original MCP caller result', event: 'Sanitized emitted event' },
    tr: { boundary: 'YALNIZCA YEREL TEST: toplayıcı verileri bellektedir ve çıkışta silinir.', result: 'MCP istemcisinin özgün sonucu', event: 'Hassas veri içermeyen olay' },
  }[locale];
  const collector = await startFixtureCollector();
  const pulse = createPulse({
    writeKey: collector.writeKey,
    endpoint: collector.endpoint,
    environment: 'test',
    enabled: true,
    queue: { flushIntervalMs: 60_000 },
  });
  const fixture = await startMcpFixture(server => {
    server.registerTool('sum', { inputSchema: z.object({ a: z.number(), b: z.number() }) }, ({ a, b }) => ({
      content: [{ type: 'text', text: String(a + b) }],
      structuredContent: { sum: a + b },
    }));
  }, { pulse });
  try {
    const client = await fixture.connect();
    const result = await client.callTool({ name: 'sum', arguments: { a: 2, b: 3 } });
    await pulse.flush({ timeoutMs: 2_000 });
    console.log(messages.boundary);
    console.log(`${messages.result}: ${JSON.stringify(result)}`);
    console.log(`${messages.event}: ${JSON.stringify(collector.events[0])}`);
  } finally {
    await fixture.close();
    await pulse.shutdown();
    await collector.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch(() => {
    console.error(JSON.stringify({
      code: 'FIXTURE_FAILED',
      message: { en: 'Local fixture failed. Run the compatibility tests.', tr: 'Yerel test başarısız. Uyumluluk testlerini çalıştırın.' },
    }));
    process.exitCode = 1;
  });
}
