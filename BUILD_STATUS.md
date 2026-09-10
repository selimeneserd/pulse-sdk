## Cloud continuation / Cloud devam durumu —2026-09-10

M1–M4 are locally verified in the independent private sibling cloud repository: real PostgreSQL/auth/collector, analytics, exports/deletion recovery, members/operators and billing/mail contracts with EN/TR browser flows. The cloud's default test gate now runs this packed SDK with an official MCP client/server and proves the original result, private-canary exclusion and durable cloud count. SDK M0 support boundary and70-test/packed-consumer proof are unchanged. Owner authorized cloud deployment to pulse.reviseflow.io on ReviseFlow VPS; M5 Linux load and final deployment verification are active. SDK/npm/public repository publication and live payment charges remain unauthorized. The pinned SDK CI workflow is implemented but has not run on a remote repository. See the sibling cloud BUILD_STATUS for current full-product results and external gates.

# Pulse build checkpoint / Geliştirme durumu

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

## Exact next task / Sıradaki görev

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

Resume: Read both AGENTS.md files, pulse-cloud CODEX_MASTER_PROMPT.md, all referenced
contracts and this checkpoint. Reuse M0 evidence, inspect actual Git/test state, and start
M1's first durable database/auth task. Do not re-create the reference UI first.
