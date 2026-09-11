# Migration and release preparation / Geçiş ve yayın hazırlığı

0.1.0 is published on npm; 0.2.0 in this checkout is **not yet published on npm**. GitHub source delivery and the separate Cloud rollout are recorded in [BUILD_STATUS.md](../BUILD_STATUS.md). Pre1.0 minor version is intentionally breaking. Keep package names. No Cloud code/assets/credentials belong in MIT packages.

## API change / API değişikliği

Before: `createPulse({endpoint,writeKey,environment})`.
After: `createPulse({environment,exporter:createHttpExporter({endpoint,authorization:\`Bearer ${writeKey}\`})})` with the factory from `@reviseflow/pulse-core/http`. Preserve the exact full endpoint and server-only key. For local value, choose memory/JSONL instead; no key. Do not fall back to a Cloud URL when env is missing. Validate required environment in the application. The new core rejects old endpoint/writeKey options so a migration mistake cannot silently send somewhere unintended.

Providing exporter now enables development/test by default. Existing production/staging behavior with explicit HTTP remains observed-handler semantics. Choose `enabled:false` deliberately for off; missing exporter disables with diagnostics. Core no longer owns quota plan codes.429 retries with a finite budget; future events recover after quota resets.401/403 requires explicit `resume()` after upstream repair, or `reconfigure({exporter:newHttpExporter})` after key changes. Neither requires wrapping again. Already dropped data is irrecoverable.

Event schema_version1 unchanged; optional adapter_version added; sdk_version derives package version; plain core adapter is custom. Collector must accept optional provenance before0.2 rollout. The old event fields/meaning stay readable. No historical data rewrite is required. Host/source tool labels and identity policy are unchanged; write-key rotation does not rotate the separate HMAC key. Flush/shutdown are bounded and concurrent-safe; the app still owns lifecycle hooks. strict:true is development opt-in; default instrumentation installation now fails open with safe diagnostics.

TR:0.2 kurucu API'si kırıcıdır; eski endpoint/key yeni HTTP exporter'a taşınır. Development/test artık açık exporter ile etkinleşir. Olay v1 anlamı aynı kalır. Önce collector ek metadata'yı kabul etmelidir. Auth/kota toparlanması aynı instance ile yapılır; atılan veri geri gelmez.

## Deployment/release order and rollback / Sıra ve geri alma

1. Review additive collector schema/DB support. The separate Cloud repo's `docs/cloud-integration-migration.md` records exact migration020, old/new packed consumer and tenant/RLS evidence. Local tests do not establish production deployment. Schedule owner-authorized migration/deploy first; keep0.1 accepted for the complete rollout/rollback window (no arbitrary forced end date).
2. Run all local gates below and inspect actual tarballs. Release core0.2.0 first; then MCP0.2.0 and optional OTel0.2.0 after registry dependencies resolve. Publication and GitHub issues/PRs require separate owner authorization. Do not execute publish merely from this document.
3. Pilot one explicitly selected development/staging service with local then HTTP export; verify handler result, diagnostics accepted/drop state and actual collector data. Do not call live business tools without authorization.
4. Rollback client to pinned0.1.0 + old endpoint/writeKey construction, keeping additive Cloud schema support. Since events stayv1, old/new history remains queryable. Do not delete new data or remove accepted fields during rollback. Pause/shutdown new exporter before replacing instrumentation in process; safest migration/rollback is an application restart.

TR: Önce collector, sonra core, sonra adaptör/isteğe bağlı OTel yayımlanır. Tüm dış işlemler sahip iznine bağlıdır. Geri alma0.1 pin+eski kurucu ile yapılır; ek DB desteği tutulur, veri silinmez. Ayrı depoların aynı anda yayımlanması gerekmez.

## Local release gates / Yerel yayın kontrolleri

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm example:local
pnpm example:otel
pnpm verify:pack
pnpm benchmark
pnpm --filter @reviseflow/pulse-core pack --pack-destination ./artifacts
pnpm --filter @reviseflow/pulse pack --pack-destination ./artifacts
pnpm --filter @reviseflow/pulse-otel pack --pack-destination ./artifacts
```

Pack is a local archive operation, not publish. `verify:pack` performs npm pack dry-run vs actual member parity, allowlisted files, licenses/metadata/source-boundary scan, isolated actual installation, types, real MCP offline/HTTP, duplicated packages and ESM bundle checks. It retains hashes/evidence. This checkout's examples use candidate archives/source; do not advertise `npm install ...@0.2.0` as available until registry verification passes. `verify:registry` is a read-only post-publication comparison and **must not pass before the release exists**.

GitHub private vulnerability reporting is enabled and was verified through the repository API on 2026-09-11; see SECURITY.md. Before owner-authorized npm publication, verify registry access and ownership without exposing tokens, record changelog/tag/source hashes and retain rollback package pins. No publishing credentials were changed or inspected here. No pricing/plan/domain/pilot success claims were changed.

TR: Pack yalnız yerel arşivdir. Registry doğrulaması yayın sonrası yapılır;0.2 mevcut değilken başarılı sayılmaz. Güvenlik kanalını ve sahip yetkisini insan doğrular. Gerçek publish/deploy bu görevde yapılmaz.
