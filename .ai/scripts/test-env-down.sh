#!/bin/sh
# om-prepare-test-env: generated teardown (contract v2)
# Stops exactly what test-env-up.sh started: the app process group and the scoped postgres container.
# history:
#   2026-10-31 generated
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
DESCRIPTOR=.ai/qa/test-env.json
SCOPE=$(printf '%s' "$ROOT" | cksum | awk '{print $1}')
PG_CONTAINER=gomoku-testenv-pg-$SCOPE
jget() { sed -n "s/.*\"$1\": *\"\{0,1\}\([^\", }]*\)\"\{0,1\}.*/\1/p" "$2" | head -n 1; }

if [ -f "$DESCRIPTOR" ] && [ "$(jget startedByThisRepo "$DESCRIPTOR")" = true ]; then
  pid=$(jget pid "$DESCRIPTOR")
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    i=0; while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 20 ]; do sleep 0.5; i=$((i + 1)); done
    kill -0 "$pid" 2>/dev/null && { kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true; }
  fi
fi
docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
if [ -f "$DESCRIPTOR" ]; then
  sed 's/"status": *"running"/"status": "stopped"/' "$DESCRIPTOR" > "$DESCRIPTOR.tmp" && mv "$DESCRIPTOR.tmp" "$DESCRIPTOR"
fi
echo "TEST_ENV_STATUS=stopped"
