# Security / Güvenlik

This repository is unpublished and has no verified public security contact.
Report a suspected vulnerability privately to the repository owner through
your established channel. Do not publish real write keys, identity secrets,
customer IDs, tool payloads or exploitable customer endpoints in issues.
Use minimal local synthetic reproductions; never test against another tenant
or production installation without authorization.

SDK write credentials are server-only. Event content uses an allowlist and
identity is opt-in, HMACed at source. A compromised write key can inject
metadata; the SDK is not an authorization or tamper-proof analytics system.
Best-effort telemetry can be lost on termination, overflow or outage. Inspect
the exact packed files and dependency notices before any release.

**TR:** Repo henüz yayımlanmadı ve doğrulanmış açık güvenlik iletişim adresi
yoktur. Bulguları mevcut özel iletişim kanalınızdan repo sahibine bildirin.
Gerçek anahtarları veya müşteri verilerini paylaşmayın; küçük yerel test
örnekleri kullanın. SDK kimlik doğrulama sistemi veya kayıpsız muhasebe defteri
değildir. Yayımdan önce paket içeriği ve bağımlılık lisansları incelenmelidir.
