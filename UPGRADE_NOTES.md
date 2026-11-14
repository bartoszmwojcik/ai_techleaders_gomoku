# Uwagi do aktualizacji

Dla operatora wdrożenia (mikr.us, Docker Compose) i dewelopera. Szczegóły procedur: [`docs/wdrozenie-i-utrzymanie.md`](docs/wdrozenie-i-utrzymanie.md), zasady zgodności wstecznej: [`BACKWARD_COMPATIBILITY.md`](BACKWARD_COMPATIBILITY.md), zmiany: [`CHANGELOG.md`](CHANGELOG.md).

## 0.1.0 (2026-11-14) — pierwsze wydanie

To pierwszy wpis, więc opisuje stan docelowy, a nie różnicę względem poprzedniej wersji. Instalację sprzed E15 (produkcja do `5495837` włącznie) aktualizuje się przez `git pull` i ponowne zbudowanie obrazu; E15 nie dodał migracji ani zmiennych środowiskowych.

### Przed wdrożeniem

1. **Zmienne wymagane w `.env.production`** — `docker compose` odmawia startu bez: `POSTGRES_PASSWORD`, `APP_ORIGIN` (dokładny adres z `https://`), `ADMIN_EMAIL` i `TRUST_PROXY_HOPS` (za proxy mikr.us wartość `1`).
2. **Zmienne opcjonalne** (puste = domyślne): `BOT_ENABLED` (gra z botem), `SHOW_ENABLED`, `SHOW_BOT_VS_BOT_ENABLED`, `SHOW_BOT_LEVEL2_ENABLED`, `BOT_SHOW_PAUSE_MIN_MS`, `BOT_SHOW_PAUSE_MAX_MS`, `SHOW_BOT_L2_SOFT_MS` (pokaz), `MCP_TOKEN_LIMIT`, `MCP_CHAT_LIMIT` (agenci MCP), `LOW_MEMORY=1` (build na małym RAM). Wzorzec: `.env.example`.
3. **Nowa zmienna musi trafić do bloku `environment` w `compose.prod.yaml`**, inaczej kontener dostaje pustą wartość mimo wpisu w `.env.production`. Po wdrożeniu sprawdź `docker exec gomoku_prod-app-1 printenv <NAZWA>`.
4. **Kopia bazy** przed każdą aktualizacją: `pg_dump -Fc` z procedury w `docs/wdrozenie-i-utrzymanie.md` („Kopie zapasowe bazy”) oraz `docker tag gomoku-app:latest gomoku-app:prev` do wycofania.
5. **Pamięć na czas builda.** Na 2 GB RAM build obrazu E15 padał (`Next.js build worker exited … SIGTERM`); przeszedł przy 2,5 GB. Zatrzymaj kontener aplikacji na czas builda (`docker stop gomoku_prod-app-1`, baza działa dalej), potem `docker compose --env-file .env.production -f compose.prod.yaml up -d --no-build`. Przy porażce buildu od razu `docker start gomoku_prod-app-1`.

### Migracje bazy

19 migracji w `packages/db/src/migrations/` (od `Migration20261027173339` do `Migration20261110190343_show_origin`) wykonuje jednorazowy kontener `migrate` przy każdym starcie stosu; aplikacja startuje dopiero po nim. Migracji już zastosowanych nie edytuje się. Wycofanie migracji (`npm run db:migration:down`) odmawia przy istniejących partiach z botem. Zmiany niszczące idą po wdrożeniu dwuetapowo (expand/contract, zob. `BACKWARD_COMPATIBILITY.md`, §4).

### Zmiany widoczne dla użytkowników i operatora

- **Język interfejsu** (PL domyślnie, EN, FR; DE szkic ukryty w przełączniku): `?lang=<pl|en|fr|de>` zapisuje ciasteczko `gomoku_lang` i odpowiada `307` na ten sam adres bez parametru. Zmiana nazwy parametru lub ciasteczka byłaby zmianą łamiącą. Panel `/backend`, e-maile i teksty MCP zostają po polsku.
- **Panel `/backend`** jest tylko do odczytu i zwraca `404` każdemu poza administratorem (konto z `ADMIN_EMAIL`, zakładane poleceniem `npm run admin:create`).
- **Błędy API:** koperta `{ ok:false, error:{ code, message, fieldErrors? } }` zachowuje polski `message`; `fieldIssues` jest dodatkiem (addytywnie), tłumaczenie odbywa się po stronie klienta po kodzie błędu.
- **Gra z botem i pokaz** są domyślnie wyłączone i włączane flagami. Wymagają osobnych kroków operatora (checklista `BOT_ENABLED`, pomiar `bot:bench`, runbook pokazu w `docs/wdrozenie-i-utrzymanie.md`).

### Dla deweloperów

- `npm run setup` jest idempotentny; testy integracyjne wymagają Dockera (Testcontainers) i `npx agent-browser install`.
- Na wolnym sprzęcie cztery testy integracyjne mogą padać na limitach czasu (`show-pages`, `show-drive`, `chat`, `agent-chat-pages`); to znane, niezwiązane z kodem przypadki (specyfikacja `2026-11-13-e15-completion.md`, Q12).

### Wycofanie

`docker tag gomoku-app:prev gomoku-app:latest && docker compose --env-file .env.production -f compose.prod.yaml up -d --no-build`. Baza: odtworzenie z kopii sprzed wdrożenia, jeśli migracje zostały zastosowane.
