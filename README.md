# Pulse SDK

Open-source analytics for MCP tool handlers. Observe calls locally, then send the same metadata to your own collector or an optional managed backend.

[**Türkçe**](README.tr.md) · [Local quickstart](#run-locally) · [Documentation](#documentation) · [Contributing](CONTRIBUTING.md)

> **Version status:** this repository contains the **0.2.0 source API**. The latest npm releases of `@reviseflow/pulse` and `@reviseflow/pulse-core` are **0.1.0**, which use the previous API. **0.2.0 has not been published to npm.** Use this checkout or its locally packed archives for the examples below; see the [migration guide](docs/migration-release.md) for existing installations.

## Run locally

Use **Node.js 24.20.0** and **pnpm 11.22.0**. Node.js 24.11.1 is also tested; the adapter targets the official MCP TypeScript SDK **2.0.0**. See the [compatibility matrix](docs/compatibility.md) for the exact evidence and limitations.

```sh
git clone https://github.com/selimeneserd/pulse-sdk.git
cd pulse-sdk
pnpm install --frozen-lockfile
pnpm example:local
node packages/mcp/dist/cli.js dev --file pulse-events.jsonl
```

This runs a real MCP client/server call through the official in-memory transport, records its handler completion in a bounded JSONL file, and reports the observed tool, duration percentiles and outcome. The example runs with network APIs blocked. Initial dependency installation can require internet; runtime observation needs no Cloud account, write key or Cloud repository.

The CLI writes to **stderr**, leaving stdout available for MCP stdio. Its local report deduplicates event IDs within the inspected file prefix and reports invalid, omitted and truncated records explicitly.

## Add Pulse to a server

Choose an exporter and wrap the server **before registering tools**. These APIs are also exercised in [`examples/quickstarts.ts`](examples/quickstarts.ts).

```ts
import { McpServer } from '@modelcontextprotocol/server';
import { createPulse } from '@reviseflow/pulse';
import { createJsonlExporter } from '@reviseflow/pulse-core/jsonl';

const pulse = createPulse({
  environment: 'development',
  exporter: createJsonlExporter({ path: './pulse-events.jsonl' }),
});

const server = pulse.wrapServer(
  new McpServer({ name: 'my-mcp', version: '1.0.0' }),
);

server.registerTool('health', {}, () => ({
  content: [{ type: 'text', text: 'ok' }],
}));
```

Connect `server` through your application's existing transport. Call `await pulse.shutdown({ timeoutMs: 2_000 })` from its shutdown hook. For a lifecycle boundary that keeps the application running, use `await pulse.flush({ timeoutMs: 2_000 })`. Neither operation guarantees delivery after a process is frozen or terminated.

After installing the locally packed candidate in another project, `pulse init --dry-run` previews a thin integration file. `pulse doctor` distinguishes static configuration from observed runtime facts. These commands do not install dependencies, upgrade MCP or invoke business tools. See the [CLI guide](docs/tooling.md).

## Choose where events go

| Exporter | Import | What acceptance means |
| --- | --- | --- |
| Memory | `@reviseflow/pulse-core/memory` | Retained in bounded process memory. |
| Explicit no-op | `createNoopExporter()` from `/memory` | Intentionally discarded. |
| JSONL | `@reviseflow/pulse-core/jsonl` | Appended locally with rotation; no fsync guarantee. |
| HTTP | `@reviseflow/pulse-core/http` | A validated acknowledgement from your explicit collector URL. |
| OpenTelemetry | `@reviseflow/pulse-otel` | Handed to your local tracer; remote delivery belongs to its provider. |

Core has **zero third-party runtime dependencies**. It owns the bounded dispatcher and receives an exporter; its root entry does not load HTTP, filesystem or OTel exporters. Native Node.js crypto and async context are required.

Without an exporter, observation is disabled and diagnostics report `missing_exporter`. `enabled: false` leaves the original server unpatched. There is no default collector URL, hidden fallback request, license check, remote configuration, update check or usage telemetry.

## Optional Pulse Cloud

[Pulse Cloud](https://pulse.reviseflow.io/en) is a separate proprietary service for managed storage, analysis and collaboration. It consumes the same public collector contract that an independent implementation can use.

Configure it through the generic HTTP exporter using your existing **server-side** configuration:

```ts
import { createPulse } from '@reviseflow/pulse';
import { createHttpExporter } from '@reviseflow/pulse-core/http';

export function createManagedPulse(endpoint: string, writeKey: string) {
  return createPulse({
    environment: 'production',
    exporter: createHttpExporter({
      endpoint, // Explicit, complete collector URL, including /v1/batch.
      authorization: `Bearer ${writeKey}`,
    }),
  });
}
```

Validate required configuration in your application and keep write keys out of the browser. Before using the 0.2.0 API with a collector, confirm it accepts the optional `adapter_version` field. The [migration guide](docs/migration-release.md) covers existing 0.1.0 installations, rollout order and rollback.

## What Pulse measures

- **Observed handler completions**, not every MCP request or business success. Input validation before the handler and failures after it returns fall outside this boundary.
- Handler duration in monotonic milliseconds, with a separate wall-clock completion timestamp.
- Optional project-scoped account pseudonyms. An account is not a person; self-reported client labels are not verified host identities.

Pulse does not collect raw arguments, results, prompts, error messages, stacks, headers or arbitrary properties. Tool and release names can still reveal business information: map or exclude sensitive labels. Optional HMAC identity is pseudonymous and linkable, not anonymous.

Queues, byte budgets and retries are bounded. Export failure does not replace a handler result. Auth recovery uses `reconfigure({ exporter })` or `resume()` on the existing instance; dropped events do not return. Pulse is best-effort analytics, not a durable audit ledger or an exactly-once delivery system.

## Documentation

| Topic | Guide |
| --- | --- |
| Local development and CLI | [Tooling](docs/tooling.md) |
| Supported runtime, MCP and module formats | [Compatibility](docs/compatibility.md) |
| Event/collector contracts and extension authoring | [Contracts](docs/contracts.md) |
| Privacy, identity, lifecycle and diagnostics | [Privacy and lifecycle](docs/privacy-lifecycle.md) |
| OpenTelemetry and Python scope | [Integration mapping](docs/otel-mapping.md) |
| Reproducible performance results | [Benchmarks](docs/benchmark.md) |
| API migration and release preparation | [Migration](docs/migration-release.md) · [Changelog](CHANGELOG.md) |
| AI-assisted setup | [Agent recipe](docs/agent-setup.md) |
| Evidence and remaining work | [Implementation status](docs/implementation-status.md) |

To validate a contribution, run `pnpm check` and `pnpm verify:pack`. The latter creates real archives, installs them in an independent consumer, and checks types, offline MCP calls, HTTP delivery, bundling and duplicate package copies. Packing does **not** publish packages.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution and RFC process. Report ordinary bugs through [GitHub issues](https://github.com/selimeneserd/pulse-sdk/issues); consult [SECURITY.md](SECURITY.md) before sharing a vulnerability. The SDK is [MIT licensed](LICENSE); Cloud code is separate and is not needed to build or test it.
