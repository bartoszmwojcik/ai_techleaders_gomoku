# 2026-11-10 — E14-S01: pokaz bot vs bot i widok tylko do odczytu (#280)

**Cel.** Zgłoszenie #280 (E14-S01, faza (a) `.ai/specs/2026-11-09-show-mode.md`, kroki 3–11) z kryteriami i18n z noty E15 (a)–(f). Przebieg autonomiczny w worktree cezara (`cez/30cae07c`), zlecony przez zadanie nadrzędne epiku E14; PR bez scalania.

## Kroki i rezultaty

1. **Kontekst.** Specyfikacja, zgłoszenie z komentarzem E15, `.ai/lessons.md`, `AGENTS.md`, `design-system.md`, kod: `game-service.ts`, `spectator-service.ts`, `bot-admission.ts`, `admin-gate.ts`, `api-handler.ts`, i18n (`catalogs`, `server.ts`, `proxy.ts`). Kroki 1–2 (migracja, `serverConfig.show`) były już na `main` (#301, #303).
2. **`@gomoku/core`.** `botStrengthOf(level, memoryMb)` (I14) i `showCreateSchema` (ściśle `bot-bot` + dwa poziomy).
3. **Bramka.** `isAdminSession()` zasila `requireAdmin()` i nowe `requireAdminApi()` (404 `NOT_FOUND`). `apiHandler(fn, { gate })` uruchamia bramkę przed CSRF. Strażnik `show-routes.guard.test.ts`.
4. **Dane produktu.** `RECORD_SQL` i `GAME_COUNTERS_SQL` z `origin <> 'show'`; `InvitationService.#find` ignoruje kod pokazu (P13, `READ_INVITATION_SQL` + `g.origin`).
5. **`BotAdmission`.** `inspect()` (tanie kontrole) i `admitShow(levels)` (jeden odczyt RAM, jeden test limitu, `data.reason`).
6. **`ShowService`.** `overview`, `current`, `preflight`, `create` (blokada doradcza, odmowa po commicie), `read` (wygaszenie → `START_SHOW_CLOCK_SQL` → `settleExpired` → stan), `end` (blokada wiersza, `settleGame`, `cancelled`, `409` po commicie). 100% pokrycia.
7. **Trasy** `/api/show`, `/api/show/preflight`, `/api/show/[id]`, `/api/show/[id]/end`; zdarzenia `security.show_created`/`show_ended`.
8. **Strony** `/show` (`ShowConsole`) i `/show/[gameId]` (`ShowRoom`), przestrzeń `show` PL/EN/FR (+ DE szkielet), `ENFORCED_GROUPS` += `app/(frontend)/show/**/*.tsx`, `lib/show/*.ts`; token `--layout-width-board-show`; link z `/backend`.
9. **Przegląd w przeglądarce** (`next dev` na jednorazowym kontenerze PostgreSQL z flagami w środowisku procesu): konsola, widok 1280/1920/320 px, tryb projektora. Poprawki z oglądu: token `min(88vh, 960px)` → `min(80vh, 960px)` i reszta widoku obok planszy (przy 88vh plansza wychodziła poza ekran 1080p).
10. **Błąd wykryty testem:** przełączenie trybu odmontowywało pole wyboru (dwa różne drzewa), fokus ginął — poprawione (stałe drzewo), lekcja `2026-11-10-toggle-that-changes-layout-keeps-its-place-in-the-tree.md`.
11. **Testy integracyjne:** `show-api.test.ts` (12), `show-pages.test.ts` (6), `cleanup.test.ts` (+3 dla pokazów); `global-setup.ts` włącza `SHOW_ENABLED`, `SHOW_BOT_VS_BOT_ENABLED`. **Kontrola mutacyjna** testu współbieżnego: bez `pg_advisory_xact_lock` wynik `[201, 201]` (dwa pokazy), z blokadą `[201, 409]`.
12. **Dokumentacja:** `AGENTS.md` (wyjątek `(frontend)/show/**`), `docs/architektura.md` („Pokaz”), `docs/security/threat-model.md` + `.mmd` (punkty wejścia, T-15, changelog), `docs/wdrozenie-i-utrzymanie.md` (zdarzenia), `design-system.md` (token), status kroków 3–11 w specyfikacji.

13. **Niezależna recenzja „Data Model”/„Driver”** (subagent w świeżym kontekście, tylko odczyt kodu): bez blokerów; poprawka „trwający pokaz przed limitem i admisją” (`409` zamiast `503 busy`) wdrożona z testami.
14. **Bramka:** pełne `npm run check` zielone przed poprawką z recenzji (unit 4029, integracja 91 plików / 1025 testów); po poprawce: lint, typecheck, unit (4030, 100% na plik), build i `show-api`/`show-pages` (18) zielone.

## Zmiany poza zakresem kroków

- Brak nowych zmiennych `.env` (wszystkie `SHOW_*` z #303).
- Brak zmian kontraktu MCP (faza c).

## Błędy i decyzje

- Bramka przed CSRF (zamiast wywołania w środku trasy), żeby obcy z żądaniem z innej strony dostał 404, a nie 403.
- Strony `/show*` bez własnego tytułu: 404 dla innych nie zdradza pokazu.
- `drive` i planowanie ruchu w odczycie zostają dla S02 (spec, krok S02-3).

## Status

Kod i testy gotowe, bramka zielona (pkt 14). Przegląd `om-auto-review-pr`, QA `om-auto-qa-pr` i CI: zob. PR.
