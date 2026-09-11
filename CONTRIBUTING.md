# Contributing to Pulse

[English](#development-setup) · [Türkçe](#türkçe)

Pulse SDK is MIT licensed. The separate proprietary Cloud repository is not required for a contribution and its code must not be copied here. Read [LICENSE](LICENSE) and [AGENTS.md](AGENTS.md) before editing.

## Development setup

Use Node.js **24.20.0**, pnpm **11.22.0**, and Python 3 for the cross-language identity fixtures. Node.js 24.11.1 is also in the tested matrix.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm verify:pack
```

`check` verifies generated contracts, builds the packages, checks core's actual dependency graph, typechecks, runs tests, and executes the public conformance and identity fixtures. `verify:pack` tests real archives in an independent consumer; it does not publish them.

For integration or performance changes, also run the relevant examples and benchmark:

```sh
pnpm example:local
pnpm example:otel
pnpm fixture
pnpm benchmark
```

Use harmless local fixtures. Do not send benchmark load to customer collectors or include credentials, customer data or private Cloud code in tests and reports.

## What a contribution should preserve

- Keep core independent of Cloud and optional I/O integrations. Queue, retry and privacy logic belong in versioned packages; generated integration files should stay thin.
- Add regression tests that demonstrate a real behavior: handler results, cancellation, retry IDs, partial acceptance, privacy or installed package consumption.
- Change event fields together with the canonical schema, generated types, privacy policy and compatibility fixtures. Run `pnpm contracts:generate` after an intentional schema change, then review the generated diff.
- Expand runtime or MCP support only after testing actual installed versions. Do not infer Pulse support from an upstream package's engine range.
- Keep first-party strings and errors available in English and Turkish. Use language-neutral APIs and identifiers.
- Preserve measurement meaning: observed handler completion is not full MCP or business success; an account is not a person; missing data stays missing. Never average percentiles or daily unique counts.

Explain the problem, resulting behavior and checks performed in your pull request. Keep unrelated work out of the diff. Release, deployment and credential changes belong in separately reviewed maintainer operations.

## API and contract proposals

Small, reversible fixes can go directly to a focused patch. For public API, schema, identity or measurement changes, add a short numbered proposal under [`docs/adr/`](docs/adr/):

1. The concrete problem and observed evidence.
2. Options considered and the proposed decision.
3. Compatibility and privacy implications.
4. A fixture or migration plan.
5. Status, owner and date.

Mark proposals as proposed until reviewed. Describe the independent conformance evidence and the scope of each contract; do not claim industry-standard status without adoption. Exporter and adapter authors can start with the [public contracts and fixtures](docs/contracts.md).

Report ordinary bugs in [GitHub issues](https://github.com/selimeneserd/pulse-sdk/issues). For vulnerabilities, use the private reporting process in [SECURITY.md](SECURITY.md).

## Türkçe

Pulse SDK MIT lisanslıdır. Katkı için ayrı Cloud deposu gerekmez; özel Cloud kodunu bu depoya kopyalamayın. Düzenleme öncesinde LICENSE ve AGENTS.md dosyalarını okuyun.

Geliştirme için Node.js **24.20.0**, pnpm **11.22.0** ve diller arası kimlik vektörleri için Python 3 kullanın. Node.js 24.11.1 de test matrisindedir. Önce `pnpm install --frozen-lockfile`, ardından `pnpm check` ve `pnpm verify:pack` çalıştırın. Paketleme npm'e yayın yapmaz. Entegrasyon veya performans değiştiyse ilgili yerel örnekleri ve benchmark'ı da doğrulayın.

Core'un Cloud'dan bağımsızlığını, sınırlı kuyruk/retry davranışını ve gizlilik sınırlarını koruyun. Gerçek bir sınırı doğrulayan regresyon testi ekleyin. Yeni olay alanlarını kanonik şema, üretilen tipler, gizlilik kuralları ve uyumluluk testleriyle birlikte güncelleyin. Yeni sürüm desteğini gerçek kurulumla kanıtlayın; EN/TR metinleri birlikte tutun.

Handler tamamlanmasını MCP veya iş başarısı saymayın; hesabı insanla eşitlemeyin ve eksik veriyi uydurmayın. Yüzdelikleri veya günlük tekil sayıları ortalamayın. Testlerde müşteri verisi ve gerçek anahtar kullanmayın; müşteri collector'larına benchmark yükü göndermeyin.

Pull request açıklamasında sorunu, değişen davranışı ve çalıştırdığınız kontrolleri belirtin. Public API, şema, kimlik veya ölçüm değişikliği için kısa ADR hazırlayın; kararın durumunu ve uyumluluk etkisini açık yazın. Yayın, deploy ve credential değişiklikleri ayrı maintainer incelemesine tabidir. Normal hatalar GitHub issues üzerinden, zafiyetler SECURITY.md'deki özel kanal üzerinden bildirilmelidir.
