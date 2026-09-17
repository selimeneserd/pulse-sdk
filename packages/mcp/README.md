# @reviseflow/pulse

The MIT-licensed MCP adapter for Pulse. Observe tool handlers through the official MCP **2.0.0** public registration API, with a local or explicitly selected exporter.

**Version 0.2.2 · MIT · Node.js 24 ESM.** The API requires an explicit exporter. [Migrate from 0.1.0](https://github.com/selimeneserd/pulse-sdk/blob/main/docs/migration-release.md) before upgrading an existing integration.

**TR:** **0.2.2 · MIT · Node.js 24 ESM.** API açık bir exporter gerektirir; mevcut 0.1.0 kurulumu için önce geçiş rehberini okuyun.

## Install / Kurulum

```sh
npm install --save-exact @reviseflow/pulse@0.2.2 @reviseflow/pulse-core@0.2.2 @modelcontextprotocol/server@2.0.0
```

Check the [compatibility guide](https://github.com/selimeneserd/pulse-sdk/blob/main/docs/compatibility.md) before changing an existing project's MCP version. Pulse does not upgrade it for you.

## Instrument a server

```ts
import { McpServer } from '@modelcontextprotocol/server';
import { createPulse } from '@reviseflow/pulse';
import { createMemoryExporter } from '@reviseflow/pulse-core/memory';

const exporter = createMemoryExporter();
const pulse = createPulse({ environment: 'development', exporter });
const server = pulse.wrapServer(
  new McpServer({ name: 'my-mcp', version: '1.0.0' }),
);

server.registerTool('health', {}, () => ({
  content: [{ type: 'text', text: 'ok' }],
}));
```

Wrap **before registration**, then connect through your existing transport. At application shutdown, call `await pulse.shutdown({ timeoutMs: 2_000 })`. For a complete, runnable client/server example with JSONL output, use the [local quickstart](https://github.com/selimeneserd/pulse-sdk#run-locally).

Node.js 24 ESM and MCP 2.0.0 are the tested scope. The adapter preserves handler values, rejection identity, `this`, cancellation and registration updates. Setup failures default to fail-open diagnostics; `strict: true` opts into setup exceptions. `enabled: false` returns the original server without instrumentation. Default double wrapping observes one event. See the compatibility guide for PromiseLike edge cases and unsupported environments.

Events describe observed **handler completions**, not full MCP request outcomes or business success. Memory/JSONL need no Cloud account or key. HTTP requires an explicit collector URL. Core does not depend on Cloud.

## Local CLI

Version 0.2.2 provides the `pulse` executable through npm's installed bin symlink. MCP checks use the target project's default Node ESM resolution, including hoisted installations and import-only exports. A broken or unsupported nearest package stays visible as a diagnostic; Pulse does not silently select another version.

TR: 0.2.2, npm'nin kurduğu komut symlink'i üzerinden `pulse` komutunu çalıştırır. MCP kontrolü, hoisted kurulumlar ve yalnız import export'ları dahil hedef projenin varsayılan Node ESM çözümlemesini kullanır. En yakın paket bozuksa veya desteklenmiyorsa bu durum diagnostics'te gösterilir; başka sürüm sessizce seçilmez.

```sh
npx --no-install pulse init --dry-run
npx --no-install pulse doctor
npx --no-install pulse dev --file pulse-events.jsonl
```

`init` previews one thin integration file and never overwrites different content. `doctor` separates static checks from runtime evidence. `dev` summarizes bounded local JSONL data. All output goes to **stderr**, protecting MCP stdio. Add `--locale tr` for Turkish output. See the [CLI guide](https://github.com/selimeneserd/pulse-sdk/blob/main/docs/tooling.md) for write flags, limits and lifecycle setup.

## Türkçe

MCP 2.0.0 için ince bir adaptördür. Yukarıdaki npm komutuyla tam sürümleri kurun. Mevcut MCP sürümünü değiştirmeden önce uyumluluk rehberini okuyun.

Sunucuyu araç kaydından **önce** sarmalayın; mevcut transport ile bağlayın ve uygulama kapanışında sınırlı `shutdown` çağrısını kullanın. Yerel bellek/JSONL için hesap veya anahtar gerekmez. Cloud isteğe bağlıdır.

Kurulum hataları varsayılan olarak uygulamayı bozmaz; `strict: true` ile geliştirme sırasında hata alınabilir. `enabled: false` sunucuyu yamalamaz. Ölçüm, handler tamamlanmasını temsil eder; tam MCP veya iş başarısı iddia etmez. CLI stderr kullanır, dosyaları habersiz ezmez ve `--locale tr` seçeneğini destekler.

[Türkçe başlangıç](https://github.com/selimeneserd/pulse-sdk/blob/main/README.tr.md) · [Gizlilik ve yaşam döngüsü](https://github.com/selimeneserd/pulse-sdk/blob/main/docs/privacy-lifecycle.md)

## Practical guides / Uygulamalı rehberler

[English guides](https://pulse.reviseflow.io/en/blog) · [Türkçe rehberler](https://pulse.reviseflow.io/tr/blog) · [Local SDK source / Yerel SDK kaynağı](https://github.com/selimeneserd/pulse-sdk#run-locally)

The MIT SDK works independently of the proprietary Cloud service. Explore the [labelled Cloud demo](https://pulse.reviseflow.io/en/demo) when shared views and managed retention become useful; package installation does not create a subscription.

MIT SDK, kapalı kaynak Cloud servisinden bağımsızdır. Ortak görünümler ve yönetilen saklama gerektiğinde [etiketlenmiş Cloud demosunu](https://pulse.reviseflow.io/tr/demo) inceleyin; paket kurulumu abonelik oluşturmaz.
