# ADR 0001 — injected I/O, stable events / Enjekte edilen I/O, kararlı olaylar

Accepted locally 2026-09-11. Keep public package names;0.2.0 changes construction from endpoint/writeKey to explicit exporter. No implicit exporter: diagnose missing configuration and retain no events; explicit noop communicates intent. Explicit exporter enables local development by default; enabled:false remains inert. Node24 ESM only; use native crypto/AsyncLocalStorage, not a browser claim.

One dispatcher owns count/byte bounds, one logical in-flight batch, timeout, retries, flush snapshots and recovery. Exporters perform a single abort-aware attempt. Ignore unknown/contradictory acknowledgements and retry unresolved IDs with original event IDs. Drop oldest queued items, never evict active I/O. Auth requires deliberate reconfiguration/resume; generic429 has bounded retry, with no plan calendar inside core. Never claim durable/exactly-once SDK delivery.

Canonical JSON Schema v1 generates TS wire shape. Version numbers are build-derived separately; optional adapter_version is additive, old events stay valid. Collector implementations independently decide and document their admission/storage boundary. Cloud retains durable commit-before-accepted.

TR: Paket adları ve olayın handler anlamı korunur;0.2.0 kurucu API'si kırıcıdır. Exporter açık seçilir; anahtar ve ağ zorunlu değildir. Tek kuyruk/retry sahibi dispatcher'dır. Şema kanoniktir; Cloud kotası core'a taşınmaz. Yerel JSONL disk kaydı process-crash sıfır kayıp garantisi vermez.
