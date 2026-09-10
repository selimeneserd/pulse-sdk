# Pulse SDK — M0, unpublished / yayımlanmamış

MIT SDK and MCP adapter for metadata-only **observed tool-handler executions**.
This is a local compatibility milestone. The package names are provisional;
no npm publication, public repository, hosted collector or customer dashboard
is available from this repository. License attribution and package scope still
need owner review before publication. Packages remain `private: true` as an
additional publication guard; local packing is supported.

**TR:** Yalnızca gözlenen araç işleyicilerinin metadata bilgisini üreten MIT SDK.
Bu aşama yerel uyumluluk kanıtıdır. Paketler henüz yayımlanmadı; barındırılan
toplayıcı, kayıt/ödeme veya çalışan müşteri paneli iddiası yoktur. Paket adları ve
lisans sahipliği yayımdan önce sahibi tarafından onaylanmalıdır.

## Run the real fixture / Gerçek düzeneği çalıştır

Use Node **24.20.0**, pnpm **11.22.0** and the committed lockfile:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm fixture
PULSE_LOCALE=tr pnpm fixture
pnpm verify:pack
```

If this Mac's shell selects a different Node version, prefix commands with
`fnm exec --using 24.20.0`. `examples/fixture.ts` runs the official MCP client
and server over real loopback Streamable HTTP, protocol **2026-07-28**. It
prints the caller's original `sum: 5` result and the sanitized emitted event.
Its clearly labelled collector is an **ephemeral test sink**, never production
storage. The private cloud repository will own durable admission in M1.

**TR:** Düzenek resmî MCP istemci ve sunucusunu gerçek yerel HTTP üzerinden
çalıştırır. Özgün `sum: 5` sonucu ve arındırılmış olay gösterilir. Test
toplayıcısı yalnızca bellekte çalışır; üretimde kalıcı veri kabulünün yerine
geçmez. Kalıcı kabul, özel cloud reposunda M1 kapsamında geliştirilecektir.

## Integration surface / Entegrasyon yüzeyi

After locally packing/installing the two SDK packages (the independent
consumer test demonstrates this), instrument **before any registration**:

```ts
import { McpServer } from '@modelcontextprotocol/server'; // exactly 2.0.0
import { createPulse } from '@pulse-sdk/mcp'; // local tarball, not published

const pulse = createPulse({
  endpoint: process.env.PULSE_BATCH_ENDPOINT!, // full /v1/batch URL
  writeKey: process.env.PULSE_WRITE_KEY!,      // server only
  environment: 'production',
});
const server = pulse.wrapServer(new McpServer({ name: 'my-server', version: '1.0.0' }));
server.registerTool('health', {}, () => ({ content: [{ type: 'text', text: 'ok' }] }));
// Use the server in the customer's existing HTTP entry point.
// At a verified response-completion/shutdown lifecycle:
await pulse.flush({ timeoutMs: 2000 });
```

The endpoint must be explicitly supplied, HTTPS outside loopback. Development
and test telemetry are disabled unless `enabled: true`. Defaults: 2-second
timer and request timeout, at most 100 events/256 KiB per batch, 1,000 pending
events/1 MiB per instance including in-flight events, three bounded retries.
`getDiagnostics()` exposes local counts without payloads or credentials.
`shutdown()` flushes within its bound and closes the SDK; it installs no
process exit listeners. Collector delivery is asynchronous and best effort.
No process-crash/frozen-runtime delivery guarantee is made.

**TR:** Tam batch adresi açıkça verilir; yerel adresler dışında HTTPS zorunludur.
Development/test için açık etkinleştirme gerekir. Varsayılan kuyruk 1.000 olay
ve 1 MiB ile sınırlıdır; her istek en fazla 100 olay ve 256 KiB içerir.
Toplayıcı kesintisi araç sonucunu değiştirmez. Süreç kapanması veya dondurulan
çalışma zamanında sıfır kayıp garantisi yoktur.

## Privacy and limits / Gizlilik ve sınırlar

No args, result bodies, prompts, raw errors, headers, IPs, arbitrary properties
or host identity are captured. Tool names and explicitly supplied release
labels can still disclose business information: map/exclude sensitive names
with `mapToolName(name)`, returning `null` to omit a tool. Client capture is
off by default; `captureClient: true` records only bounded known labels and
safe version hints from the public MCP envelope/handshake. It does not prove
use by a real ChatGPT/Claude installation.

Identity is off by default. If deliberately enabled, supply
`identity: {secret, projectNamespace, epoch}` with a separate stable secret
of at least 32 bytes, then run already-authenticated request handling inside
`pulse.withContext({actorId, conversationId?}, handler)`. Values are HMACed
locally with separate account/conversation domains and never exported raw.
These are observed accounts, not people. Changing the secret, namespace or
epoch breaks identity continuity; write-key rotation does not.

**TR:** Argüman, sonuç içeriği, sohbet, ham hata, header, IP veya keyfi özellik
toplanmaz. Hassas araç adları eşlenmeli ya da hariç bırakılmalıdır. İstemci
metadatası ve kimlik ayrı ayrı açık onayla etkinleştirilir. Kimlik, doğrulanmış
istek bağlamından alınır ve ayrı kalıcı proje sırrıyla yerelde HMAC işleminden
geçer. Bunlar insan sayısı değildir. Kimlik sırrı/namespace/epoch değişirse
hesap geçmişinin sürekliliği bozulur; yazma anahtarı değişimi kimliği etkilemez.

Read [compatibility evidence](docs/SDK_COMPATIBILITY.md) for exact tested
behavior, public registration hook details and blind spots. In particular,
pre-handler rejection and post-handler output/transport failures are outside
this metric. Pre-bound registration functions and direct `handler`/`executor`
mutation are unsupported; use the public registration/update methods.
Only MCP **2.0.0**, Node **24.20.0**, and loopback Streamable HTTP are verified.
Next.js/serverless, stdio, Python, Edge and real host installations are not
claimed. This SDK never imports the private sibling `pulse-cloud`.

**TR:** Tam doğrulama kapsamı uyumluluk belgesindedir. Handler öncesi ret ve
sonrası çıktı/taşıma hatası bu ölçümün dışındadır. Next.js/serverless, stdio,
Python, Edge ve gerçek istemci platformları test edilmeden destekleniyor
olarak gösterilmez. Bu SDK özel cloud reposundan kod içe aktarmaz.
