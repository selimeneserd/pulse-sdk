# OTel mapping and Python gate / OTel eşleme ve Python kararı

Research date2026-09-11. Installed/registry verified: `@opentelemetry/api1.9.1`, `@opentelemetry/sdk-trace-base2.11.0`; the latter is test/example-only. Its public BasicTracerProvider/SimpleSpanProcessor APIs are read from installed declarations and exercised with a real in-memory provider.

The official [MCP semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/mcp.md) are marked **Development**; the [old documentation URL](https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/) points to the new GenAI repository. It distinguishes client/server operation spans and operation/session duration metrics, and defines `gen_ai.tool.name` for tool metadata. Do not treat developing conventions as a universal stable contract. This package deliberately emits a narrower INTERNAL handler observation, not an MCP request span or MCP operation-duration metric.

| Pulse | Export mapping |
|---|---|
|one completed handler|one INTERNAL `pulse.tool_handler` span|
|tool_name|`gen_ai.tool.name` (only this shared tool attribute)|
|duration_ms|span duration; `pulse.handler.duration_ms`, **never mcp.*.operation.duration**|
|occurred_at|span end; start reconstructed by subtracting monotonic duration, not original trace parent|
|outcome|`pulse.handler.outcome`; ERROR status only tool_error/handler_exception, no exception message|
|scope/coverage|`pulse.measurement.scope=handler_completion`, `pulse.coverage=unknown`|
|origin/event ID|`pulse.origin=pulse-exporter`, stable `pulse.event.id`|
|identity/client/prompt/arguments/result/stack/headers|omitted|

Inject a tracer; Pulse does not install a global provider or select an OTLP endpoint. OTel sampling and delivery are external. `accepted` means the local tracer handoff completed, including a sampled-away/no-op span; it cannot mean remote persistence or known population coverage. Do not use trace-derived totals for billing. The local dedup window is bounded recent IDs, not durable idempotency. No inbound OTel processor exists, so client/server/delegation spans cannot be re-counted and emitted spans cannot feed back into Pulse. Test coverage: real MCP→Pulse→actual OTel provider; replay ID→one span; sampler off→zero exported spans; raw-field rejection. Run `pnpm exec vitest run tests/otel.test.ts` and `node examples/otel.ts`.

TR: Resmî semantik hâlâ Development durumundadır. Bizim span handler kapsamını taşır; tam MCP gecikmesine çevrilmez. OTel kabulü yerel tracer'a teslimdir, uzak depolama/örnekleme kapsamı garantisi değildir. Kimlik/ham içerik aktarılmaz. Ters span alımı yoktur, çift sayım/döngü üretilmez.

## Python/FastMCP decision / Python kararı

Official [FastMCP middleware](https://gofastmcp.com/servers/middleware) exposes `on_call_tool(context,call_next)` and layered request hooks. Its operation boundary can include behavior outside a bare handler; blindly labelling middleware latency as v1 handler duration would be wrong. Official [FastMCP telemetry](https://gofastmcp.com/servers/telemetry) already provides OTel integration and client/server/delegation span hierarchies. A reverse bridge must select one authoritative server boundary, reject duplicate/delegation/client/own-origin spans, and explicitly handle unknown sampling; wholesale attribute copying is forbidden.

Decision: implement Pulse→OTel now; defer OTel→Pulse/Python bridge until pilot demand and a tested mapping exist. Python HMAC vector verification is **contract portability evidence only, not Python SDK/FastMCP support**. No Python package, installed FastMCP fixture or compatibility claim is shipped. Gate:2 independent pilot requests + maintained public hook + real client invocation + schema/identity/cancel/privacy conformance + ownership of lifecycle. Prefer a thin public middleware/OTel bridge; do not clone the TypeScript retry runtime without evidence.

TR: FastMCP açık middleware ve OTel sunuyor. Middleware sınırı handler ile aynı varsayılamaz. Şimdilik yalnız Pulse→OTel uygulanır. Python'daki kimlik vektörü testi Python SDK desteği değildir. Talep ve gerçek entegrasyon testleri olmadan ikinci SDK başlatılmaz.
