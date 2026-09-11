# Local workflow / Yerel kullanım

The 0.2.0 examples run from this checkout after `pnpm build`. They do not require a Cloud account, write key, internet connection or Cloud repository at runtime. Installing the initial dependencies can require network access; the packed gate installs first and forbids runtime network APIs separately.

Sürüm adayı örnekleri `pnpm build` sonrasında bu depodan çalışır. Çalışma zamanında Cloud hesabı, write key, internet veya Cloud deposu gerekmez. İlk bağımlılık kurulumu ağ gerektirebilir; paket testi kurulumu ve ağsız çalıştırmayı ayrı doğrular.

```sh
pnpm build
node examples/local.ts pulse-events.jsonl
node packages/mcp/dist/cli.js dev --file pulse-events.jsonl --locale en
node packages/mcp/dist/cli.js dev --file pulse-events.jsonl --locale tr
```

`examples/local.ts` connects the official MCP 2.0.0 client and server through its public `InMemoryTransport`, invokes the registered `sum` tool and exports the observed completion to JSONL. This transport negotiates the SDK's legacy session protocol; the separate real Streamable HTTP fixture verifies protocol 2026-07-28. No socket is required for the local example. JSONL defaults in this example are a 1 MiB active-file bound and two retained files including the active file; exporter writes are serialized and limits belong to the exporter, while queue/retry limits belong to core. Local file acceptance is not an fsync/durability guarantee. Tool names are part of the privacy allowlist and can still contain sensitive business terms: map or exclude them before collection.

Örnek, resmi MCP 2.0.0 istemci/sunucusunu public `InMemoryTransport` ile bağlar, kayıtlı `sum` aracını çağırır ve gözlemlenen tamamlanmayı JSONL dosyasına aktarır. Bu transport eski oturum protokolünü müzakere eder; ayrı Streamable HTTP testi 2026-07-28 protokolünü doğrular. Yerel örnek soket açmaz. Örnekte etkin dosya sınırı 1 MiB, etkin dosya dahil tutulan toplam dosya sayısı ikidir. Dosya kabulü fsync/kalıcılık garantisi değildir. İzinli araç adları da hassas iş terimleri içerebilir; toplama öncesinde eşleyin veya hariç bırakın.

After installing `@reviseflow/pulse@0.2.0` from npm, `pulse` is the package's CLI executable:

Aday paket arşivleri kurulduktan sonra `pulse`, paketin CLI komutudur:

```sh
pulse init --dry-run --cwd ./my-server --locale tr
pulse init --yes --cwd ./my-server --locale tr
pulse doctor --cwd ./my-server --locale tr
pulse doctor --cwd ./my-server --file pulse-events.jsonl --locale tr
pulse dev --file pulse-events.jsonl --locale tr
```

- `init` checks the project manifest and installed MCP version, then previews one thin `pulse.integration.ts` file. `--yes` or `--non-interactive` explicitly writes it; `--dry-run` always prevents writes. An identical existing file is unchanged; a different file or symlink is refused. It does not install packages, upgrade MCP, edit handlers, load project code or read environment secrets. Import `pulse` from the generated file, call `pulse.wrapServer(originalServer)` before tool registration, and connect `pulse.shutdown({ timeoutMs: 2_000 })` to the application's shutdown path yourself.
- `doctor` reports static compatibility separately from runtime facts. Handler observation, queueing, attempted export and collector acceptance remain `unknown` unless observed by a running SDK. A supplied JSONL file is only historical local-export evidence; it cannot prove current server health or remote acceptance. No tool is invoked and no endpoint is contacted.
- `dev` reads at most 10 MiB, 10,000 records and 200 distinct tool names from one regular file, validates with the public schema, and reports per-tool handler counts, nearest-rank p50/p95/p99 and outcomes. Repeated event IDs within the inspected prefix count once, with a separate duplicate count. It calculates percentiles from the individual observations; it never averages percentiles. Invalid records are counted without printing their content. Output marks prefix truncation. Rotated files and discarded events are not silently included in totals.
- All output uses JSON-escaped strings on **stderr**, leaving stdout available to MCP stdio. `--locale en|tr` selects first-party messages. There is no web server, tracking, polling, auto-update or remote configuration.

`init`, tek ince dosyayı önizler; açık yazma bayrağı olmadan değişiklik yapmaz, var olan farklı dosyayı veya symlink'i ezmez. Paket kurmaz, sürüm yükseltmez, handler veya proje kodu çalıştırmaz. `doctor` statik uyumluluğu çalışma zamanı gözleminden ayırır; JSONL geçmiş yerel kanıttır. `dev` en çok 10 MiB, 10.000 kayıt ve 200 araç adını doğrular, bireysel handler gözlemlerinden yüzdelik hesaplar. Aynı event ID bir kez sayılır, yinelenenler ayrıca raporlanır. Bozuk satır içeriklerini yazmaz; kesilmeyi bildirir. Bütün çıktı stderr'e gider; stdout MCP stdio için boş kalır.
