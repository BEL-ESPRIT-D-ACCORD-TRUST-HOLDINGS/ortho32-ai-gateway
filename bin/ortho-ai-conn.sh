#!/bin/sh
# One ortho-ai connection (run by socat per client).
# stdin : one ORTHOHost MessageEnvelope JSON line (PascalCase; Payload = {prompt, model, ...})
# stdout: InferenceEvent JSON lines, ending with {"Done":true,...}
# Request values go to M through the environment, never through a shell command line.
set -eu
umask 077

IFS= read -r line || exit 0

fail() { # fail <message>: emit one terminal error event
  jq -nc --arg e "$1" '{CorrelationId:"",Chunk:"",Done:true,Model:"",Tokens:0,Error:$e}'
  exit 0
}

printf '%s' "$line" | jq -e 'type == "object"' >/dev/null 2>&1 || fail "invalid request JSON"

field() { # field <jq-filter>: raw value; callers append a sentinel to keep trailing newlines
  printf '%s' "$line" | jq -j "$1"
}

ID=$(field '.CorrelationId // .correlationId // empty' | tr -cd 'A-Za-z0-9_-' | cut -c1-64)
[ -n "$ID" ] || ID="req-$$-$(date +%s)"
MODEL=$(field '.Payload.model // .payload.model // empty'; printf x); MODEL=${MODEL%x}
PROMPT=$(field '.Payload.prompt // .payload.prompt // empty'; printf x); PROMPT=${PROMPT%x}

# A single environment string is limited to 128 KiB on Linux.
[ "${#PROMPT}" -le 120000 ] || fail "prompt too large (max 120000 bytes)"

export ORTHO_REQ_ID="$ID" ORTHO_MODEL="$MODEL" ORTHO_PROMPT="$PROMPT"
exec "$ydb_dist/yottadb" -run SERVE^ORTHOAI
