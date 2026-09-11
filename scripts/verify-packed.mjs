/**
 * Local release gate only; creates and installs archives, never publishes them.
 * Yalnızca yerel doğrulama; arşivleri oluşturur ve kurar, paket yayımlamaz.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryMode = process.argv.includes('--registry');
const evidenceDirectory = join(root, 'docs', 'evidence');
const evidencePath = join(evidenceDirectory, registryMode ? 'registry-consumer.json' : 'packed-consumer.json');
const commands = [];
const startedAt = new Date().toISOString();
let consumerDirectory;
let archiveDirectory;
const report = {
  gate: registryMode ? 'NPM_REGISTRY_CONSUMER' : 'LOCAL_PACKED_CONSUMER',
  status: 'RUNNING',
  started_at: startedAt,
  node: process.version,
  package_manager: null,
  npm: null,
  publication_performed: false,
  production_deployment_performed: false,
  collector_boundary: 'Ephemeral in-memory local test sink; no durable cloud ingestion claim.',
  packages: [],
  consumer: {},
  commands,
};

const scrub = value => String(value)
  .replaceAll(process.execPath, 'node')
  .replaceAll(root, '<sdk>')
  .replaceAll(consumerDirectory ?? '\u0000', '<temporary-consumer>');

function run(command, args, cwd = root, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    timeout: options.timeout ?? 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  commands.push({
    command: [command, ...args].map(scrub),
    cwd: scrub(cwd),
    exit_code: result.status,
    ...(options.env ? { environment: options.env } : {}),
    ...(result.error ? { process_error: result.error.code ?? 'PROCESS_ERROR' } : {}),
  });
  if (result.error || result.status !== 0) {
    // Build/install failures are not dumped: dependency tooling can include local
    // user paths or registry configuration. The command and exit code are enough
    // to repeat the failed gate without recording arbitrary external output.
    throw Object.assign(new Error('PACKED_CONSUMER_COMMAND_FAILED'), { command, exitCode: result.status });
  }
  return result.stdout;
}

const sha256 = value => createHash('sha256').update(value).digest('hex');
const allowedDist = /^dist\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:js|d\.ts|js\.map|d\.ts\.map)$/;
function allowedFile(path, core) {
  return ['package.json', 'LICENSE', 'README.md'].includes(path)
    || allowedDist.test(path)
    || (core && ['contracts/event-v1.schema.json', 'contracts/batch-v1.schema.json', 'contracts/LICENSE', 'contracts/NOTICE'].includes(path));
}

async function auditPackage(name) {
  const core = name === '@reviseflow/pulse-core';
  const directory = join(root, 'packages', core ? 'core' : 'mcp');
  const sourceManifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const dryRun = JSON.parse(run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], directory));
  assert.equal(dryRun.length, 1, 'EXPECTED_ONE_DRY_RUN_PACKAGE');
  const expectedFiles = dryRun[0].files.map(file => file.path).sort();
  assert.ok(expectedFiles.includes('README.md'), 'PACKAGE_README_REQUIRED');
  assert.ok(expectedFiles.includes('LICENSE'), 'PACKAGE_LICENSE_REQUIRED');
  if (core) {
    assert.ok(expectedFiles.includes('contracts/event-v1.schema.json'), 'PUBLIC_EVENT_CONTRACT_REQUIRED');
    assert.ok(expectedFiles.includes('contracts/batch-v1.schema.json'), 'PUBLIC_BATCH_CONTRACT_REQUIRED');
  }
  assert.ok(expectedFiles.every(path => allowedFile(path, core)), 'PACKAGE_ALLOWLIST_VIOLATION');

  run('pnpm', ['--filter', name, 'pack', '--pack-destination', archiveDirectory]);
  const filename = `${name.replace('@', '').replace('/', '-')}-${sourceManifest.version}.tgz`;
  const path = join(archiveDirectory, filename);
  const actualFiles = run('tar', ['-tzf', path]).trim().split('\n').map(entry => {
    assert.ok(entry.startsWith('package/'), 'INVALID_TARBALL_ROOT');
    const member = entry.slice('package/'.length);
    assert.ok(!member.split('/').includes('..'), 'UNSAFE_TARBALL_MEMBER');
    assert.ok(allowedFile(member, core), 'TARBALL_ALLOWLIST_VIOLATION');
    return member;
  }).sort();
  assert.deepEqual(actualFiles, expectedFiles, 'DRY_RUN_AND_ACTUAL_ARCHIVE_DIFFER');

  const memberHashes = [];
  for (const member of actualFiles) {
    const content = run('tar', ['-xOzf', path, `package/${member}`]);
    // Scope is the shipped tarball only. No credential stores or unrelated files
    // are searched. Mentions of licensing boundaries in README prose are allowed.
    assert.ok(!/(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)/.test(content), 'ABSOLUTE_USER_PATH_IN_PACKAGE');
    assert.ok(!/(?:PRIVATE_(?:ERROR|RESULT|ARGUMENT|OUTPUT|ACCOUNT|VERSION|CANCEL)_CANARY|SECRET_PAYLOAD_CANARY)/.test(content), 'TEST_SECRET_CANARY_IN_PACKAGE');
    if (member.startsWith('dist/')) {
      assert.ok(!/(?:pulse-cloud|@pulse-cloud\/|packages\/(?:db|analytics|config)|apps\/(?:collector|worker|web))/.test(content), 'PRIVATE_CLOUD_CODE_REFERENCE');
      assert.ok(!/(?:from\s*|import\s*\(|require\s*\()\s*['"](?:file:|\/|\.\.\/\.\.\/\.\.\/)/.test(content), 'EXTERNAL_SOURCE_IMPORT');
    }
    if (member === 'package.json') {
      const packedManifest = JSON.parse(content);
      assert.equal(packedManifest.name, name);
      assert.notEqual(packedManifest.private, true, 'PUBLIC_SDK_REQUIRED');
      assert.equal(packedManifest.publishConfig.access, 'public');
      assert.equal(packedManifest.publishConfig.registry, 'https://registry.npmjs.org/');
      assert.equal(packedManifest.license, 'MIT');
      for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const [dependency, range] of Object.entries(packedManifest[field] ?? {})) {
          assert.ok(!/^(?:workspace:|file:|link:|\/)/.test(range), 'LOCAL_DEPENDENCY_IN_PACKED_MANIFEST');
          assert.ok(!dependency.startsWith('@pulse-cloud/'), 'PRIVATE_DEPENDENCY_IN_PACKED_MANIFEST');
        }
      }
      if (!core) assert.equal(packedManifest.dependencies['@reviseflow/pulse-core'], sourceManifest.version);
    }
    memberHashes.push({ path: member, sha256: sha256(content) });
  }
  const packageEvidence = {
    name,
    version: sourceManifest.version,
    archive: relative(root, path),
    sha256: sha256(await readFile(path)),
    dry_run_matches_archive: true,
    allowlist_passed: true,
    scoped_secret_and_private_source_scan_passed: true,
    files: memberHashes,
  };
  if (registryMode) {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${sourceManifest.version}`);
    assert.equal(response.status, 200, 'PUBLISHED_PACKAGE_REQUIRED');
    const metadata = await response.json();
    const archiveBytes = await readFile(path);
    const integrity = `sha512-${createHash('sha512').update(archiveBytes).digest('base64')}`;
    assert.equal(metadata.dist.integrity, integrity, 'PUBLISHED_ARCHIVE_MUST_MATCH_REVIEWED_BYTES');
    packageEvidence.registry = { version: metadata.version, integrity, tarball: metadata.dist.tarball };
  }
  report.packages.push(packageEvidence);
  return { filename, path };
}

const typeConsumer = `import { McpServer } from '@modelcontextprotocol/server';
import { createPulse } from '@reviseflow/pulse';
import { createPulseCore, type PulseEvent } from '@reviseflow/pulse-core';
import { z } from 'zod';

const pulse = createPulse({ environment: 'test', enabled: false });
const original = new McpServer({ name: 'packed-consumer', version: '0.0.0' });
const server: McpServer = pulse.wrapServer(original);
server.registerTool('sum', { inputSchema: z.object({ a: z.number(), b: z.number() }) }, ({ a, b }, context) => {
  const sum: number = a + b;
  const signal: AbortSignal = context.mcpReq.signal;
  // @ts-expect-error The packed adapter must preserve numeric input inference.
  const invalid: string = a;
  void signal; void invalid;
  return { content: [{ type: 'text', text: String(sum) }] };
});
server.registerTool('no_args', {}, context => {
  const signal: AbortSignal = context.mcpReq.signal;
  void signal;
  return { content: [] };
});
const handle = server.registerTool('updates', { inputSchema: z.object({ value: z.number() }) }, ({ value }) => ({ content: [{ type: 'text', text: String(value) }] }));
handle.disable(); handle.enable(); handle.remove();
const core = createPulseCore({ environment: 'test', enabled: false });
const sameType: number = core.withContext({ actorId: 'local-test' }, () => 42);
// @ts-expect-error Event payloads cannot acquire arbitrary properties.
const prohibited: keyof PulseEvent = 'arguments';
void sameType; void prohibited;
`;

const runtimeConsumer = `import assert from 'node:assert/strict';
import { createPulse } from '@reviseflow/pulse';
import { z } from 'zod';
import eventSchema from '@reviseflow/pulse-core/contracts/event-v1.schema.json' with { type: 'json' };
import batchSchema from '@reviseflow/pulse-core/contracts/batch-v1.schema.json' with { type: 'json' };
import { startFixtureCollector, startMcpFixture } from './fixture.ts';
assert.equal(eventSchema.additionalProperties, false);
assert.equal(batchSchema.additionalProperties, false);
assert.equal(batchSchema.properties.events.maxItems, 100);
const collector = await startFixtureCollector();
const pulse = createPulse({ endpoint: collector.endpoint, writeKey: collector.writeKey, environment: 'test', enabled: true, queue: { flushIntervalMs: 60000 } });
const fixture = await startMcpFixture(server => {
  server.registerTool('sum', { inputSchema: z.object({ a: z.number(), b: z.number() }) }, ({ a, b }) => ({ content: [{ type: 'text', text: String(a + b) }], structuredContent: { sum: a + b } }));
}, { pulse });
try {
  const client = await fixture.connect();
  const result = await client.callTool({ name: 'sum', arguments: { a: 2, b: 3 } });
  assert.deepEqual(result.content, [{ type: 'text', text: '5' }]);
  assert.deepEqual(result.structuredContent, { sum: 5 });
  assert.equal(collector.requests.length, 0);
  await pulse.flush();
  assert.equal(collector.events.length, 1);
  assert.equal(collector.requests.length, 1);
  const event = collector.events[0];
  for (const required of eventSchema.required) assert.ok(Object.hasOwn(event, required));
  for (const key of Object.keys(event)) assert.ok(Object.hasOwn(eventSchema.properties, key));
  assert.equal(event.outcome, 'tool_success');
  assert.equal(event.sdk_version, '0.1.0');
  assert.equal(event.actor_id, null);
  assert.equal(event.client_name, null);
  assert.equal(pulse.getDiagnostics().observed, 1);
  assert.equal(pulse.getDiagnostics().accepted, 1);
  console.log(JSON.stringify({ passed: true, observed: 1, accepted: 1, emitted_events: 1, schema_exports_verified: true, export_is_separate_from_handler_return: true }));
} finally {
  await fixture.close();
  await pulse.shutdown();
  await collector.close();
}
`;

async function verifyConsumer(archives) {
  consumerDirectory = await mkdtemp(join(tmpdir(), 'pulse-packed-consumer-'));
  assert.ok(!(await realpath(consumerDirectory)).startsWith(await realpath(root)), 'CONSUMER_MUST_BE_INDEPENDENT');
  await mkdir(join(consumerDirectory, 'artifacts'));
  for (const archive of archives) await cp(archive.path, join(consumerDirectory, 'artifacts', archive.filename));
  const manifest = {
    name: 'pulse-unrelated-packed-consumer',
    version: '0.0.0',
    private: true,
    license: 'UNLICENSED',
    type: 'module',
    dependencies: {
      '@reviseflow/pulse-core': registryMode ? report.packages[0].version : `file:./artifacts/${archives[0].filename}`,
      '@reviseflow/pulse': registryMode ? report.packages[1].version : `file:./artifacts/${archives[1].filename}`,
      '@modelcontextprotocol/server': '2.0.0',
      '@modelcontextprotocol/client': '2.0.0',
      '@modelcontextprotocol/node': '2.0.0',
      zod: '4.6.1',
      typescript: '7.0.2',
      '@types/node': '24.13.4',
    },
    overrides: { zod: '4.6.1' },
  };
  await writeFile(join(consumerDirectory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], consumerDirectory, { timeout: 300_000 });
  const dependencyTree = JSON.parse(run('npm', ['ls', '--json', '--depth=0'], consumerDirectory));
  report.consumer.dependencies = Object.fromEntries(Object.entries(dependencyTree.dependencies).map(([name, dependency]) => [name, dependency.version]));
  for (const [name, version] of Object.entries(manifest.dependencies)) {
    if (!version.startsWith('file:')) assert.equal(report.consumer.dependencies[name], version);
  }
  for (const name of ['pulse-core', 'pulse']) {
    const installed = await realpath(join(consumerDirectory, 'node_modules', '@reviseflow', name));
    assert.ok(installed.startsWith(await realpath(consumerDirectory)), 'PACKED_PACKAGE_LINKS_TO_WORKSPACE');
    assert.ok(!installed.startsWith(await realpath(root)), 'PACKED_PACKAGE_LINKS_TO_WORKSPACE');
  }
  await cp(join(root, 'examples', 'fixture.ts'), join(consumerDirectory, 'fixture.ts'));
  await writeFile(join(consumerDirectory, 'consumer.ts'), typeConsumer);
  await writeFile(join(consumerDirectory, 'consumer-runtime.mjs'), runtimeConsumer);
  await writeFile(join(consumerDirectory, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      target: 'ES2023', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true,
      types: ['node'],
      noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, skipLibCheck: true,
      noEmit: true, verbatimModuleSyntax: true,
    },
    include: ['consumer.ts', 'fixture.ts'],
  }, null, 2)}\n`);
  run(process.execPath, ['./node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], consumerDirectory);
  const runtime = JSON.parse(run(process.execPath, ['consumer-runtime.mjs'], consumerDirectory));
  const locales = [];
  for (const locale of ['en', 'tr']) {
    const output = run(process.execPath, ['fixture.ts'], consumerDirectory, { env: { PULSE_LOCALE: locale } });
    const lines = output.trim().split('\n');
    assert.equal(lines.length, 3, 'UNEXPECTED_FIXTURE_OUTPUT');
    const result = JSON.parse(lines[1].slice(lines[1].indexOf(': ') + 2));
    const event = JSON.parse(lines[2].slice(lines[2].indexOf(': ') + 2));
    assert.deepEqual(result.content, [{ type: 'text', text: '5' }]);
    assert.deepEqual(result.structuredContent, { sum: 5 });
    assert.equal(event.tool_name, 'sum');
    assert.equal(event.outcome, 'tool_success');
  assert.equal(event.sdk_version, '0.1.0');
    assert.equal(event.kind, 'tool_handler.completed');
    assert.equal(event.actor_id, null);
    assert.equal(event.client_name, null);
    assert.ok(Number.isFinite(event.duration_ms) && event.duration_ms >= 0);
    for (const forbidden of ['args', 'arguments', 'result', 'results', 'prompt', 'headers', 'properties', 'content', 'structuredContent']) {
      assert.ok(!Object.hasOwn(event, forbidden), 'PAYLOAD_IN_TELEMETRY');
    }
    assert.ok(locale === 'en' ? lines[0].startsWith('LOCAL TEST ONLY:') : lines[0].startsWith('YALNIZCA YEREL TEST:'), 'FIXTURE_LOCALE_MISMATCH');
    locales.push({ locale, passed: true, caller_result: result, sanitized_event: event });
  }
  const installedServerManifest = join(consumerDirectory, 'node_modules', '@modelcontextprotocol', 'server', 'package.json');
  const originalServerManifest = await readFile(installedServerManifest, 'utf8');
  const simulatedManifest = JSON.parse(originalServerManifest);
  assert.equal(simulatedManifest.version, '2.0.0');
  simulatedManifest.version = '2.0.1';
  await writeFile(join(consumerDirectory, 'unsupported-version.mjs'), `import assert from 'node:assert/strict';\nimport { createPulse } from '@reviseflow/pulse';\nassert.throws(() => createPulse({ environment: 'test', enabled: false }), { code: 'UNSUPPORTED_MCP_VERSION' });\n`);
  try {
    // Mutate only this disposable consumer's installed package metadata. This
    // exercises rejection of drift; it is not a real MCP 2.0.1 compatibility run.
    await writeFile(installedServerManifest, `${JSON.stringify(simulatedManifest, null, 2)}\n`);
    run(process.execPath, ['unsupported-version.mjs'], consumerDirectory);
  } finally {
    await writeFile(installedServerManifest, originalServerManifest);
  }
  assert.equal(await readFile(installedServerManifest, 'utf8'), originalServerManifest);
  report.consumer = {
    ...report.consumer,
    unrelated_temporary_directory: true,
    workspace_source_links_absent: true,
    typed_registration_compilation_passed: true,
    runtime,
    unsupported_version_guard: {
      passed: true,
      kind: 'simulated-package-metadata-drift',
      actual_installed_code: '2.0.0',
      simulated_metadata_version: '2.0.1',
      expected_error: 'UNSUPPORTED_MCP_VERSION',
      metadata_restored: true,
      real_2_0_1_compatibility_claimed: false,
    },
    fixture_source_sha256: sha256(await readFile(join(root, 'examples', 'fixture.ts'))),
    locales,
  };
}

try {
  assert.equal(process.version, 'v24.20.0', 'RUN_WITH_VERIFIED_NODE_24_20_0');
  report.package_manager = run('pnpm', ['--version']).trim();
  assert.equal(report.package_manager, '11.22.0', 'RUN_WITH_PINNED_PNPM');
  report.npm = run('npm', ['--version']).trim();
  // Read before packing: a missing owner-facing README is a failed gate, never
  // silently bypassed with generated placeholder content.
  for (const name of ['core', 'mcp']) await readFile(join(root, 'packages', name, 'README.md'));
  await mkdir(join(root, 'artifacts'), { recursive: true });
  archiveDirectory = await mkdtemp(join(root, 'artifacts', 'packed-'));
  run('pnpm', ['build']);
  const core = await auditPackage('@reviseflow/pulse-core');
  const mcp = await auditPackage('@reviseflow/pulse');
  await verifyConsumer([core, mcp]);
  report.status = 'PASSED';
  console.log('Packed SDK consumer verification passed. / Paketlenmiş SDK tüketici doğrulaması başarılı.');
} catch (error) {
  report.status = 'FAILED';
  report.failure = { code: error instanceof Error ? scrub(error.message).split('\n')[0] : 'PACKED_CONSUMER_FAILED' };
  console.error('Packed SDK verification failed; inspect the evidence file. / Paket doğrulaması başarısız; kanıt dosyasını inceleyin.');
  process.exitCode = 1;
} finally {
  report.finished_at = new Date().toISOString();
  if (consumerDirectory) {
    // Delete only the fresh temporary directory created by this run.
    await rm(consumerDirectory, { recursive: true, force: true });
  }
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
}
