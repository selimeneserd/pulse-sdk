# Pulse repository rules

- Read this repository's LICENSE before editing. SDK is MIT/public-intended; cloud is private proprietary. Never copy cloud code into SDK or initialize the shared parent directory as a public repo.
- Use current verified installed SDK documentation. Record exact dependency baseline and compatibility fixtures.
- No raw args/results/prompts/headers/error messages/PII in telemetry or logs. Strict schema, optional project-scoped identity.
- All tenant access checked server-side; DB/RLS negative tests mandatory. No write-key analytics reads.
- EN/TR for all first-party user-facing strings, errors, mail and metadata. Keep APIs/IDs locale-neutral.
- No synthetic production fallbacks. Demo data only in explicitly labelled demo/test boundaries.
- Basic metrics are observed handler calls; account ≠ person; client is self-reported; missing data stays missing.
- Never average percentiles or daily unique counts. Follow golden fixtures.
- Exporter failure must not alter original tool result. Bounded best-effort telemetry, no zero-loss claim.
- Run tests per milestone. Keep BUILD_STATUS.md with real evidence and explicit blockers.
- Never publish, deploy production, alter external credentials, charge cards or delete production data without owner authorization.

## This repository

SDK: MIT; public-intended, unpublished. Owner attribution/scope require review before publishing.
