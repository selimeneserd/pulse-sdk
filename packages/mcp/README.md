# @reviseflow/pulse

The MIT-licensed MCP adapter for Pulse. Observe tool handlers through the official MCP **2.0.0** public registration API, with a local or explicitly selected exporter.

> **Source API: 0.2.0. npm release: 0.1.0.** The new API is not yet published to npm. Use the checkout or its local archives; [migrate existing 0.1.0 integrations](https://github.com/selimeneserd/pulse-sdk/blob/main/docs/migration-release.md) before changing versions.
>
> **TR:** Kaynak API **0.2.0**, npm sürümü **0.1.0**. Yeni API henüz npm'de yoktur; depoyu veya yerel arşivleri kullanın. Mevcut kurulumlarda önce geçiş rehberini okuyun.

## Install a local candidate

From the SDK checkout:

```sh
pnpm --filter @reviseflow/pulse-core pack --pack-destination ./artifacts
pnpm --filter @reviseflow/pulse pack --pack-destination ./artifacts
```

In a **new** consumer project, replace `/path/to/pulse-sdk` with the checkout's location:

```sh
npm install \
  /path/to/pulse-sdk/artifacts/reviseflow-pulse-core-0.2.0.tgz \
  /path/to/pulse-sdk/artifacts/reviseflow-pulse-0.2.0.tgz \
  @modelcontextprotocol/server@2.0.0
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

The installed package provides `pulse`:

```sh
pulse init --dry-run
pulse doctor
pulse dev --file pulse-events.jsonl
```

`init` previews one thin integration file and never overwrites different content. `doctor` separates static checks from runtime evidence. `dev` summarizes bounded local JSONL data. All output goes to **stderr**, protecting MCP stdio. Add `--locale tr` for Turkish output. See the [CLI guide](https://github.com/selimeneserd/pulse-sdk/blob/main/docs/tooling.md) for write flags, limits and lifecycle setup.

## Türkçe

MCP 2.0.0 için ince bir adaptördür. Yukarıdaki yerel arşivleri SDK deposunda oluşturun ve yeni tüketici projede yollarını değiştirerek kurun. Mevcut MCP sürümünü değiştirmeden önce uyumluluk rehberini okuyun.

Sunucuyu araç kaydından **önce** sarmalayın; mevcut transport ile bağlayın ve uygulama kapanışında sınırlı `shutdown` çağrısını kullanın. Yerel bellek/JSONL için hesap veya anahtar gerekmez. Cloud isteğe bağlıdır.

Kurulum hataları varsayılan olarak uygulamayı bozmaz; `strict: true` ile geliştirme sırasında hata alınabilir. `enabled: false` sunucuyu yamalamaz. Ölçüm, handler tamamlanmasını temsil eder; tam MCP veya iş başarısı iddia etmez. CLI stderr kullanır, dosyaları habersiz ezmez ve `--locale tr` seçeneğini destekler.

[Türkçe başlangıç](https://github.com/selimeneserd/pulse-sdk/blob/main/README.tr.md) · [Gizlilik ve yaşam döngüsü](https://github.com/selimeneserd/pulse-sdk/blob/main/docs/privacy-lifecycle.md)
