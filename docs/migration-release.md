# Migration and release preparation / Geçiş ve yayın hazırlığı

## 0.2.2 documentation release / 0.2.2 belge yayını

Owner-authorized release preparation on 2026-09-17. All three package versions
align at 0.2.2. This patch updates EN/TR documentation and discovery metadata;
only generated package-version values change in runtime code. There is no API,
wire, dependency or compatibility-matrix change from 0.2.1 and no migration.
Publish the exact verified archives in core → MCP → optional OTel order, then
verify registry integrity and clean consumers on Node 24.11.1 and 24.20.0.
Publication status is recorded in BUILD_STATUS.md; preparation is not publication.

**TR:** 17 Eylül 2026 tarihinde sahibi tarafından yetkilendirilen 0.2.2 yayını,
EN/TR belgeleri ve keşif bilgilerini günceller. Paket sürümü dışında çalışma zamanı
değişmez; 0.2.1'den migration gerekmez. Doğrulanmış arşivler sırayla yayımlanır;
registry bütünlüğü ve iki Node sürümündeki gerçek tüketiciler ayrıca doğrulanır.

## 0.2.1 correctness patch / Doğruluk yaması — 2026-09-12

0.2.1 is published on npm as `latest` for core, MCP and optional OpenTelemetry with owner authorization. Exact archive integrity and clean registry consumers passed on Node 24.11.1 and 24.20.0; [BUILD_STATUS.md](../BUILD_STATUS.md) records the release's exact source, local gates, CI and publication evidence. The earlier `evidence/correctness-baseline-20260912.json` records the starting registry state, when all three packages were 0.2.0; it is historical evidence, not the current release status.

The patch shares safe exporter-result validation between the dispatcher, conformance and normalized HTTP acknowledgements; resolves MCP from the target project's default Node ESM context; starts npm's installed CLI symlink correctly; and preserves HTTP `Retry-After` minimums, including malformed 202 responses. If a server minimum exceeds the configured dispatcher delay cap, pending events are dropped under the existing bounded policy instead of retried early. Partial acceptance and duplicate semantics stay the same.

There is no public TypeScript signature, exporter/wire constraint, third-party dependency or support-matrix change. CLI adds neutral `mcpStatus` values and EN/TR explanations. **No constructor or contract migration is needed from 0.2.0.** Keep the three Pulse packages on the same exact version; optional OTel remains optional:

```sh
npm install --save-exact @reviseflow/pulse@0.2.1 @reviseflow/pulse-core@0.2.1 @modelcontextprotocol/server@2.0.0
# Optional / İsteğe bağlı
npm install --save-exact @reviseflow/pulse-otel@0.2.1 @opentelemetry/api@1.9.1
```

The release sequence is core → MCP → optional OTel, with exact core dependency availability verified before dependent publication. Package versions, generated version metadata and the lockfile must align at 0.2.1, and both Node 24.11.1/24.20.0 local gates must pass against the final archives. Never republish 0.2.0 or use the earlier 0.2.0-labelled development archives as 0.2.1 evidence. These SDK fixes require no Cloud schema or API migration; any separately authorized Cloud rollout is recorded in its own repository.

`verify:pack` records archive members, entry points, types, executable CLI, MIT metadata and source boundaries, and runs an offline publish dry-run. Its clean consumers exercise real MCP memory/JSONL, hoisted CLI resolution and explicit loopback HTTP outside the workspace. Packing and publish dry-runs establish archive behavior, not registry publication. After publication, verify the exact release:

```sh
pnpm verify:registry --evidence docs/evidence/release-0.2.1-registry-node24.20.0.json
# Separate fresh project / Ayrı, temiz proje
mkdir pulse-registry-acceptance
cd pulse-registry-acceptance
npm init -y
npm install --ignore-scripts --save-exact @reviseflow/pulse-core@0.2.1 @reviseflow/pulse@0.2.1 @modelcontextprotocol/server@2.0.0 @modelcontextprotocol/client@2.0.0 zod@4.6.1
npm ls --depth=0
./node_modules/.bin/pulse init --dry-run
./node_modules/.bin/pulse doctor
```

Final local receipts use `evidence/release-0.2.1-check-node24.11.1.txt`, `release-0.2.1-check-node24.20.0.txt` and `release-0.2.1-packed-node*.json`. The release ledger is `evidence/npm-release-0.2.1-20260912.json`; registry consumer receipts are `evidence/release-0.2.1-registry-node24.11.1.json` and `evidence/release-0.2.1-registry-node24.20.0.json`. Their completed status and CI links are recorded in BUILD_STATUS.md.

`verify:registry` compares each exact registry archive's integrity with the release checkout before running its clean consumer checks. Human acceptance is separately tracked in [pilots.md](pilots.md). If the patch causes a problem, stop adopting it, pin the last accepted exact 0.2.x version and restart the application after bounded shutdown. A local memory/JSONL exporter can isolate HTTP investigation. Pinning 0.2.0 restores the known CLI, conformance and retry bugs; it is not a correctness workaround. Registry deprecation/tag repair requires owner authorization; do not unpublish packages, delete data or change Cloud credentials. The historical 0.1-to-0.2 migration below concerns a different constructor change.

TR: Sahip tarafından yetkilendirilen 0.2.1 sürümü üç paket için npm üzerinde `latest` olarak yayımlandı. Exact arşiv bütünlüğü ve temiz registry tüketicileri Node 24.11.1 ve 24.20.0 üzerinde doğrulandı; gerçek kaynak, test, CI ve yayın kanıtları [BUILD_STATUS.md](../BUILD_STATUS.md) içindedir. Ortak sonuç doğrulaması, hedef proje ESM çözümlemesi, npm CLI komutu ve `Retry-After` alt sınırı düzeltilir. Bekleme dispatcher sınırını aşarsa erken retry yerine mevcut politika ile drop uygulanır. 0.2.0'dan migration gerekmez; üçüncü taraf bağımlılıklar ve destek matrisi değişmez. Önce core, sonra MCP ve isteğe bağlı OTel yayımlanır; son arşivlerle iki runtime kontrolü ve yayın sonrası exact registry tüketimi doğrulanır. Pack yayın kanıtı değildir. Sorunda son kabul edilen exact sürüme pinleyip uygulamayı yeniden başlatın; 0.2.0'a dönüş bilinen hataları da geri getirir.

## Published 0.2.0 history / Yayımlanmış 0.2.0 geçmişi

**Core, MCP and optional OpenTelemetry 0.2.0 were published on npm on 2026-09-11 with owner authorization.** 0.1.0 remains available for rollback. GitHub source delivery and the separate Cloud rollout are recorded in [BUILD_STATUS.md](../BUILD_STATUS.md). Pre1.0 minor version is intentionally breaking. Keep package names. No Cloud code/assets/credentials belong in MIT packages.

## API change / API değişikliği

Before: `createPulse({endpoint,writeKey,environment})`.
After: `createPulse({environment,exporter:createHttpExporter({endpoint,authorization:\`Bearer ${writeKey}\`})})` with the factory from `@reviseflow/pulse-core/http`. Preserve the exact full endpoint and server-only key. For local value, choose memory/JSONL instead; no key. Do not fall back to a Cloud URL when env is missing. Validate required environment in the application. The new core rejects old endpoint/writeKey options so a migration mistake cannot silently send somewhere unintended.

Providing exporter now enables development/test by default. Existing production/staging behavior with explicit HTTP remains observed-handler semantics. Choose `enabled:false` deliberately for off; missing exporter disables with diagnostics. Core no longer owns quota plan codes.429 retries with a finite budget; future events recover after quota resets.401/403 requires explicit `resume()` after upstream repair, or `reconfigure({exporter:newHttpExporter})` after key changes. Neither requires wrapping again. Already dropped data is irrecoverable.

Event schema_version1 unchanged; optional adapter_version added; sdk_version derives package version; plain core adapter is custom. Collector must accept optional provenance before0.2 rollout. The old event fields/meaning stay readable. No historical data rewrite is required. Host/source tool labels and identity policy are unchanged; write-key rotation does not rotate the separate HMAC key. Flush/shutdown are bounded and concurrent-safe; the app still owns lifecycle hooks. strict:true is development opt-in; default instrumentation installation now fails open with safe diagnostics.

TR:0.2 kurucu API'si kırıcıdır; eski endpoint/key yeni HTTP exporter'a taşınır. Development/test artık açık exporter ile etkinleşir. Olay v1 anlamı aynı kalır. Önce collector ek metadata'yı kabul etmelidir. Auth/kota toparlanması aynı instance ile yapılır; atılan veri geri gelmez.

## Historical 0.1.0 → 0.2.0 rollout and rollback / Geçmiş yayın sırası ve geri alma

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

Pack is a local archive operation, not publish. `verify:pack` performs npm pack dry-run vs actual member parity, allowlisted files, licenses/metadata/source-boundary scan, isolated actual installation, types, real MCP offline/HTTP, duplicated packages and ESM bundle checks. It retains hashes/evidence. The checkout examples also run from source. `verify:registry` is a read-only post-publication comparison and **must not pass before the release exists**.

GitHub private vulnerability reporting is enabled and was verified through the repository API on 2026-09-11; see SECURITY.md. Before owner-authorized npm publication, verify registry access and ownership without exposing tokens, record changelog/tag/source hashes and retain rollback package pins. The historical 0.2.0 publication used the existing npm owner account and interactive passkey verification; no credentials or security settings were changed. No pricing/plan/domain/pilot success claims were changed.

TR: Pack yalnız yerel arşivdir. Registry doğrulaması exact sürüm yayımlandıktan sonra yapılır. Geçmiş 0.2.0 yayını sahip yetkisiyle tamamlandı; bu kayıt 0.2.1 yayın kanıtı değildir. Güncel yayın durumu BUILD_STATUS.md içindedir.
