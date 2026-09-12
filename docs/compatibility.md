# Compatibility evidence / Uyumluluk kanıtı

0.2.1 retains the Node 24.11.1/24.20.0, MCP 2.0.0 and ESM support matrix. The final exact release passed **205/205** tests and clean packed consumers locally on both runtimes. [GitHub CI 34676226310](https://github.com/selimeneserd/pulse-sdk/actions/runs/34676226310) passed both Node versions on Ubuntu. After npm publication, exact archive integrity and **106 clean registry consumer commands per runtime** passed. [BUILD_STATUS.md](../BUILD_STATUS.md) links the source and publication ledger.

Final release receipts use `evidence/release-0.2.1-check-node24.11.1.txt`, `release-0.2.1-check-node24.20.0.txt`, `release-0.2.1-packed-node*.json` and `release-0.2.1-registry-node*.json`. Earlier `correctness-check-node*.txt` and `correctness-packed-node*.json` describe 0.2.0-labelled development archives before the version bump; they are historical evidence.

The CLI's default Node ESM resolution is tested with real installed MCP 2.0.0, hoisted workspace consumers and synthetic package/symlink fixtures. Custom loaders, bundler aliases and pnpm end-to-end support are not claimed. No support range changed.

TR: Son 0.2.1 sürümü Node 24.11.1/24.20.0, MCP 2.0.0 ve ESM destek matrisini korur. İki runtime'da 205 kaynak testi ve temiz tarball tüketicileri, Ubuntu üzerinde iki Node sürümlü CI ve npm yayını sonrasında her runtime'da 106 registry tüketici komutu geçti. Exact arşiv bütünlükleri eşleşir. Önceki 0.2.0 etiketli geliştirme arşivlerinin kanıtları tarihsel olarak korunur. Hoisted kurulumlar test edilir; custom loader, bundler alias veya pnpm uçtan uca desteği iddia edilmez.

## Historical 0.2.0 baseline / Geçmiş 0.2.0 temeli

Research and local verification date: 2026-09-11. Both complete checks and packed gates passed locally on macOS arm64; both Node versions also passed the full Ubuntu 24.04 matrix in [GitHub CI run 34625143572](https://github.com/selimeneserd/pulse-sdk/actions/runs/34625143572). The installed package metadata and README identify `@modelcontextprotocol/server`, `client`, `node` and `core` as **2.0.0** (upstream package engines `node >=20`). Pulse's narrower support is determined by its own tests, not inherited from upstream's engine range. The exact peer pin remains because no second MCP release has been installed and tested. This is a support declaration, not a runtime package-version lock.

Araştırma ve yerel doğrulama tarihi: 2026-09-11. İki runtime için tam kontrol ve paket testleri macOS arm64 üzerinde geçti; iki Node sürümü için Ubuntu 24.04 CI matrisi de başarıyla çalıştı. Kurulu MCP paketleri **2.0.0**. Pulse desteği upstream'in geniş runtime aralığından değil, kendi testlerinden gelir. Başka MCP sürümü gerçekten kurulup test edilmediği için peer sürümü 2.0.0 kalır; çalışma zamanında paket sürümü kilidi uygulanmaz.

| Surface / Yüzey | Evidence / Kanıt |
| --- | --- |
| Node 24.11.1, Node 24.20.0 + MCP 2.0.0 | Full suite: 133/133 on each runtime, including 33 adapter/HTTP/CLI tests. Ubuntu CI passed for both versions; packed-run evidence is recorded in `docs/evidence/packed-consumer-node24.11.1.json` and `docs/evidence/packed-consumer.json`. |
| ESM | Published `import` exports and TypeScript declarations; packed consumer compiles inferred registration signatures. |
| CommonJS | Not declared or shipped by Pulse; upstream providing CJS does not make Pulse CJS. |
| Browser, edge, Bun, Deno, Node 20/22/25, MCP v1 | Not supported or claimed by this release. |
| In-memory MCP transport | Real official client/server call, no sockets; legacy session negotiation supported by SDK 2.0.0. |
| Streamable HTTP | Real loopback client/server; protocol 2026-07-28, listing, input/output validation, input-required control flow, cancellation and optional client metadata. |
| Packed/bundled/duplicate copies | Reproducible gate `pnpm verify:pack`; exact run result in packed evidence. Pulse is embedded in an ESM bundle with the MCP peer external; a second real installed MCP class and Pulse module copy are exercised separately. |

The adapter uses the public `registerTool`, returned registration `update`, `isConnected`, `server.getCapabilities`, `server.getClientVersion` and request-context signal/envelope. It does not inspect private registries, read runtime package metadata, assume package directory layout or use `instanceof McpServer`. The public hook marker uses a data-free `Symbol.for` key on Pulse's own function to avoid duplicate instrumentation across package copies. Other servers/prototypes are untouched; shutdown never restores a patch over another layer.

Adaptör yalnızca public kayıt/bağlantı/context yüzeylerini kullanır. Private registry veya paket dizin yapısına erişmez; `instanceof McpServer` zorunluluğu yoktur. Veri taşımayan public hook işareti çift paket kopyasında çift ölçümü engeller. Shutdown başka katmanın yamasını geri almaz.

`enabled: false` returns the exact original server without capability probes, patches, telemetry timers or telemetry I/O. Normal JavaScript imports and peer-package resolution still occur. Unsupported shapes and setup failures return the original server with `instrumentationFailures` and a safe `lastInstrumentationError`. Use `strict: true` to turn setup compatibility failures into `PulseCompatibilityError`; `getMessage('en'|'tr')` renders a localized message. Application registration or handler exceptions remain application exceptions. Default double wrapping returns the already wrapped server and observes one event; strict mode rejects it. Pausing, reconfiguration and shutdown do not change handler return values.

`enabled: false` özgün sunucuyu olduğu gibi döndürür; normal JavaScript import maliyeti sürer. Destek dışı arayüz ve kurulum hatası, kodlu diagnostics ile fail-open davranır. `strict: true`, geliştirme sırasında yerelleştirilebilir kurulum hatası verir. Uygulama handler/kayıt hataları değiştirilmez. Varsayılan çift sarmalama bir olay üretir; strict mod bunu reddeder.

Native promises, foreign-realm promises and ordinary thenables preserve resolved/rejected value identity; thenable adoption is queued, and its `then` accessor is read once by Pulse. Pulse does not promise complete transparency for a hostile `then` getter whose behavior changes between reads. If probing `then` itself throws, Pulse preserves the original synchronous return object and records an unknown outcome; a later framework await can independently invoke that getter. Exact promise-object identity or identical microtask scheduling is not claimed. Avoid such accessor side effects in supported tool return values.

Native ve başka realm'den gelen Promise'larda, olağan thenable nesnelerde sonuç/hata kimliği korunur; thenable çağrısı mikro göreve ertelenir. Okumalar arasında davranışı değişen zararlı `then` getter'ları için tam şeffaflık iddia edilmez. `then` incelenirken hata atarsa özgün senkron dönüş nesnesi korunur ve sonuç bilinmiyor olarak kaydedilir; framework daha sonra getter'ı yeniden çağırabilir. Promise nesnesinin birebir kimliği veya aynı mikro görev zamanlaması garanti edilmez.

Official references verified against the installed public README and declaration surface: [upstream repository](https://github.com/modelcontextprotocol/typescript-sdk), [public registration API source](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server/src/server/mcp.ts), [MCP 2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28). The repository README was also retrieved live; hosted API documentation did not open through the research tool, so no additional claim is inferred from those pages.

Resmi kaynaklar kurulu public README ve tip bildirimleriyle karşılaştırıldı. Repository README canlı alındı; barındırılmış API belgesi araştırma aracında açılamadığı için oradan ek destek iddiası üretilmedi.
