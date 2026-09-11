#!/usr/bin/env node
/** Local-only tools. No network, project execution, package install or secrets. */
import { open, lstat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePulseEvent } from '@reviseflow/pulse-core/conformance';

const texts = {
  en: {
    HELP: 'pulse init [--dry-run|--yes] [--cwd DIR]; pulse doctor [--file JSONL]; pulse dev --file JSONL [--locale en|tr]. Output uses stderr.',
    INVALID_OPTIONS: 'Unsupported command or options.',
    PROJECT_UNAVAILABLE: 'Cannot safely inspect the project package manifest.',
    COMPATIBILITY_UNKNOWN: 'MCP server 2.0.0 has not been verified in this project. No files changed and no versions upgraded.',
    INIT_PREVIEW: 'Preview: add pulse.integration.ts. Wrap before registering tools; call shutdown from the application lifecycle. Re-run with --yes to write.',
    INIT_CREATED: 'Created pulse.integration.ts. Connect it to the server before registering tools and flush during shutdown.',
    INIT_UNCHANGED: 'The integration file already matches. No changes.',
    INIT_CONFLICT: 'The integration file already exists with different content. No files overwritten.',
    DOCTOR: 'Static checks do not prove handler observation, queueing or collector acceptance. Optional JSONL is historical local-export evidence only.',
    DEV: 'Observed handler completions in this local file; duration is not full MCP request latency. This summary is bounded and may cover only a prefix.',
    FILE_UNAVAILABLE: 'Cannot safely inspect the selected regular JSONL file.',
    FAILED: 'Local tool operation failed. No external request was made.',
  },
  tr: {
    HELP: 'pulse init [--dry-run|--yes] [--cwd DIR]; pulse doctor [--file JSONL]; pulse dev --file JSONL [--locale en|tr]. Çıktı stderr kullanır.',
    INVALID_OPTIONS: 'Komut veya seçenekler desteklenmiyor.',
    PROJECT_UNAVAILABLE: 'Proje paket bildirimi güvenle incelenemedi.',
    COMPATIBILITY_UNKNOWN: 'Bu projede MCP server 2.0.0 doğrulanamadı. Dosyalar ve sürümler değiştirilmedi.',
    INIT_PREVIEW: 'Önizleme: pulse.integration.ts eklenecek. Araç kaydından önce sarmalayın; uygulama kapanışında shutdown çağırın. Yazmak için --yes ile yeniden çalıştırın.',
    INIT_CREATED: 'pulse.integration.ts oluşturuldu. Araç kaydından önce sunucuya bağlayın ve kapanışta flush çağırın.',
    INIT_UNCHANGED: 'Entegrasyon dosyası zaten aynı. Değişiklik yok.',
    INIT_CONFLICT: 'Entegrasyon dosyası farklı içerikle mevcut. Üzerine yazılmadı.',
    DOCTOR: 'Statik kontroller handler gözlemini, kuyruklamayı veya collector kabulünü kanıtlamaz. Seçilen JSONL yalnızca geçmiş yerel dışa aktarım kanıtıdır.',
    DEV: 'Yerel dosyadaki gözlemlenen handler tamamlanmaları; süre tam MCP isteği gecikmesi değildir. Sınırlı özet dosyanın yalnızca başını kapsayabilir.',
    FILE_UNAVAILABLE: 'Seçilen normal JSONL dosyası güvenle incelenemedi.',
    FAILED: 'Yerel araç işlemi başarısız. Dış istek yapılmadı.',
  },
} as const;
type Locale = keyof typeof texts;
type Code = keyof typeof texts.en;
const integration = `// Local JSONL analytics / Yerel JSONL analitiği
import { createPulse } from '@reviseflow/pulse';
import { createJsonlExporter } from '@reviseflow/pulse-core/jsonl';

export const pulse = createPulse({
  environment: 'development',
  exporter: createJsonlExporter({ path: 'pulse-events.jsonl', maxBytes: 1_048_576, maxFiles: 2 }),
});
// Before tool registration / Araç kaydından önce: const server = pulse.wrapServer(originalServer);
// Application shutdown / Uygulama kapanışı: await pulse.shutdown({ timeoutMs: 2_000 });
`;

async function boundedRead(path: string, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const info = await lstat(path);
  if (!info.isFile()) throw new Error('NOT_REGULAR_FILE');
  const handle = await open(path, 'r');
  try {
    const bytes = Buffer.alloc(Math.min(info.size, maxBytes));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    return { text: bytes.subarray(0, bytesRead).toString('utf8'), truncated: info.size > bytesRead };
  } finally { await handle.close(); }
}

async function projectInfo(cwd: string) {
  const source = await boundedRead(resolve(cwd, 'package.json'), 1_048_576);
  if (source.truncated) throw new Error('PROJECT_TOO_LARGE');
  const manifest = JSON.parse(source.text) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
  const declared = manifest.dependencies?.['@modelcontextprotocol/server'] ?? manifest.devDependencies?.['@modelcontextprotocol/server'];
  let installed: unknown;
  try {
    // CLI static inspection only; adapter runtime never reads package paths.
    const metadata = await boundedRead(resolve(cwd, 'node_modules/@modelcontextprotocol/server/package.json'), 1_048_576);
    if (!metadata.truncated) installed = JSON.parse(metadata.text).version;
  } catch { /* Missing install remains unverified. */ }
  return {
    mcpDeclared: typeof declared === 'string' && /^[\d.^~<>= |*-]{1,80}$/.test(declared) ? declared : null,
    mcpInstalled: typeof installed === 'string' && /^\d+\.\d+\.\d+$/.test(installed) ? installed : null,
    compatible: installed === '2.0.0',
  };
}

async function summarize(path: string) {
  const source = await boundedRead(path, 10 * 1_048_576);
  let lines = source.text.split('\n');
  if (source.truncated) lines.pop();
  let truncated = source.truncated || lines.length > 10_000;
  lines = lines.slice(0, 10_000);
  let events = 0, invalid = 0, duplicates = 0, omittedToolRecords = 0;
  const seen = new Set<string>();
  const tools = new Map<string, { count: number; durations: number[]; outcomes: Record<string, number> }>();
  for (const line of lines) {
    if (!line.trim()) continue;
    if (Buffer.byteLength(line) > 16_384) { invalid++; continue; }
    let event: unknown;
    try { event = JSON.parse(line); } catch { invalid++; continue; }
    if (!validatePulseEvent(event)) { invalid++; continue; }
    if (seen.has(event.event_id)) { duplicates++; continue; }
    seen.add(event.event_id);
    if (!tools.has(event.tool_name) && tools.size >= 200) { omittedToolRecords++; truncated = true; continue; }
    const tool = tools.get(event.tool_name) ?? { count: 0, durations: [], outcomes: Object.create(null) as Record<string, number> };
    tool.count++; tool.durations.push(event.duration_ms);
    tool.outcomes[event.outcome] = (tool.outcomes[event.outcome] ?? 0) + 1;
    tools.set(event.tool_name, tool); events++;
  }
  return { events, invalid, duplicates, omittedToolRecords, truncated, tools: [...tools].map(([tool_name, tool]) => {
    tool.durations.sort((a, b) => a - b);
    const percentile = (p: number) => tool.durations[Math.max(0, Math.ceil(tool.count * p) - 1)]!;
    return { tool_name, count: tool.count, p50_ms: percentile(.5), p95_ms: percentile(.95), p99_ms: percentile(.99), outcomes: tool.outcomes };
  }) };
}

export async function runCli(args: string[], write: (text: string) => void = text => { process.stderr.write(text); }): Promise<number> {
  let locale: Locale = 'en';
  const emit = (code: Code, detail: Record<string, unknown> = {}) => write(JSON.stringify({ code, message: texts[locale][code], ...detail }) + '\n');
  let cwd = process.cwd(), file: string | undefined, yes = false, dryRun = false;
  const command = args[0] ?? 'help';
  try {
    for (let index = 1; index < args.length; index++) {
      const flag = args[index];
      if (flag === '--yes' || flag === '--non-interactive') yes = true;
      else if (flag === '--dry-run') dryRun = true;
      else if (flag === '--locale' || flag === '--cwd' || flag === '--file') {
        const value = args[++index];
        if (!value || value.startsWith('--')) { emit('INVALID_OPTIONS'); return 1; }
        if (flag === '--locale') { if (value !== 'en' && value !== 'tr') { emit('INVALID_OPTIONS'); return 1; } locale = value; }
        else if (flag === '--cwd') cwd = resolve(value);
        else file = value;
      } else { emit('INVALID_OPTIONS'); return 1; }
    }
    if (command === 'help' || command === '--help') { emit('HELP'); return 0; }
    if (!['init', 'doctor', 'dev'].includes(command)) { emit('INVALID_OPTIONS'); return 1; }
    if (command === 'dev') {
      if (!file) { emit('INVALID_OPTIONS'); return 1; }
      try { emit('DEV', await summarize(resolve(cwd, file))); return 0; }
      catch { emit('FILE_UNAVAILABLE'); return 1; }
    }
    let project;
    try { project = await projectInfo(cwd); } catch { emit('PROJECT_UNAVAILABLE'); return 1; }
    if (command === 'doctor') {
      let localExport: Awaited<ReturnType<typeof summarize>> | null = null;
      if (file) { try { localExport = await summarize(resolve(cwd, file)); } catch { emit('FILE_UNAVAILABLE'); return 1; } }
      emit('DOCTOR', { static: project, runtime: { handlerObserved: 'unknown', eventQueued: 'unknown', exportAttempted: 'unknown', collectorAccepted: 'unknown' }, localExport });
      return 0;
    }
    if (!project.compatible) { emit('COMPATIBILITY_UNKNOWN', { static: project }); return 1; }
    const path = resolve(cwd, 'pulse.integration.ts');
    try {
      const existing = await boundedRead(path, 16_384);
      if (!existing.truncated && existing.text === integration) { emit('INIT_UNCHANGED'); return 0; }
      emit('INIT_CONFLICT'); return 1;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { emit('INIT_CONFLICT'); return 1; } }
    emit('INIT_PREVIEW', { file: 'pulse.integration.ts', content: integration });
    if (dryRun || !yes) return 0;
    try { await writeFile(path, integration, { flag: 'wx', mode: 0o600 }); }
    catch { emit('INIT_CONFLICT'); return 1; }
    emit('INIT_CREATED'); return 0;
  } catch { emit('FAILED'); return 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await runCli(process.argv.slice(2));
