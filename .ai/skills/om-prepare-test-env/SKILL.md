# Repo-local: om-prepare-test-env

Środowisko testowe Gomoku (PostgreSQL w Dockerze + `next start`).

- Start / ponowne użycie: `sh .ai/scripts/test-env-up.sh` (flagi `--force`, `--force-rebuild`).
- Stop: `sh .ai/scripts/test-env-down.sh` (zatrzymuje tylko proces aplikacji z deskryptora i kontener `gomoku-testenv-pg-<hash katalogu>`).
- Deskryptor: `.ai/qa/test-env.json`; hasła kont demo (`qa-player1@example.com`, `qa-player2@example.com`) w gitignorowanym `.ai/qa/test-env.env`.
- Łańcuch: `npm ci && npm run build` (za cache'em: odcisk lockfile + `packages/*`) -> kontener `postgres:17` na wolnym porcie 127.0.0.1 -> `npm run db:migration:up` -> `next start` (port 3100 lub wolny; `TRUST_PROXY_HOPS=1`, `EMAIL_TRANSPORT=file`, `PASSWORD_HASH_COST=4`) -> sonda `/api/health` -> rejestracja kont demo przez `/api/auth/register`.
- Pułapki naprawione w skrypcie: `migration:up` przepisuje śledzony `.snapshot-gomoku.json` (wyłączony z odcisku; przed commitem `git checkout` tego pliku); rejestracja ma limit 5/h na adres (stąd `X-Forwarded-For`).
- Przeglądarka: `node_modules/.bin/agent-browser` (wersja z `package.json`), `agent-browser install` uruchamiany przy każdym przebudowaniu.
