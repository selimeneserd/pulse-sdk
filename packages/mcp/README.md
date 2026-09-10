# @pulse-sdk/mcp — local M0 package / yerel M0 paketi

MIT, unpublished. Exact peer: `@modelcontextprotocol/server@2.0.0`.
Node 24.20.0, Streamable HTTP, protocol 2026-07-28 tested by the repository
fixture. Install with the locally packed `@pulse-sdk/core` tarball. No hosted
collector or production package publication is implied.

```ts
import { McpServer } from '@modelcontextprotocol/server';
import { createPulse } from '@pulse-sdk/mcp';
const pulse = createPulse({
  environment: 'production',
  endpoint: process.env.PULSE_BATCH_ENDPOINT!,
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

**TR:** Henüz yayımlanmamış MIT paketi. Sunucuyu araç kaydından ve bağlantıdan
önce sarmalayın. Yalnızca bu nesnenin açık kayıt metodu değiştirilir; özel
SDK kayıtları okunmaz, global/prototip yaması yapılmaz. Kayıt güncelleme,
yeniden adlandırma, etkinleştirme ve kaldırma korunur. Ölçüm handler sınırıdır;
öncesindeki girdi reddi ve sonrasındaki çıktı doğrulaması kapsam dışıdır.
Kimlik ve istemci metadatası varsayılan olarak kapalıdır. Ham tool içeriği
dışarı aktarılmaz. Next.js/serverless ve diğer platformlar henüz doğrulanmadı.

All failures originating in telemetry delivery remain isolated from tool
execution. Diagnostic/compatibility errors provide English/Turkish messages;
machine identifiers stay locale-independent.
