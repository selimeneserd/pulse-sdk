# Historical0.1 compatibility / Tarihsel0.1 uyumluluk

This file preserves the original0.1 test record. For current0.2 support, APIs and executed package matrix use [compatibility.md](compatibility.md). Old exact-version runtime checks and endpoint/key examples below do not describe0.2.

TR: Bu kayıt0.1 geçmişidir; güncel0.2 için compatibility.md belirleyicidir.

# SDK compatibility / SDK uyumluluğu

**2026-09-11 release:** `@reviseflow/pulse@0.1.0` and `@reviseflow/pulse-core@0.1.0` are published on npm. The exact baseline below was retained and reverified with 70 tests and a real, unrelated npm-installed consumer. See [registry evidence](evidence/registry-consumer.json).

**TR:** 0.1.0 paketleri npm üzerinde yayımlandı. Aşağıdaki sürümler korundu;70 test ve npm’den kurulan bağımsız gerçek MCP istemcisiyle yeniden doğrulandı.

**M0 FIXTURE_VERIFIED — 2026-09-10.** The exact local target below passed 70 tests, strict compilation and independent tarball consumption. This is local SDK evidence; no production collector or live host certification is implied.

**TR:** **M0 yerel düzenekle doğrulandı — 10 Eylül 2026.** Aşağıdaki kesin hedefte 70 test, sıkı derleme ve repo dışı paket kurulumu geçti. Bu SDK kanıtı üretim toplayıcısı veya gerçek istemci platformu onayı değildir.

## Narrow target / Sınırlı hedef

| Dimension / Boyut | Target / Hedef | Evidence / Kanıt |
| --- | --- | --- |
| Runtime / Çalışma zamanı | Node.js **24.20.0**, macOS arm64 development fixture | Installed runtime reports `v24.20.0`; official Node 24 LTS release exists. / Yerel sürüm ve resmî LTS kaydı doğrulandı. |
| Official server / Resmî sunucu | `@modelcontextprotocol/server` **2.0.0** | Installed package metadata and public declaration files inspected. / Kurulu metadata ve açık tip bildirimleri incelendi. |
| Official client / Resmî istemci | `@modelcontextprotocol/client` **2.0.0** | Exact selected stable package; real HTTP fixture passed. / Gerçek HTTP düzeneği geçti. |
| Node transport / Node taşıması | `@modelcontextprotocol/node` **2.0.0**, remote Streamable HTTP | Loopback HTTP fixture; no remote host claim. / Yerel HTTP düzeneği; haricî sunucu iddiası yok. |
| Protocol / Protokol | **2026-07-28**, explicitly pinned by fixture | Real fixture pins this revision and asserts modern protocol era. / Gerçek düzenek bu sürümü sabitler ve modern protokolü doğrular. |
| Registration / Araç kaydı | Per-instance `registerTool(name, config, handler)` hook installed before registration/connection; returned facade binds other methods | Strict compilation and negative type tests passed. / Sıkı derleme ve negatif tip testleri geçti. |

The upstream [README](https://github.com/modelcontextprotocol/typescript-sdk), [roadmap](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/ROADMAP.md) and [v2 documentation](https://ts.sdk.modelcontextprotocol.io/v2/) agree with the registry: the split 2.0.0 packages are stable. The older combined `@modelcontextprotocol/sdk@1.30.0` is a separate release line and is not supported by this adapter. Wider SDK versions, operating systems or runtimes need their own executed matrix. [Node support policy](https://nodejs.org/en/about/previous-releases).

**TR:** Resmî belgeler ve kayıt sistemi ayrı 2.0.0 paketlerinin kararlı olduğunu doğruluyor. Eski birleşik `@modelcontextprotocol/sdk@1.30.0` bu adaptörün kapsamında değildir. Daha geniş sürüm, işletim sistemi veya çalışma zamanı desteği ayrıca çalıştırılmış test gerektirir.

## Acceptance matrix / Kabul matrisi

| Scenario / Senaryo | Required observation / Gerekli gözlem | Status / Durum |
| --- | --- | --- |
| Actual MCP request / Gerçek MCP isteği | Official client calls official server over HTTP; original caller result and sanitized event shown. / İstemci sonucu ve arındırılmış olay gösterilir. | FIXTURE_VERIFIED |
| Registration typing / Kayıt tipleri | Input inference, no-schema callback, deprecated raw-shape overload, output type errors stay intact. / Girdi ve sonuç tipleri korunur. | FIXTURE_VERIFIED (strict typecheck) |
| Success / Başarı | One `tool_success` event; original value preserved. / Tek olay, özgün sonuç. | FIXTURE_VERIFIED |
| Returned tool error / Dönen araç hatası | `isError: true` maps to `tool_error`; result unchanged. / Sonuç değişmez. | FIXTURE_VERIFIED |
| Thrown error / Fırlatılan hata | `handler_exception`; wrapper rethrows the same error object. Upstream may transform it at the protocol boundary. / Sarmalayıcı aynı hatayı yeniden fırlatır. | FIXTURE_VERIFIED |
| Unknown result / Bilinmeyen sonuç | Unsupported discriminant/shape remains `unknown`, never assumed success. / Başarı varsayılmaz. | FIXTURE_VERIFIED |
| Input required / Ek girdi gerekiyor | Explicit upstream incomplete result becomes `input_required`; it is not success. / Ayrı sonuç olarak kaydedilir. | FIXTURE_VERIFIED |
| Cancellation / İptal | Observable handler cancellation maps to `cancelled`; exporter timeout cannot manufacture cancellation. / Yalnızca gözlenen işleyici iptali kaydedilir. | FIXTURE_VERIFIED |
| Concurrent identities / Eşzamanlı kimlikler | Request-scoped HMAC identities remain isolated with zero cross-request leakage. / İstek bağlamları karışmaz. | FIXTURE_VERIFIED |
| No identity or metadata / Kimlik veya metadata yok | Missing fields stay absent; capture remains opt-in. / Eksik alan üretilmez. | FIXTURE_VERIFIED |
| Metadata and binding / Metadata ve bağlama | Tool title, description, annotations, icons and schema validation stay upstream-owned; callback receiver retained. / Açıklama, şema ve çağrı bağlamı korunur. | FIXTURE_VERIFIED |
| Public handle lifecycle / Açık kayıt nesnesi yaşam döngüsü | Same returned handle; update callback/name, disable, enable and remove still work; schema validation remains upstream-owned. / Güncelleme ve kaldırma davranışı korunur. | FIXTURE_VERIFIED |
| Pre-handler rejection / İşleyici öncesi ret | Unknown tool, malformed input and auth failure produce zero handler events. / İşleyici olayı üretilmez. | FIXTURE_VERIFIED |
| Output validation / Çıktı doğrulaması | Handler event records the observed returned envelope; upstream output validation remains unchanged. / Sonraki şema doğrulaması değişmez. | FIXTURE_VERIFIED |
| Analytics disabled / Analitik kapalı | No event/export/network work; caller behavior preserved. / Olay veya ağ isteği yok. | FIXTURE_VERIFIED |
| Collector outage / Toplayıcı kesintisi | Caller result/latency independent of remote collector; count and byte bounds enforced. / Çağrı sonucu etkilenmez, kuyruk sınırlıdır. | FIXTURE_VERIFIED |
| Retry and duplication / Yeniden deneme ve yinelenme | Same immutable event ID reused; accepted subset removed; retries single-flight and bounded. / Kimlik değişmez, tekrarlar sınırlıdır. | FIXTURE_VERIFIED |
| Privacy / Gizlilik | Large args/results and raw errors never appear in emitted events; labels normalized/bounded. / Ham içerik dışarı aktarılmaz. | FIXTURE_VERIFIED |
| Version/double-wrap rejection / Sürüm ve çift sarmalama reddi | Unsupported instance/version, pre-registered and already wrapped server fail explicitly. / Desteklenmeyen kullanım açık hata verir. | FIXTURE_VERIFIED |
| Independent packed consumer / Bağımsız paket tüketicisi | Packed public SDK installs outside repository; genuine MCP fixture still passes. / Depo dışı gerçek düzenek geçer. | FIXTURE_VERIFIED |

## Boundaries and open review items / Sınırlar ve açık inceleme maddeleri

Measurement ends when an instrumented registered handler returns, resolves or throws. It measures monotonic handler duration and a separate wall-clock completion time. It does not measure transport delivery, model reasoning, business outcomes, prompt/resource operations, `tools/list`, authorization failures or validation that happens before the handler. Output validation may occur after this event, so handler success does not guarantee a successful protocol response.

**TR:** Ölçüm sarmalanmış kayıtlı işleyici döndüğünde, tamamlandığında veya hata fırlattığında sona erer. İşleyici süresi monoton saatle, tamamlanma zamanı duvar saatiyle tutulur. Taşıma başarısı, model akıl yürütmesi, iş sonucu, keşif işlemleri ve işleyici öncesi retler ölçülmez. Çıktı doğrulaması olaydan sonra gerçekleşebilir.

The selected implementation installs one **per-instance public `registerTool` hook** and returns a facade that binds other methods to the original server. This public method replacement is intentional: a subclass helper calling `this.registerTool(...)`, or another reference to the same original server, must still pass through instrumentation. The original registration method must be captured once before replacement. Existing registrations are rejected conservatively through public capability/connection checks. Registration functions captured or bound **before wrapping**, and direct mutation of a registration handle's `handler`/`executor`, are outside the supported route; use the public `update({callback})` API. No private upstream handler registry, global `fetch`, prototype patch or raw SSE parsing is part of the adapter. Runtime tests prove this public hook preserves subclass method binding and instruments subclass registration helpers.

**TR:** Seçilen uygulama yalnızca ilgili sunucu nesnesinin açık `registerTool` metodunu değiştirir; diğer metotları özgün sunucuya bağlayan bir facade döndürür. Böylece alt sınıfın `this.registerTool(...)` çağrısı veya aynı sunucunun başka referansı da ölçümden geçer. Özgün kayıt metodu değişimden önce bir kez saklanır. Önceden kayıtlı/bağlı sunucular reddedilir. **Sarmalamadan önce** alınmış/bağlanmış kayıt fonksiyonları ve kayıt nesnesindeki `handler`/`executor` alanına doğrudan yazma kapsam dışıdır; `update({callback})` kullanılmalıdır. Özel kayıt alanı, global `fetch`, prototip yaması veya ham SSE ayrıştırması yoktur. Çalışma zamanı testleri bu kayıt yolunu ve alt sınıf bağlamını doğrular.

Independent review found and fixed foreign-realm Promise settlement and subclass helper registration bypasses. Regression tests passed. A second review found and fixed shutdown/concurrent-flush cutoff loss and retry-budget resets after HTTP 413 batch splitting. Core tests also snapshot changing completion getters before validation to retain the strict privacy boundary.

**TR:** Bağımsız incelemenin bulduğu farklı JavaScript bağlamındaki Promise ve alt sınıf kayıt kaybı düzeltildi, regresyon testleri geçti. Kapanış/eşzamanlı flush sırasında olay kaybı ve 413 sonrası retry bütçesi sıfırlanması da gerçek HTTP testleriyle giderildi. Doğrulamadan önce değişken getter değerleri bir kez okunur.

Client names are self-reported hints, never identity or host certification. Any client metadata in a local fixture is **simulated metadata**, even when supplied by the real official MCP client. ChatGPT/Claude host installations, host-provided user/session identity, stdio, Python, Next.js/serverless lifecycle, external remote deployment and production collector behavior are **not verified** by a loopback fixture.

**TR:** İstemci adı özbildirimdir; kimlik veya sunucu sertifikası değildir. Resmî istemciyle gönderilse de yerel düzeneğin metadatası **simüledir**. ChatGPT/Claude kurulumu, sunucu kaynaklı kullanıcı/oturum kimliği, stdio, Python, Next.js/serverless yaşam döngüsü, haricî dağıtım ve üretim toplayıcısı yerel HTTP testleriyle doğrulanmış sayılmaz.

## Executed evidence / Çalıştırılmış kanıt

2026-09-10, Node24.20.0 / pnpm11.22.0 on macOS arm64:

- `pnpm check`: both packages build; strict TypeScript compilation passes, including expected type errors; **70/70 tests pass** across 4 files.
- `node scripts/verify-packed.mjs`: **PASSED**. Both tarballs install into an unrelated temporary consumer with no workspace links. TypeScript registration, real HTTP one-event proof, EN/TR fixture and public schema imports pass.
- A disposable consumer's package metadata was deliberately changed to 2.0.1 and rejected by the runtime guard, then restored. This is a **simulated drift test**, not a compatibility test of real 2.0.1 code.
- `examples/fixture.ts`: real MCP caller receives `content:[{type:"text",text:"5"}]`, `structuredContent:{sum:5}`. Emitted event has `tool_name:sum`, `outcome:tool_success`, a stable UUID and finite handler duration, with actor/client/release null and no args/results.

The exact sanitized event, package SHA-256 values and command outcomes are in [packed-consumer.json](evidence/packed-consumer.json). Test summaries and corrected failures are in [m0-verification.json](evidence/m0-verification.json).

**TR:** Dört test dosyasında 70 test geçti; her iki paket derlendi, negatif tip kontrolleri korundu. Paketler repo dışındaki temiz tüketicide EN/TR gerçek HTTP örneğiyle doğrulandı. Sürüm reddi testi yalnızca geçici metadata değişimini kapsar. Gerçek üretim veritabanı ve Next.js/serverless aşamaları henüz uygulanmadı.
