#!/bin/sh
# Starts Gomoku locally with one command: prepares the repository (npm run setup: dependencies,
# .env.local, PostgreSQL in Docker, migrations) and then runs the app.
#
#   scripts/gomoku-local.sh                 development server (hot reload), http://localhost:3000
#   scripts/gomoku-local.sh --prod          production build + `next start` (what runs on the VPS)
#   scripts/gomoku-local.sh --port 3100     another port (APP_ORIGIN follows it, so CSRF checks pass)
#   scripts/gomoku-local.sh --bot           turn the bot on (BOT_ENABLED=true; off by default, see docs)
#   scripts/gomoku-local.sh --no-setup      skip `npm run setup` (everything is already prepared)
#   scripts/gomoku-local.sh --check         only verify prerequisites, start nothing
#   scripts/gomoku-local.sh --stop          stop the local PostgreSQL container (data stays in the volume)
#
# POSIX sh on purpose: works on macOS, Linux, WSL2 and Git Bash. Idempotent: safe to run repeatedly.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

MODE=dev
PORT=3000
SETUP=1
CHECK_ONLY=0
STOP=0
BOT=0

usage() {
  cat <<'EOF'
Użycie: scripts/gomoku-local.sh [opcje]

  (brak opcji)    serwer deweloperski z odświeżaniem, http://localhost:3000
  --prod          build produkcyjny i `next start` (jak na serwerze)
  --port N        inny port (APP_ORIGIN dopasowuje się, żeby ochrona CSRF działała)
  --bot           włącz bota (BOT_ENABLED=true; domyślnie wyłączony)
  --no-setup      pomiń `npm run setup` (wszystko już przygotowane)
  --check         tylko sprawdź wymagania (Node, npm, Docker, port), nic nie uruchamiaj
  --stop          zatrzymaj lokalny kontener PostgreSQL (dane zostają w wolumenie)
  -h, --help      ta pomoc
EOF
}

die() {
  echo "Błąd: $*" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --prod) MODE=prod ;;
    --port)
      [ $# -ge 2 ] || die "--port wymaga numeru portu"
      PORT=$2
      shift
      ;;
    --port=*) PORT=${1#--port=} ;;
    --bot) BOT=1 ;;
    --no-setup) SETUP=0 ;;
    --check) CHECK_ONLY=1 ;;
    --stop) STOP=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "nieznana opcja: $1"
      ;;
  esac
  shift
done

case "$PORT" in
  '' | *[!0-9]*) die "port musi być liczbą (podano: $PORT)" ;;
esac
[ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "port poza zakresem 1-65535 (podano: $PORT)"

if [ "$STOP" -eq 1 ]; then
  command -v docker >/dev/null 2>&1 || die "Docker nie jest zainstalowany"
  echo "Zatrzymuję lokalny PostgreSQL (docker compose stop)..."
  docker compose stop
  echo "Gotowe. Dane zostają w wolumenie; kolejne uruchomienie skryptu wystartuje bazę ponownie."
  exit 0
fi

# --- prerequisites ---------------------------------------------------------------------------
command -v node >/dev/null 2>&1 || die "brak Node.js (wymagany >= 22.17)"
command -v npm >/dev/null 2>&1 || die "brak npm"

NODE_VERSION=$(node -p "process.versions.node")
node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  process.exit(major > 22 || (major === 22 && minor >= 17) ? 0 : 1);
' || die "Node.js $NODE_VERSION jest za stary (wymagany >= 22.17)"

DOCKER_STATE="niedostępny"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  DOCKER_STATE="działa"
fi

port_is_free() {
  node -e '
    const server = require("node:net").createServer();
    server.once("error", () => process.exit(1));
    server.listen(Number(process.argv[1]), () => server.close(() => process.exit(0)));
  ' "$PORT"
}

PORT_STATE="wolny"
port_is_free || PORT_STATE="zajęty"

echo "Node.js:   $NODE_VERSION"
echo "Docker:    $DOCKER_STATE"
echo "Port $PORT: $PORT_STATE"
echo "Tryb:      $MODE"
if [ "$BOT" -eq 1 ]; then echo "Bot:       włączony (BOT_ENABLED=true)"; fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  [ "$PORT_STATE" = "wolny" ] || die "port $PORT jest zajęty; wybierz inny: --port N"
  echo "Wymagania spełnione."
  exit 0
fi

[ "$PORT_STATE" = "wolny" ] || die "port $PORT jest zajęty; wybierz inny: --port N"

# --- preparation ----------------------------------------------------------------------------
if [ "$SETUP" -eq 1 ]; then
  if [ "$DOCKER_STATE" != "działa" ]; then
    echo "Uwaga: Docker nie działa. Instalator uruchomi bazę tylko wtedy, gdy już odpowiada pod DATABASE_URL." >&2
  fi
  echo "==> npm run setup"
  npm run setup
fi

if [ "$BOT" -eq 1 ]; then
  BOT_ENABLED=true
  export BOT_ENABLED
fi

# The app compares the Origin header with APP_ORIGIN (CSRF), so it must follow the chosen port.
APP_ORIGIN=${APP_ORIGIN:-http://localhost:$PORT}
export APP_ORIGIN

if [ "$MODE" = "dev" ]; then
  echo "==> serwer deweloperski: $APP_ORIGIN (Ctrl+C kończy)"
  exec npm run dev -- -p "$PORT"
fi

# Production-like run: same code path as the VPS, over plain HTTP on localhost. The production config
# insists on these variables; mail goes to a local file instead of Brevo.
echo "==> npm run build"
npm run build
OUTBOX=${GOMOKU_EMAIL_OUTBOX:-${TMPDIR:-/tmp}/gomoku-local-outbox.jsonl}
echo "==> serwer produkcyjny: $APP_ORIGIN (Ctrl+C kończy); poczta zapisywana w $OUTBOX"
exec env \
  NODE_ENV=production \
  TRUST_PROXY_HOPS="${TRUST_PROXY_HOPS:-1}" \
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.test}" \
  SESSION_COOKIE_SECURE=false \
  EMAIL_TRANSPORT=file \
  EMAIL_OUTBOX_PATH="$OUTBOX" \
  npm run start -- -p "$PORT"
