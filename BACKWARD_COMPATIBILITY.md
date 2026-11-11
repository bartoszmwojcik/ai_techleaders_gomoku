# Zgodność wsteczna

Ten plik wymienia **chronione powierzchnie kontraktu** tego repozytorium i opisuje, jak je zmieniać. Recenzenci (w tym `om-code-review`) sprawdzają zmiany według niego, a skille implementujące ostrzegają, gdy zmiana go narusza. Zmiana kontraktu nie jest zakazana — wymaga wybranej tu ścieżki, opisanej w PR.

Stan na 2026-10-19: aplikacja jest przed pierwszym wydaniem (brak wdrożenia produkcyjnego i zapisanych danych użytkowników). Reguły dla danych i adresów URL obowiązują od pierwszego wdrożenia; reguły dla pakietów, API HTTP i konfiguracji — już teraz.

## Jak czytać „zmianę łamiącą”

Każda zmiana, po której istniejący konsument przestaje działać bez własnej zmiany: usunięcie lub zmiana nazwy, zmiana typu lub kształtu, zmiana znaczenia wartości, zaostrzenie wymagań wejścia, zmiana domyślnej wartości. Dodanie opcjonalnego pola, nowego eksportu lub nowej trasy łamiącą zmianą nie jest.

## Powierzchnie

### 1. API pakietów workspace (`@gomoku/core`, `@gomoku/db`, `@gomoku/ui`)

Eksporty z pól `exports` w `package.json` pakietów:

| Pakiet | Publiczne wejścia | Konsumenci |
|---|---|---|
| `@gomoku/core` | `.` (`createAppContainer`, reeksporty Awilix `asClass`/`asFunction`/`asValue`/`Lifetime`, `BOARD_SIZE`, `WIN_LENGTH`) oraz `./*` (każdy moduł `src/*.ts`) | `@gomoku/app`, `@gomoku/db` |
| `@gomoku/db` | `.` (`createOrm`, `createOrmConfig`, `entities`, typy `Orm`, `EntityManager`, `OrmConfig`) | `@gomoku/app` |
| `@gomoku/core/i18n/*` (E15-S01, addytywne) | `locales` (`LOCALES`, `Locale`, `LANG_COOKIE`, `isLocale`, `resolveLocale`, `parseAcceptLanguage`, `fallbackChain`, `langCookieAttributes`, `langSwitchHref`), `translator` (`createTranslator`, `Dict`, `Catalog`, `MessageKey`), `format` (`formatNumber`, `formatMegabytes`, `formatDateTime`) | `@gomoku/app` |
| `@gomoku/ui` | `./globals.css`, `./components/*`, `./hooks/*`, `./lib/*` | `@gomoku/app` (panel `/backend`) |

Pakiety są prywatne (`"private": true`) i nie są publikowane — wszyscy konsumenci są w tym repozytorium.

**Ścieżka:** zmiana łamiąca jest dozwolona, jeśli **ten sam PR** aktualizuje wszystkich konsumentów, a `npm run typecheck`, `npm test` i `npm run build` przechodzą. Okres deprecjacji i podbicie wersji nie są wymagane. Gdy pakiet zostanie kiedyś opublikowany, ta sekcja musi zostać zaostrzona (semver, deprecjacja).

### 2. API HTTP

| Trasa | Kontrakt | Konsumenci |
|---|---|---|
| `GET /api/health` | `200` + `{ "status": "ok", "database": { "ok": true } }`; `503` + `{ "status": "error", "database": { "ok": false, "reason"?: string } }` — `reason` tylko poza produkcją | `scripts/smoke.mjs`, testy integracyjne, healthchecki infrastruktury (load balancer, orkiestrator) |
| `POST /api/mcp` (narzędzia MCP `join`, `get_state`, `play_move`, `send_message`) | wejście i `structuredContent` narzędzi oraz kody błędów (`structuredContent.error.code`) opisane w `docs/architektura.md` („Agent dołącza do partii przez MCP”); opisy narzędzi są po polsku (I20) | klienci MCP agentów (Claude Code, Codex, Gemini CLI, Copilot, Cursor), testy integracyjne `agent-*` i `show-agent` |
| przyszłe `/api/*` | koperta `{ ok: true, data }` / `{ ok: false, error: { code, message, fieldErrors? } }` (standardy inżynierskie) | klient przeglądarkowy, klient czasu rzeczywistego |

**Łamiące:** zmiana ścieżki, metody, kodów statusu, nazw lub typów pól, znaczenia `status`; ujawnienie `reason` w produkcji (regresja bezpieczeństwa).
**MCP (E14-S03, addytywne):** `opponent.kind` w `join` i `get_state` może mieć nową wartość `"bot"` (tylko pokaz administratora; typ `ParticipantKind` już ją zawierał), a opis `join` mówi „zaprosił Cię człowiek albo administrator pokazu; przeciwnikiem może być bot”. Nowa wartość wyliczenia w odpowiedzi jest zgodna wstecz dla klientów, którzy traktują `kind` jako opis; łamiące byłoby usunięcie wartości, zmiana nazwy pola albo kodu błędu.
**Wielojęzyczność (E15):** `error.message` w kopercie zostaje polskim zapasem i kontraktem; klient tłumaczy komunikat po `error.code` (faza C5). Planowane pola addytywne (opcjonalne, bez zmiany istniejących): `bot?: { level, tableMb }` obok `displayName`/`bot.name` (E14/C2) i `fieldIssues` obok `fieldErrors` (C5, decyzja przed paczką).
**Ścieżka:** nowe pole opcjonalne — bez ograniczeń. Zmiana łamiąca `/api/health` — zaktualizuj w tym samym PR `smoke.mjs`, testy integracyjne i opis w README, a w opisie PR wymień konfigurację infrastruktury do zmiany. Po pierwszym wdrożeniu: zmiana łamiąca API używanego przez przeglądarkę wymaga zgodności z poprzednim kształtem przez co najmniej jedno wydanie (otwarte karty i klient czasu rzeczywistego działają na starym kodzie).

### 3. Adresy URL stron

`/` (strona graczy), `/backend` (panel; w produkcji celowo `404` do czasu roli administratora, #152), a w przyszłości linki zaproszeń (BR-09, BR-11) i adresy partii.

Parametr `?lang=<pl|en|fr|de>` (E15-S01) działa na każdej stronie gracza: `proxy.ts` zapisuje ciasteczko `gomoku_lang` (tylko kod języka) i odpowiada `307` na ten sam adres bez `lang`, zachowując pozostałe parametry (np. `?projektor=1`); nieobsługiwana wartość jest tylko usuwana. Linki z `?lang=` wysyłane poza aplikację (np. pokaz) muszą działać dalej; zmiana nazwy parametru lub ciasteczka to zmiana łamiąca. `/api/*`, `/backend` i pliki statyczne nie przechodzą przez proxy.

**Łamiące:** zmiana lub usunięcie ścieżki, zmiana formatu linku zaproszenia lub kodu.
**Ścieżka:** po pierwszym wdrożeniu stary adres przekierowuje (`redirects` w `next.config.ts` lub strona przejściowa) na nowy. Linki zaproszeń są wysyłane poza aplikację — ich format musi być akceptowany do końca ważności wszystkich wydanych zaproszeń.

### 4. Schemat bazy danych i migracje

Migracje MikroORM w `packages/db/src/migrations/` oraz tabela `mikro_orm_migrations`.

**Łamiące:** usunięcie lub zmiana nazwy tabeli/kolumny, zmiana typu, nowe ograniczenie `NOT NULL`/unikalne na istniejących danych, edycja migracji już zastosowanej gdziekolwiek (także w innej gałęzi lub u innego dewelopera).
**Ścieżka:**
- zmiany schematu wyłącznie nową migracją (`npm run db:migration:create`), sprawdzoną w górę i w dół na prawdziwym PostgreSQL; PR ma etykietę `risk-high` i plan wycofania w opisie (`SDLC.md`);
- po pierwszym wdrożeniu zmiany niszczące idą w dwóch krokach (expand/contract): najpierw migracja addytywna i kod zgodny z oboma schematami, usunięcie starej kolumny/tabeli dopiero w kolejnym wydaniu;
- zapisane partie i historia (BR-08) muszą przetrwać każdą migrację — migracja danych jest częścią tego samego PR.

### 5. Zasady gry zapisane w danych

`BOARD_SIZE` (15) i `WIN_LENGTH` (5) w `@gomoku/core` to decyzja produktowa BR-10. Zmiana wartości zmienia interpretację zapisanych partii.

**Ścieżka:** tylko po zmianie decyzji w `.ai/specs/product-brief.md` przez właściciela; zapisane partie zachowują parametry, z którymi zostały rozegrane (zapis parametrów w partii lub migracja).

### 6. Konfiguracja środowiska

Zmienne z `.env.example`: `DATABASE_URL`, `DATABASE_POOL_MIN`, `DATABASE_POOL_MAX`, `DATABASE_DEBUG` (oraz każda kolejna). Konsumenci: wdrożenia, `.env.local` deweloperów, CI, Testcontainers w testach integracyjnych.

**Łamiące:** zmiana nazwy lub usunięcie zmiennej, zmiana formatu wartości, zmiana domyślnej wartości, nowa zmienna wymagana bez wartości domyślnej.
**Ścieżka:** zaktualizuj w tym samym PR `.env.example`, tabelę w `README.md`, workflow CI i `tests/integration/global-setup.ts`; w opisie PR wymień zmianę do wykonania we wdrożeniach. Zmiana nazwy po pierwszym wdrożeniu — przez jedno wydanie czytaj obie nazwy.

### 7. Komendy npm

Skrypty w głównym `package.json` (`setup`, `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, `test:integration`, `smoke`, `check`, `db:migration:*`, `db:status`). Format JSON `db:status` jest wewnętrznym kontraktem z instalatorem (`scripts/setup`) — zmieniaj obie strony w tym samym PR. Konsumenci: CI (`.github/workflows/ci.yml`), bramka walidacyjna skilli (`.ai/agentic.config.json`), `AGENTS.md`, `README.md`, `SDLC.md`.

**Łamiące:** zmiana nazwy lub usunięcie skryptu, zmiana tego, co sprawdza `check`.
**Ścieżka:** zaktualizuj w tym samym PR wszystkich wymienionych konsumentów.

## Poza kontraktem

- Wewnętrzne moduły `packages/app` (`src/server/*`, komponenty stron) — refaktoryzuj swobodnie, w granicach testów.
- Komponenty shadcn w `packages/ui/src/components` — mogą być regenerowane przez `npx shadcn add`, o ile ich konsumenci w panelu nadal działają.
- Pliki w `.ai/` (specyfikacje, lekcje, logi przebiegów) — dokumentacja, nie kontrakt.
