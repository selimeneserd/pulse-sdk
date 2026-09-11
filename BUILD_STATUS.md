# Current SDK and cloud status / Güncel SDK ve cloud durumu

Updated **2026-09-10**. SDK M0 is verified: **70 tests plus independent packed consumer proof**; implementation commit `e45c0bdcb2f9ec5e72ad7ef28553b505209ddee2`. Its exact MCP2.0.0/Node24.20.0 support boundary remains unchanged. Later SDK commits contain CI and status documentation only; no packages or public repositories were published. The pinned CI workflow exists but has not run remotely.

**2026-09-11 initial Git delivery verification:** `pnpm check` passed all70 tests (641ms), both package builds and typecheck. `pnpm verify:pack` passed again at07:09UTC; the refreshed `docs/evidence/packed-consumer.json` records the real EN/TR MCP consumers. Both tarball SHA256 values match the preceding verification. Full Git-history Gitleaks scan returned0 findings. The owner requested committing/pushing both sibling repositories; the existing `selimeneserd/pulse-sdk` GitHub target was verified private and empty. No SDK source, compatibility promise, license, package visibility or npm publication behavior changed.

**TR:** İlk Git aktarımı öncesinde70 SDK testi ve bağımsız paket tüketicisi yeniden geçti. Paket özetleri önceki doğrulamayla aynı, Git geçmişinde secret bulgusu yok. Sahip iki deponun commit/push işlemini istedi; hedef SDK deposu özel ve boş olarak doğrulandı. SDK kaynak kodu ve destek kapsamı değişmedi; npm yayını yapılmadı.

The independent private cloud sibling is now actually deployed at **https://pulse.reviseflow.io**. Runtime commit `338c249070f6d6b06678b3f28071dc066ea098e5` passed239 application tests,108 ops tests,20 public HTTP probes and3 real public Chrome security cases. An authenticated official MCP fixture exported through public HTTPS into real PostgreSQL and read the correct EN/TR count; private canaries were absent and the disposable account was removed. The final-schema R2 backup was retrieved, decrypted only on the owner's Mac and restored into a new isolated PostgreSQL database. This is a remote collector acceptance proof, not ChatGPT/Claude-host certification or a new SDK adapter/runtime promise.

**TR:** MIT SDK'nın70 testlik ve bağımsız paket tüketicisiyle doğrulanmış M0 kapsamı korunuyor. Ayrı özel cloud deposu https://pulse.reviseflow.io adresine dağıtıldı; gerçek MCP çağrısı genel HTTPS üzerinden kalıcı veritabanına ulaştı ve EN/TR sayaç doğrulandı. Üretim yedeğinin R2'den alınarak ayrı veritabanına kurtarılması da geçti. Ücretli checkout kapalı; merchant, gerçek alıcıya e-posta teslimi, dış istemci/pilot ve ikinci çevrimdışı kurtarma anahtarı kopyası açık kapılardır. Milyon olayda1,5 saniyelik önerilen analitik hedefi henüz karşılanmıyor; doğrulanmış100k trial kapsamı korunuyor.

Next SDK work requires a concrete new compatibility target or external host fixture. Do not infer stdio, Python, Edge, serverless, arbitrary SDK versions or genuine host support from this Node HTTP proof. The cloud BUILD_STATUS.md contains full current product evidence and next external/engineering tasks. Public npm publication and live payments require separate authorization.

The remainder is the **historical M0 checkpoint**. Statements below about unimplemented M1–M5 describe that earlier checkpoint and have been superseded by the current status above.

# Historical M0 checkpoint / Tarihli M0 kaydı

Updated: 2026-09-10. **M0: FIXTURE_VERIFIED (local Node/Streamable HTTP scope).**
M1–M5 remain PLANNED. The product as a whole is not complete or production-ready.

**TR:** M0 yerel Node/Streamable HTTP kapsamında doğrulandı. M1–M5 henüz
uygulanmadı; ürün bütünü tamamlanmış veya üretime hazır değildir.

## Exact worktrees / Çalışma dizinleri

- Private cloud: `/Users/selimenes/Documents/ALONE/pulse-cloud`
- MIT, public-intended SDK: `/Users/selimenes/Documents/ALONE/pulse-sdk`
- Both were existing independent Git repositories. No parent repo or remote was created.
- Supplied planning files and landing/dashboard references were preserved. Their data,
  SDK snippets and internal timelines remain design prototypes.
- Local Git checkpoints are recorded in each repository's latest commit; no push/publication.

## Implemented / Uygulanan

- Exact upstream and registry baseline: MCP server/client/node2.0.0; protocol2026-07-28;
  Node24.20.0 LTS, pnpm11.22.0, TypeScript7.0.2, Vitest5.0.0, Zod4.6.1.
- MIT SDK `packages/core`: strict allowlisted immutable event, optional local HMAC identity
  and request-scoped ALS, bounded asynchronous exporter, partial acknowledgement,
  stable-ID retries, HTTP413 split, Retry-After, diagnostics and bounded shutdown.
- MIT SDK `packages/mcp`: exact-version guard, public per-instance registration hook/facade,
  types/this/results/errors preserved; update, rename, disable/enable/remove preserved.
- Real official MCP client/server on loopback HTTP, with success/error/exception,
  input_required, cancellation, concurrent verified test identities and privacy cases.
- EN/TR SDK docs, fixture output and configuration/compatibility messages. No production
  web interface exists yet; full first-party EN/TR remains mandatory in subsequent work.
- Private cloud root is private:true / UNLICENSED; SDK code/license is MIT. SDK packages
  are still private:true with a failing publication hook until owner approval.
- Independent tarball consumer test and package allowlist/scoped privacy scan.

**TR:** Gerçek MCP istemcisi/sunucusu ile ölçüm, gizlilik, hata davranışı ve bağımsız
paket kurulumu doğrulandı. Ham argüman, sonuç, hata metni veya kimlik gönderilmiyor.

## Actual commands and results / Gerçek komutlar ve sonuçlar

Run SDK commands in the SDK worktree using `fnm exec --using 24.20.0` on this Mac:

| Command | Actual result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS, all 3 workspace projects up to date |
| `pnpm check` | PASS: both builds, strict typecheck, **70/70 tests**, 4 files; final run 976ms |
| `node scripts/verify-packed.mjs` / `pnpm verify:pack` | PASS: two inspected tarballs, clean unrelated npm consumer, types, EN/TR real HTTP fixture, exactly one accepted event, schema exports |
| `node examples/fixture.ts` and `PULSE_LOCALE=tr node examples/fixture.ts` | PASS: caller receives original sum5; one sanitized event emitted |
| cloud: `python3 contracts/verify_golden.py` | PASS: counts, identities, outcomes, exact quantiles, breakdowns and duplicate IDs; arithmetic fixture only, no SQL/database claim |

Test breakdown: 44 core/exporter, 11 adapter/public registration, 11 actual MCP HTTP,
4 strict public schema tests. Compile-only negative registration tests also pass.
Exact commands/results: [m0-verification.json](docs/evidence/m0-verification.json).
Exact packed file hashes, sanitized sample events, EN/TR output evidence and simulated
version-drift rejection: [packed-consumer.json](docs/evidence/packed-consumer.json).
See [dependency baseline](docs/DEPENDENCY_BASELINE.md) and
[compatibility](docs/SDK_COMPATIBILITY.md) for upstream links and precise boundaries.

Reviewed failures were fixed before this checkpoint: foreign-realm Promise settlement,
subclass registration bypass, observed cancellation classification, concurrent flush/shutdown
cutoff loss,413 retry-budget reset, and changing completion getters. Zod versions were
unified and Node ambient types made explicit for TypeScript7. Intermediate failed checks
are documented in the verification report; the final full check passed.

## Known boundaries / Bilinen sınırlar

- The M0 collector in `pulse-sdk/examples/fixture.ts` is an explicitly labelled **ephemeral
  test sink**. It has no durable database, production key lifecycle, tenant isolation,
  trial, quota or billing implementation. It must never serve a production project.
- Measurement covers instrumented handler execution only. tools/list, unknown tools,
  pre-handler input/auth rejection and post-handler output/transport validation are outside it.
- Output-schema failure can follow an observed successful handler return; this is documented
  and tested, not represented as transport success or business success.
- Client names are self-reported hints. Real ChatGPT/Claude hosts, host_subject identity,
  Next.js/serverless lifecycle, stdio, Python, Edge, external remote host and broader
  versions/runtimes are PLANNED/unverified, not supported release claims.
- Registration functions captured before wrapping and direct handle handler/executor mutation
  bypass the supported path. Wrap first, then use public registration/update methods.
- Auth/quota rejection stops the exporter instance; recreate it after resolving key/quota.
  Outages, overflow, long Retry-After or process shutdown can drop best-effort telemetry.
- npm metadata calls upstream MCP MIT, but actual verified archives include an Apache/MIT
  transition and documentation terms. Preserve upstream notices; full transitive license
  review and owner attribution remain release gates.

**TR:** Test toplayıcısı üretim altyapısı değildir. Kimliksiz/eksik metadata durumları boş
kalır. Sunucunun bütün HTTP trafiği veya iş sonucunun tamamı ölçülüyor iddiası yoktur.

## Blockers and owner gates / Engeller ve sahip onayları

No remaining local M0 execution blocker. Registry and local runtime access worked.
Missing M1 functionality is planned work, not a simulated successful implementation.

Owner-controlled gates still open: final brand/domain/npm scope/license attribution,
public repository/npm publication, production host/secrets/DNS/email, merchant approval
and live payments, production deployment, real external host/pilot access. No package was
published, public repository created, live payment charged or production deployment made.
These gates do not prevent local M1 database/auth development.

## Historical next task (completed) / Tarihli sonraki görev (tamamlandı)

**M1: one genuine database-backed vertical slice.** Begin in pulse-cloud by reading its
AGENTS/master/docs and the PostgreSQL skill, then verify/install exact database/server/auth
packages. Build PostgreSQL/Drizzle migrations with separate auth/app/event responsibilities,
tenant repository checks and non-bypass RLS tests. Implement Better Auth account/session,
owner workspace, project and one-time write-key creation/revoke/rotate. The real SDK must
send into a durable collector transaction (dedup+usage+trial admission after commit), then
an authenticated minimal EN/TR overview must query the actual accepted count.

Run the two-tenant negative probes, rollback/duplicate/key-revocation tests and real SDK
flow before marking M1 verified. No full UI redesign until this flow passes. Keep the M0
fixture for compatibility tests; do not promote its in-memory collector or demo data into
production code. Next.js/serverless lifecycle gets a separate exact-version test before
advertising that adapter.

**TR:** Sonraki iş M1: PostgreSQL/Drizzle, gerçek hesap/oturum, çalışma alanı/proje,
yazma anahtarı ve transaction ile kalıcı olay kabulü. Sonuç gerçek veritabanından okunan
EN/TR sayaçta gösterilmeli; iki kiracılı yetki testleri geçmeden M1 tamamlanmış sayılmaz.

Historical resume text: Read both AGENTS.md files, pulse-cloud CODEX_MASTER_PROMPT.md, all referenced
contracts and this checkpoint. Reuse M0 evidence, inspect actual Git/test state, and start
M1's first durable database/auth task. Do not re-create the reference UI first.
