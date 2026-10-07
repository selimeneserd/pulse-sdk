# 0002 — Reported model usage / Bildirilen model kullanımı

Status: accepted by the owner on 2026-10-07; implementation and npm publication
authorized before the independent Cloud consumer update.

**TR:** Durum: 7 Ekim 2026'da sahip tarafından kabul edildi. Önce bağımsız SDK ve
npm yayını, ardından ayrı Cloud tüketicisinin güncellenmesi yetkilendirildi.

The existing SDK observes MCP handler completions and has no numeric model usage
API. A handler may make several model calls; several tools may follow one host
model call. Handler count cannot establish token consumption or host usage.

Decision: add optional `recordUsage` to independent core/MCP instances. A separate
strict `model_usage.recorded` event carries provider-reported numbers only, with
optional async-scoped tool-invocation correlation. Memory, JSONL, generic HTTP and
OTel remain explicitly selected sinks. No provider SDK or Cloud dependency is
introduced. Caller attests provider-reported usage and emits each invocation once.

Rejected alternatives: tokenizing raw prompts/results would expand the privacy
surface and would not establish provider-billed usage. Adding model totals to
every handler would double-count shared calls and mix measurement boundaries.
Automatic host-token inference is unsupported by the observed server boundary.

Compatibility: existing handlers/events remain valid. `PulseEvent` becomes a
discriminated union; custom exporters/collectors must handle `kind` and apply the
new schema plus cache/reasoning subset comparisons. Missing counts stay null,
details remain subsets, exporter failures stay best effort and fail open.

Evidence: golden/negative fixtures, raw-field/accessor rejection, async context
isolation, real MCP calls, independent collector checks, OTel/CLI, and clean packed
consumers on Node 24.11.1/24.20.0. BUILD_STATUS.md records executed release gates.

**TR:** Ayrı ve isteğe bağlı usage olayı yalnız sağlayıcının bildirdiği sayıları
taşır. Ham prompt/sonuç tokenize edilmez; model toplamı her tool'a kopyalanmaz.
SDK Cloud'dan bağımsızdır. Eski handler olayları geçerli kalır; exporter ve
collector `kind` ayrımı ile yeni şema/alt küme kontrollerini uygulamalıdır. Eksik
sayılara sıfır atanmaz. Gerçek doğrulamalar BUILD_STATUS.md içindedir.
