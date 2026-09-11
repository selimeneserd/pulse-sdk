# @reviseflow/pulse-core

The MIT-licensed event contract and bounded dispatcher behind Pulse. Observe handler completions with **zero third-party runtime dependencies**, then choose an exporter explicitly.

**Version 0.2.0 · MIT · Node.js 24 ESM.** The API requires an explicit exporter. [Migrate from 0.1.0](https://github.com/selimeneserd/pulse-sdk/blob/main/docs/migration-release.md) before upgrading an existing integration.

**TR:** **0.2.0 · MIT · Node.js 24 ESM.** API açık bir exporter gerektirir; mevcut 0.1.0 kurulumu için önce geçiş rehberini okuyun.

## Install / Kurulum

```sh
npm install --save-exact @reviseflow/pulse-core@0.2.0
```

This standalone example records an explicitly supplied test observation in memory:

```ts
import { createPulseCore } from '@reviseflow/pulse-core';
import { createMemoryExporter } from '@reviseflow/pulse-core/memory';

const exporter = createMemoryExporter();
const pulse = createPulseCore({ environment: 'test', exporter });

pulse.complete({
  toolName: 'example_health',
  durationMs: 1,
  outcome: 'tool_success',
});

await pulse.flush();
const events = exporter.getEvents();
await pulse.shutdown();
```

For a real MCP client/server call, follow the repository's [local quickstart](https://github.com/selimeneserd/pulse-sdk#run-locally). Core accepts observations supplied by an adapter or your application; it does not instrument handlers by itself.

## Boundaries

- Node.js 24 ESM is supported, with 24.11.1 and 24.20.0 tested. Native crypto and `AsyncLocalStorage` are required; browser and edge support are not claimed.
- The root entry does not load an HTTP, filesystem or OTel exporter. Choose `/memory`, `/jsonl`, `/http`, or implement `PulseExporter` yourself.
- Missing exporter configuration disables observation and reports `missing_exporter`. `createNoopExporter()` is an explicit choice to discard events.
- Queue bytes, event counts, retries and shutdown deadlines are bounded. Telemetry failure must not replace application results. There is no durable or exactly-once delivery guarantee.
- Raw arguments, results, prompts, error messages, headers and arbitrary properties are excluded. Optional HMAC identity is pseudonymous, not anonymous.

JSON Schemas are available under `/contracts`. `/conformance` provides canonical event validation and bounded exporter checks. See [contracts](https://github.com/selimeneserd/pulse-sdk/blob/main/docs/contracts.md), [privacy and lifecycle](https://github.com/selimeneserd/pulse-sdk/blob/main/docs/privacy-lifecycle.md), and [migration](https://github.com/selimeneserd/pulse-sdk/blob/main/docs/migration-release.md).

## Türkçe

Pulse Core, açık olay sözleşmesini ve sınırlı dispatcher'ı sağlar. Üçüncü taraf runtime bağımlılığı yoktur. Node.js 24 ESM üzerinde çalışır; 24.11.1 ve 24.20.0 doğrulanmıştır. Tarayıcı veya edge desteği iddia edilmez.

Yukarıdaki npm komutuyla tam 0.2.0 sürümünü kurun. Bellek örneği açıkça tanımlanmış bir test gözlemidir. Gerçek MCP çağrısı için [Türkçe başlangıç rehberini](https://github.com/selimeneserd/pulse-sdk/blob/main/README.tr.md) kullanın.

Exporter açıkça seçilir; yerel kullanım için hesap, anahtar veya ağ gerekmez. Eksik exporter diagnostics'te görünür. Kuyruk ve yeniden denemeler sınırlıdır; handler tamamlanması tam MCP veya iş başarısı değildir. Ham içerik alınmaz, HMAC anonimlik sağlamaz ve atılan olaylar geri getirilemez.
