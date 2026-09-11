# Changelog / Değişiklik günlüğü

## 0.2.0 — Unreleased / Yayımlanmadı

Breaking: inject a `PulseExporter`; remove endpoint/writeKey from core/adapter options. Explicit exporter enables development/test. Preserve eventv1 handler meaning; add optional adapter_version, deterministic package metadata and canonical generated types. Core root has no HTTP/fs/OTel exporter imports. Optional memory/noop, bounded rotating JSONL, explicit generic HTTP and separate OTel handoff.

Dispatcher: immediate count/byte threshold, one bounded active attempt, validated partial/duplicate/permanent/retryable results, pause/resume/reconfigure, bounded concurrent flush/shutdown, safe aggregate diagnostics. Quota product logic removed; recover existing instance after key/quota fixes. Never exactly-once/durable SDK claims.

Adapter: public hooks, structural compatibility, default fail-open/strict option, inert disabled mode, duplicate-copy protection, handler semantics and external patch ownership. CLI: safe init preview/idempotency, honest doctor, bounded JSONL dev with dedup and per-observation percentiles. Installed/offline/real HTTP/bundle/duplicate tests, public conformance/HMAC vectors, real OTel pipeline and repeatable benchmark.

TR: Kırıcı API geçişi, açık exporter, v1 anlamının korunması, sınırlı kuyruk/toparlanma, fail-open adaptör, güvenli CLI ve gerçek paket testleri. Ayrıntılar migration-release.md. Cloud zorunlu değildir; yayın yapılmadı.

## 0.1.0 —2026-09-11

Initial published MIT core and MCP2 adapter; explicit HTTP endpoint and server write-key constructor. Existing real-handler privacy/semantic tests retained as regression evidence.

TR: İlk MIT yayın; HTTP adresi ve sunucu write key kurucusu. Mevcut gizlilik/handler testleri regresyon temeli olarak korunur.
