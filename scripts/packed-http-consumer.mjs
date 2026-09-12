/** Copied into the clean tarball consumer; imports only installed public exports.
 * Temiz tarball tüketicisine kopyalanır; yalnızca kurulu açık API'leri kullanır. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { createPulseCore } from '@reviseflow/pulse-core';
import { createHttpExporter } from '@reviseflow/pulse-core/http';

const received = [];
const instances = [];
let requestsActive = 0;
let maximumActive = 0;
let fixtureError;
const ack = (response, events, extra = {}, headers = {}) => response.writeHead(202, {
  'content-type': 'application/json', ...headers,
}).end(JSON.stringify({ accepted: events.map(event => event.event_id), duplicates: [], rejected: [], server_time: new Date().toISOString(), ...extra }));
const server = createServer(async (request, response) => {
  requestsActive++; maximumActive = Math.max(maximumActive, requestsActive);
  response.once('close', () => requestsActive--);
  try {
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.authorization, undefined, 'NO_CLOUD_KEY_IN_LOCAL_COLLECTOR');
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      assert.ok(size <= 64 * 1024, 'BOUNDED_TEST_COLLECTOR_BODY');
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert.equal(body.schema_version, 1);
    const entry = { path: request.url, events: body.events, at: performance.now() };
    received.push(entry);
    const attempts = received.filter(item => item.path === request.url);
    if (request.url === '/over-budget') {
      response.writeHead(503, { 'retry-after': '120' }).end();
    } else if (request.url === '/outage' && attempts.length === 1) {
      response.writeHead(503, { 'retry-after': '0.2' }).end();
    } else if (request.url === '/partial' && attempts.length === 1) {
      assert.equal(body.events.length, 4);
      ack(response, body.events.slice(0, 1), {
        duplicates: [body.events[1].event_id],
        rejected: [{ event_id: body.events[2].event_id, code: 'INVALID_EVENT', retryable: false }],
        next_retry_after_ms: 40,
      }, { 'retry-after': '0.25' });
    } else {
      assert.ok(['/outage', '/partial'].includes(request.url));
      ack(response, body.events);
    }
  } catch {
    // Only a fixed test code escapes; no headers, body, errors or event payloads.
    fixtureError = 'LOOPBACK_COLLECTOR_ASSERTION_FAILED';
    response.writeHead(500).end();
  }
});
const originalFetch = globalThis.fetch;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  globalThis.fetch = (input, options) => {
    assert.equal(new URL(typeof input === 'string' ? input : input.url).origin, origin, 'LOOPBACK_DESTINATION_ONLY');
    return originalFetch(input, options);
  };
  const core = (path, retryMaxMs) => {
    const pulse = createPulseCore({
      environment: 'test', exporter: createHttpExporter({ endpoint: `${origin}${path}` }),
      queue: { flushIntervalMs: 60_000, requestTimeoutMs: 2_000, retryBaseMs: 1, retryMaxMs },
    });
    instances.push(pulse);
    return pulse;
  };
  const complete = (pulse, toolName) => pulse.complete({ toolName, durationMs: 1, outcome: 'tool_success' });
  const attemptsFor = path => received.filter(entry => entry.path === path);
  const waitFirst = async path => {
    const deadline = performance.now() + 2_000;
    while (!attemptsFor(path).length) {
      assert.ok(performance.now() < deadline, 'LOOPBACK_FIRST_REQUEST_TIMEOUT');
      await sleep(2);
    }
  };

  const overBudget = core('/over-budget', 60_000);
  complete(overBudget, 'packed.over_budget');
  await overBudget.flush({ timeoutMs: 2_000 });
  assert.equal(attemptsFor('/over-budget').length, 1);
  assert.equal(overBudget.getDiagnostics().requests, 1);
  assert.equal(overBudget.getDiagnostics().retries, 0);
  assert.equal(overBudget.getDiagnostics().droppedRetries, 1, 'SERVER_MINIMUM_MUST_DROP_INSTEAD_OF_CLAMPING');
  assert.equal(overBudget.getDiagnostics().inFlight, 0);

  const outage = core('/outage', 1_000);
  complete(outage, 'packed.outage');
  const outageFlush = outage.flush({ timeoutMs: 5_000 });
  await waitFirst('/outage');
  await sleep(100);
  assert.equal(attemptsFor('/outage').length, 1, 'NO_RETRY_BEFORE_503_MINIMUM');
  await outageFlush;
  const outageAttempts = attemptsFor('/outage');
  assert.equal(outageAttempts.length, 2);
  const outageWait = outageAttempts[1].at - outageAttempts[0].at;
  assert.ok(outageWait >= 200, '503_MINIMUM_MUST_BE_PRESERVED');
  assert.deepEqual(outageAttempts[1].events, outageAttempts[0].events, 'RETRY_EVENT_MUST_BE_IDENTICAL');
  assert.equal(outage.getDiagnostics().accepted, 1);
  assert.equal(outage.getDiagnostics().retries, 1);

  const partial = core('/partial', 1_000);
  for (let index = 0; index < 4; index++) complete(partial, `packed.partial.${index}`);
  const partialFlush = partial.flush({ timeoutMs: 5_000 });
  await waitFirst('/partial');
  await sleep(100);
  assert.equal(attemptsFor('/partial').length, 1, 'NO_PARTIAL_RETRY_BEFORE_HEADER_MINIMUM');
  await partialFlush;
  const partialAttempts = attemptsFor('/partial');
  assert.equal(partialAttempts.length, 2);
  const partialWait = partialAttempts[1].at - partialAttempts[0].at;
  assert.ok(partialWait >= 250, 'HEADER_MINIMUM_MUST_EXCEED_ACK_BACKOFF');
  assert.deepEqual(partialAttempts[1].events, partialAttempts[0].events.slice(3), 'ONLY_UNCONFIRMED_REMAINDER_MAY_RETRY');
  const diagnostics = partial.getDiagnostics();
  for (const [key, value] of Object.entries({ observed: 4, accepted: 2, duplicates: 1, rejected: 1, retries: 1, queued: 0, inFlight: 0, pendingBytes: 0, droppedRetries: 0 })) {
    assert.equal(diagnostics[key], value, `PARTIAL_COUNTER_${key}`);
  }
  assert.equal(maximumActive, 1, 'SINGLE_ACTIVE_HTTP_ATTEMPT');
  assert.equal(fixtureError, undefined);
  console.log(JSON.stringify({
    passed: true, explicit_loopback_only: true, real_http_requests: received.length,
    no_cloud_key: true, maximum_concurrent_requests: maximumActive,
    over_budget: { retry_after_ms: 120_000, retry_max_ms: 60_000, requests: 1, retries: 0, dropped_retries: 1 },
    outage: { minimum_ms: 200, observed_wait_ms: outageWait, requests: 2, accepted: 1 },
    partial: { header_minimum_ms: 250, wire_minimum_ms: 40, observed_wait_ms: partialWait, requests: 2, accepted: 2, duplicates: 1, rejected: 1, only_unconfirmed_retried: true },
  }));
} finally {
  await Promise.all(instances.map(pulse => pulse.shutdown({ timeoutMs: 0 })));
  globalThis.fetch = originalFetch;
  server.closeAllConnections();
  if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
