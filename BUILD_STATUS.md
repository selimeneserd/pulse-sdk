# SDK delivery status / SDK teslim durumu


## 0.2.2 release prepared — 2026-09-17 / Yayın hazırlandı

Owner authorized npm publication and the separate Cloud deployment. EN/TR root
and package READMEs, package manifests and generated version metadata now align
at **0.2.2**. Runtime behavior, public API, wire schema, dependencies and the
supported matrix are unchanged from 0.2.1, apart from reported package versions.

- Node **24.11.1 and 24.20.0**: **205 tests each**, build, types, contracts,
  boundaries, conformance and 12 identity vectors passed.
- **106 packed-consumer commands per runtime** passed; all three archive hashes
  are identical across runtimes. Archive allowlists, metadata, MIT boundaries,
  CLI, real MCP, OTel and offline publish dry-runs passed.
- [Preparation receipt](docs/evidence/release-0.2.2-preparation-20260917.json).
  CI, npm authentication/publication and registry consumer verification are the
  remaining release gates. The existing npm session expired; the owner completes
  npm's security-key authentication. No security settings are weakened.
- The lower Node runtime was not initially installed on this Mac; the first
  invocation stopped before testing. After installing official Node 24.11.1,
  its complete check and packed-consumer run passed.

**TR:** 0.2.2 yayını yetkilendirildi; iki Node sürümünde 205'er test ve 106'şar
paket tüketim komutu geçti. API veya bağımlılık değişikliği yoktur. Bu kayıt
hazırlık kanıtıdır; npm yayını ve Cloud deploy'u ayrı sonuçlarla doğrulanır.

## Organic discovery implementation — 2026-09-17 / Organik keşif çalışması

EN/TR README paths now explain the local SDK, verified tutorials and optional
Cloud handoff. Package descriptions and keywords identify MCP analytics,
monitoring, TypeScript and optional OpenTelemetry. GitHub About/topics were
updated with the same scope. Existing live guide URLs are used; no README points
to the new Cloud SDK route before deployment. No runtime, dependency, version,
license or public API changed; no Cloud source was copied into this public repo.

- Node 24.20.0 / pnpm 11.22.0: `pnpm check` passed **205 tests**, build/typecheck,
  core boundaries, conformance and **12 identity vectors**.
- `pnpm verify:pack` passed **106 commands** against all three packages, including
  package contents, metadata, real consumer examples, CLI and offline publication
  dry-runs. [Sanitized evidence](docs/evidence/seo-pack-20260917.json).
- npm publication and production deployment were not performed. Registry 0.2.1
  retains its previously published bytes; edited package metadata requires a
  separately authorized future release. The supported Node matrix is unchanged;
  this task's local run used 24.20.0, with the CI matrix checked after push.

**TR:** EN/TR rehber bağlantıları, paket açıklamaları/anahtar kelimeleri ve GitHub
keşif bilgileri güncellendi. 205 test ve 106 paket tüketim komutu geçti. SDK MIT
ve Cloud’dan bağımsız kaldı. npm yayını veya üretim deploy’u yapılmadı.

## 0.2.1 published and verified — 2026-09-12 / Yayımlandı ve doğrulandı

**All three MIT packages are published on npm as 0.2.1 (`latest`).** The owner authorized Git delivery, publication, README updates and deployment. [Source commit `2756fcd`](https://github.com/selimeneserd/pulse-sdk/commit/2756fcd6310636632c4c7c0b8e244a6e0d601ae8) is pushed; [CI 34676226310](https://github.com/selimeneserd/pulse-sdk/actions/runs/34676226310) passed on Ubuntu with Node 24.11.1 and 24.20.0. The [v0.2.1 release](https://github.com/selimeneserd/pulse-sdk/releases/tag/v0.2.1) includes the final documentation and receipts; package bytes derive from that tested source commit.

- `pnpm check`: **205/205 tests on each supported Node runtime**, with build, types, contracts, boundaries, conformance and identity vectors. Final logs: [24.11.1](docs/evidence/release-0.2.1-check-node24.11.1.txt), [24.20.0](docs/evidence/release-0.2.1-check-node24.20.0.txt).
- Packed consumers passed on both runtimes; all three archive hashes match across the matrix. The npm release used those exact archives in core → MCP → optional OTel order.
- `pnpm verify:registry`: **106 commands passed per runtime**, comparing exact registry integrity before clean npm installation and testing real offline MCP memory/JSONL, installed CLI normal/hoisted/nested resolution, public types, ESM/duplicate packages, OTel and explicit loopback HTTP. [24.11.1 receipt](docs/evidence/release-0.2.1-registry-node24.11.1.json), [24.20.0 receipt](docs/evidence/release-0.2.1-registry-node24.20.0.json), [publication ledger](docs/evidence/npm-release-0.2.1-20260912.json).

EN/TR root and all package READMEs describe exact 0.2.1 installation. No third-party dependency, supported runtime, public signature or wire contract changed; no migration is needed from 0.2.0. The workspace-link lockfile is unchanged and frozen offline installation passed. Existing npm passkey authentication was used; no credential or security setting was replaced. The separate proprietary Cloud repository owns its deployment and live evidence. Independent human/workspace pilots remain pending; automated checks do not establish human acceptance.

TR: Üç MIT paketi npm üzerinde **0.2.1 (`latest`)** olarak yayımlandı; kaynak commit'i pushlandı ve iki Node sürümlü GitHub CI geçti. Her runtime'da205 kaynak testi, gerçek paket tüketimi ve yayın sonrası registry'den temiz kurulumun106 komutu geçti. Arşivler yayımlanan baytlarla eşleşir. EN/TR ve paket README'leri güncellendi. Yeni bağımlılık, destek aralığı veya migration yoktur. Ayrı Cloud deposu kendi deploy/canlı kanıtlarını kaydeder; bağımsız insan pilotları yapılmış sayılmaz.

## Historical local correctness checkpoint / Önceki yerel düzeltme kaydı

### Correctness fixes — 2026-09-12 / Doğruluk düzeltmeleri

**Historical snapshot before the owner-authorized 0.2.1 release: local work was complete; these fixes had not yet been published, pushed or deployed.** Starting HEAD `e304c641f0e09b91b401366e247f73f22550ccfa`, clean working tree. All three reported issues reproduced against real repository code and are fixed with regressions. Source manifests remain 0.2.0; live registry metadata still reports published 0.2.0. Changed local tarballs are development artifacts, not that registry release. See [current implementation evidence](docs/implementation-status.md#correctness-task--2026-09-12).

- `pnpm check`: **205/205 tests on each of Node 24.11.1 and 24.20.0**, plus build, typecheck, public contracts/conformance, strict core import boundaries and 12 identity vectors. No standalone lint script is configured.
- `pnpm verify:pack --evidence …`: **passed on both runtimes**, three packages each; real npm CLI normal/hoisted/nested layouts, offline real MCP memory/JSONL, public types, ESM bundle/duplicate copies, explicit loopback HTTP and pack/publish dry-runs. [24.11.1 evidence](docs/evidence/correctness-packed-node24.11.1.json), [24.20.0 evidence](docs/evidence/correctness-packed-node24.20.0.json). Package hashes match across both runtimes.
- HTTP 120s minimum with 60s per-delay cap: one request, no retry, one retry-budget drop. Real HTTP 200ms/250ms minimums are preserved; partial accepted/duplicate/permanent rejections are removed once. Fake-clock regressions also cover exact boundaries, dates, fractional/huge values and shutdown.
- Existing benchmark completed 84 measurements on Node 24.11.1; no new performance guarantee. `pnpm audit --prod`: no known vulnerabilities at this run. Current code has no new runtime dependencies or wire/API migration; CLI status fields are additive.

**Release blockers/manual gates:** owner-selected unused exact patch version, aligned package/generated/lock metadata and rerun gates for that exact version, separate publication authorization, fresh CI for this change, registry integrity/clean-consumer check after publication, and independent human/workspace acceptance. No current CI or corrected registry-release success is claimed. pnpm-style symlink fixtures are synthetic; no new pnpm end-to-end certification. Cloud ingestion/tenant/quota behavior was not exercised here. [Release steps](docs/migration-release.md), [pending human acceptance](docs/pilots.md).

TR: Üç hata güncel kodda yeniden üretildi ve kapatıldı. İki Node sürümünde 205 test ve gerçek üç tarball tüketicisi geçti. Bu düzeltmeler yalnız yereldir; commit/push/publish/deploy yapılmadı. Manifest 0.2.0 bırakıldı, registry'deki 0.2.0 farklı eski baytlardır. Exact patch seçimi, yayın/CI/registry ve insan kabulü bekliyor; Cloud veya pnpm uçtan uca başarı iddiası yoktur.

## Historical 0.2.0 delivery / Önceki 0.2.0 teslimi

Updated 2026-09-11. **At the 2026-09-11 release, all three MIT packages were published on npm as 0.2.0 (`latest` at that time).** See the [registry consumer evidence](docs/evidence/registry-consumer.json). Release commit [`99d635a`](https://github.com/selimeneserd/pulse-sdk/commit/99d635a57c7d4279ad55b92615ed0ded05a68eb3) is pushed and tagged [`v0.2.0`](https://github.com/selimeneserd/pulse-sdk/releases/tag/v0.2.0). [GitHub CI](https://github.com/selimeneserd/pulse-sdk/actions/runs/34630503040) passed on Ubuntu 24.04 with Node 24.11.1 and 24.20.0, including clean packed consumers. The optional Cloud collector accepted both SDK versions through real public HTTPS, with durable storage and preserved original MCP results.

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

## Historical 0.2.0 Turkish summary / Önceki Türkçe özet

**11 Eylül 2026 kaydında üç MIT paketi npm üzerinde 0.2.0 olarak yayımlandı; o tarihte `latest` buydu.** SDK kaynakları GitHub’a gönderildi; Ubuntu üzerinde iki Node sürümünün CI kontrolleri geçti. Ayrı Cloud servisi dağıtıldı; iki SDK sürümüyle gerçek genel HTTPS akışı, kalıcı kayıt ve özgün MCP sonucu doğrulandı.

İki Node sürümünde 133 test, tip/build kontrolleri, üç gerçek paket tüketicisi, çevrimdışı MCP, HTTP, CLI ve kimlik vektörleri geçti. Yerel kullanım Cloud hesabı veya anahtarı istemez. Yeni kurucu açık exporter gerektirir; Daha geniş runtime desteği ve kullanıcı pilotları doğrulanmış sayılmaz.
