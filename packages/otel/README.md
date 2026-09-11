# @reviseflow/pulse-otel

An optional MIT-licensed exporter that sends Pulse handler observations to **your OpenTelemetry tracer**. Core and the MCP adapter do not import this package.

**Version 0.2.0 · MIT · Node.js 24 ESM.** The API requires an explicit exporter. [Migrate from 0.1.0](https://github.com/selimeneserd/pulse-sdk/blob/main/docs/migration-release.md) before upgrading an existing integration.

**TR:** **0.2.0 · MIT · Node.js 24 ESM.** API açık bir exporter gerektirir; mevcut 0.1.0 kurulumu için önce geçiş rehberini okuyun.

## Install / Kurulum

```sh
npm install --save-exact @reviseflow/pulse-otel@0.2.0 @reviseflow/pulse-core@0.2.0 @opentelemetry/api@1.9.1
```

Pass your configured tracer to the exporter, then inject it into Pulse:

```ts
import type { Tracer } from '@opentelemetry/api';
import { createPulseCore } from '@reviseflow/pulse-core';
import { createOtelExporter } from '@reviseflow/pulse-otel';

export function pulseForTracer(tracer: Tracer) {
  return createPulseCore({
    environment: 'production',
    exporter: createOtelExporter({ tracer }),
  });
}
```

The same exporter can be passed to the MCP adapter's `createPulse`. A full example with a real MCP client/server and an in-memory OTel provider is in [`examples/otel.ts`](https://github.com/selimeneserd/pulse-sdk/blob/main/examples/otel.ts). Run `pnpm example:otel` from the SDK checkout.

## Semantics and limits

- Emits one INTERNAL `pulse.tool_handler` span per event with allowlisted metadata. Handler duration is **not** full MCP request latency.
- Does not copy identities, arguments, results, exceptions or prompts. Sampling and coverage remain unknown.
- Acceptance means local tracer handoff, not remote receipt. Your application owns provider configuration, flush and shutdown; Pulse does not mutate the global provider.
- Replay protection keeps 1,000 recent IDs by default. Same ID/body returns duplicate; a changed body returns `EVENT_ID_CONFLICT`. A failed tracer handoff does not become success on replay.
- Cache entries contain fixed-size SHA-256 fingerprints produced by Node's crypto API, not serialized event bodies. There is no durable or exactly-once guarantee.
- Wire timestamps JavaScript cannot represent, including leap seconds, return `INVALID_EVENT`. Explicit epoch tuples preserve representable historical times; the original numeric handler duration remains an attribute. No current-time fallback is created.

This is a Node.js integration. Reverse ingestion from existing spans is not implemented. See the [OTel mapping and scope](https://github.com/selimeneserd/pulse-sdk/blob/main/docs/otel-mapping.md) and [privacy guide](https://github.com/selimeneserd/pulse-sdk/blob/main/docs/privacy-lifecycle.md).

## Türkçe

Kendi OTel tracer'ınızı verin ve exporter'ı `createPulseCore` veya MCP adaptörünün `createPulse` fonksiyonuna aktarın. Yukarıdaki npm komutuyla tam sürümleri kurun. Tam gerçek MCP örneği için depoda `pnpm example:otel` çalıştırın.

Yalnızca izinli handler metadata'sı INTERNAL span olarak aktarılır. Handler süresi tam MCP gecikmesi değildir. Kimlik, argüman, sonuç, hata veya prompt kopyalanmaz. Örnekleme kapsamı bilinmiyor olarak kalır. Kabul, yerel tracer'a teslimdir; uzak teslim ve provider yaşam döngüsü uygulamanın sorumluluğudur.

Tekrar önbelleği varsayılan olarak son 1.000 ID ile sınırlıdır. Aynı ID/gövde tekrar sayılır; farklı gövde `EVENT_ID_CONFLICT` döndürür. Başarısız teslimin tekrarı başarılı alındı sayılmaz. Olay gövdeleri yerine Node kripto API'siyle sabit boyutlu SHA-256 parmak izleri tutulur.

JavaScript'in temsil edemediği zamanlar, artık saniye dahil, `INVALID_EVENT` döndürür; güncel saatle yedek veri üretilmez. Bu paket Node.js içindir, mevcut span'lardan ters veri alımı uygulanmamıştır. Kalıcı veya exactly-once teslim garantisi yoktur.
