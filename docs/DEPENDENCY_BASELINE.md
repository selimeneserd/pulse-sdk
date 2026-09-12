# Dependency baseline / Bağımlılık temeli

0.2.1 release preparation, 2026-09-12: third-party dependency versions and the support matrix remain unchanged. Pulse core/MCP/optional OTel versions align at 0.2.1; generated version metadata and workspace lock references are release metadata changes. The pre-release installed versions, engines, starting SHA and then-current lock SHA-256 are recorded in `evidence/correctness-baseline-20260912.json`; that hash belongs to the earlier 0.2.0 checkout and is not a 0.2.1 lock hash. Final release validation and exact evidence are tracked in [BUILD_STATUS.md](../BUILD_STATUS.md).

The declared CI matrix remains Node 24.11.1/24.20.0, MCP 2.0.0 and pnpm 11.22.0. CLI uses built-in Node `findPackageJSON`, default ESM `import.meta.resolve` and `import.meta.main`, exercised by the correctness regressions on both declared runtimes; no new dependency is added. Historical 0.2.0 CI results below do not establish 0.2.1 release validation.

TR: 0.2.1 hazırlığında üçüncü taraf bağımlılıklar ve destek matrisi değişmez; üç Pulse paketinin sürümü, üretilen metadata ve workspace lock referansları hizalanır. İlk correctness kaydındaki lock hash önceki 0.2.0 checkout'una aittir. Son yayın doğrulaması ve exact kanıtlar BUILD_STATUS.md içindedir. Yeni CLI API'leri iki Node sürümünde regresyon testleriyle doğrulandı; yeni bağımlılık eklenmedi.

Verified locally2026-09-11 from installed package manifests and committed lockfile. Node24.11.1 and24.20.0 actual test fixtures; pnpm11.22.0. Core zero third-party runtime dependencies; native Node crypto/AsyncLocalStorage. MCP peer stays exact2.0.0 because no other actual MCP release was tested. OTel peer is isolated1.9.1; trace SDK only dev/example. No private registry or Cloud package. Browser/Edge/Python/CJS not claimed.

| Dependency | Installed |
|---|---|
|`@modelcontextprotocol/server`|2.0.0|
|`@modelcontextprotocol/client`|2.0.0|
|`@modelcontextprotocol/node`|2.0.0|
|`@modelcontextprotocol/core`|2.0.0|
|`typescript`|7.0.2|
|`vitest`|5.0.0|
|`zod`|4.6.1|
|`ajv`|8.20.0|
|`ajv-formats`|3.0.1|
|`@types/node`|24.13.4|
|`@opentelemetry/api`|1.9.1|
|`@opentelemetry/sdk-trace-base`|2.11.0|
|`tsx`|4.23.13|
|`esbuild`|0.28.2|

Installed official MCP README and dist declarations are the API baseline: public McpServer.registerTool/update, ServerContext.mcpReq.signal, InMemoryTransport; StreamableHTTP fixture negotiated2026-07-28. The actual package metadata is2.0.0, not an inferred version from prior notes. OTel official docs/source research lives in otel-mapping.md. Exact versions, engines, license and lock hash: evidence/dependency-baseline-0.2.0.json.

CI proposes Ubuntu24.04 matrix Node24.11.1/24.20.0 with same locked dependency graph. Local macOS results do not claim the remote CI already ran. Both independent packed consumer runs are retained; initial downloads can use network, runtime offline guard is separate. esbuild0.28.2 is an explicitly allowed build-time dev tool; no runtime update/telemetry feature was added.

TR: Sürümler kurulu manifestlerden doğrulandı. Core runtime bağımlılığı sıfırdır. İki Node sürümünde gerçek test/paket tüketimi çalışır; başka MCP sürümü test edilmediği için peer genişletilmedi. CI tanımı uzaktaki çalışmanın tamamlandığı anlamına gelmez. Önceki0.1 kayıtları evidence altında tarihsel kanıttır.
