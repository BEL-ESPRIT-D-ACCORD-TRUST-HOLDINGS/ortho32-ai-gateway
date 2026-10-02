# ortho32-ai-gateway

Compact ORTHO AI Gateway core in M/MUMPS.

The previous TypeScript service tree was collapsed into executable routines and `^ORTHO(...)` globals. The gateway core no longer has DTO files, one-method wrappers, provider classes, Fastify route wrappers, or fake provider echoes.

## Runtime Path

```text
REQUEST
  -> REQ^ORTHOAI
  -> RESOLVE^ORTROUTE
  -> CHECK^ORTHEALTH
  -> CALL^ORTPROV
  -> EVENT/TOKEN^ORTSTREAM
  -> SEND^ORTIPC
  -> RECORD^ORTUSAGE
```

## Core Routines

| Routine | Purpose |
| --- | --- |
| `m/ORTHOAI.m` | Public entry points, request state machine, cancellation |
| `m/ORTROUTE.m` | Model catalog and alias routing in `^ORTHO("MODEL")` / `^ORTHO("ROUTE")` |
| `m/ORTPROV.m` | Provider dispatch to real OpenAI/Anthropic HTTP transports via `curl` |
| `m/ORTSTREAM.m` | Monotonic event sequence handling |
| `m/ORTVAULT.m` | Credential-service boundary using environment keys |
| `m/ORTHEALTH.m` | Provider health state |
| `m/ORTUSAGE.m` | Usage ledger |
| `m/ORTIPC.m` | ORTHOHost event output boundary |

## Globals

```text
^ORTHO("MODEL")   canonical model catalog
^ORTHO("ROUTE")   alias routing table
^ORTHO("HEALTH")  provider health
^ORTHO("REQ")     active request state
^ORTHO("USAGE")   usage ledger
^ORTHO("EVENT")   runtime event records
```

## Provider Credentials

The core does not invent custom cryptography. `ORTVAULT` reads provider credentials from the process environment:

```text
OPENAI_API_KEY
ANTHROPIC_API_KEY
```

If a required key is absent, the request transitions to `FAILED`. The gateway does not emit canned model output.

## Running as a service (ORTHOHost IPC)

`bin/ortho-ai-serve.sh` starts the listener ORTHOHost's `InferenceService` connects to. .NET maps
`NamedPipeClientStream(".", "ortho-ai")` to the Unix socket `/tmp/CoreFxPipe_ortho-ai`
(override with `ORTHO_AI_SOCKET`). It creates the database on first start (`ORTHO_DATA`, default
`/var/lib/ortho32-ai`), initialises the model catalog once, then runs `socat`, which forks
`bin/ortho-ai-conn.sh` per connection.

```text
host MessageEnvelope line  ->  jq (id, model, prompt)  ->  environment  ->  SERVE^ORTHOAI
                                                                               |
InferenceEvent lines  <-  ORTIPC  <-  ORTSTREAM  <-  ORTPROV (curl, 0600 config + body files)
```

- Input: one host `MessageEnvelope` JSON line; `Payload.model` (alias or `provider:model`) and `Payload.prompt`.
- Output: `InferenceEvent` lines (`CorrelationId`, `Chunk`, `Done`, `Model`, `Tokens`, optional `Error`) ending in `Done: true`.
- The reply text is the provider's message text (`choices[0].message.content` / `content[0].text`), or the whole response body if those fields are absent.
- Requires `YottaDB`, `socat`, `jq`, `curl`; keys in `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`.
- `ORTHO_OPENAI_URL` / `ORTHO_ANTHROPIC_URL` override the provider endpoints (used by the tests and for internal proxies).
- Prompts are limited to 120000 bytes (a single environment string is capped at 128 KiB).
- Provider data never reaches a shell command line: the body and credential header go through 0600 files, and request ids are validated (`[A-Za-z0-9_-]{1,64}`).

## Example M Invocation

With YottaDB available, the global directory configured (record size >= 1048576 for large prompts, see `bin/ortho-ai-serve.sh`), and `m/` on the routine path:

```mumps
DO INIT^ORTHOAI
SET OK=$$REQ^ORTHOAI("REQ-1","coding.default","Say HELLO exactly.")
WRITE "STATE=", $$STATE^ORTHOAI("REQ-1"), !
```

`REQ` writes the `InferenceEvent` lines to the current output as it goes.

Calling convention: labels that return a value (`REQ`, `RESOLVE`, `CHECK`, `CALL`, `KEY`, ...) are called with `$$`;
labels that do not (`INIT`, `EVENT`, `SEND`, `RECORD`, `TOKEN`, `FAIL`, `SERVE`) are called with `DO`.

## Verification

```bash
npm test          # static collapse gate (no YottaDB needed)
npm run test:e2e  # needs YottaDB ($ydb_dist), socat, jq, curl, node
```

The static gate verifies:

- no TypeScript gateway core remains under `src/`
- exactly 8 core M routines exist
- required executable labels exist
- required `^ORTHO(...)` global subtrees are used
- provider dispatch uses `curl` against the real provider URLs
- `$ZF(-1,...)` is not used (it silently does nothing on YottaDB r2.06; use `ZSYSTEM`)

The end-to-end test runs the real chain (socat, bridge, YottaDB, curl, jq) against a local mock of the
provider APIs and checks: exact round-trip of quotes, backslashes, newlines, tabs, control characters and
UTF-8; a 100000-byte prompt; auth headers; shell-injection attempts; terminal error events for an unknown
model, a missing key and malformed input; temp-file cleanup; and that keys never reach the logs.
It does not call the real OpenAI or Anthropic APIs.

---

## Sovereign Boundary

This repository operates under the **SnapKitty Method**: public by default, sovereign by construction.

```
CODE        → PUBLIC      (this repository)
PROOF       → PUBLIC      (Lean 4 / formal verification artifacts)
SPEC        → PUBLIC      (interfaces, schemas, invariants)
HISTORY     → PUBLIC      (cryptographic provenance, WORM-sealed)

AUTHORITY   → SOVEREIGN   (Bel Esprit D'Accord Irrevocable Trust)
STATE       → SOVEREIGN   (credentials, private data, operational secrets)
EXECUTION   → AUTHORIZED  (requires sovereign state — not in this repo)
```

> **"Here is the machine. You do not own the state it operates on."**

Reading the source does not grant execution authority. Forking the repo does not grant deployment rights. The code is verifiable. The authority is not transferable.

**[→ Full architecture: SOVEREIGN_METHOD.md](./SOVEREIGN_METHOD.md)**

**[→ License terms: LICENSE](./LICENSE)** · **[→ IP estate: NOTICE](./NOTICE)**

---

*Copyright (C) 2026 Bel Esprit D'Accord Irrevocable Trust (EIN 42-697643) · `Ω = TRUST ∧ CODE`*
