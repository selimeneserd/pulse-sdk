# Reported token usage / Bildirilen token kullanımı

Pulse 0.3.0 records optional, provider-reported model usage independently of MCP
handler observations. Use `createPulseCore` without an MCP server, or the same
`recordUsage` API on `createPulse`. Select memory, JSONL, your own HTTP collector,
or the optional OTel exporter. No Pulse Cloud account, credential, subscription,
LLM package or external request is required for local recording.

**TR:** Pulse 0.3.0, sağlayıcının bildirdiği isteğe bağlı model kullanımını MCP
handler gözlemlerinden ayrı kaydeder. MCP olmadan `createPulseCore`, MCP ile
`createPulse` üzerindeki aynı API kullanılabilir. Yerel kayıt Cloud hesabı,
anahtarı, abonelik, LLM paketi veya dış istek gerektirmez.

## Standalone local fixture / Bağımsız yerel test örneği

The numbers below are explicitly labelled test data. In an application, pass only
usage actually returned by the model provider; do not use these numbers as a
fallback. Pulse does not call a provider or read application response content.

**TR:** Aşağıdaki sayılar test verisidir. Uygulamada yalnız model sağlayıcısının
döndürdüğü gerçek kullanımı verin; bu sayıları yedek veri olarak kullanmayın.
Pulse sağlayıcı çağırmaz veya uygulama yanıtının içeriğini okumaz.

```ts
import { createPulseCore } from '@reviseflow/pulse-core';
import { createMemoryExporter } from '@reviseflow/pulse-core/memory';

const exporter = createMemoryExporter();
const pulse = createPulseCore({ environment: 'test', exporter });

// TEST FIXTURE ONLY / YALNIZCA TEST VERİSİ
pulse.recordUsage({
  provider: 'example-provider',
  model: 'example-model',
  inputTokens: 120,
  outputTokens: 30,
  cachedInputTokens: 80,
});

await pulse.flush();
const usage = exporter.getEvents().find(e => e.kind === 'model_usage.recorded');
await pulse.shutdown();
```

## API and meaning / API ve anlamı

`recordUsage({provider, model, inputTokens?, outputTokens?, cachedInputTokens?,
reasoningOutputTokens?, toolName?})` records one model invocation. It returns
`void`; recording is bounded best effort. Invalid metadata increments safe
diagnostics and is omitted, without throwing a telemetry failure into your app.

| Field | Contract / Sözleşme |
| --- | --- |
| `provider`, `model` | Fixed safe labels, not URLs, prompts, account IDs or arbitrary metadata / Güvenli sabit etiketler |
| `inputTokens`, `outputTokens` | At least one must be supplied; integer 0–2,147,483,647 / En az biri verilmelidir |
| Missing count | Wire value `null`, never an inferred zero / Eksik değer sıfır değildir |
| `cachedInputTokens` | Requires known `inputTokens`; must not exceed it / Bilinen input toplamının alt kümesi |
| `reasoningOutputTokens` | Requires known `outputTokens`; must not exceed it / Bilinen output toplamının alt kümesi |
| `toolName` | Optional safe association when recording outside a scoped handler / Kapsam dışında isteğe bağlı tool ilişkisi |

Normalize provider-specific fields in your application. Input must include cached
input, and output must include reasoning output, when reporting their subsets.
Do not add subsets to their parents again. Emit once after final usage is known;
streaming cumulative updates would otherwise be separate events and overcount.
An application retry that makes another model call is another invocation; an
export retry reuses the same event ID. Calling `recordUsage` again creates a new
event, so application-side duplication is not automatically detected.

**TR:** Sağlayıcı alanlarını uygulamanızda normalize edin. Cache input içinde,
reasoning output içinde olmalıdır; alt kümeleri tekrar toplamayın. Streaming
sonunda nihai kullanım bilindiğinde bir kez kaydedin. Yeni model çağrısı ayrı
kullanımdır; exporter retry aynı olay ID'sini korur. API'yi tekrar çağırmak yeni
olay üretir; uygulamanın tekrar bildirimini Pulse kendiliğinden ayıramaz.

## Tool correlation / Tool ilişkisi

The MCP wrapper creates an async-scoped invocation ID for each observed handler.
Usage recorded through that same Pulse instance inside the handler inherits the
mapped tool name and invocation ID. Concurrent and nested scopes stay isolated.
`withToolContext({toolName}, fn)` offers this boundary to custom adapters without
depending on MCP. Outside a scope, the invocation ID stays `null`; no host or
conversation identity is inferred. Optional account context uses the existing
project-scoped HMAC configuration and `withContext`.

**TR:** MCP sarmalayıcısı her handler için asenkron kapsamlı çağrı ID'si üretir.
Handler içinde aynı Pulse instance'ıyla kaydedilen kullanım, eşlenmiş tool adı ve
çağrı ID'sini alır. Paralel ve iç içe kapsamlar ayrıdır. Özel adaptörler MCP
bağımlılığı olmadan `withToolContext({toolName}, fn)` kullanabilir. Kapsam dışında
ID null kalır; istemci veya konuşma kimliği tahmin edilmez.

## Measurement and compatibility / Ölçüm ve uyumluluk

`tool_handler.completed` and `model_usage.recorded` are separate event kinds.
Handler count, duration, outcome and unique-account metrics remain handler-only.
`observed` counts handlers; `observedUsage` counts valid usage observations.
Queue/export counters include both kinds. One model call can lead to several
tools, and one tool can call several models; never copy a model total onto every
tool. Unknown input/output stays unknown, and complete totals require both.

Pulse cannot discover the Claude/Cursor/other host's model usage through a server
wrapper. `maxTokens`, payload size and text tokenization are not provider usage.
No prompts, raw arguments, results, authentication tokens, headers or errors are
copied. Labels can still reveal business information; supply safe fixed labels.
Best-effort observed counts are not an invoice, audit ledger or full-coverage
guarantee. OTel sampling can further reduce observed exported spans.

Custom exporters should narrow `PulseEvent` by `kind`; the named
`PulseHandlerEvent` and `PulseUsageEvent` types are also exported. An independent
collector must adopt the updated public schema **and subset comparisons** before
usage records are enabled. The public JSON Schema checks types/required fields;
cross-field `cached <= input` and `reasoning <= output` need an additional check.
Existing handler events remain valid, including older SDK records without an
invocation ID. There is no automatic remote collector upgrade.

**TR:** Handler ve model kayıtları ayrı olay türleridir. `observed` handler,
`observedUsage` geçerli usage gözlemi sayar; kuyruk/export sayaçları iki türü
kapsar. İstemcinin model tüketimi sunucu sarmalayıcısıyla keşfedilmez. Ham içerik
toplanmaz. Gözlemlenen sayılar fatura veya tam kapsama garantisi değildir.
Özel exporter `kind` ile türü ayırmalı; collector yeni açık şemayı ve cache/reasoning
alt küme kontrollerini uygulamalıdır. Eski handler olayları geçerlidir.
