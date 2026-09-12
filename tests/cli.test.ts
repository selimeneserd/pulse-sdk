import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../packages/mcp/src/cli.js';
import { createPulseCore } from '@reviseflow/pulse-core';
import { createMemoryExporter } from '@reviseflow/pulse-core/memory';
import { createJsonlExporter } from '@reviseflow/pulse-core/jsonl';
import { runLocalExample } from '../examples/local.js';

const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function project(version = '2.0.0') {
  const dir = await mkdtemp(join(tmpdir(), 'pulse-cli-test-')); dirs.push(dir);
  await mkdir(join(dir, 'node_modules/@modelcontextprotocol/server'), { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify({ dependencies: { '@modelcontextprotocol/server': version } }));
  await writeFile(join(dir, 'node_modules/@modelcontextprotocol/server/package.json'), JSON.stringify({ name: '@modelcontextprotocol/server', version, type: 'module', exports: { '.': { import: './index.mjs' } } }));
  await writeFile(join(dir, 'node_modules/@modelcontextprotocol/server/index.mjs'), 'export {};');
  return dir;
}
async function cli(...args: string[]) {
  let output = '';
  const exit = await runCli(args, value => { output += value; });
  return { exit, output, lines: output.trim().split('\n').map(line => JSON.parse(line)) };
}

describe('local-only setup and inspection', () => {
  it('previews by default and dry-run, creates only after explicit flag, stays idempotent and never overwrites', async () => {
    const cwd = await project();
    for (const flags of [[], ['--yes', '--dry-run']]) {
      expect((await cli('init', '--cwd', cwd, ...flags)).lines[0].code).toBe('INIT_PREVIEW');
      await expect(readFile(join(cwd, 'pulse.integration.ts'))).rejects.toMatchObject({ code: 'ENOENT' });
    }
    expect((await cli('init', '--cwd', cwd, '--non-interactive')).lines.at(-1).code).toBe('INIT_CREATED');
    expect((await cli('init', '--cwd', cwd, '--yes')).lines[0].code).toBe('INIT_UNCHANGED');
    await writeFile(join(cwd, 'pulse.integration.ts'), 'PRIVATE_USER_FILE');
    const conflict = await cli('init', '--cwd', cwd, '--yes');
    expect(conflict.exit).toBe(1); expect(conflict.output).not.toContain('PRIVATE_USER_FILE');
    expect(await readFile(join(cwd, 'pulse.integration.ts'), 'utf8')).toBe('PRIVATE_USER_FILE');
  });
  it('does not upgrade unsupported MCP or follow an integration symlink', async () => {
    const cwd = await project('1.0.0');
    expect((await cli('init', '--cwd', cwd, '--yes')).lines[0].code).toBe('COMPATIBILITY_UNKNOWN');
    const supported = await project();
    await symlink(join(supported, 'package.json'), join(supported, 'pulse.integration.ts'));
    expect((await cli('init', '--cwd', supported, '--yes')).lines[0].code).toBe('INIT_CONFLICT');
  });
  it('doctor separates static compatibility from unobserved runtime facts', async () => {
    const result = await cli('doctor', '--cwd', await project());
    expect(result.lines[0].static.compatible).toBe(true);
    expect(Object.values(result.lines[0].runtime)).toEqual(['unknown', 'unknown', 'unknown', 'unknown']);
  });
  it('executes a real offline MCP call, persists JSONL, and reports validated bounded local data in EN/TR', async () => {
    const cwd = await project();
    const path = join(cwd, 'events.jsonl');
    const exporter = createJsonlExporter({ path, maxBytes: 1_048_576, maxFiles: 2 });
    const { result, diagnostics } = await runLocalExample(exporter);
    expect(result.structuredContent).toEqual({ sum: 5 });
    expect(diagnostics.observed).toBe(1); expect(diagnostics.accepted).toBe(1);
    for (const locale of ['en', 'tr']) {
      const output = await cli('dev', '--cwd', cwd, '--file', 'events.jsonl', '--locale', locale);
      expect(output.exit).toBe(0); expect(output.lines[0].events).toBe(1);
      expect(output.lines[0].tools).toMatchObject([{ tool_name: 'sum', count: 1, outcomes: { tool_success: 1 } }]);
    }
  });
  it('drops raw payload sentinels and unknown fields from CLI output without echoing parse errors', async () => {
    const cwd = await project();
    const exporter = createMemoryExporter();
    const core = createPulseCore({ environment: 'test', exporter });
    core.complete({ toolName: 'safe', durationMs: 2, outcome: 'tool_success' });
    await core.flush(); await core.shutdown();
    const good = exporter.getEvents()[0];
    await writeFile(join(cwd, 'events.jsonl'), [JSON.stringify(good), JSON.stringify(good), JSON.stringify({ ...good, arguments: 'PRIVATE_ARGS' }), '{PRIVATE_MALFORMED', JSON.stringify({ ...good, tool_name: '\u001bPRIVATE_TOOL' })].join('\n'));
    const output = await cli('dev', '--cwd', cwd, '--file', 'events.jsonl');
    expect(output.lines[0]).toMatchObject({ events: 1, invalid: 3, duplicates: 1 });
    expect(output.output).not.toContain('PRIVATE_');
    await writeFile(join(cwd, 'events.jsonl'), Array.from({ length: 201 }, (_, index) => JSON.stringify({ ...good, event_id: randomUUID(), tool_name: `tool_${index}` })).join('\n'));
    const bounded = await cli('dev', '--cwd', cwd, '--file', 'events.jsonl');
    expect(bounded.lines[0]).toMatchObject({ events: 200, invalid: 0, omittedToolRecords: 1, truncated: true });
  });
});
