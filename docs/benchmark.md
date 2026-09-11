# Benchmark evidence / Benchmark kanıtı

## English

Measured on 2026-09-11T16:31:51.892Z: Node **v24.20.0**, macOS `25.1.0`, Apple M1 arm64, 8 logical CPUs, 16 GiB RAM. The base Git SHA is `9f17526705be0ca4bbabe5a7b65e3de6f9c83dc3` with uncommitted implementation changes. The [machine-readable artifact](evidence/benchmark-20260911.json) records exact dependency versions and SHA-256 fingerprints of the benchmark and loaded SDK modules. The runner refuses to save evidence if those files change during its run.

```sh
# Use Node 24.20.0 to reproduce this particular measurement baseline.
pnpm build
node scripts/benchmark.ts docs/evidence/benchmark-20260911.json
```

The runner executes **24 microbenchmark cases × 3 repetitions**, plus **4 real MCP HTTP modes × 3 repetitions**. Every microbenchmark run warms up 100 calls; each real HTTP run warms up 10 calls and then measures 50 client calls. No customer tools, authentication keys, or remote collectors are used. The slow collector waits 15 ms on loopback; the unavailable collector uses a just-closed ephemeral loopback port; the stalled collector intentionally never responds. Baseline and disabled cases have modules already loaded: these measurements make no import/startup-cost claim.

Microbenchmark calls invoke the public `RegisteredTool.handler` returned by the installed official MCP 2.0.0 server. The SDK has wrapped that callback through public registration. This measures synchronous handler-invocation overhead, including event construction and optional HMAC context. It excludes waiting for async telemetry I/O and excludes the MCP request/response stack. A separate real `Client.callTool`/Streamable HTTP experiment measures the latter. The handler returns the same frozen empty result in every case; identity or result replacement fails the runner.

The following values are pooled individual invocation observations from the **sustained** workload: 600 calls per repetition, with a 1 ms timer yield after each 25 calls. Percentiles are nearest-rank quantiles over all individual observations; percentiles are never averaged. Ratios compare absolute mean invocation time with the matching absent baseline.

| Export mode | Identity | Mean µs | p95 µs | p99 µs | Mean / absent |
|---|---|---:|---:|---:|---:|
| absent | off / kapalı | 0.107 | 0.125 | 0.583 | 1.00× |
| disabled | off / kapalı | 0.174 | 0.208 | 1.708 | 1.63× |
| memory | off / kapalı | 20.506 | 29.542 | 131.250 | 192.22× |
| memory | on / açık | 19.601 | 55.667 | 159.375 | 183.73× |
| http_healthy | off / kapalı | 3.417 | 7.750 | 23.917 | 32.03× |
| http_healthy | on / açık | 8.869 | 15.000 | 35.750 | 83.13× |
| http_slow | off / kapalı | 4.125 | 7.666 | 25.458 | 38.67× |
| http_slow | on / açık | 11.109 | 15.750 | 29.167 | 104.13× |
| http_unreachable | off / kapalı | 3.391 | 6.500 | 16.917 | 31.79× |
| http_unreachable | on / açık | 9.515 | 14.375 | 35.250 | 89.19× |

These are measurements of one machine and workload, not a universal overhead budget. The empty-handler baseline is close to timer resolution; ratios therefore amplify tiny absolute differences. Disabled appearing faster in a run is noise/JIT/order sensitivity, not evidence that instrumentation speeds up an application. Cases run sequentially in one process without forced GC or randomized order. Do not use the apparent ordering of exporter modes to rank performance.

Real Streamable HTTP MCP requests, 150 measured requests pooled per mode:

| Mode | p95 request ms | p99 request ms | Per-run requests/s range |
|---|---:|---:|---:|
| absent | 2.719 | 2.932 | 460–483 |
| disabled | 2.520 | 2.678 | 486–520 |
| memory | 2.459 | 2.602 | 502–537 |
| http_healthy | 2.419 | 2.566 | 508–561 |

These full-request samples include the local MCP protocol/HTTP stack and cannot be interpreted as the event's observed handler duration. Sparse tail samples, JIT, garbage collection, and concurrent system work affect p99. There are no timing assertions or claims of statistically significant speedups.

The complete JSON retains each repetition's throughput, CPU user/system time, RSS before/after/sample maximum, heap delta, event-loop p95/p99, peak pending event/encoded-byte counts, lifecycle duration, collector acceptance, and every drop reason. HTTP collector and exporter share the process, so process CPU includes both; synchronous invocation samples are reported separately. RSS is sampled every 25 invocations and before/after, and is not an isolated exact peak. Memory limits bound queued encoded metadata, not total process RSS or JavaScript object overhead.

Observed reliability results in all three repetitions:

- Sustained healthy/slow collector and memory cases accepted all 600 measured events with no drops, including both identity settings.
- A synchronous 1,500-call burst fills the 1,000-event limit before a microtask can export: 1,000 events were accepted and 500 oldest queued events were dropped for healthy/local modes. This intentional overload illustrates bounded best effort, not zero-loss delivery.
- With `maxEvents: 64`, 2,000-call memory and slow-HTTP bursts accepted 64 events and dropped 1,936 oldest queued events. Encoded bytes and in-flight events remained in the configured accounting limits.
- The unavailable collector accepted zero events; retries were bounded and dropped observations were counted. No later acceptance was invented.
- The stalled collector shutdown scenario dropped its 200 pending observations and finished within **9.63 ms** in this run with a requested 10 ms deadline. Event-loop scheduling can add a small delay; this is no hard real-time guarantee.

The raw artifact records the actual queue/retry configuration and each repetition independently. Re-run after substantive code changes, compare absolute times and distributions, and use repeated isolated benchmark jobs before setting performance budgets. The test suite provides deterministic correctness checks for queue, retry, timeout, auth recovery, and handler preservation; this runner adds empirical performance evidence.

## Türkçe

Bu belge 2026-09-11T16:31:51.892Z tarihinde **Node v24.20.0 / Apple M1 / arm64 / 16 GiB RAM** ortamında gerçekten çalıştırılmış sonuçları içerir. Başlangıç commit'i `9f17526705be0ca4bbabe5a7b65e3de6f9c83dc3`; çalışma ağacı henüz commit edilmemiş değişiklikler içeriyor. JSON çıktısında tam bağımlılık sürümleri, ayarlar, tekrarlar ve çalıştırılan SDK dosyalarının SHA-256 değerleri var. Kod çalışırken değişirse ölçüm kaydedilmez.

Yukarıdaki komut **24 senaryoyu üçer kez** ve **4 gerçek MCP HTTP modunu üçer kez** çalıştırır. Mikro ölçümlerde her tekrarda 100 ısınma çağrısı, gerçek MCP ölçümlerinde 10 ısınma ve 50 ölçülen çağrı vardır. Yalnızca yerel test araçları ve loopback collector kullanılır. Gerçek müşteri verisi, Cloud hesabı veya gizli anahtar gerekmez.

İlk tablo resmi MCP sunucusunun public kayıt handle'ındaki handler çağrısını ölçer. Senkron ölçüm; olay oluşturmayı ve isteğe bağlı HMAC kimlik bağlamını içerir; asenkron ağ gönderimini beklemez. İkinci tablo gerçek MCP client/server HTTP isteğini ölçer. **Handler süresi ve tam MCP istek gecikmesi ayrı ölçümlerdir.** Tüm p95/p99 değerleri tekil örnekler üzerinden hesaplandı; yüzdeliklerin ortalaması alınmadı.

Sürekli yükte sağlıklı/yavaş HTTP ve memory senaryoları, kimlik açık ve kapalıyken her tekrardaki 600 olayı kabul etti. Kesintisiz 1.500 çağrılık ani yük, microtask çalışamadan 1.000 olaylık kuyruğu doldurdu; 500 en eski bekleyen olay düştü. 64 olaylık sınırda 2.000 çağrının 64'ü kabul edildi, 1.936'sı düştü. Erişilemeyen collector için kabul sıfır kaldı ve sınırlı retry sonrasında düşüşler sayıldı. Yanıt vermeyen collector'a karşı 10 ms shutdown bütçesi bu çalışmada en fazla 9.63 ms sürdü; 200 bekleyen olay düştü.

Bunlar tek makinedeki kanıtlardır; her uygulamada aynı süre veya kayıpsız teslim garantisi vermez. Boş handler'ın taban maliyeti saat çözünürlüğüne yakın olduğundan oranlar büyük görünebilir; mutlak mikrosaniye değerleriyle birlikte okunmalıdır. Kapalı SDK'nin bazı örneklerde daha hızlı görünmesi JIT/sıralama/gürültü etkisidir. Senaryolar aynı process'te sırayla çalışır; GC zorlanmaz. HTTP process CPU değerleri aynı process'teki collector'ı da içerir. RSS her 25 çağrıda örneklenir; kuyruk bayt sınırı toplam process belleği sınırı değildir. JSON, CPU/bellek/event-loop/throughput/kabul/düşüş/lifecycle ayrıntılarını her tekrar için ayrı saklar.
