# Privacy, lifecycle and diagnostics / Gizlilik ve yaşam döngüsü

| Fields | Policy / Politika |
|---|---|
|event_id/schema_version/kind|UUID stable through retry; fixed schema semantics / retry boyunca aynı|
|occurred_at/duration_ms/outcome/error_code|Wall-clock completion, monotonic ms0–86400000, fixed enums; no error text|
|tool_name|1–128 ASCII identifier chars. Can reveal content; map/exclude dynamic or sensitive names|
|environment/release|Fixed environment enum; release opt-in1–80 safe identifier chars; no tenant/user/version URL|
|sdk_name/sdk_version/adapter/adapter_version|Provenance; package-generated versions, adapter-supplied bounded labels|
|client_name/version/source|Off by default; only known normalized labels, semver hints. Self-reported, not certified host identity|
|identity_source/epoch/actor_id/conversation_id|Off by default/null. Account pseudonyms, not persons. Epoch changes continuity|
|args/results/errors/stacks/prompts/headers/tokens/properties/PII|Forbidden, never copied. Public exporter boundaries reject extra fields|

TR: Teknik isimlerin içerik taşımaması uygulamanın sorumluluğundadır. Sentineller testlerle olay, HTTP, JSONL, diagnostics ve CLI sınırında aranır. Sınırlı söz dizimi tek başına anonimleştirme değildir. İstemci ve kimlik açık seçimdir; eksik veri eksik kalır.

## HMAC identity / HMAC kimlik

Optional config `identity:{secret,projectNamespace,epoch}`. Use a separately managed random secret32–4096 UTF-8 bytes; never use a write key. No identity config means no hashing/raw fallback. `withContext({actorId,conversationId?},fn)` accepts already-authenticated app account context; malformed values omit identity. Raw identifiers max4096 UTF-8 bytes; conversation without actor is omitted. Native Node HMAC-SHA256: secret UTF-8 bytes; message is compact JSON array `['pulse.identity.v1',namespace,domain,'app_account',epoch,value]` encoded UTF-8, with domain `actor` or `conversation`. No Unicode normalization; JSON escaping follows standard JSON.stringify. Prefix `h1_` + lowercase hex. Namespace1–128 and epoch1–32 ASCII alphanumeric/_/-. Public cross-language vectors include non-ASCII/emoji and composed/decomposed Unicode. Node tests and Python `pnpm identity:check` must match exact serialization bytes.

Hash before AsyncLocalStorage storage; concurrent/nested contexts isolate identities. Key/namespace/epoch rotation breaks continuity; write-key rotation does not. HMAC is pseudonymization; the key holder can recompute/link values. No anonymity, distinct-human or exact retention claim.

TR: Ayrı bir kimlik sırrı kullanın; write key kullanmayın. Unicode normalize edilmez, UTF-8 kompakt JSON ve domain ayrımı vektörlerle doğrulanır. Eksik/geçersiz kimlik ham değere düşmez. Pseudonym bağlanabilir; kişi sayısı değildir.

## Bounds and lifecycle / Sınırlar

Default queue1000 events/1MiB including in-flight and envelope overhead. Batch100 events/256KiB. Oversize single event drops; oldest queued items drop first on capacity, active I/O is never evicted. A full count/byte batch starts in a microtask; otherwise2s timer. Handler never waits on I/O. One active attempt, request timeout2s, max3 retries (4 attempts), retryBase100ms/retryMax2s. Config limits are in `core/src/config.ts`; they cannot be disabled with Infinity/negative values.

`pause()` holds existing queued items within the same cap; new events drop as paused, an already completed active acceptance can still be counted. `resume()` retries queued work/clears ordinary block; `reconfigure({exporter})` switches explicitly and resumes. Auth blocks drop data; quota/rate-limit has bounded retry then drops, without permanent plan lock. Fixing quota lets future calls use the same instance. Previously dropped records are gone. A non-cooperative exporter timeout blocks more attempts until that exporter settles; no unbounded orphan retries.

`flush({timeoutMs})` observes a finite sequence snapshot and waits at most its deadline; concurrent later events need their own flush. `shutdown({timeoutMs})` is repeatable, closes admissions, drains within the deadline, aborts remaining work, counts drops and bounds exporter shutdown. No exit/signal hooks installed. Wire this into your own lifecycle. Serverless response completion may freeze the process; explicitly await flush in a supported hook. Aborted requests/export timeout never mutate the application's cancellation signal.

Diagnostics expose local counters, queue/in-flight bytes, acceptance timestamp, retryAttempt, enum status/blockReason and separate drops. They do not contain endpoint/key/event payload or raw exceptions. Callback errors are swallowed; no automatic stdout/logging. Cloud cannot infer local drop counters when disconnected. Missing events mean unknown coverage, not zero usage or healthy telemetry. Explicit noop accepted means intentional discard, not storage. `droppedQuota` remains0 as a deprecated compatibility counter; Cloud quota interpretation was removed from core.

TR: Kuyruk aktif batch dahil sınırlıdır. Dolan batch timer beklemez. Pause mevcut bekleyeni tutar, yeniyi atar; auth/kota sonrası kayıp olay geri gelmez. Flush sonlu snapshot'tır; shutdown süreyle sınırlıdır. Serverless açık lifecycle gerektirir. Diagnostics yalnız yerel toplu durumu gösterir; Cloud bağlantısız SDK'nın kaybını bilemez.
