import { chmod, mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../packages/mcp/src/cli.js';

const exec = promisify(execFile);
const packageName = '@modelcontextprotocol/server';
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'pulse-cli-resolution-')); dirs.push(root);
  return root;
}
async function application(root: string, name = 'service', declared = '^2.0.0') {
  const cwd = join(root, 'packages', name);
  await mkdir(cwd, { recursive: true });
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ type: 'module', dependencies: { [packageName]: declared }, scripts: { prepare: 'throw PRIVATE_LIFECYCLE' } }));
  await writeFile(join(cwd, 'index.mjs'), "throw new Error('PRIVATE_APPLICATION_EXECUTED');");
  return cwd;
}
async function installed(root: string, version = '2.0.0', overrides: Record<string, unknown> = {}) {
  const path = join(root, 'node_modules', packageName);
  await mkdir(join(path, 'dist', 'nested'), { recursive: true });
  // Synthetic import-only package, deliberately hiding package.json and deeply nesting its entry.
  await writeFile(join(path, 'package.json'), JSON.stringify({ name: packageName, version, type: 'module', exports: { '.': { import: './dist/nested/index.mjs' } }, ...overrides }));
  await writeFile(join(path, 'dist', 'nested', 'index.mjs'), "throw new Error('PRIVATE_PACKAGE_EXECUTED');");
  return path;
}
async function cli(cwd: string, command = 'doctor', ...args: string[]) {
  let output = '';
  const exit = await runCli([command, '--cwd', cwd, ...args], text => { output += text; });
  return { exit, output, lines: output.trim().split('\n').map(line => JSON.parse(line)) };
}
async function esmResolution(cwd: string) {
  const { NODE_OPTIONS: _options, ...env } = process.env;
  const { stdout } = await exec(process.execPath, ['--input-type=module', '--eval', `process.stdout.write(import.meta.resolve('${packageName}'))`], { cwd, env });
  return stdout;
}

describe('CLI dependency resolution from the target application', () => {
  it('runs its command when Node enters through an npm-style executable symlink', async () => {
    const root = await workspace();
    const bin = join(root, 'pulse');
    await symlink(fileURLToPath(new URL('../packages/mcp/src/cli.ts', import.meta.url)), bin);
    const { stdout, stderr } = await exec(process.execPath, [bin, 'help']);
    expect(stdout).toBe('');
    expect(JSON.parse(stderr).code).toBe('HELP');
  });

  it('accepts an import-only normal install with unexported package.json without executing its code', async () => {
    const root = await workspace(), cwd = await application(root);
    await installed(cwd);
    expect(await esmResolution(cwd)).toContain('/dist/nested/index.mjs');
    const result = await cli(cwd);
    expect(result.lines[0].static).toMatchObject({ mcpDeclared: '^2.0.0', mcpInstalled: '2.0.0', compatible: true });
    expect(result.output).not.toContain('PRIVATE_');
  });

  it('accepts the hoisted package that Node ESM resolves from each workspace application', async () => {
    const root = await workspace();
    await installed(root);
    for (const name of ['service', 'other']) {
      const cwd = await application(root, name);
      expect(await esmResolution(cwd)).toContain('/node_modules/@modelcontextprotocol/server/dist/nested/index.mjs');
      expect((await cli(cwd)).lines[0].static).toMatchObject({ mcpDeclared: '^2.0.0', mcpInstalled: '2.0.0', compatible: true });
    }
  });

  it('follows a synthetic pnpm-style package symlink, without claiming package-manager integration', async () => {
    const root = await workspace(), cwd = await application(root);
    const store = join(root, '.pnpm', '@modelcontextprotocol+server@2.0.0');
    const path = await installed(store);
    await mkdir(join(root, 'node_modules', '@modelcontextprotocol'), { recursive: true });
    await symlink(path, join(root, 'node_modules', packageName), 'dir');
    expect(await esmResolution(cwd)).toContain('/.pnpm/');
    expect((await cli(cwd)).lines[0].static).toMatchObject({ mcpInstalled: '2.0.0', compatible: true });
  });

  it('reports the nearest application version instead of the supported CLI or workspace version', async () => {
    const root = await workspace(), cwd = await application(root);
    await installed(root);
    await installed(cwd, '2.1.0');
    expect(await esmResolution(cwd)).toContain('/packages/service/node_modules/');
    expect((await cli(cwd)).lines[0].static).toMatchObject({ mcpDeclared: '^2.0.0', mcpInstalled: '2.1.0', compatible: false, mcpStatus: 'unsupported' });
    expect((await cli(cwd, 'init', '--yes')).exit).toBe(1);
    await expect(readFile(join(cwd, 'pulse.integration.ts'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('accepts a supported local version even when the workspace version is unsupported', async () => {
    const root = await workspace(), cwd = await application(root);
    await installed(root, '2.1.0'); await installed(cwd);
    expect((await cli(cwd)).lines[0].static).toMatchObject({ mcpInstalled: '2.0.0', compatible: true });
  });

  it('preserves hoisted init dry-run, creation, repeated-run and doctor behavior in EN/TR', async () => {
    const root = await workspace(), cwd = await application(root); await installed(root);
    expect((await cli(cwd, 'init', '--yes', '--dry-run')).lines[0].code).toBe('INIT_PREVIEW');
    await expect(readFile(join(cwd, 'pulse.integration.ts'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await cli(cwd, 'init', '--yes')).lines.at(-1).code).toBe('INIT_CREATED');
    expect((await cli(cwd, 'init', '--yes')).lines[0].code).toBe('INIT_UNCHANGED');
    for (const locale of ['en', 'tr']) {
      const result = await cli(cwd, 'doctor', '--locale', locale);
      expect(result.lines[0].static.compatible).toBe(true);
      expect(Object.values(result.lines[0].runtime)).toEqual(['unknown', 'unknown', 'unknown', 'unknown']);
    }
  });

  it('does not use the CLI own dependency when the target application package is absent', async () => {
    const cwd = await application(await workspace());
    expect((await cli(cwd)).lines[0].static).toMatchObject({ mcpInstalled: null, compatible: false, mcpStatus: 'not_found' });
  });

  it.each([
    ['no root export', { exports: { './other': './dist/nested/index.mjs' } }],
    ['require-only export', { exports: { '.': { require: './dist/nested/index.mjs' } } }],
    ['missing entry', { exports: { '.': { import: './missing.mjs' } } }],
    ['directory entry', { exports: { '.': { import: './dist/nested' } } }],
  ])('keeps %s separate from unsupported version and does not fall through to a hoisted copy', async (_name, overrides) => {
    const root = await workspace(), cwd = await application(root);
    await installed(root); await installed(cwd, '2.0.0', overrides);
    expect((await cli(cwd)).lines[0].static).toMatchObject({ mcpInstalled: '2.0.0', compatible: false, mcpStatus: 'unresolvable' });
  });

  it.each([
    ['malformed JSON', '{PRIVATE_MALFORMED'],
    ['unexpected package', JSON.stringify({ name: 'PRIVATE_WRONG_PACKAGE', version: '2.0.0' })],
    ['non-object metadata', 'null'],
    ['invalid version', JSON.stringify({ name: packageName, version: 'PRIVATE_BAD_VERSION' })],
    ['oversized metadata', JSON.stringify({ name: packageName, version: '2.0.0', padding: 'x'.repeat(1_048_576) })],
  ])('reports %s as unverified metadata without echoing private data', async (_name, metadata) => {
    const root = await workspace(), cwd = await application(root);
    await installed(root); const path = await installed(cwd);
    await writeFile(join(path, 'package.json'), metadata);
    const result = await cli(cwd);
    expect(result.lines[0].static).toMatchObject({ mcpInstalled: null, compatible: false, mcpStatus: 'metadata_unverified' });
    expect(result.output).not.toContain('PRIVATE_');
  });

  it('rejects an unreadable manifest and a manifest symlink without claiming unsupported', async () => {
    const root = await workspace(), cwd = await application(root);
    const path = join(await installed(cwd), 'package.json');
    await chmod(path, 0);
    try { expect((await cli(cwd)).lines[0].static).toMatchObject({ mcpInstalled: null, compatible: false, mcpStatus: 'metadata_unverified' }); }
    finally { await chmod(path, 0o600); }
    await rm(path);
    await symlink(join(cwd, 'package.json'), path);
    expect((await cli(cwd)).lines[0].static).toMatchObject({ mcpInstalled: null, compatible: false, mcpStatus: 'metadata_unverified' });
  });

  it('does not inherit NODE_OPTIONS that would execute project preload code in its resolver', async () => {
    const root = await workspace(), cwd = await application(root); await installed(cwd);
    const old = process.env.NODE_OPTIONS;
    process.env.NODE_OPTIONS = '--import=data:text/javascript,throw%20new%20Error(%22PRIVATE_PRELOAD_EXECUTED%22)';
    try { expect((await cli(cwd)).lines[0].static.compatible).toBe(true); }
    finally { if (old === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = old; }
  });
});
