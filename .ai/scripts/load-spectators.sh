#!/bin/sh
# Reproducible load measurement for live spectating (E10-S02-T01, #206; Q-17, A-14).
# Starts a disposable PostgreSQL (Docker), applies the migrations, runs `next start` from the
# production build and drives load-spectators.mjs against it; everything is removed afterwards.
# It never touches a developer database or any remote host.
#
#   sh .ai/scripts/load-spectators.sh [load-spectators.mjs options]
#   sh .ai/scripts/load-spectators.sh --scenarios=0@0,20@2000 --moves=30
#
# Needs: Docker, `npm ci` done, a build (`LOW_MEMORY=1 npm run build` is run when missing).
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

used=$(free -m | awk '/^Mem:/ {printf "%d", ($3 / $2) * 100}')
[ "$used" -lt 90 ] || { echo "RAM usage is ${used}% (>= 90%), stop other processes first" >&2; exit 1; }

[ -f packages/app/.next/BUILD_ID ] || LOW_MEMORY=1 NODE_ENV=production npm run build

NAME=gomoku-load-pg-$$
docker run -d --rm --name "$NAME" -e POSTGRES_USER=gomoku -e POSTGRES_PASSWORD=gomoku -e POSTGRES_DB=gomoku \
  -p 127.0.0.1::5432 postgres:17 >/dev/null
APP_PID=""
cleanup() {
  [ -z "$APP_PID" ] || kill "$APP_PID" 2>/dev/null || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  git checkout -- packages/db/src/migrations/.snapshot-gomoku.json 2>/dev/null || true  # migration:up rewrites it
}
trap cleanup EXIT INT TERM

PG_PORT=$(docker port "$NAME" 5432/tcp | head -n1 | sed 's/.*://')
export DATABASE_URL="postgres://gomoku:gomoku@127.0.0.1:$PG_PORT/gomoku"
i=0
until docker exec "$NAME" pg_isready -U gomoku -d gomoku >/dev/null 2>&1 && docker exec "$NAME" psql -U gomoku -d gomoku -c 'select 1' >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 60 ] && { echo "postgres not ready" >&2; exit 1; }; sleep 1
done
sleep 2  # the proxy accepts connections before PostgreSQL restarts once (lesson 2026-10-19)
npm run db:migration:up >/dev/null

PORT=${LOAD_PORT:-3199}
export BASE_URL="http://127.0.0.1:$PORT"
(
  cd packages/app
  NODE_ENV=production TRUST_PROXY_HOPS=1 APP_ORIGIN="$BASE_URL" ADMIN_EMAIL=admin-load@example.com \
  SESSION_COOKIE_SECURE=false PASSWORD_HASH_COST=4 EMAIL_TRANSPORT=file EMAIL_OUTBOX_PATH=/tmp/load-outbox.jsonl \
  exec node "$ROOT/node_modules/next/dist/bin/next" start --hostname 127.0.0.1 --port "$PORT"
) >/tmp/load-spectators-app.log 2>&1 &
APP_PID=$!
i=0
until curl -fs "$BASE_URL/api/health" >/dev/null 2>&1; do
  kill -0 "$APP_PID" 2>/dev/null || { tail -n 20 /tmp/load-spectators-app.log >&2; exit 1; }
  i=$((i + 1)); [ "$i" -gt 120 ] && { echo "app not healthy" >&2; exit 1; }; sleep 0.5
done

SERVER_PID=$APP_PID node "$ROOT/.ai/scripts/load-spectators.mjs" "$@"
echo "--- postgres container memory ---"
docker stats --no-stream --format '{{.Name}} {{.MemUsage}} cpu={{.CPUPerc}}' "$NAME"
