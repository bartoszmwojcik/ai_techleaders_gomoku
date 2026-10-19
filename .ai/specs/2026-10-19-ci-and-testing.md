# CI (GitHub Actions), testy jednostkowe i integracyjne

**Status:** w realizacji (2026-10-19)

## Cel

Każdy pull request jest automatycznie sprawdzany: lint, typy, build, testy jednostkowe ze 100% pokryciem
oraz testy integracyjne uruchamiające zbudowaną aplikację na efemerycznym PostgreSQL. Reguła 100% pokrycia
testami jednostkowymi jest zapisana w `AGENTS.md` i egzekwowana przez CI. Istniejący kod dostaje testy
pokrywające go w 100%.

## Wymagania

### R1. Testy jednostkowe — Vitest

- Runner: **Vitest 5** (`vitest`, `@vitest/coverage-v8`), jedna konfiguracja w roocie (`vitest.config.ts`)
  z projektami generowanymi z katalogów `packages/*` (`extends: true` — dziedziczą `resolve.tsconfigPaths`
  i `unstubEnvs`; coverage i progi tylko w roocie). Opcjonalny `vitest.setup.ts` pakietu
  (`app`: zaślepka `server-only`). Środowisko `node`; komponenty React renderowane
  przez `react-dom/server` (`renderToStaticMarkup`) — bez jsdom, dopóki nie pojawią się komponenty
  klienckie z interakcją (wtedy: `jsdom` + `@testing-library/react` w projekcie, który ich potrzebuje).
- Testy leżą obok kodu: `src/**/<plik>.test.ts(x)`. Importy z `vitest` jawne (bez `globals`).
- Alias `@/*` w `app` przez `resolve.tsconfigPaths` (Vite 8).
- Pokrycie (`coverage.include`): `packages/*/src/**/*.{ts,tsx}` + `packages/app/next.config.ts`.
  Próg: `thresholds: { 100: true, perFile: true }` — statements, branches, functions, lines, każdy plik.
- Wyjątki z pokrycia (jedyne dozwolone):
  - komponenty shadcn/ui — **jawna lista nazw** w `vitest.config.ts` (`SHADCN_COMPONENTS`), dopisywana
    przy każdym `npx shadcn add` (decyzja użytkownika 2026-10-19: kod vendorowany, regenerowany przez CLI);
  - migracje (`packages/db/src/migrations/**`) — pliki generowane;
  - pliki testowe i deklaracje (`*.test.*`, `*.d.ts`).
- Zakaz `/* v8 ignore */` i dopisywania wyjątków bez zgody użytkownika — CI (job `unit`) odrzuca
  komentarze `v8|c8|istanbul ignore` w `packages/`.
- Komendy: `npm test` (jednorazowo z pokryciem), `npm run test:watch`.

### R2. Testy integracyjne — Testcontainers + agent-browser

- Osobna konfiguracja `vitest.integration.config.ts`, testy w `tests/integration/*.test.ts`.
- `globalSetup` (`tests/integration/global-setup.ts`):
  1. sprawdza, że istnieje build (`packages/app/.next/BUILD_ID`), inaczej kończy się czytelnym błędem;
  2. startuje `PostgreSqlContainer("postgres:17")` (`@testcontainers/postgresql`);
  3. uruchamia migracje (`npm run db:migration:up`) z jawnym `DATABASE_URL` kontenera;
  4. startuje `next start` (`NODE_ENV=production`) na wolnym porcie z `DATABASE_URL` kontenera
     (zmienne procesu mają pierwszeństwo przed `.env*` — lekcja 2026-10-18-sandbox-env-overrides);
  5. przekazuje `baseUrl` do testów przez `provide`/`inject`;
  6. teardown: zamyka sesję przeglądarki, zatrzymuje serwer (cała grupa procesów) i kontener.
- Przeglądarka: **agent-browser** (CLI, Chrome for Testing) przez helper `tests/integration/browser.ts`:
  wywołania `agent-browser --session <unikalna> --json …`, parsowanie `{ success, data, error }`,
  błąd → wyjątek z komunikatem CLI.
- Scenariusze startowe: `/` (nagłówek „Gomoku”, plansza 15×15 = 225 pól przez `data-testid="board"`),
  `/backend` („Panel administracyjny”, badge „Połączono” — dowód połączenia z bazą z kontenera,
  parametry gry), `/api/health` (200, `status: "ok"`, przez `fetch`), nieistniejąca ścieżka (404 przez
  `fetch` + strona w przeglądarce).
- `next start` uruchamiany bezpośrednio (`node next/dist/bin/next start`) we własnej grupie procesów;
  teardown czeka na wyjście serwera przed zatrzymaniem kontenera. Log serwera: `tests/integration/server.log`
  (artefakt CI przy błędzie).
- Przy pierwszej encji/migracji dopisać scenariusz sprawdzający schemat w kontenerze.
- Komenda: `npm run test:integration` (wymaga Dockera i wcześniejszego `npm run build`).
- Jednorazowo lokalnie: `npx agent-browser install` (Chrome). W CI preinstalowany Chrome runnera
  (`AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome`, `AGENT_BROWSER_ARGS=--no-sandbox` — AppArmor
  na Ubuntu 24.04 blokuje sandbox Chrome) — bez pobierania i cache.

### R3. CI — GitHub Actions

- `.github/workflows/ci.yml`, wyzwalacze: `pull_request`, `push` na `main`, `workflow_dispatch`;
  `concurrency` z anulowaniem starszych przebiegów PR (pushy na `main` nie anuluje);
  `permissions: contents: read`; `timeout-minutes` na jobach; akcje `@v7` (Node 24).
- Node 22 (zgodnie z `engines`), `npm ci` z cache npm.
- Joby (równoległe, każdy osobny status check): `lint`, `typecheck`, `unit` (`npm test`, raport pokrycia
  jako artefakt), `build`, `integration` (build → `agent-browser install --with-deps` z cache przeglądarki →
  `npm run test:integration`).

### R4. Reguły w `AGENTS.md` i dokumentacja

- Stack: Vitest, Testcontainers, agent-browser, GitHub Actions.
- Reguła: każda nowa funkcja i każda zmiana kodu ma 100% pokrycia testami jednostkowymi (per plik,
  wszystkie metryki); PR bez tego nie przechodzi CI. Wyjątki tylko z R1.
- Konwencje testów (położenie, mockowanie granic: `next/server`, `server-only`, ORM), integracja.
- `npm run check` = lint → typecheck → test → build → test:integration.
- Root `tsconfig.json` obejmuje `vitest*.config.ts` i `tests/` (sprawdzane w `npm run typecheck`);
  ESLint ignoruje `coverage/`.
- Przy `npx shadcn add` dopisz komponent do `SHADCN_COMPONENTS`.
- README: sekcja o testach i CI.

### R5. Testy istniejącego kodu (100%)

| Plik | Co testujemy |
| --- | --- |
| `core/src/di.ts` | tryb PROXY (destrukturyzacja), `strict` (singleton zależny od scoped → błąd), reeksporty |
| `core/src/game/rules.ts`, `core/src/index.ts` | stałe zasad, publiczne API pakietu |
| `db/src/config.ts` | domyślne wartości, `DATABASE_URL`, pula z env (puste, poprawne, niepoprawne → błąd), `debug`, nadpisania |
| `db/src/orm.ts` | `createOrm` tworzy instancję bez łączenia z bazą (leniwie), przekazuje nadpisania |
| `db/src/mikro-orm.config.ts` | ładuje `.env` z roota, Migrator, ścieżka i opcje migracji |
| `db/src/entities/index.ts`, `db/src/index.ts` | rejestr encji, publiczne API |
| `app/next.config.ts` | ładowanie `.env` z roota (dev/prod), `serverExternalPackages` |
| `app/src/server/services/health-service.ts` | ok, błąd `Error`, błąd nie-`Error` |
| `app/src/server/container.ts` | singleton ORM i kontenera, ponowienie po błędzie (ORM i kontener), scope z forkiem `em` |
| `app/src/app/api/health/route.ts` | 200 ok, 503 w dev (z `reason`), 503 w prod (bez szczegółów) |
| `app/src/app/(frontend)/page.tsx`, `layout.tsx` | treść, plansza 225 pól, kamienie, metadata |
| `app/src/app/(backend)/backend/page.tsx`, `layout.tsx` | stan połączony / brak połączenia, parametry gry, metadata |

## Kryteria akceptacji

- [x] `npm test` przechodzi i raportuje 100% (statements/branches/functions/lines) dla każdego pliku w zakresie
  (2026-10-19: 34 testy, 14 plików w pełni pokrytych, 2 barrele bez instrukcji).
- [x] Próg perFile jest egzekwowany — dowód: bez `db/src/config.test.ts` `npm test` kończy się exit 1
  (`config.ts`: 50% linii).
- [x] `npm run test:integration` przechodzi lokalnie: kontener PostgreSQL, migracje, `next start`, agent-browser
  (4 testy).
- [x] Workflow CI ma joby `lint`, `typecheck`, `unit`, `build`, `integration` i wszystkie przechodzą na PR
  (PR #3, 2026-10-19: wszystkie zielone; integracja 1m36s).
- [x] `AGENTS.md` zawiera regułę 100% pokrycia dla nowych funkcji i konwencje testów; README opisuje testy i CI.
- [x] `npm run lint`, `npm run typecheck`, `npm run build` przechodzą (`npm run check` w całości: exit 0).

## Poza zakresem

- Ustawienie wymaganych status checków (branch protection) — ustawienie repozytorium, decyzja właściciela.
- Podatności `braces` w narzędziach deweloperskich.
- Zastąpienie `scripts/smoke.mjs` — zostaje jako szybki test przeciw istniejącej bazie (bez Dockera).

## Notatki techniczne

- `agent-browser@0.39.1` deklaruje `engines.node >=24`, ale dystrybuuje natywną binarkę; działa z Node 22
  (sprawdzone 2026-10-19). Wyjście `--json`: `{ success, data, error }`, kod wyjścia ≠ 0 przy błędzie.
- `server-only` rzuca wyjątek poza warunkiem `react-server` — w testach `vi.mock("server-only", () => ({}))`.
- MikroORM v7 łączy się leniwie — `createOrm()` w teście jednostkowym nie wymaga bazy (`orm.close()` po teście).
- `package-lock.json`: lockfile z `main` zawierał pola `libc`, których nie zapisuje ani lokalny npm 10, ani
  npm 11 (sprawdzone 2026-10-19). npm 11 domyślnie nie uruchamia skryptów instalacyjnych (`install-scripts`) —
  pozostajemy przy npm 10 z Node 22 (to samo co w CI). Patrz lekcja 2026-10-19-npm-lockfile-libc.

## Historia

- 2026-10-19 — specyfikacja utworzona; decyzja: komponenty shadcn poza progiem 100% (jawna lista).
- 2026-10-19 — przegląd planu przez drugiego agenta; uwzględnione: ignore `coverage/` w ESLint, root
  tsconfig dla testów, `unstubEnvs`, setup `server-only`, projekty z `packages/*`, `data-testid` planszy,
  kody HTTP przez `fetch`, czekanie na wyjście serwera, Chrome runnera w CI, blokada `v8 ignore`, concurrency.
  Odrzucone: łączenie jobów `build` i `integration` (użytkownik chce osobnego statusu buildu), wspólny helper
  startu serwera ze `smoke.mjs` (poza zakresem).
- 2026-10-19 — implementacja; `npm run check` przechodzi lokalnie, CI na PR #3 zielone. Po merge przenieść do `implemented/`.
