# Baseline architecture / Başlangıç mimarisi

Audit date 2026-09-11. SDK starting SHA `9f17526705be0ca4bbabe5a7b65e3de6f9c83dc3`. Separate private Cloud starting SHA `e6995e2701399bfd5a7e9f5e68d765a48da3a4ba`; both clean before work. SDK MIT; Cloud proprietary. No Cloud source is copied here.

## Baseline / Başlangıç

`MCP app -> @reviseflow/pulse -> pulse-core (event + AsyncLocalStorage/HMAC + HTTP queue) -> explicitly configured collector`. The original core already had zero third-party dependencies and required an explicit endpoint: **no hidden Cloud default was found**. However, enabled core required a write key and owned HTTP, so memory/offline exporters were impossible.

- `packages/core/src/config.ts:resolveOptions` required endpoint/writeKey for enabled instances; development/test defaulted disabled.
- `packages/core/src/exporter.ts:enqueue/schedule` only started the interval, never immediately flushed a full batch. Queue counted bytes and in-flight entries, drop-oldest queued; failed retries were bounded.
- `exporter.ts:send` blocked auth and recognized Cloud quota codes permanently; no resume API. `shutdown` depended on cooperative fetch cancellation.
- `event.ts:createEventFactory` hardcoded sdk_version0.1.0 and adapter mcp-typescript-2. Existing canonical wire schema already permitted other bounded sdk/adapter values; TypeScript was narrower and hand-maintained.
- `mcp/src/index.ts:assertVersion/wrapServer` read package metadata by directory layout, performed checks even disabled, used instanceof and per-module WeakSet. Public registerTool/update hook already preserved subclass registration, this, sync values, async resolution/error identity, mapper exclusion and request-signal cancellation.
- `tests/mcp-http.test.ts` already proved handler completion can precede client-visible output validation failure. Pre-handler rejections produce no completion. Preserve these semantics.
- `scripts/verify-packed.mjs` installed real tarballs into a temp consumer, but only HTTP + exact Node24.20.0, and simulated package metadata drift rather than testing a real additional MCP release.
- `contracts/event-v1.schema.json` had placeholder `$id` and proposed title; packaged schema copies were tested for equality, types had no generator.
- `SECURITY.md`, package homepage and setup examples mixed published0.1.0 with older prepublication language. New0.2.0 remains an unpublished local release candidate.

Baseline actual commands: SDK `pnpm check`: 70/70 passed, Node24.11.1 (engine warning; declared24.20). Cloud `pnpm check`: TS + golden passed, 257 passed/10 skipped/1 failed due to pinned Node check; Cloud shell actually selected22.22.0. Exact24.20.0 is installed; reruns recorded separately. Baseline is immutable in `docs/evidence/baseline-sdk-20260911.txt`.

Cloud read-only map: `/v1/batch` strict Ajv, max100/256KiB, Bearer write-key authentication. PostgreSQL SECURITY DEFINER `app.admit_batch` locks relevant tenant/key/usage rows, derives tenant from key, commits event before202. `(project,event_id)` dedup checks content hash; duplicate does not increment usage. Runtime collector role has no direct analytics SELECT. Existing tests cover negative tenant/RLS paths; new adapter metadata needs an additive SQL allowlist change. These are code observations; local tests are not production verification.

## Chosen target / Seçilen hedef

`MCP -> core event + bounded dispatcher -> injected exporter`, with optional `core/memory`, `core/jsonl`, `core/http`; optional separate `pulse-otel`. Core root imports no HTTP/fs/OTel exporter. Node AsyncLocalStorage/crypto remain explicit supported-runtime choices. Exporter owns one I/O attempt, dispatcher owns all retry/queue/lifecycle. Contract v1 handler meaning unchanged. Public JSON Schema generates TS shape/version files. Cloud consumes the MIT public contract only.

TR: Başlangıçta gizli Cloud adresi bulunmadı; sorun etkin core'un HTTP ve anahtara bağlı olmasıydı. Handler tamamlanması MCP isteği veya iş sonucuyla eşitlenmez. Kuyruk/gizlilik temeli korunarak I/O dışarıdan seçilir. İlk testteki Cloud hatası Node seçimi kaynaklıdır; sonraki kanıt ayrı kaydedilir. Üretim sistemi bu çalışmada değiştirilmez.
