#!/bin/sh
# End-to-end test of the ortho-ai listener: socat -> bin/ortho-ai-conn.sh -> YottaDB -> curl -> mock provider.
# Requires: ydb_dist (YottaDB), socat, jq, curl, node. Run: npm run test:e2e
set -u
: "${ydb_dist:?set ydb_dist to the YottaDB install directory}"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
PIDS=""
cleanup() { for p in $PIDS; do kill "$p" 2>/dev/null; done; rm -rf "$T"; }
trap cleanup EXIT INT TERM
mkdir -p "$T/tmp"

PASS=0; FAILN=0
check() { # check <name> <command...>
  name=$1; shift
  if "$@"; then PASS=$((PASS + 1)); echo "ok   $name"; else FAILN=$((FAILN + 1)); echo "FAIL $name"; fi
}

# --- mock provider
MOCK_LOG="$T/mock.log" MOCK_PORT_FILE="$T/port" node "$ROOT/tests/mock-provider.mjs" & PIDS="$PIDS $!"
i=0; while [ ! -s "$T/port" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
PORT=$(cat "$T/port")

start_gateway() { # start_gateway <name> [env assignments...]: sets SOCK_<name>
  n=$1; shift
  s="$T/$n.sock"
  env "$@" ORTHO_DATA="$T/data-$n" ORTHO_AI_SOCKET="$s" ORTHO_TMP="$T/tmp" \
      ORTHO_OPENAI_URL="http://127.0.0.1:$PORT/openai" ORTHO_ANTHROPIC_URL="http://127.0.0.1:$PORT/anthropic" \
      sh "$ROOT/bin/ortho-ai-serve.sh" >"$T/$n.log" 2>&1 & PIDS="$PIDS $!"
  i=0; while [ ! -S "$s" ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i + 1)); done
  [ -S "$s" ] || { echo "gateway $n did not start:"; cat "$T/$n.log"; exit 1; }
  eval "SOCK_$n=$s"
}

ask() { # ask <socket> <prompt> <model> -> events (JSON lines) on stdout
  jq -nc --arg p "$2" --arg m "$3" \
    '{RequestId:"r",CorrelationId:"corr-1",Source:"t",Action:"INFERENCE_SUBMIT",Payload:{prompt:$p,model:$m}}' |
    socat -t 20 - "UNIX-CONNECT:$1"
}

start_gateway keys OPENAI_API_KEY=sk-test-openai ANTHROPIC_API_KEY=sk-ant-test
start_gateway nokeys OPENAI_API_KEY= ANTHROPIC_API_KEY=

jqt() { jq -se "$1" "$2" >/dev/null; } # jqt <filter> <file>: filter over all lines must be true

# 1. OpenAI path, awkward characters: quote, backslash, apostrophe, newline, tab, UTF-8, control char
tricky=$(printf 'quote " back\\slash it'"'"'s\nnew\tline \303\251\342\202\254 ctl\001end'; printf x); tricky=${tricky%x}
printf '%s' "$tricky" >"$T/tricky.txt"
ask "$SOCK_keys" "$tricky" fast.default >"$T/ev1"
check "openai: stream ends with Done and no Error" jqt 'last | .Done == true and (has("Error") | not)' "$T/ev1"
{ printf 'echo:'; cat "$T/tricky.txt"; } >"$T/want1"
jq -j -s 'map(.Chunk) | join("")' "$T/ev1" >"$T/got1"
check "openai: reply text round-trips exactly" cmp -s "$T/got1" "$T/want1"
tail -n1 "$T/mock.log" | jq -j '.body.messages[0].content' >"$T/recv1"
check "openai: provider received the prompt intact" cmp -s "$T/recv1" "$T/tricky.txt"
check "openai: auth header sent" sh -c "tail -n1 '$T/mock.log' | jq -e '.headers.authorization == \"Bearer sk-test-openai\"' >/dev/null"

# 2. Anthropic path
ask "$SOCK_keys" "hello" coding.default >"$T/ev2"
check "anthropic: reply text" jqt 'map(.Chunk) | join("") == "echo:hello"' "$T/ev2"
check "anthropic: headers" sh -c "tail -n1 '$T/mock.log' | jq -e '.headers[\"x-api-key\"] == \"sk-ant-test\" and .headers[\"anthropic-version\"] == \"2023-06-01\"' >/dev/null"

# 3. Shell injection attempts through the prompt must not execute
ask "$SOCK_keys" "'; touch $T/PWNED1; echo '" fast.default >"$T/ev3"
ask "$SOCK_keys" "\$(touch $T/PWNED2) \`touch $T/PWNED3\` \" ; touch $T/PWNED4 #" fast.default >>"$T/ev3"
check "no shell injection through the prompt" sh -c "! ls '$T'/PWNED* >/dev/null 2>&1"
check "injection attempts still got normal replies" jqt '[.[] | select(.Done)] | length == 2 and all(.[]; has("Error") | not)' "$T/ev3"

# 4. Failure paths each end with exactly one terminal Error event
ask "$SOCK_keys" "hi" no.such.model >"$T/ev4"
check "unknown model -> terminal Error" jqt 'last | .Done == true and .Error == "route failed"' "$T/ev4"
ask "$SOCK_nokeys" "hi" fast.default >"$T/ev5"
check "missing key -> terminal Error" jqt 'last | .Done == true and (.Error | test("unconfigured"))' "$T/ev5"
printf 'not json\n' | socat -t 20 - "UNIX-CONNECT:$SOCK_keys" >"$T/ev6"
check "malformed request -> terminal Error" jqt 'last | .Done == true and .Error == "invalid request JSON"' "$T/ev6"
check "each failure ends with exactly one Done" sh -c "[ \$(jq -s '[.[] | select(.Done)] | length' '$T/ev4') = 1 ] && [ \$(jq -s '[.[] | select(.Done)] | length' '$T/ev5') = 1 ]"

# 5. Large prompt (100000 bytes)
big=$(head -c 100000 /dev/zero | tr '\0' 'a')
ask "$SOCK_keys" "$big" fast.default >"$T/ev7"
check "100000-byte prompt round-trips" jqt 'map(.Chunk) | join("") | length == 100005' "$T/ev7"

# 6. Hygiene
check "temp files (body, credential header) cleaned up" sh -c "[ -z \"\$(ls -A '$T/tmp')\" ]"
check "credential never written to gateway logs" sh -c "! grep -q 'sk-test-openai\\|sk-ant-test' '$T/keys.log'"

echo "$PASS passed, $FAILN failed"
[ "$FAILN" -eq 0 ]
