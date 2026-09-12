# Changelog / Değişiklik günlüğü

## 0.2.1 — 2026-09-12

- Share one safe exporter-result snapshot between dispatcher, conformance smoke and normalized HTTP acknowledgements. Smoke no longer passes results already invalid at runtime; partial/duplicate semantics are unchanged.
- Resolve installed MCP from the target project's default Node ESM context, including hoisted/import-only packages. Add safe localized resolution status, preserve declared versus installed versions, and start the actual npm executable symlink correctly.
- Preserve HTTP Retry-After minimums above 60 seconds, through malformed 202 responses and fractional timer delays. Keep bounded retry/drop policy and wire constraints.
- Add source regressions and clean tarball consumers for CLI, offline real MCP memory/JSONL and loopback HTTP. No new runtime dependencies, wire version, supported runtime or migration requirement. All three package versions align at 0.2.1; no migration is needed from 0.2.0.

TR: Ortak güvenli sonuç doğrulaması, hedef proje/hoisted ESM çözümlemesi ve gerçek npm komutu, Retry-After alt sınırının korunması. Kısmi teslim/kuyruk sınırları ve public sözleşme korunur; CLI durum açıklamaları eklenir. Yeni bağımlılık veya migration yoktur; üç paket 0.2.1 sürümünde hizalanır.

## 0.2.0 — 2026-09-11

Breaking: inject a `PulseExporter`; remove endpoint/writeKey from core/adapter options. Explicit exporter enables development/test. Preserve eventv1 handler meaning; add optional adapter_version, deterministic package metadata and canonical generated types. Core root has no HTTP/fs/OTel exporter imports. Optional memory/noop, bounded rotating JSONL, explicit generic HTTP and separate OTel handoff.

Dispatcher: immediate count/byte threshold, one bounded active attempt, validated partial/duplicate/permanent/retryable results, pause/resume/reconfigure, bounded concurrent flush/shutdown, safe aggregate diagnostics. Quota product logic removed; recover existing instance after key/quota fixes. Never exactly-once/durable SDK claims.

Adapter: public hooks, structural compatibility, default fail-open/strict option, inert disabled mode, duplicate-copy protection, handler semantics and external patch ownership. CLI: safe init preview/idempotency, honest doctor, bounded JSONL dev with dedup and per-observation percentiles. Installed/offline/real HTTP/bundle/duplicate tests, public conformance/HMAC vectors, real OTel pipeline and repeatable benchmark.

TR: Kırıcı API geçişi, açık exporter, v1 anlamının korunması, sınırlı kuyruk/toparlanma, fail-open adaptör, güvenli CLI ve gerçek paket testleri. Ayrıntılar migration-release.md. Cloud zorunlu değildir; üç paket npm üzerinde yayımlandı.

## 0.1.0 —2026-09-11

Initial published MIT core and MCP2 adapter; explicit HTTP endpoint and server write-key constructor. Existing real-handler privacy/semantic tests retained as regression evidence.

TR: İlk MIT yayın; HTTP adresi ve sunucu write key kurucusu. Mevcut gizlilik/handler testleri regresyon temeli olarak korunur.
