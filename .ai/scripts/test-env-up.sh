#!/bin/sh
# om-prepare-test-env: generated entrypoint (contract v2)
# regenerate with: om-prepare-test-env --regenerate
# history:
#   2026-10-31 jget trims spaces; one credential per descriptor line (greedy sed picked the last user -> login probe 401 -> never reused)
#   2026-10-31 fingerprint/freshness ignore .snapshot-*.json (migration:up rewrites it; caused needless rebuild)
#   2026-10-31 generated (disposable postgres:17 container + migrations + `next start`, build cache, demo accounts via API)
set -eu

# ---------------------------------------------------------------- variables
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
QA_DIR=.ai/qa
DESCRIPTOR=$QA_DIR/test-env.json
CRED_FILE=$QA_DIR/test-env.env
BUILD_CACHE=$QA_DIR/test-env-build-cache.json
LOCK_DIR=$QA_DIR/test-env.lock
APP_LOG=$QA_DIR/test-env.app.log
OUTBOX=$ROOT/$QA_DIR/test-env.email-outbox.jsonl
UP_REL=.ai/scripts/test-env-up.sh
DOWN_REL=.ai/scripts/test-env-down.sh
TTL=${TEST_ENV_CACHE_TTL_SECONDS:-600}

PG_IMAGE=postgres:17
PG_USER=gomoku; PG_PASSWORD=gomoku; PG_DB=gomoku
# Container name is scoped per checkout (hash of the repo root), never shared with dev stacks.
SCOPE=$(printf '%s' "$ROOT" | cksum | awk '{print $1}')
PG_CONTAINER=gomoku-testenv-pg-$SCOPE
APP_PREFERRED_PORT=3100
HEALTH_PATH=/api/health
PREP_CHAIN='npm ci && npm run build'     # install -> build (migrations run fresh per environment)

BUILD_INPUTS="package.json package-lock.json tsconfig.base.json packages"
BUILD_ENV_VARS="NODE_ENV"
ARTIFACTS="node_modules packages/app/.next/BUILD_ID"

DEMO_USERS="player1 player2"            # registered through the public API; disposable values only

FORCE=0; FORCE_REBUILD=0
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    --force-rebuild) FORCE_REBUILD=1 ;;
    *) echo "unknown flag: $a" >&2; exit 2 ;;
  esac
done

mkdir -p "$QA_DIR"
T0=$(date +%s)
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { printf '[test-env] %s\n' "$*" >&2; }

# ---------------------------------------------------------------- helpers
free_port() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'
  else
    node -e 's=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
  fi
}
port_free() { ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
jget() { sed -n "s/.*\"$1\": *\"\{0,1\}\([^\", }]*\)\"\{0,1\}.*/\1/p" "$2" | head -n 1; }
http_code() { curl -s -o /dev/null -m 8 -w '%{http_code}' "$@" 2>/dev/null || echo 000; }

# ---------------------------------------------------------------- lock
lock_owned=0
release_lock() { [ "$lock_owned" = 1 ] && rm -rf "$LOCK_DIR"; return 0; }
trap release_lock EXIT
trap 'exit 130' INT TERM
waited=0
while ! mkdir "$LOCK_DIR" 2>/dev/null; do
  owner=$(jget pid "$LOCK_DIR/owner.json" 2>/dev/null || true)
  if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then rm -rf "$LOCK_DIR"; continue; fi
  [ "$waited" -ge 300 ] && { log "lock held by pid $owner for 5 min"; exit 1; }
  sleep 2; waited=$((waited + 2))
  # the other bootstrap may have produced a reusable env; the reuse check below decides
done
lock_owned=1
printf '{"pid": %s, "source": "test-env-up", "acquiredAt": "%s"}\n' "$$" "$(now)" > "$LOCK_DIR/owner.json"

# ---------------------------------------------------------------- reuse check
login_probe() {
  # one authenticated round trip with the recorded demo account (password stays inside this run)
  [ -f "$CRED_FILE" ] || return 1
  # shellcheck disable=SC1090
  set -a; . "$CRED_FILE"; set +a
  email=$(jget username "$DESCRIPTOR")
  [ -n "${TEST_PLAYER1_PASSWORD:-}" ] && [ -n "$email" ] || return 1
  code=$(http_code -X POST "$1/api/auth/login" -H 'content-type: application/json' \
    -H "origin: $1" -H 'x-gomoku-request: 1' -H "x-forwarded-for: 198.51.100.$(( $$ % 200 + 1 ))" \
    -d "{\"email\":\"$email\",\"password\":\"$TEST_PLAYER1_PASSWORD\"}")
  [ "$code" = 200 ]
}
reuse_ok() {
  [ -f "$DESCRIPTOR" ] || return 1
  [ "$(jget status "$DESCRIPTOR")" = running ] || return 1
  [ "$(jget startedByThisRepo "$DESCRIPTOR")" = true ] || return 1
  pid=$(jget pid "$DESCRIPTOR"); [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null || return 1
  [ "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null || echo false)" = true ] || return 1
  base=$(jget baseUrl "$DESCRIPTOR")
  [ "$(http_code "$base/")" != 000 ] || return 1
  [ "$(http_code "$base$HEALTH_PATH")" = 200 ] || return 1
  login_probe "$base" || return 1
  started=$(jget startedAtEpoch "$DESCRIPTOR"); [ -n "$started" ] || return 1
  [ $(( $(date +%s) - started )) -le "$TTL" ] || { log "reuse: older than TTL (${TTL}s)"; return 1; }
  newer=$(find package.json package-lock.json tsconfig.base.json packages -type f \
    ! -path '*/node_modules/*' ! -path '*/.next/*' ! -path '*/coverage/*' ! -path '*/storybook-static/*' \
    ! -name '*.email-outbox.jsonl' ! -name '*.tsbuildinfo' ! -name '.snapshot-*.json' -newer "$DESCRIPTOR" 2>/dev/null | head -n 1)
  [ -z "$newer" ] || { log "reuse: source changed ($newer)"; return 1; }
  return 0
}

emit_result() { # $1 base url, $2 reused
  printf 'TEST_ENV_STATUS=running\nTEST_ENV_BASE_URL=%s\nTEST_ENV_DESCRIPTOR=%s\nTEST_ENV_REUSED=%s\n' "$1" "$DESCRIPTOR" "$2"
  printf 'BROWSER_PROVIDER=agent-browser\nBROWSER_INSTALLED=%s\n' "$(jget installed "$DESCRIPTOR" | head -n 1 | sed 's/true/1/;s/false/0/')"
}

if [ "$FORCE" != 1 ] && reuse_ok; then
  log "reused running environment ($(( $(date +%s) - T0 ))s)"
  emit_result "$(jget baseUrl "$DESCRIPTOR")" 1
  exit 0
fi
if [ -f "$DESCRIPTOR" ] && [ "$(jget startedByThisRepo "$DESCRIPTOR")" = true ] && [ "$(jget status "$DESCRIPTOR")" = running ]; then
  log "stale environment found - tearing down what this repo started"
  sh "$DOWN_REL" || true
fi
# leftover container of a crashed run (scoped name only)
docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true

# ---------------------------------------------------------------- build cache
fp_file() { stat -c '%s:%Y' "$1" 2>/dev/null || stat -f '%z:%m' "$1" 2>/dev/null; }
fingerprint() {
  {
    for p in $BUILD_INPUTS; do
      if [ -d "$p" ]; then
        find "$p" -type f ! -path '*/node_modules/*' ! -path '*/.git/*' ! -path '*/.next/*' \
          ! -path '*/.cache/*' ! -path '*/coverage/*' ! -path '*/storybook-static/*' \
          ! -name '*.email-outbox.jsonl' ! -name '*.tsbuildinfo' ! -name 'next-env.d.ts' ! -name '.snapshot-*.json'
        elif [ -f "$p" ]; then echo "$p"; fi
    done | LC_ALL=C sort | while IFS= read -r f; do printf '%s:%s\n' "$f" "$(fp_file "$f")"; done
    for v in $BUILD_ENV_VARS; do eval "printf 'env:%s=%s\n' \"$v\" \"\${$v:-}\""; done
  } | cksum | awk '{print $1"-"$2}'
}
build_needed() {
  [ "$FORCE_REBUILD" = 1 ] && return 0
  [ -f "$BUILD_CACHE" ] || return 0
  [ "$(jget sourceFingerprint "$BUILD_CACHE")" = "$(fingerprint)" ] || return 0
  [ "$(jget projectRoot "$BUILD_CACHE")" = "$(pwd)" ] || return 0
  for a in $ARTIFACTS; do [ -s "$a" ] || [ -d "$a" ] || return 0; done
  return 1
}

BUILT=0
if build_needed; then
  log "preparing workspace: $PREP_CHAIN"
  sh -c "$PREP_CHAIN" >"$QA_DIR/test-env.build.log" 2>&1 || { tail -n 30 "$QA_DIR/test-env.build.log" >&2; exit 1; }
  printf '{ "builtAt": "%s", "sourceFingerprint": "%s", "projectRoot": "%s", "artifactPaths": "%s" }\n' \
    "$(now)" "$(fingerprint)" "$(pwd)" "$ARTIFACTS" > "$BUILD_CACHE"
  BUILT=1
else
  log "build cache valid - skipping install/build"
fi

# ---------------------------------------------------------------- browser (record only; provisioned at generation)
AB="$ROOT/node_modules/.bin/agent-browser"
[ -x "$AB" ] || AB=$(command -v agent-browser 2>/dev/null || true)
B_INSTALLED=false; B_VERSION=unknown
if [ -n "$AB" ]; then
  [ "$BUILT" = 1 ] && "$AB" install >"$QA_DIR/test-env.browser.log" 2>&1 || true
  B_VERSION=$("$AB" --version 2>/dev/null | head -n 1 || echo unknown)
  B_INSTALLED=true
fi

# ---------------------------------------------------------------- postgres
PG_PORT=$(free_port)
log "starting $PG_IMAGE on 127.0.0.1:$PG_PORT ($PG_CONTAINER)"
docker run -d --rm --name "$PG_CONTAINER" -p "127.0.0.1:$PG_PORT:5432" \
  -e POSTGRES_USER="$PG_USER" -e POSTGRES_PASSWORD="$PG_PASSWORD" -e POSTGRES_DB="$PG_DB" \
  --label om-test-env=gomoku "$PG_IMAGE" >/dev/null
i=0
until docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc 'select 1' >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 60 ] && { log "postgres not ready"; docker rm -f "$PG_CONTAINER" >/dev/null 2>&1; exit 1; }
  sleep 1
done
DATABASE_URL="postgres://$PG_USER:$PG_PASSWORD@127.0.0.1:$PG_PORT/$PG_DB"
export DATABASE_URL
log "running migrations"
npm run db:migration:up >"$QA_DIR/test-env.migrate.log" 2>&1 || { tail -n 30 "$QA_DIR/test-env.migrate.log" >&2; docker rm -f "$PG_CONTAINER" >/dev/null 2>&1; exit 1; }

# ---------------------------------------------------------------- app
if port_free "$APP_PREFERRED_PORT"; then APP_PORT=$APP_PREFERRED_PORT; else APP_PORT=$(free_port); fi
BASE_URL=http://127.0.0.1:$APP_PORT
rm -f "$OUTBOX"
: > "$APP_LOG"
log "starting next start on $BASE_URL"
(
  cd packages/app
  NODE_ENV=production DATABASE_URL="$DATABASE_URL" TRUST_PROXY_HOPS=1 APP_ORIGIN="$BASE_URL" \
  SESSION_COOKIE_SECURE=false PASSWORD_HASH_COST=4 EMAIL_TRANSPORT=file EMAIL_OUTBOX_PATH="$OUTBOX" \
  exec setsid node "$ROOT/node_modules/next/dist/bin/next" start --hostname 127.0.0.1 --port "$APP_PORT" \
    >"$ROOT/$APP_LOG" 2>&1 < /dev/null
) &
APP_PID=$!
i=0
until [ "$(http_code "$BASE_URL$HEALTH_PATH")" = 200 ]; do
  kill -0 "$APP_PID" 2>/dev/null || { tail -n 30 "$APP_LOG" >&2; docker rm -f "$PG_CONTAINER" >/dev/null 2>&1; log "app exited early"; exit 1; }
  i=$((i + 1)); [ "$i" -gt 120 ] && { log "app not healthy"; kill -- "-$APP_PID" 2>/dev/null || true; docker rm -f "$PG_CONTAINER" >/dev/null 2>&1; exit 1; }
  sleep 0.5
done

# ---------------------------------------------------------------- demo accounts (API) + credentials file
rand_pw() { head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
: > "$CRED_FILE"; chmod 600 "$CRED_FILE"
CRED_JSON=""; n=0
for role in $DEMO_USERS; do
  n=$((n + 1))
  upper=$(printf '%s' "$role" | tr 'a-z' 'A-Z' | tr -c 'A-Z0-9\n' '_')
  pw=$(rand_pw)
  email="qa-$role@example.com"
  code=$(http_code -X POST "$BASE_URL/api/auth/register" -H 'content-type: application/json' \
    -H "origin: $BASE_URL" -H 'x-gomoku-request: 1' -H "x-forwarded-for: 198.51.100.$((100 + n))" \
    -d "{\"email\":\"$email\",\"displayName\":\"QA_$role\",\"password\":\"$pw\"}")
  [ "$code" = 201 ] || { log "registering $role failed (HTTP $code)"; sh "$DOWN_REL" || true; exit 1; }
  printf 'TEST_%s_PASSWORD=%s\n' "$upper" "$pw" >> "$CRED_FILE"
  CRED_JSON="$CRED_JSON${CRED_JSON:+,
    }{ \"role\": \"$role\", \"username\": \"$email\", \"passwordEnv\": \"TEST_${upper}_PASSWORD\" }"
done

# ---------------------------------------------------------------- descriptor
case "$(uname -s)" in Darwin) PLATFORM=darwin ;; Linux) grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null && PLATFORM=wsl2 || PLATFORM=linux ;; *) PLATFORM=win32 ;; esac
ELAPSED=$(( $(date +%s) - T0 ))
RUN_ID="$(date +%Y%m%d)-$(rand_pw | head -c 6)"
cat > "$DESCRIPTOR" <<EOF
{
  "version": 1,
  "runId": "$RUN_ID",
  "status": "running",
  "mode": "ephemeral",
  "baseUrl": "$BASE_URL",
  "startedByThisRepo": true,
  "startScript": "$UP_REL",
  "stopScript": "$DOWN_REL",
  "app": { "startCommand": "next start (packages/app, NODE_ENV=production)", "port": $APP_PORT, "healthPath": "$HEALTH_PATH", "pid": $APP_PID },
  "services": [
    { "type": "postgres", "host": "127.0.0.1", "port": $PG_PORT, "container": "$PG_CONTAINER", "url": "$DATABASE_URL", "env": { "DATABASE_URL": "$DATABASE_URL" } }
  ],
  "credentials": [
    $CRED_JSON
  ],
  "credentialsFile": "$CRED_FILE",
  "browser": {
    "provider": "agent-browser",
    "installed": $B_INSTALLED,
    "command": "node_modules/.bin/agent-browser",
    "version": "$B_VERSION",
    "descriptor": ".ai/browsers/agent-browser.md",
    "notes": ""
  },
  "testRunner": { "name": "other", "config": "vitest.integration.config.ts" },
  "platform": "$PLATFORM",
  "startedAt": "$(now)",
  "startedAtEpoch": $(date +%s),
  "notes": "Fresh postgres:17 per environment (migrated by npm run db:migration:up); demo accounts qa-player1/qa-player2@example.com (passwords in credentialsFile). Mail goes to $QA_DIR/test-env.email-outbox.jsonl (EMAIL_TRANSPORT=file). Production build, plain HTTP. Registration is rate limited (5/h per client address, X-Forwarded-For honoured). Last boot: ${ELAPSED}s (built=$BUILT). Stop: sh $DOWN_REL"
}
EOF

# ensure ignores
for g in '.ai/qa/test-env.*' '.ai/qa/test-env-build-cache.json'; do
  grep -qxF "$g" .gitignore 2>/dev/null || printf '%s\n' "$g" >> .gitignore
done

log "environment up in ${ELAPSED}s (built=$BUILT)"
emit_result "$BASE_URL" 0
