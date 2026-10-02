#!/bin/sh
# Start the ortho-ai listener that ORTHOHost's InferenceService connects to.
# .NET maps NamedPipeClientStream(".", "ortho-ai") to the Unix socket /tmp/CoreFxPipe_ortho-ai.
# Requires: YottaDB ($ydb_dist), socat, jq, curl. Provider keys: OPENAI_API_KEY / ANTHROPIC_API_KEY.
set -eu
: "${ydb_dist:?set ydb_dist to the YottaDB install directory}"
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$HERE")
DATA=${ORTHO_DATA:-/var/lib/ortho32-ai}
SOCK=${ORTHO_AI_SOCKET:-/tmp/CoreFxPipe_ortho-ai}

mkdir -p "$DATA/obj"
export ydb_chset=M
export ydb_gbldir="$DATA/ortho.gld"
export ydb_routines="$DATA/obj($ROOT/m) $ydb_dist/libyottadbutil.so"

if [ ! -f "$DATA/ortho.dat" ]; then
  "$ydb_dist/yottadb" -run GDE >/dev/null <<EOF
change -segment DEFAULT -file=$DATA/ortho.dat -block_size=4096
change -region DEFAULT -record_size=1048576 -key_size=1019
exit
EOF
  "$ydb_dist/mupip" create >/dev/null
fi

# Model catalog and provider health are initialised once here, not per request.
"$ydb_dist/yottadb" -run INIT^ORTHOAI

rm -f "$SOCK"
exec socat "UNIX-LISTEN:$SOCK,fork,mode=600" "EXEC:$HERE/ortho-ai-conn.sh"
