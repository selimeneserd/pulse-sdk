# SDK delivery status / SDK teslim durumu

## 0.2.1 release execution — 2026-09-12 / Yayın işlemi

The owner authorized commit/push, npm publication, README updates and production deployment. All three SDK manifests and generated provenance now use **0.2.1**; no dependency/support range changed. Frozen offline installation passes with the existing workspace-link lockfile. EN/TR and package README installation commands target the exact patch version.

`pnpm check` passed **205/205 on Node 24.11.1 and 24.20.0** for this exact version. Packed consumers passed on both runtimes; source commit/CI and npm/registry verification are in progress. The owner completed the existing npm passkey authentication; no security setting or credential was replaced. Cloud0.2.1 integration/deployment is being prepared separately. Final receipts will be recorded here after actual completion.

TR: Sahip commit/push, npm yayını, README ve deploy işlemini yetkilendirdi. Üç paket ve üretilen sürüm bilgileri0.2.1; iki Node sürümünde205 test geçti. Yayın/CI/registry ve ayrı Cloud dağıtımı sürüyor; yalnızca gerçek tamamlanma kanıtı başarılı sayılacak.

## Historical local correctness checkpoint / Önceki yerel düzeltme kaydı

## Correctness fixes — 2026-09-12 / Doğruluk düzeltmeleri

**Local work complete; these fixes are not published, pushed or deployed.** Starting HEAD `e304c641f0e09b91b401366e247f73f22550ccfa`, clean working tree. All three reported issues reproduced against real repository code and are fixed with regressions. Source manifests remain 0.2.0; live registry metadata still reports published 0.2.0. Changed local tarballs are development artifacts, not that registry release. See [current implementation evidence](docs/implementation-status.md#correctness-task--2026-09-12).

- `pnpm check`: **205/205 tests on each of Node 24.11.1 and 24.20.0**, plus build, typecheck, public contracts/conformance, strict core import boundaries and 12 identity vectors. No standalone lint script is configured.
- `pnpm verify:pack --evidence …`: **passed on both runtimes**, three packages each; real npm CLI normal/hoisted/nested layouts, offline real MCP memory/JSONL, public types, ESM bundle/duplicate copies, explicit loopback HTTP and pack/publish dry-runs. [24.11.1 evidence](docs/evidence/correctness-packed-node24.11.1.json), [24.20.0 evidence](docs/evidence/correctness-packed-node24.20.0.json). Package hashes match across both runtimes.
- HTTP 120s minimum with 60s per-delay cap: one request, no retry, one retry-budget drop. Real HTTP 200ms/250ms minimums are preserved; partial accepted/duplicate/permanent rejections are removed once. Fake-clock regressions also cover exact boundaries, dates, fractional/huge values and shutdown.
- Existing benchmark completed 84 measurements on Node 24.11.1; no new performance guarantee. `pnpm audit --prod`: no known vulnerabilities at this run. Current code has no new runtime dependencies or wire/API migration; CLI status fields are additive.

**Release blockers/manual gates:** owner-selected unused exact patch version, aligned package/generated/lock metadata and rerun gates for that exact version, separate publication authorization, fresh CI for this change, registry integrity/clean-consumer check after publication, and independent human/workspace acceptance. No current CI or corrected registry-release success is claimed. pnpm-style symlink fixtures are synthetic; no new pnpm end-to-end certification. Cloud ingestion/tenant/quota behavior was not exercised here. [Release steps](docs/migration-release.md), [pending human acceptance](docs/pilots.md).

TR: Üç hata güncel kodda yeniden üretildi ve kapatıldı. İki Node sürümünde 205 test ve gerçek üç tarball tüketicisi geçti. Bu düzeltmeler yalnız yereldir; commit/push/publish/deploy yapılmadı. Manifest 0.2.0 bırakıldı, registry'deki 0.2.0 farklı eski baytlardır. Exact patch seçimi, yayın/CI/registry ve insan kabulü bekliyor; Cloud veya pnpm uçtan uca başarı iddiası yoktur.

## Historical 0.2.0 delivery / Önceki 0.2.0 teslimi

Updated 2026-09-11. **All three MIT packages are published on npm as 0.2.0 (`latest`).** See the [registry consumer evidence](docs/evidence/registry-consumer.json). Release commit [`99d635a`](https://github.com/selimeneserd/pulse-sdk/commit/99d635a57c7d4279ad55b92615ed0ded05a68eb3) is pushed and tagged [`v0.2.0`](https://github.com/selimeneserd/pulse-sdk/releases/tag/v0.2.0). [GitHub CI](https://github.com/selimeneserd/pulse-sdk/actions/runs/34630503040) passed on Ubuntu 24.04 with Node 24.11.1 and 24.20.0, including clean packed consumers. The optional Cloud collector accepted both SDK versions through real public HTTPS, with durable storage and preserved original MCP results.

## Verified implementation

- Independent MIT core with zero third-party runtime dependencies; explicit exporters for memory, JSONL, generic HTTP and optional OpenTelemetry.
- Public event/batch/ack contracts, bounded dispatcher, recovery/lifecycle controls, MCP adapter and EN/TR CLI.
- **133 tests passed on Node 24.11.1 and 24.20.0**, with TypeScript, package builds, public contract conformance, import graph checks and 12 Node/Python identity vectors.
- All three packed packages passed clean consumer installation on both runtimes, including the installed CLI, network-disabled real MCP, HTTP, duplicate package copies and an ESM bundle.
- An 84-run benchmark records CPU, memory, event-loop delay, latency, throughput and overflow/shutdown behavior. It is one-machine evidence, not a universal overhead or zero-loss guarantee.

Detailed scope and original/final test logs: [implementation status](docs/implementation-status.md), [compatibility](docs/compatibility.md), [benchmark](docs/benchmark.md), [packed consumer](docs/evidence/packed-consumer.json).

## Release boundaries

GitHub source and npm publication are separate. The 0.2.0 constructor requires an explicit exporter and is a breaking change from npm 0.1.0. Follow the [migration guide](docs/migration-release.md). The SDK requires no Cloud account, key or subscription for local collection. Cloud is an optional independent consumer and remains proprietary.

No Python SDK, browser/Edge/CJS support, arbitrary MCP versions, external host certification or successful human pilots are claimed. GitHub private vulnerability reporting is enabled and verified; see [SECURITY.md](SECURITY.md). Real customer pilots remain pending.

## Türkçe

**Üç MIT paketi npm üzerinde 0.2.0 (`latest`) olarak yayımlandı.** SDK kaynakları GitHub’a gönderildi; Ubuntu üzerinde iki Node sürümünün CI kontrolleri geçti. Ayrı Cloud servisi dağıtıldı; iki SDK sürümüyle gerçek genel HTTPS akışı, kalıcı kayıt ve özgün MCP sonucu doğrulandı.

İki Node sürümünde 133 test, tip/build kontrolleri, üç gerçek paket tüketicisi, çevrimdışı MCP, HTTP, CLI ve kimlik vektörleri geçti. Yerel kullanım Cloud hesabı veya anahtarı istemez. Yeni kurucu açık exporter gerektirir; Daha geniş runtime desteği ve kullanıcı pilotları doğrulanmış sayılmaz.
