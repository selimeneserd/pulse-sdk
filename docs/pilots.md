# Five independent pilots / Beş bağımsız pilot

**Plan only; zero pilots/users/interviews claimed.** Target operators of remote MCP servers already used by others, typically solo developers/small teams. No SDK phone-home. Open-source adoption is only partially observable; voluntary reports are separate from Cloud conversion.

| Pilot slot | Operator consent | First local event | Continued use week2/4 | Repeated blockers | External contribution | Optional Cloud conversion |
|---|---|---|---|---|---|---|
|1|pending|not measured|not measured|unknown|unknown|unknown|
|2|pending|not measured|not measured|unknown|unknown|unknown|
|3|pending|not measured|not measured|unknown|unknown|unknown|
|4|pending|not measured|not measured|unknown|unknown|unknown|
|5|pending|not measured|not measured|unknown|unknown|unknown|

Integration checklist: consent and actual stack/version; reproduce current handler result; use local JSONL first; measure unassisted time-to-first-observed-event; prove privacy allowlist with synthetic sentinel; simulate collector outage/queue pressure locally; integrate lifecycle; optionally select managed endpoint; record accepted/drop evidence and support needs. Do not invoke business tools or inspect customer payloads. Week2/4 continuation is voluntary self-report, not covert tracking.

Feedback form: tested runtime/MCP/Pulse versions; integration method; time and assistance needed; expected vs observed handler/MCP outcome; redacted error code only; local/export/collector evidence separately; repeated blocker; desired exporter/adapter; permission to contact again; desired Cloud value. No keys, raw tool args/results, personal identifiers or screenshots with customer data.

Decision gates: consider Python/v1 only with2 independent recurring requests and an owned real compatibility fixture. Consider permanent free Cloud plan only after owner reviews storage/support/abuse costs and conversion evidence. No pricing/quota/domain change is implied.

TR: Bu plandır; pilot/kullanıcı/görüşme yapılmış sayılmaz. İlk olay süresi, sonraki haftalarda devam, engeller, dış katkı ve Cloud dönüşümü ayrı ölçülür. Katılım gönüllüdür; SDK'ye zorunlu telemetri eklenmez. Yeni adaptör/ücretsiz plan insan kararı ve gerçek bulgu gerektirir.

## Unsent technical content outlines / Gönderilmemiş taslaklar

1. “A full handler success can still become an MCP error”: reproduce output-validation regression from real HTTP tests; show exact measurement boundary, no invented failure rates.
2. “What happens when a collector stops”: use committed benchmark config and accepted/drop counts; disclose local machine, overload, retry budget, no zero-loss claim.
3. “Cloud-free MCP observation”: run packed offline example and inspect JSONL; explain initial dependency download vs network-free runtime.
4. “Metadata-only privacy”: show schema allowlist, HMAC public vectors, sensitive tool-name caveat and unknown sampling.

Outreach draft (not sent): “We are testing an MIT MCP handler analytics SDK that works locally without an account. Would you be willing to try a harmless local integration and voluntarily share setup friction? No customer payloads or credentials are needed. Hosted storage is optional.”

TR taslak: “Hesapsız yerel çalışan MIT MCP handler analytics SDK'sını test ediyoruz. Zararsız bir yerel entegrasyonu deneyip kurulum engellerini gönüllü paylaşır mısınız? Müşteri verisi/anahtarı gerekmez; Cloud isteğe bağlıdır.”
