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

## Example M Invocation

With YottaDB or GT.M available and `m/` on the routine path:

```mumps
DO INIT^ORTHOAI
SET OK=$$REQ^ORTHOAI("REQ-1","coding.default","Say HELLO exactly.")
WRITE "STATE=", $$STATE^ORTHOAI("REQ-1"), !
```

Expected observable path:

```text
REQUEST ID
-> ROUTE
-> PROVIDER
-> STREAM SEQUENCE
-> TERMINAL STATE
```

## Verification

This checkout includes a static collapse gate:

```bash
npm test
```

The gate verifies:

- no TypeScript gateway core remains under `src/`
- exactly 8 core M routines exist
- required executable labels exist
- required `^ORTHO(...)` global subtrees are used
- provider dispatch reaches real HTTP transports instead of fake echoes

Full runtime execution requires YottaDB or GT.M on the host, plus a real provider key.
