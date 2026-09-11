# @reviseflow/pulse

Google Analytics, but for your MCP. MIT-licensed analytics for **observed tool-handler calls**, with bounded, best-effort delivery and no raw tool payload capture.

**TR:** MCP sunucunuz için analitik. Gözlenen araç işleyicisi çağrılarını ölçer; ham araç içeriği toplamaz. Gönderim sınırlıdır ve en iyi çaba esasına dayanır. MIT lisanslıdır.

## Install / Kurulum

```sh
npm install --save-exact @reviseflow/pulse@0.1.0 @modelcontextprotocol/server@2.0.0
```

The adapter installs `@reviseflow/pulse-core@0.1.0` automatically. Verified baseline:
Node **24.20.0**, official MCP server **2.0.0**, Streamable HTTP, protocol **2026-07-28**.
The exact peer is intentional; other MCP versions and runtimes are not verified.

**TR:** Adaptör `@reviseflow/pulse-core@0.1.0` paketini otomatik kurar. Doğrulanmış temel:
Node **24.20.0**, resmî MCP sunucusu **2.0.0**, Streamable HTTP ve **2026-07-28** protokolü.
Diğer MCP sürümleri ve çalışma ortamları doğrulanmış değildir.

[English setup guide](https://pulse.reviseflow.io/en/docs) · [Türkçe kurulum rehberi](https://pulse.reviseflow.io/tr/docs)

## Connect / Bağlantı

Create a project and a Test write key in Pulse. Set `PULSE_COLLECTOR_URL` to
`https://pulse.reviseflow.io/v1/batch` and store `PULSE_WRITE_KEY` only in your server environment.
Never commit the key or put it in browser code. Write keys cannot read analytics.

**TR:** Pulse içinde proje ve Test yazma anahtarı oluşturun. `PULSE_COLLECTOR_URL` değerini
`https://pulse.reviseflow.io/v1/batch` olarak ayarlayın. `PULSE_WRITE_KEY` yalnızca sunucu
ortamında saklanmalıdır; Git'e veya tarayıcı koduna koymayın. Yazma anahtarı analitik okuyamaz.

```ts
import { McpServer } from '@modelcontextprotocol/server';
import { createPulse } from '@reviseflow/pulse';
const pulse = createPulse({
  environment: 'test',
  enabled: true,
  endpoint: process.env.PULSE_COLLECTOR_URL!,
  writeKey: process.env.PULSE_WRITE_KEY!,
});
const server = pulse.wrapServer(new McpServer({ name: 'my-server', version: '1.0.0' }));
server.registerTool('health', {}, () => ({ content: [] }));
```

Wrap before tool registration/connection. This replaces the instance's public
`registerTool` method and returns a facade with correctly bound other methods.
Public handle `update`, rename, enable/disable and remove are preserved.
No upstream private registry or global/prototype patch is used. Registrations
through pre-bound functions and direct handle internals mutation are unsupported.

Observed handler duration uses a monotonic clock. One terminal event per
execution; results and exceptions preserve the original handler behavior.
`isError` → `tool_error`; thrown exception → `handler_exception`; explicit
`input_required`, observed request abort and unknown envelopes stay separate.
Input rejection before the handler and output validation after it are outside
this boundary. Original tool content is never exported.

**TR:** MIT lisanslı MCP adaptörü. Sunucuyu araç kaydından ve bağlantıdan
önce sarmalayın. Yalnızca bu nesnenin açık kayıt metodu değiştirilir; özel
SDK kayıtları okunmaz, global/prototip yaması yapılmaz. Kayıt güncelleme,
yeniden adlandırma, etkinleştirme ve kaldırma korunur. Ölçüm handler sınırıdır;
öncesindeki girdi reddi ve sonrasındaki çıktı doğrulaması kapsam dışıdır.
Kimlik ve istemci metadatası varsayılan olarak kapalıdır. Ham tool içeriği
dışarı aktarılmaz. Next.js/serverless ve diğer platformlar henüz doğrulanmadı.

All failures originating in telemetry delivery remain isolated from tool
execution. Diagnostic/compatibility errors provide English/Turkish messages;
machine identifiers stay locale-independent.

## Verify and shut down / Doğrulama ve kapanış

Call a real tool through your MCP client, then at a controlled verification point:

**TR:** MCP istemcisinden gerçek bir araç çağırın; ardından kontrollü bir doğrulama noktasında:

```ts
await pulse.flush({ timeoutMs: 2000 });
const diagnostics = pulse.getDiagnostics();
```

Diagnostics are local counters. Confirm the accepted event in your project's **Test → Live events** dashboard; local counters do not prove database storage.
After stopping new requests and waiting for active handlers, call `await pulse.shutdown()` during graceful shutdown. No process listeners are installed automatically. See the setup guide for optional account identity, client labels and delivery limits.

**TR:** Tanılama yerel sayaçlardan oluşur. Kabul edilen olayı projenizin **Test → Canlı olaylar** panelinde doğrulayın; yerel sayaçlar veritabanı kaydını kanıtlamaz.
Yeni istekleri durdurup etkin işleyicileri bekledikten sonra kontrollü kapanışta `await pulse.shutdown()` çağırın. Otomatik süreç dinleyicisi kurulmaz. İsteğe bağlı hesap kimliği, istemci etiketleri ve gönderim sınırları için kurulum rehberine bakın.
