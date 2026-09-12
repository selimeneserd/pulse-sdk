# Pulse SDK

MCP araç handler'ları için açık kaynak analiz altyapısı. Çağrıları yerelde gözlemleyin; aynı metadata'yı kendi collector'ınıza veya isteğe bağlı yönetilen bir servise gönderin.

[**English**](README.md) · [Yerel başlangıç](#yerelde-çalıştırın) · [Belgeler](#belgeler) · [Katkı](CONTRIBUTING.md)

> **Sürüm 0.2.1:** `@reviseflow/pulse`, `@reviseflow/pulse-core` ve isteğe bağlı `@reviseflow/pulse-otel`. Bu yama 0.2 API'sini korur; 0.2.0'dan geçişte migration gerekmez. 0.1.0'dan güncelleme açık exporter seçimi gerektirir: [geçiş rehberini](docs/migration-release.md) okuyun.

0.2.1, conformance ile çalışma zamanı exporter doğrulamasını eşitler; kurulan CLI komutunu ve hoisted MCP çözümlemesini düzeltir; collector'ın `Retry-After` alt sınırını korur. Alt sınır dispatcher'ın yapılandırılan bekleme sınırını aşarsa, bekleyen olaylar erken yeniden denenmek yerine sınırlı kuyruk politikasıyla atılır. Ayrıntılar [değişiklik günlüğündedir](CHANGELOG.md).

```sh
npm install --save-exact @reviseflow/pulse@0.2.1 @reviseflow/pulse-core@0.2.1 @modelcontextprotocol/server@2.0.0
```

## Yerelde çalıştırın

**Node.js 24.20.0** ve **pnpm 11.22.0** kullanın. Node.js 24.11.1 de test edilmiştir; adaptör, resmi MCP TypeScript SDK **2.0.0** sürümünü hedefler. Doğrulanan kapsam ve sınırlar [uyumluluk tablosunda](docs/compatibility.md) bulunur.

```sh
git clone https://github.com/selimeneserd/pulse-sdk.git
cd pulse-sdk
pnpm install --frozen-lockfile
PULSE_LOCALE=tr pnpm example:local
node packages/mcp/dist/cli.js dev --file pulse-events.jsonl --locale tr
```

Bu akış, resmi bellek içi transport üzerinden gerçek bir MCP client/server çağrısı yapar. Gözlenen handler tamamlanmasını sınırlı bir JSONL dosyasına kaydeder; araç adı, süre yüzdelikleri ve sonuç özetini gösterir. Örnek, ağ API'leri engellenerek çalışır. İlk bağımlılık kurulumu internet gerektirebilir; çalışma zamanında Cloud hesabı, write key veya Cloud deposu gerekmez.

CLI bütün çıktıyı **stderr** üzerinden verir; stdout MCP stdio için boş kalır. Yerel rapor, incelenen dosya bölümünde aynı event ID'yi bir kez sayar; geçersiz, sınır nedeniyle dışarıda kalan ve kesilen kayıtları açıkça bildirir.

## Sunucunuza ekleyin

Exporter seçin ve sunucuyu **araç kaydından önce** sarmalayın. Bu API'ler [`examples/quickstarts.ts`](examples/quickstarts.ts) içinde de doğrulanır.

```ts
import { McpServer } from '@modelcontextprotocol/server';
import { createPulse } from '@reviseflow/pulse';
import { createJsonlExporter } from '@reviseflow/pulse-core/jsonl';

const pulse = createPulse({
  environment: 'development',
  exporter: createJsonlExporter({ path: './pulse-events.jsonl' }),
});

const server = pulse.wrapServer(
  new McpServer({ name: 'my-mcp', version: '1.0.0' }),
);

server.registerTool('health', {}, () => ({
  content: [{ type: 'text', text: 'ok' }],
}));
```

`server` nesnesini uygulamanızın mevcut transport'u üzerinden bağlayın. Uygulamanın kapanış hook'unda `await pulse.shutdown({ timeoutMs: 2_000 })` çağırın. Uygulama çalışmaya devam ederken kuyruğu boşaltmak için `await pulse.flush({ timeoutMs: 2_000 })` kullanın. Process dondurulduktan veya sonlandırıldıktan sonra teslim garantisi yoktur.

Paketleri projenize kurduktan sonra `npx --no-install pulse init --dry-run`, ince bir entegrasyon dosyasını önizler. `npx --no-install pulse doctor`, hoisted kurulumlar dahil projenin Node ESM bağlamında çözümlenen MCP paketini kontrol eder; statik yapılandırma ile gerçekten gözlenmiş çalışma zamanı durumlarını ayırır. Bu komutlar bağımlılık kurmaz, MCP sürümünü yükseltmez ve iş araçlarını çağırmaz. Ayrıntılar [CLI rehberinde](docs/tooling.md).

## Olayların gideceği yeri seçin

| Exporter | Import | Kabulün anlamı |
| --- | --- | --- |
| Memory | `@reviseflow/pulse-core/memory` | Sınırlı process belleğinde tutulur. |
| Açık no-op | `/memory` içinden `createNoopExporter()` | Bilinçli olarak atılır. |
| JSONL | `@reviseflow/pulse-core/jsonl` | Dosya sınırları ve rotasyonla yerelde yazılır; fsync garantisi yoktur. |
| HTTP | `@reviseflow/pulse-core/http` | Açıkça seçilen collector'dan doğrulanmış kabul yanıtı alınır. |
| OpenTelemetry | `@reviseflow/pulse-otel` | Yerel tracer'a teslim edilir; uzak teslim provider'a aittir. |

Core'un **üçüncü taraf runtime bağımlılığı yoktur**. Sınırlı dispatcher'ı yönetir ve exporter'ı dışarıdan alır; ana giriş noktası HTTP, dosya sistemi veya OTel exporter'ını yüklemez. Node.js'in yerel kripto ve async context desteği gerekir.

Exporter verilmezse gözlem kapalıdır ve diagnostics `missing_exporter` bildirir. `enabled: false`, özgün sunucuyu yamalamadan bırakır. Varsayılan collector adresi, gizli yedek istek, lisans kontrolü, uzaktan yapılandırma, güncelleme kontrolü veya kullanım telemetrisi yoktur.

## İsteğe bağlı Pulse Cloud

[Pulse Cloud](https://pulse.reviseflow.io/tr), yönetilen depolama, analiz ve ekip çalışması sunan ayrı, özel kaynak kodlu bir servistir. Bağımsız collector'ların da uygulayabileceği aynı açık sözleşmeyi tüketir.

Mevcut **sunucu tarafı** yapılandırmanızı genel HTTP exporter'a verin:

```ts
import { createPulse } from '@reviseflow/pulse';
import { createHttpExporter } from '@reviseflow/pulse-core/http';

export function createManagedPulse(endpoint: string, writeKey: string) {
  return createPulse({
    environment: 'production',
    exporter: createHttpExporter({
      endpoint, // /v1/batch dahil, açıkça seçilmiş tam collector adresi.
      authorization: `Bearer ${writeKey}`,
    }),
  });
}
```

Zorunlu yapılandırmayı uygulamanızda doğrulayın; write key'i tarayıcıya taşımayın. Collector ile 0.2 API'sini kullanmadan önce isteğe bağlı `adapter_version` alanını kabul ettiğini doğrulayın. [Geçiş rehberi](docs/migration-release.md), mevcut 0.1.0 kurulumlarını, yayın sırasını ve geri almayı açıklar.

## Pulse neyi ölçer?

- **Gözlemlenen handler tamamlanmalarını** ölçer. Bütün MCP isteklerinin veya iş işlemlerinin başarılı olduğunu söylemez. Handler öncesi doğrulamalar ve handler döndükten sonraki hatalar bu sınırın dışındadır.
- Handler süresini monotonic milisaniye olarak, tamamlanma zamanını ayrı bir wall-clock alanında tutar.
- İsteğe bağlı, proje kapsamlı hesap pseudonym'leri üretir. Hesap bir insan demek değildir; client'ın kendi bildirdiği etiket, doğrulanmış host kimliği değildir.

Ham argüman, sonuç, prompt, hata mesajı, stack, header veya keyfi properties toplanmaz. Araç ve sürüm adları yine de iş bilgisi taşıyabilir; hassas etiketleri eşleyin veya hariç bırakın. İsteğe bağlı HMAC kimliği ilişkilendirilebilir; anonimlik garantisi vermez.

Kuyruk, bayt bütçesi ve yeniden denemeler sınırlıdır. Exporter hatası handler sonucunu değiştirmez. Kimlik doğrulama düzeltildikten sonra aynı instance üzerinde `reconfigure({ exporter })` veya `resume()` kullanılabilir; atılmış olaylar geri gelmez. Pulse best-effort analiz sağlar; kalıcı audit ledger veya exactly-once teslim sistemi değildir.

## Belgeler

| Konu | Rehber |
| --- | --- |
| Yerel geliştirme ve CLI | [Araçlar](docs/tooling.md) |
| Runtime, MCP ve modül desteği | [Uyumluluk](docs/compatibility.md) |
| Olay/collector sözleşmesi ve yeni entegrasyonlar | [Sözleşmeler](docs/contracts.md) |
| Gizlilik, kimlik, yaşam döngüsü ve diagnostics | [Gizlilik ve yaşam döngüsü](docs/privacy-lifecycle.md) |
| OpenTelemetry ve Python kapsamı | [Entegrasyon eşlemesi](docs/otel-mapping.md) |
| Tekrarlanabilir performans sonuçları | [Benchmark](docs/benchmark.md) |
| API geçişi ve yayın hazırlığı | [Geçiş](docs/migration-release.md) · [Değişiklik günlüğü](CHANGELOG.md) |
| AI ile kurulum | [Agent tarifi](docs/agent-setup.md) |
| Kanıtlar ve kalan işler | [Uygulama durumu](docs/implementation-status.md) |

Katkınızı doğrulamak için `pnpm check` ve `pnpm verify:pack` çalıştırın. İkinci komut gerçek arşivler oluşturur; bağımsız bir tüketiciye kurar ve tipleri, ağsız MCP çağrılarını, HTTP teslimini, bundle ve çift paket kopyası davranışını kontrol eder. Paketleme, npm'e **yayın yapmaz**.

Katkı ve RFC süreci [CONTRIBUTING.md](CONTRIBUTING.md) içinde bulunur. Normal hataları [GitHub issues](https://github.com/selimeneserd/pulse-sdk/issues) üzerinden bildirin; zafiyet ayrıntılarını paylaşmadan önce [SECURITY.md](SECURITY.md) belgesini okuyun. SDK [MIT lisanslıdır](LICENSE); ayrı Cloud kodu build veya test için gerekmez.
