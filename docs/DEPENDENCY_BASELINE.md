# M0 dependency baseline / M0 bağımlılık başlangıç noktası

Verified on **2026-09-10 at 12:30 UTC** against official documentation, the npm registry and the downloaded MCP package archives. Exact registry metadata, publication timestamps, tarball URLs and integrity values are recorded in [`evidence/dependency-registry.json`](./evidence/dependency-registry.json). This is dependency evidence; executed compatibility results belong in `SDK_COMPATIBILITY.md` and `BUILD_STATUS.md`.

**TR:** Resmî dokümanlar, npm kayıt sistemi ve indirilen MCP paket arşivleri **10 Eylül 2026, 12:30 UTC** tarihinde doğrulandı. Kesin sürümler, yayın zamanları, arşiv adresleri ve bütünlük değerleri bağlantılı JSON dosyasındadır. Bu kayıt bağımlılık kanıtıdır; çalıştırılmış uyumluluk sonuçları `SDK_COMPATIBILITY.md` ve `BUILD_STATUS.md` dosyalarında tutulur.

## Exact selection / Kesin sürümler

| Component / Bileşen | Selected / Seçilen | Evidence and reason / Kanıt ve gerekçe |
| --- | --- | --- |
| Node.js | **24.20.0** | Official release index: 2026-08-26, Krypton LTS. Existing local installation prints `v24.20.0`; selected without a global runtime upgrade. / Resmî sürüm kaydı ve mevcut yerel kurulum doğrulandı. |
| pnpm | **11.22.0** | Existing CLI prints `11.22.0`; exact registry release exists, published 2026-08-15. Engine requires Node `>=22.13`. Pin with `packageManager`. / Mevcut ve kayıt sisteminde bulunan kesin sürüm sabitlenir. |
| `@modelcontextprotocol/server` | **2.0.0** | Registry `latest`, published 2026-07-27T23:55:22.239Z. / Kayıt sistemindeki kararlı sunucu sürümü. |
| `@modelcontextprotocol/client` | **2.0.0** | Registry `latest`, published 2026-07-27T23:55:22.113Z. / Kayıt sistemindeki kararlı istemci sürümü. |
| `@modelcontextprotocol/node` | **2.0.0** | Registry `latest`, published 2026-07-27T23:55:17.622Z. Node HTTP transport integration. / Node HTTP taşıma entegrasyonu. |
| TypeScript | **7.0.2** | Registry `latest`; official TypeScript download page identifies the 7.0 line. Strict compiler settings are required. / Resmî 7.0 sürüm hattı, sıkı derleyici ayarları. |
| Vitest | **5.0.0** | Registry `latest`; engine `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` includes the selected Node. / Seçilen Node sürümü motor aralığındadır. |
| Zod | **4.6.1** | Registry `latest`; v2 MCP uses Standard Schema-compatible input schemas. / MCP v2 için Standard Schema uyumlu girdi şemaları. |
| Ajv | **8.20.0** | Registry `latest`; explicit event-contract validation. / Olay sözleşmesinin açık doğrulaması. |
| `ajv-formats` | **3.0.1** | Registry `latest`; peer `ajv: ^8.0.0`. / Ajv 8 ile uyumlu biçim doğrulaması. |
| `@types/node` | **24.13.4** | Exact published Node 24 types. The registry's global `latest` points to 22.20.2, so select the matching major explicitly. / Genel etiket yerine çalışma zamanıyla eşleşen ana sürüm seçildi. |

Node **24.21.0** is a newer available LTS patch (2026-09-07), and pnpm **12.3.4** is the registry `latest`. The selected installed versions above are deliberate pins, not claims to be the newest releases. Node 24 remains Active LTS until 2026-10-20, then Maintenance LTS through 2028-04-30. Node 26 is Current rather than LTS as of this check. The MCP packages advertise Node `>=20`; that does not expand Pulse's tested runtime support beyond executed fixtures. [Node release policy](https://nodejs.org/en/about/previous-releases), [official release index](https://nodejs.org/dist/index.json), [official schedule](https://github.com/nodejs/Release/blob/main/schedule.json), [pnpm installation compatibility](https://pnpm.io/installation), [Vitest requirements](https://vitest.dev/guide/).

**TR:** Daha yeni Node 24.21.0 LTS ve pnpm 12.3.4 sürümleri vardır; seçilen mevcut sürümler bilinçli olarak sabitlenmiştir. Node 24 desteği 30 Nisan 2028'e kadar sürer. MCP paketlerinin geniş Node motor aralığı, Pulse için test edilmemiş çalışma zamanı desteği anlamına gelmez.

## MCP release-line resolution / MCP sürüm hattının doğrulanması

The official [repository README](https://github.com/modelcontextprotocol/typescript-sdk), [release list](https://github.com/modelcontextprotocol/typescript-sdk/releases), [roadmap](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/ROADMAP.md) and [v2 documentation](https://ts.sdk.modelcontextprotocol.io/v2/) identify **v2 as stable**, implementing the **2026-07-28** protocol generation. The registry agrees: the split server/client/node packages have `latest: 2.0.0`. All three downloaded archives matched their registry SHA-512 integrity values during this evidence check.

The legacy combined package [`@modelcontextprotocol/sdk`](https://registry.npmjs.org/@modelcontextprotocol%2Fsdk) has `latest: 1.30.0`. Its version number must not be used to infer that no stable v2 exists: v2 uses different package names. Upstream states that v1 receives fixes and security updates for at least six months after the 2026-07-27 v2 release. Pulse's M0 targets the exact split **2.0.0** packages. No v1, prerelease, alternate framework or broad `^2` compatibility is established by this selection.

There is **no observed date or release disagreement** between current upstream documentation and the current registry. The alpha-release concern in `08-SOURCE-NOTES.md` is resolved by this fresh check, rather than by reusing the older snippet. Install, type-check and actual client/server fixture results remain necessary to prove the adapter itself.

**TR:** Resmî belgeler ve kayıt sistemi MCP v2.0.0'ın kararlı olduğu konusunda uyumludur. Eski birleşik `@modelcontextprotocol/sdk` paketinin 1.30.0 sürümü, farklı adlarla yayımlanan v2 paketleriyle karıştırılmamalıdır. M0 yalnızca kesin 2.0.0 paketlerini hedefler. Önceki alfa sürümü şüphesi güncel kayıt ve arşiv kontrolüyle giderildi; adaptörün çalıştığı ayrıca gerçek istemci/sunucu testleriyle kanıtlanmalıdır.

## Dependency license evidence / Bağımlılık lisansı kanıtı

The registry reports `license: MIT` for all three selected MCP packages. Their actual `package/LICENSE` files contain an **Apache-2.0 / MIT licensing transition**, with CC-BY-4.0 terms for documentation. Each license file was read directly from its integrity-verified 2.0.0 archive; its SHA-256 is recorded in the evidence JSON. The registry's single license field does not fully describe those files.

Pulse's original SDK/adapters/wire schema remain MIT; private cloud code remains proprietary. Do not describe all upstream material as MIT or replace upstream notices with Pulse's license. If upstream code or documentation is copied or bundled, preserve its applicable license and notices and inspect the final tarball. The public package release gate must review actual installed/package contents, not only package metadata. TypeScript declares Apache-2.0; the remaining selected tooling declares MIT in registry metadata, with a full transitive/package audit still a release gate. [Upstream license](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/LICENSE), [TypeScript installation and version guidance](https://www.typescriptlang.org/download/).

**TR:** MCP paketlerinin kayıt metadatası MIT dese de gerçek arşivlerdeki lisans dosyası Apache-2.0 / MIT geçişini ve dokümantasyon için CC-BY-4.0 koşullarını içerir. Pulse'ın özgün SDK kodu MIT, bulut kodu özel lisanslı kalır. Üst kaynak kodu veya dokümanı kopyalanır ya da paketlenirse geçerli lisans ve bildirimler korunur. Tüm bağımlılıkları MIT olarak tanıtmak veya yalnızca metadata üzerinden lisans kontrolü yapmak doğru değildir; son paket incelemesi yayın kapısıdır.

## Reproduction and scope / Yeniden doğrulama ve kapsam

```sh
fnm exec --using=24.20.0 node --version
pnpm --version
npm view @modelcontextprotocol/server dist-tags --json
npm view @modelcontextprotocol/client dist-tags --json
npm view @modelcontextprotocol/node dist-tags --json
npm view @modelcontextprotocol/sdk dist-tags --json
npm view @modelcontextprotocol/server@2.0.0 dist --json
```

The evidence JSON was produced through HTTPS requests to the explicit public npm registry and Node upstream URLs. An initial Python HTTPS read failed because that Python installation lacked a usable local CA chain; the successful reads used Node's verified HTTPS `fetch`, without disabling certificate verification. This was an environment-specific client failure, not a registry-access blocker.

Only M0 dependencies are selected here. Next.js/React, auth, database, billing and deployment dependencies must be verified when their milestone begins. No cloud package, publication, public repository, live checkout or production deployment is created by this check.

**TR:** Kanıt dosyası npm ve Node'un açık HTTPS adreslerinden, sertifika doğrulaması açık tutularak üretildi. İlk Python isteğindeki yerel CA hatası Node HTTPS istemcisiyle giderildi; kayıt sistemine erişim engeli yoktur. Bu dosya yalnızca M0 bağımlılıklarını kapsar; sonraki kilometre taşlarının bağımlılıkları uygulamaya başlanırken doğrulanır.

## Executed installation adjustment / Doğrulanmış kurulum düzeltmesi

The SDK lockfile uses an exact Zod4.6.1 override. Without it pnpm selected transitive 4.5.4 for MCP while the fixture used 4.6.1; the deprecated raw-shape overload then exposed incompatible Zod type identities. The unified version passes both preferred Standard Schema registration and the deprecated overload type checks. TypeScript7 also requires explicit `types: ["node"]` in this workspace. Frozen-lockfile installation and both package builds passed. pnpm recorded age-policy exceptions for the explicitly verified exact Zod/Node-types releases; no unverified broad version range was added.

**TR:** MCP bağımlılığı ve test düzeneğindeki farklı Zod tiplerini birleştirmek için 4.6.1 kesin sürümü override ile sabitlendi. Tercih edilen Standard Schema ve eski overload tip kontrolleri geçti. TypeScript7 için Node tipleri açıkça tanımlandı; donmuş lockfile kurulumu ve paket derlemeleri doğrulandı.
