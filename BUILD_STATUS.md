# SDK delivery status / SDK teslim durumu

Updated 2026-09-11. **0.2.0 is a source release candidate; npm still provides 0.1.0.** Source commit [`f10a9c3`](https://github.com/selimeneserd/pulse-sdk/commit/f10a9c3c455ed505e8ce2d6b39bafd2b0ecf3de5) is pushed. [GitHub CI](https://github.com/selimeneserd/pulse-sdk/actions/runs/34625143572) passed on Ubuntu 24.04 with Node 24.11.1 and 24.20.0, including clean packed consumers. The optional Cloud collector accepted both SDK versions through real public HTTPS, with durable storage and preserved original MCP results.

## Verified implementation

- Independent MIT core with zero third-party runtime dependencies; explicit exporters for memory, JSONL, generic HTTP and optional OpenTelemetry.
- Public event/batch/ack contracts, bounded dispatcher, recovery/lifecycle controls, MCP adapter and EN/TR CLI.
- **133 tests passed on Node 24.11.1 and 24.20.0**, with TypeScript, package builds, public contract conformance, import graph checks and 12 Node/Python identity vectors.
- All three packed packages passed clean consumer installation on both runtimes, including the installed CLI, network-disabled real MCP, HTTP, duplicate package copies and an ESM bundle.
- An 84-run benchmark records CPU, memory, event-loop delay, latency, throughput and overflow/shutdown behavior. It is one-machine evidence, not a universal overhead or zero-loss guarantee.

Detailed scope and original/final test logs: [implementation status](docs/implementation-status.md), [compatibility](docs/compatibility.md), [benchmark](docs/benchmark.md), [packed consumer](docs/evidence/packed-consumer.json).

## Release boundaries

GitHub source and npm publication are separate. The 0.2.0 constructor requires an explicit exporter and is a breaking change from npm 0.1.0. Follow the [migration guide](docs/migration-release.md). The SDK requires no Cloud account, key or subscription for local collection. Cloud is an optional independent consumer and remains proprietary.

No Python SDK, browser/Edge/CJS support, arbitrary MCP versions, external host certification or successful human pilots are claimed. GitHub private vulnerability reporting is enabled and verified; see [SECURITY.md](SECURITY.md). npm 0.2.0 publication and real customer pilots remain pending.

## Türkçe

**0.2.0 kaynak kodu yayın adayıdır; npm üzerinde 0.1.0 vardır.** SDK kaynakları GitHub’a gönderildi; Ubuntu üzerinde iki Node sürümünün CI kontrolleri geçti. Ayrı Cloud servisi dağıtıldı; iki SDK sürümüyle gerçek genel HTTPS akışı, kalıcı kayıt ve özgün MCP sonucu doğrulandı.

İki Node sürümünde 133 test, tip/build kontrolleri, üç gerçek paket tüketicisi, çevrimdışı MCP, HTTP, CLI ve kimlik vektörleri geçti. Yerel kullanım Cloud hesabı veya anahtarı istemez. Yeni kurucu açık exporter gerektirir; npm yayını, daha geniş runtime desteği ve kullanıcı pilotları doğrulanmış sayılmaz.
