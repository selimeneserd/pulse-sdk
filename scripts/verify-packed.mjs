/**
 * Local release gate only; creates and installs archives, never publishes them.
 * Yalnızca yerel doğrulama; arşivleri oluşturur ve kurar, paket yayımlamaz.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryMode = process.argv.includes('--registry');
const evidenceDirectory = join(root, 'docs', 'evidence');
const evidenceArgument = process.argv.indexOf('--evidence');
if (evidenceArgument !== -1 && (!process.argv[evidenceArgument + 1] || process.argv[evidenceArgument + 1].startsWith('--'))) throw new Error('EVIDENCE_PATH_REQUIRED');
const evidencePath = evidenceArgument === -1
  ? join(evidenceDirectory, registryMode ? 'registry-consumer.json' : 'packed-consumer.json')
  : resolve(root, process.argv[evidenceArgument + 1]);
const commands = [];
const startedAt = new Date().toISOString();
let consumerDirectory;
let archiveDirectory;
const report = {
  gate: registryMode ? 'NPM_REGISTRY_CONSUMER' : 'LOCAL_PACKED_CONSUMER',
  status: 'RUNNING',
  started_at: startedAt,
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  package_manager: null,
  npm: null,
  child_runtime_path_pinned_to_current_node: true,
  publication_performed: false,
  production_deployment_performed: false,
  collector_boundary: 'Ephemeral loopback HTTP test collector and local memory/JSONL; no Cloud ingestion claim.',
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
    env: { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`, ...options.env },
    timeout: options.timeout ?? 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  commands.push({
    command: [command, ...args].map(scrub),
    cwd: scrub(cwd),
    exit_code: result.status,
    ...(options.env ? { environment: Object.fromEntries(Object.entries(options.env).map(([key, value]) => [key, scrub(value)])) } : {}),
    ...(result.error ? { process_error: result.error.code ?? 'PROCESS_ERROR' } : {}),
  });
  if (result.error || result.status !== 0) {
    // Build/install failures are not dumped: dependency tooling can include local
    // user paths or registry configuration. The command and exit code are enough
    // to repeat the failed gate without recording arbitrary external output.
    throw Object.assign(new Error('PACKED_CONSUMER_COMMAND_FAILED'), { command, exitCode: result.status });
  }
  return options.capture === 'stdio' ? { stdout: result.stdout, stderr: result.stderr } : result.stdout;
}

const sha256 = value => createHash('sha256').update(value).digest('hex');
const allowedDist = /^dist\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:js|d\.ts|js\.map|d\.ts\.map)$/;
function allowedFile(path, core) {
  return ['package.json', 'LICENSE', 'README.md'].includes(path)
    || allowedDist.test(path)
    || (core && ['contracts/event-v1.schema.json', 'contracts/batch-v1.schema.json', 'contracts/ack-v1.schema.json', 'contracts/LICENSE', 'contracts/NOTICE'].includes(path));
}

async function auditPackage(name) {
  const core = name === '@reviseflow/pulse-core';
  const directory = join(root, 'packages', core ? 'core' : name === '@reviseflow/pulse-otel' ? 'otel' : 'mcp');
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
      assert.equal(packedManifest.version, sourceManifest.version);
      assert.notEqual(packedManifest.private, true, 'PUBLIC_SDK_REQUIRED');
      assert.equal(packedManifest.publishConfig.access, 'public');
      assert.equal(packedManifest.publishConfig.registry, 'https://registry.npmjs.org/');
      assert.equal(packedManifest.license, 'MIT');
      assert.deepEqual(packedManifest.engines, sourceManifest.engines);
      assert.equal(packedManifest.repository.url, 'git+https://github.com/selimeneserd/pulse-sdk.git');
      const assertMember = target => {
        assert.equal(typeof target, 'string', 'INVALID_PACKAGE_ENTRYPOINT');
        assert.ok(target.startsWith('./'), 'ENTRYPOINT_MUST_BE_PACKAGE_RELATIVE');
        assert.ok(actualFiles.includes(target.slice(2)), 'PACKAGED_ENTRYPOINT_MISSING');
      };
      for (const target of Object.values(packedManifest.exports)) {
        if (typeof target === 'string') assertMember(target);
        else {
          assert.ok(target.types.endsWith('.d.ts'), 'TYPED_ENTRYPOINT_REQUIRED');
          assertMember(target.types); assertMember(target.import);
        }
      }
      for (const target of Object.values(packedManifest.bin ?? {})) assertMember(target);
      for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const [dependency, range] of Object.entries(packedManifest[field] ?? {})) {
          assert.ok(!/^(?:workspace:|file:|link:|\/)/.test(range), 'LOCAL_DEPENDENCY_IN_PACKED_MANIFEST');
          assert.ok(!dependency.startsWith('@pulse-cloud/'), 'PRIVATE_DEPENDENCY_IN_PACKED_MANIFEST');
        }
      }
      if (core) assert.deepEqual(packedManifest.dependencies ?? {}, {}, 'CORE_RUNTIME_DEPENDENCY_FORBIDDEN');
      if (!core) assert.equal(packedManifest.dependencies['@reviseflow/pulse-core'], sourceManifest.version);
    }
    memberHashes.push({ path: member, sha256: sha256(content) });
  }
  // --dry-run forbids publication; --offline also denies registry interaction.
  // Audit the exact archive, with all lifecycle scripts disabled.
  const publishDryRun = JSON.parse(run('npm', ['publish', path, '--dry-run', '--ignore-scripts', '--offline', '--json'], root));
  // npm 11.6 emits one package object; 11.19 keys that same object by name.
  const publishPackage = Array.isArray(publishDryRun) ? publishDryRun[0] : publishDryRun[name] ?? publishDryRun;
  assert.equal(publishPackage.name, name, 'PUBLISH_DRY_RUN_PACKAGE_MISMATCH');
  assert.equal(publishPackage.version, sourceManifest.version, 'PUBLISH_DRY_RUN_VERSION_MISMATCH');
  assert.deepEqual(publishPackage.files.map(file => file.path).sort(), actualFiles, 'PUBLISH_DRY_RUN_FILES_DIFFER');
  const packageEvidence = {
    name,
    version: sourceManifest.version,
    archive: relative(root, path),
    sha256: sha256(await readFile(path)),
    dry_run_matches_archive: true,
    publish_dry_run_offline_passed: true,
    entrypoints_types_bin_and_metadata_passed: true,
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
import { createPulseCore, type PulseEvent, type PulseExporter } from '@reviseflow/pulse-core';
import { createHttpExporter } from '@reviseflow/pulse-core/http';
import { createJsonlExporter } from '@reviseflow/pulse-core/jsonl';
import { createMemoryExporter } from '@reviseflow/pulse-core/memory';
import { runExporterConformance } from '@reviseflow/pulse-core/conformance';
import { createOtelExporter } from '@reviseflow/pulse-otel';
import { trace } from '@opentelemetry/api';
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
const publicExporters: PulseExporter[] = [createMemoryExporter(), createJsonlExporter({ path: 'local.jsonl' }), createHttpExporter({ endpoint: 'http://127.0.0.1:1/events' }), createOtelExporter({ tracer: trace.getTracer('packed-types') })];
const conformance: (exporter: PulseExporter, event: PulseEvent) => Promise<Readonly<{ passed: boolean; checks: number }>> = runExporterConformance;
void publicExporters; void conformance;
void sameType; void prohibited;
`;

const runtimeConsumer = `import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPulse } from '@reviseflow/pulse';
import { createMemoryExporter } from '@reviseflow/pulse-core/memory';
import { createJsonlExporter } from '@reviseflow/pulse-core/jsonl';
import { runExporterConformance, validatePulseEvent } from '@reviseflow/pulse-core/conformance';
import eventSchema from '@reviseflow/pulse-core/contracts/event-v1.schema.json' with { type: 'json' };
import { runLocalExample } from './local.ts';
const memory = createMemoryExporter();
const { result, diagnostics } = await runLocalExample(memory);
assert.deepEqual(result.structuredContent, { sum: 5 });
assert.equal(diagnostics.observed, 1);
assert.equal(diagnostics.accepted, 1);
const event = memory.getEvents()[0];
for (const required of eventSchema.required) assert.ok(Object.hasOwn(event, required));
for (const key of Object.keys(event)) assert.ok(Object.hasOwn(eventSchema.properties, key));
assert.equal(event.outcome, 'tool_success');
assert.equal(event.actor_id, null);
assert.equal(event.client_name, null);
assert.equal(event.adapter, 'mcp-typescript-2');
assert.equal(validatePulseEvent(event), true);
assert.equal((await runExporterConformance(createMemoryExporter(), event)).passed, true);
const jsonl = createJsonlExporter({ path: 'offline-events.jsonl', maxBytes: 1_048_576, maxFiles: 2 });
const jsonlCall = await runLocalExample(jsonl);
assert.deepEqual(jsonlCall.result.structuredContent, { sum: 5 });
assert.equal(jsonlCall.diagnostics.observed, 1);
assert.equal(jsonlCall.diagnostics.accepted, 1);
const localLines = (await readFile('offline-events.jsonl', 'utf8')).trim().split('\\n');
assert.equal(localLines.length, 1);
const localEvent = JSON.parse(localLines[0]);
for (const required of eventSchema.required) assert.ok(Object.hasOwn(localEvent, required));
for (const key of Object.keys(localEvent)) assert.ok(Object.hasOwn(eventSchema.properties, key));
assert.equal(localEvent.outcome, 'tool_success');
assert.equal(localEvent.actor_id, null);
assert.equal(localEvent.client_name, null);
assert.equal(localEvent.adapter, 'mcp-typescript-2');
assert.equal(validatePulseEvent(localEvent), true);
const disabled = createPulse({ environment: 'test', enabled: false });
const hostile = new Proxy({}, { get() { throw Error('UNEXPECTED_PROBE'); } });
assert.equal(disabled.wrapServer(hostile), hostile);
await disabled.shutdown();
console.log(JSON.stringify({ passed: true, observed: 1, accepted: 1, emitted_events: 1, jsonl: { real_mcp_calls: 1, observed: 1, accepted: 1, emitted_events: 1, local_event_schema_verified: true }, conformance_smoke_passed: true, schema_exports_verified: true, real_mcp_in_memory_transport: true, cloud_key_absent: true, network_guard: globalThis.__pulseNetworkDenied === true }));
`;

const networkGuard = `import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
const deny = () => { throw Object.assign(new Error('RUNTIME_NETWORK_FORBIDDEN'), { code: 'RUNTIME_NETWORK_FORBIDDEN' }); };
net.Socket.prototype.connect = deny;
net.Server.prototype.listen = deny;
net.createConnection = deny; net.connect = deny;
tls.connect = deny; http.request = deny; http.get = deny;
https.request = deny; https.get = deny;
dgram.createSocket = deny;
for (const key of Object.keys(dns)) if (/^(lookup|resolve|reverse)/.test(key) && typeof dns[key] === 'function') dns[key] = deny;
for (const key of Object.keys(dns.promises)) if (/^(lookup|resolve|reverse)/.test(key) && typeof dns.promises[key] === 'function') dns.promises[key] = deny;
globalThis.fetch = deny;
globalThis.WebSocket = class { constructor() { deny(); } };
globalThis.__pulseNetworkDenied = true;
syncBuiltinESMExports();
`;

async function verifyPackedCli() {
  const cli = join(consumerDirectory, 'node_modules', '.bin', 'pulse');
  const cliOptions = { capture: 'stdio', env: { NODE_OPTIONS: `--import=${join(consumerDirectory, 'network-guard.mjs')}` } };
  const invoke = (args, cwd = consumerDirectory) => {
    const output = run(cli, args, cwd, cliOptions);
    assert.equal(output.stdout, '', 'CLI_MUST_NOT_WRITE_STDOUT');
    assert.ok(output.stderr.trim(), 'PACKED_BIN_MUST_EXECUTE');
    return output.stderr.trim().split('\n').map(line => JSON.parse(line));
  };
  assert.equal(invoke(['help'])[0].code, 'HELP');
  const layouts = [];
  for (const [layout, project, declared, locale] of [
    ['normal', consumerDirectory, '2.0.0', 'en'],
    ['hoisted', join(consumerDirectory, 'packages', 'service'), '^2.0.0', 'tr'],
    ['nested_workspace', join(consumerDirectory, 'packages', 'other', 'service'), '~2.0.0', 'en'],
  ]) {
    if (project !== consumerDirectory) {
      await mkdir(project, { recursive: true });
      await writeFile(join(project, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { '@modelcontextprotocol/server': declared } }));
      await assert.rejects(lstat(join(project, 'node_modules')), { code: 'ENOENT' });
    }
    const nodeResolution = run(process.execPath, ['--import', join(consumerDirectory, 'network-guard.mjs'), '--input-type=module', '-e', "console.log(import.meta.resolve('@modelcontextprotocol/server'))"], project).trim();
    const realMcpDirectory = await realpath(join(consumerDirectory, 'node_modules', '@modelcontextprotocol', 'server'));
    assert.ok(fileURLToPath(nodeResolution).startsWith(`${realMcpDirectory}/`), 'APPLICATION_MUST_RESOLVE_REAL_HOISTED_MCP');
    // Exercise both process cwd and the explicit target-project option on the
    // distributed npm bin, rather than importing a source helper.
    const doctor = invoke(['doctor', '--locale', locale], project)[0];
    assert.equal(doctor.code, 'DOCTOR');
    assert.equal(doctor.static.mcpDeclared, declared);
    assert.equal(doctor.static.mcpInstalled, '2.0.0');
    assert.equal(doctor.static.compatible, true);
    assert.deepEqual(Object.values(doctor.runtime), ['unknown', 'unknown', 'unknown', 'unknown']);
    const preview = invoke(['init', '--dry-run', '--cwd', project, '--locale', locale]);
    assert.deepEqual(preview.map(message => message.code), ['INIT_PREVIEW']);
    await assert.rejects(lstat(join(project, 'pulse.integration.ts')), { code: 'ENOENT' });
    assert.deepEqual(invoke(['init', '--yes', '--cwd', project, '--locale', locale]).map(message => message.code), ['INIT_PREVIEW', 'INIT_CREATED']);
    assert.deepEqual(invoke(['init', '--yes', '--cwd', project, '--locale', locale]).map(message => message.code), ['INIT_UNCHANGED']);
    layouts.push({ layout, locale, real_mcp_version: doctor.static.mcpInstalled, declared_range: declared, node_application_resolution_verified: true, doctor_passed: true, init_dry_run_and_idempotence_passed: true });
  }
  return { installed_npm_bin_executed: true, stdout_empty: true, network_guard_enabled: true, layouts, pnpm_execution_claimed: false };
}

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
      '@reviseflow/pulse-otel': registryMode ? report.packages[2].version : `file:./artifacts/${archives[2].filename}`,
      '@opentelemetry/api': '1.9.1',
      esbuild: '0.28.2',
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
  for (const name of ['pulse-core', 'pulse', 'pulse-otel']) {
    const installed = await realpath(join(consumerDirectory, 'node_modules', '@reviseflow', name));
    assert.ok(installed.startsWith(await realpath(consumerDirectory)), 'PACKED_PACKAGE_LINKS_TO_WORKSPACE');
    assert.ok(!installed.startsWith(await realpath(root)), 'PACKED_PACKAGE_LINKS_TO_WORKSPACE');
  }
  await cp(join(root, 'examples', 'fixture.ts'), join(consumerDirectory, 'fixture.ts'));
  await cp(join(root, 'examples', 'local.ts'), join(consumerDirectory, 'local.ts'));
  await writeFile(join(consumerDirectory, 'network-guard.mjs'), networkGuard);
  await writeFile(join(consumerDirectory, 'guard-test.mjs'), `import assert from 'node:assert/strict'; import net from 'node:net'; assert.throws(() => net.connect(80,'127.0.0.1'), {code:'RUNTIME_NETWORK_FORBIDDEN'}); assert.throws(() => fetch('https://example.invalid'), {code:'RUNTIME_NETWORK_FORBIDDEN'});`);
  await writeFile(join(consumerDirectory, 'consumer.ts'), typeConsumer);
  await writeFile(join(consumerDirectory, 'consumer-runtime.mjs'), runtimeConsumer);
  await cp(join(root, 'scripts', 'packed-http-consumer.mjs'), join(consumerDirectory, 'http-runtime.mjs'));
  await writeFile(join(consumerDirectory, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      target: 'ES2023', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true,
      types: ['node'],
      noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, skipLibCheck: true,
      noEmit: true, verbatimModuleSyntax: true,
    },
    include: ['consumer.ts', 'fixture.ts', 'local.ts'],
  }, null, 2)}\n`);
  run(process.execPath, ['./node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], consumerDirectory);
  run(process.execPath, ['--import', './network-guard.mjs', 'guard-test.mjs'], consumerDirectory);
  const runtime = JSON.parse(run(process.execPath, ['--import', './network-guard.mjs', 'consumer-runtime.mjs'], consumerDirectory));
  assert.equal(runtime.network_guard, true);
  await rm(join(consumerDirectory, 'offline-events.jsonl'));
  run('./node_modules/.bin/esbuild', [ 'consumer-runtime.mjs', '--bundle', '--platform=node', '--format=esm', '--external:@modelcontextprotocol/*', '--external:zod', '--define:import.meta.url="file:///pulse-bundled-library"', '--outfile=bundle.mjs'], consumerDirectory);
  const bundled = JSON.parse(run(process.execPath, ['--import', './network-guard.mjs', 'bundle.mjs'], consumerDirectory));
  assert.equal(bundled.passed, true);
  run(process.execPath, ['--import', './network-guard.mjs', '-e', "import('@reviseflow/pulse-otel').then(m => { if (typeof m.createOtelExporter !== 'function') process.exit(1) })"], consumerDirectory);
  const cli = await verifyPackedCli();
  const http = JSON.parse(run(process.execPath, ['http-runtime.mjs'], consumerDirectory));
  assert.equal(http.passed, true);
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
  assert.equal(event.sdk_version, report.packages[0].version);
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
  // Install a second actual MCP package copy and a second Pulse copy. No private
  // paths are consulted by instrumentation; separate class identity is accepted.
  const duplicateDirectory = join(consumerDirectory, 'duplicate');
  await mkdir(duplicateDirectory);
  await cp(join(consumerDirectory, 'node_modules/@modelcontextprotocol/server'), join(duplicateDirectory, 'server'), { recursive: true });
  await cp(join(consumerDirectory, 'node_modules/@reviseflow/pulse'), join(duplicateDirectory, 'pulse'), { recursive: true });
  const duplicateServer = JSON.parse(await readFile(join(duplicateDirectory, 'server/package.json'), 'utf8'));
  const duplicatePulse = JSON.parse(await readFile(join(duplicateDirectory, 'pulse/package.json'), 'utf8'));
  await writeFile(join(consumerDirectory, 'duplicates.mjs'), `import assert from 'node:assert/strict';
import { McpServer as OriginalServer } from '@modelcontextprotocol/server';
import { McpServer } from './duplicate/server/${duplicateServer.exports['.'].import.default.replace('./','')}';
import { createPulse } from '@reviseflow/pulse';
import { createPulse as duplicatePulse } from './duplicate/pulse/${duplicatePulse.exports['.'].import.replace('./','')}';
import { createMemoryExporter } from '@reviseflow/pulse-core/memory';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
const memory=createMemoryExporter();
const one=createPulse({environment:'test',exporter:memory});
const two=duplicatePulse({environment:'test',exporter:memory});
const target=new McpServer({name:'duplicate',version:'1'});
assert.equal(target instanceof OriginalServer,false);
const server=two.wrapServer(one.wrapServer(target));
server.registerTool('once',{},()=>({content:[]}));
const client=new Client({name:'fixture',version:'1'});
const [c,s]=InMemoryTransport.createLinkedPair();
await server.connect(s); await client.connect(c);
await client.callTool({name:'once'}); await one.flush(); await two.flush();
assert.equal(memory.getEvents().length,1);
await client.close(); await server.close(); await one.shutdown(); await two.shutdown();
`);
  run(process.execPath, ['--import', './network-guard.mjs', 'duplicates.mjs'], consumerDirectory);
  report.consumer = {
    ...report.consumer,
    unrelated_temporary_directory: true,
    workspace_source_links_absent: true,
    typed_registration_compilation_passed: true,
    runtime,
    cli,
    http,
    offline_runtime_guard_verified: true,
    bundle_esm_pulse_embedded_mcp_peer_external_passed: true,
    duplicate_mcp_and_pulse_copies_passed: true,
    cli_stdout_empty: true,
    fixture_source_sha256: sha256(await readFile(join(root, 'examples', 'fixture.ts'))),
    locales,
  };
}

try {
  assert.ok(['v24.11.1', 'v24.20.0'].includes(process.version), 'RUN_WITH_VERIFIED_NODE_MATRIX');
  report.package_manager = run('pnpm', ['--version']).trim();
  assert.equal(report.package_manager, '11.22.0', 'RUN_WITH_PINNED_PNPM');
  report.npm = run('npm', ['--version']).trim();
  // Read before packing: a missing owner-facing README is a failed gate, never
  // silently bypassed with generated placeholder content.
  for (const name of ['core', 'mcp', 'otel']) await readFile(join(root, 'packages', name, 'README.md'));
  await mkdir(join(root, 'artifacts'), { recursive: true });
  archiveDirectory = await mkdtemp(join(root, 'artifacts', 'packed-'));
  run('pnpm', ['build']);
  const core = await auditPackage('@reviseflow/pulse-core');
  const mcp = await auditPackage('@reviseflow/pulse');
  const otel = await auditPackage('@reviseflow/pulse-otel');
  await verifyConsumer([core, mcp, otel]);
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
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
}
