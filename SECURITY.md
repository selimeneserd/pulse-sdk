# Security / Güvenlik

## Report a vulnerability privately

GitHub private vulnerability reporting is enabled for this repository. Use [**Report a vulnerability**](https://github.com/selimeneserd/pulse-sdk/security/advisories/new) to contact the maintainers privately. A GitHub account may be required.

Include the affected package/version, expected and observed behavior, and a minimal reproduction using synthetic data. Do not include live credentials or customer records. Keep vulnerability details and exploitable reproductions out of public issues and pull requests.

If the private form is unavailable, open only a non-sensitive [request for a private contact channel](https://github.com/selimeneserd/pulse-sdk/issues). Do not attach the vulnerability details to that request.

## Scope and boundaries

The SDK is public and MIT licensed; Pulse Cloud is a separate proprietary product. The current published core, MCP and optional OpenTelemetry packages are 0.2.0. Include the actual installed version in a report.

Use local synthetic fixtures and systems you are authorized to test. Do not probe another tenant or production system without permission. SDK telemetry is best effort, not a tamper-proof audit ledger. Optional HMAC identities are pseudonymous and linkable; tool and release names may expose business information. Exporters are application-trusted code, and write credentials belong only on the server.

See the [privacy and lifecycle guide](docs/privacy-lifecycle.md) for the field policy and delivery limits.

## Zafiyeti özel olarak bildirin

Bu depoda GitHub özel zafiyet bildirimi etkindir. Maintainer'lara özel olarak ulaşmak için [**Report a vulnerability**](https://github.com/selimeneserd/pulse-sdk/security/advisories/new) formunu kullanın. GitHub hesabı gerekebilir.

Etkilenen paket/sürümü, beklenen ve gözlenen davranışı, sentetik verilerle hazırlanmış küçük bir örneği ekleyin. Canlı anahtar veya müşteri kaydı göndermeyin. Zafiyet ayrıntılarını ve kullanılabilir saldırı örneklerini açık issue veya pull request içinde paylaşmayın.

Özel form kullanılamıyorsa yalnızca hassas olmayan bir [özel iletişim kanalı talebi](https://github.com/selimeneserd/pulse-sdk/issues) açın. Zafiyet ayrıntılarını bu talebe eklemeyin.

## Kapsam ve sınırlar

SDK herkese açık ve MIT lisanslıdır; Pulse Cloud ayrı, özel kaynak kodlu bir üründür. Yayımlanmış core, MCP ve isteğe bağlı OpenTelemetry paketlerinin güncel sürümü 0.2.0'dır. Bildiriminizde gerçekten kurulu sürümü belirtin.

Yerel sentetik fixture'lar ve test yetkiniz olan sistemlerle çalışın. Başka tenant'ları veya production sistemlerini izinsiz test etmeyin. Telemetri best-effort'tur; değiştirilemez audit ledger değildir. İsteğe bağlı HMAC kimlikleri ilişkilendirilebilir; araç ve sürüm adları iş bilgisi taşıyabilir. Exporter uygulamanın güvendiği koddur; write credential'lar yalnızca sunucuda tutulmalıdır.

Alan politikası ve teslim sınırları [gizlilik ve yaşam döngüsü rehberinde](docs/privacy-lifecycle.md) bulunur.
