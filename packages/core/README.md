# @reviseflow/pulse-core

MIT-licensed, bounded metadata exporter for Pulse **0.1.0**. Verified on Node **24.20.0**.
For MCP server instrumentation, install `@reviseflow/pulse@0.1.0`; it includes this core automatically.
Direct consumers can use `npm install --save-exact @reviseflow/pulse-core@0.1.0`.

**TR:** Pulse **0.1.0** için MIT lisanslı, sınırlı metadata göndericisi. Node **24.20.0** ile doğrulandı.
MCP sunucusunu ölçmek için `@reviseflow/pulse@0.1.0` kurun; core otomatik gelir.
Doğrudan kullanım için `npm install --save-exact @reviseflow/pulse-core@0.1.0` komutunu kullanın.

[English documentation](https://pulse.reviseflow.io/en/docs) · [Türkçe belgeler](https://pulse.reviseflow.io/tr/docs)

```ts
import { createPulseCore } from '@reviseflow/pulse-core';

const pulse = createPulseCore({
  writeKey: process.env.PULSE_WRITE_KEY!,
  endpoint: process.env.PULSE_COLLECTOR_URL!,
  environment: 'production',
});

// Hosting lifecycle / Barındırma yaşam döngüsü
await pulse.flush({ timeoutMs: 2000 });
await pulse.shutdown();
```

Supply the full collector batch URL. No Pulse cloud endpoint is assumed.
HTTPS is required except HTTP on `localhost`, `127.0.0.1` or `::1` for isolated
local fixtures. The write key travels only in the Authorization header. Redirects
are refused. Development and test are disabled unless `enabled: true` is set;
production and staging are enabled by default. Disabled instances create no
export timers, queues or requests and do not require credentials.

Toplayıcının tam batch URL adresini sağlayın. Varsayılan Pulse bulut adresi yoktur.
Yalıtılmış yerel testlerde `localhost`, `127.0.0.1` veya `::1` üzerindeki HTTP
dışında HTTPS gerekir. Yazma anahtarı yalnızca Authorization başlığında gönderilir.
Yönlendirmeler reddedilir. Development ve test, `enabled: true` verilmedikçe
kapalıdır; production ve staging varsayılan olarak açıktır. Kapalı örnekler
gönderim zamanlayıcısı, kuyruk veya istek oluşturmaz ve kimlik bilgisi istemez.

## Recorded boundary / Kaydedilen sınır

An event records an observed handler completion: UUID, UTC completion timestamp,
monotonic handler duration, bounded tool label, explicit outcome, environment,
optional release and normalized self-reported client metadata. The exporter
does not capture args, results, prompts, headers, error messages, stacks, email,
IP or arbitrary properties. A handler completion does not prove transport
delivery or background business completion. Tool labels and release values are
customer-controlled labels: do not put customer details in them. Use the MCP
adapter's label mapper or exclusion list for sensitive tool names.

Bir olay gözlenen araç işleyicisi tamamlanmasını kaydeder: UUID, UTC tamamlanma
zamanı, monoton işleyici süresi, sınırlı araç etiketi, açık sonuç, ortam, isteğe
bağlı sürüm ve normalize edilmiş istemci beyanı. Gönderici argüman, sonuç,
istem, başlık, hata mesajı, yığın izi, e-posta, IP veya serbest alan toplamaz.
İşleyicinin tamamlanması aktarımın veya arka plan işinin tamamlandığını kanıtlamaz.
Araç ve sürüm etiketleri müşterinin kontrolündedir; bu etiketlere müşteri bilgisi
koymayın. Hassas araç adları için MCP adaptöründeki etiket eşleyiciyi veya hariç
tutma listesini kullanın.

Known client labels are `chatgpt`, `claude-desktop`, `claude-code`, `cursor`,
`codex`, `vscode`, `windsurf` and `mcp-inspector` (with a few exact case-insensitive
aliases). This is normalization, **not proof of a live host integration**.
Unrecognized names remain null with source `unknown`; unsafe/non-semver versions
remain null. Missing data stays missing.

Bilinen istemci etiketleri `chatgpt`, `claude-desktop`, `claude-code`, `cursor`,
`codex`, `vscode`, `windsurf` ve `mcp-inspector` değerleridir; birkaç tam eşleşen
büyük/küçük harf duyarsız alternatif desteklenir. Bu normalizasyondur;
**canlı istemci entegrasyonu kanıtı değildir**. Tanınmayan adlar null ve kaynak
`unknown` kalır; güvenli semver biçimine uymayan sürümler null olur. Eksik veri
eksik kalır.

## Optional identity / İsteğe bağlı kimlik

No identity is sent by default. Configure `identity` only with a separate,
persistent, cryptographically random secret of at least 32 bytes per project:

Varsayılan olarak kimlik gönderilmez. `identity` seçeneğini yalnızca her proje
için ayrı, kalıcı, kriptografik rastgele ve en az 32 baytlık bir sırla yapılandırın:

```ts
const pulse = createPulseCore({
  environment: 'production',
  writeKey: process.env.PULSE_WRITE_KEY!,
  endpoint: process.env.PULSE_COLLECTOR_URL!,
  identity: {
    secret: process.env.PULSE_IDENTITY_SECRET!,
    projectNamespace: 'stable-project-namespace',
    epoch: 'v1',
  },
});

// actorId must come from verified app authentication.
// actorId doğrulanmış uygulama kimlik doğrulamasından gelmelidir.
pulse.withContext({ actorId: verifiedAccountId, conversationId }, () => {
  return handleAuthenticatedRequest();
});
```

`withContext` hashes identifiers before storing them in AsyncLocalStorage;
only `h1_<hex>` values can leave the process. HMAC-SHA256 input is an unambiguous
JSON array containing protocol domain, project namespace, actor/conversation
domain, `app_account` source, epoch and raw ID. Concurrent and nested requests
remain isolated. Conversation identity requires an account identity. Raw IDs
over 4096 UTF-8 bytes are omitted. No host-subject integration is shipped.
Account identity does not identify a person. Rotating the identity secret,
namespace or epoch breaks continuity; do not automatically merge those cohorts.
The rotating write key must never be the identity secret. Configuration validates
length/separation, but cannot prove the randomness of a customer-provided secret.

`withContext`, kimlikleri AsyncLocalStorage içine koymadan önce özetler; işlemden
yalnızca `h1_<hex>` değerleri çıkabilir. HMAC-SHA256 girdisi protokol alanı, proje
ad alanı, hesap/konuşma alanı, `app_account` kaynağı, dönem ve ham kimliği içeren
belirsizliğe izin vermeyen bir JSON dizisidir. Eşzamanlı ve iç içe istekler ayrı
kalır. Konuşma kimliği için hesap kimliği gerekir. 4096 UTF-8 baytını aşan ham
kimlikler atlanır. Host-subject entegrasyonu sunulmamaktadır. Hesap kimliği kişi
kimliği değildir. Kimlik sırrını, ad alanını veya dönemi değiştirmek sürekliliği
bozar; bu gruplar otomatik birleştirilmemelidir. Döndürülen yazma anahtarı kimlik
sırrı olarak kullanılamaz. Yapılandırma uzunluğu ve ayrılığı denetler; müşterinin
verdiği sırrın rastgeleliğini kanıtlayamaz.

## Delivery and diagnostics / Gönderim ve tanılama

Defaults: 100 events and 256 KiB per batch; 1000 pending events and 1 MiB pending
serialized bytes **including in-flight events**; 2-second lazy flush timer;
2-second HTTP timeout; at most three retries with jitter. Optional `queue`
settings can reduce count/batch limits and tune bounded timing/byte limits.
Overflow drops the oldest unsent event; an in-flight event is never evicted.
Retries preserve IDs and event bytes. Partial acknowledgements remove accepted,
duplicate and non-retryable rejected subsets before retrying missing IDs.
413 splits a batch; a rejected singleton is dropped. Responses are read through
a 64 KiB bound. Retry-After is respected; events are dropped when its delay
exceeds the configured retry horizon rather than sent too soon. Auth failures
and explicit quota exhaustion stop export for the instance; create a new
instance after fixing the key or quota.

Varsayılanlar: batch başına 100 olay ve 256 KiB; **gönderilmekte olanlar dahil**
1000 bekleyen olay ve 1 MiB serileştirilmiş veri; gerektiğinde başlayan 2 saniyelik
gönderim zamanlayıcısı; 2 saniyelik HTTP zaman aşımı; rastgele beklemeli en fazla
üç tekrar. İsteğe bağlı `queue` ayarları sayı/batch sınırlarını azaltabilir ve
sınırlı süre/bayt değerlerini değiştirebilir. Taşmada gönderilmemiş en eski olay
atılır; gönderilmekte olan olay çıkarılmaz. Tekrarlar aynı kimlik ve olay
baytlarını korur. Kısmi onayda kabul edilen, yinelenen ve tekrar denenmeyecek
reddedilen olaylar çıkarılır; yalnızca onaysız kimlikler yeniden denenir. 413
batch'i böler; tek başına reddedilen olay atılır. Yanıt okuma sınırı 64 KiB'dır.
Retry-After süresine uyulur; süre tekrar deneme ufkunu aşıyorsa erken gönderim
yerine olay atılır. Yetki hatası ve açık kota tükenmesi örneğin gönderimini
durdurur; anahtar veya kota düzeltildikten sonra yeni bir örnek oluşturun.

`complete` never awaits export and catches local telemetry errors. `flush`
waits at most `timeoutMs` (default 2000): a timeout does not prove delivery, and
bounded export work may continue. Each flush drains its own current queue
snapshot, including events queued before it joins an earlier flush; newer calls
remain queued for the next flush/timer. `shutdown`
stops intake, tries a bounded final drain, then aborts and counts remaining
events as dropped. It is idempotent and adds no process/global shutdown hooks.
`getDiagnostics()` returns only frozen numeric counters, never raw errors.
Configuration errors expose code `PULSE_INVALID_CONFIGURATION` and
`getMessage('en' | 'tr')`.

`complete` gönderimi beklemez ve yerel telemetri hatalarını yakalar. `flush`
en fazla `timeoutMs` bekler (varsayılan 2000): zaman aşımı teslimatı kanıtlamaz;
sınırlı gönderim işi devam edebilir. Her gönderim kendi kuyruk görüntüsünü,
önceki gönderime katılmadan önce kuyruğa eklenen olaylar dahil işler; daha yeni
çağrılar sonraki gönderim/zamanlayıcı için kalır. `shutdown`
yeni alımı durdurur, sınırlı son gönderimi dener, ardından kalanları iptal eder
ve atılmış sayar. Tekrarlanabilir; işlem/genel kapanış kancası eklemez.
`getDiagnostics()` yalnızca dondurulmuş sayısal sayaçları döndürür, ham hataları
döndürmez. Yapılandırma hataları `PULSE_INVALID_CONFIGURATION` kodunu ve
`getMessage('en' | 'tr')` seçeneğini sunar.

This is bounded best-effort telemetry. Kills, freezes and outages can lose events.
A timer alone does not establish serverless compatibility; use and test the
hosting platform's completion lifecycle. M0 does not ship a Next.js/stdio/Python
adapter or claim zero loss.

Bu sınırlı, en iyi çabalı telemetridir. İşlem sonlandırılması, dondurma ve kesintiler
olay kaybına yol açabilir. Tek başına zamanlayıcı serverless uyumluluğunu kanıtlamaz;
barındırma platformunun tamamlanma yaşam döngüsünü kullanın ve test edin. M0,
Next.js/stdio/Python adaptörü sunmaz ve sıfır kayıp iddiasında bulunmaz.
