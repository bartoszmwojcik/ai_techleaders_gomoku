# Plan: migracja do monorepo

Status: ukończony (2026-10-18)
Specyfikacja (wymagania, decyzje techniczne): `implemented/2026-10-18-monorepo-architecture.md`.
Zasady obowiązujące po migracji: `AGENTS.md`, opis architektury: `README.md`.

## Fazy

### Faza 1 — workspace i przeniesienie aplikacji ✅

- npm workspaces (`packages/*`), jeden `package-lock.json`, `tsconfig.base.json`, ESLint dla całego repo.
- Aplikacja Next.js przeniesiona z `src/` do `packages/app`; root `package.json` deleguje skrypty
  (`dev`, `build`, `start`, `lint`, `typecheck`, `db:*`).

Kryteria ukończenia:
- [x] `npm ci` na czystej kopii repo przechodzi (2026-10-18: 706 pakietów, bez błędów).
- [x] `npm run dev -- --hostname 0.0.0.0 --port …` (komenda z `openmercato.toml`) uruchamia aplikację z roota.
- [x] W roocie nie ma kodu aplikacji (`src/`, `public/`, `next.config.ts`, `tsconfig.json` usunięte).

### Faza 2 — wydzielenie `core`, `db`, `ui` i podłączenie do `app` ✅

- `core`: helpery DI (Awilix), zasady gry. `db`: MikroORM 7, konfiguracja, CLI migracji.
  `ui`: shadcn/ui + motyw. `app`: route groups `(frontend)` / `(backend)`, kontener DI, `/api/health`.

Kryteria ukończenia:
- [x] Importy wyłącznie zgodne z grafem `app → core, db, ui`; `db → core` (sprawdzone grepem;
  jedyny wyjątek `@next/env` w konfiguracji CLI `db` — devDependency, udokumentowane).
- [x] `npm run lint`, `npm run typecheck`, `npm run build` — zielone na czystej kopii.
- [x] `/` 200, `/backend` 200 (stan bazy „Połączono”), `/api/health` 200 / 503 bez bazy, nieznane trasy 404.
- [x] Migracje `create` / `up` / `list` / `down` na prawdziwym PostgreSQL (tymczasowa baza, usunięta).
- [x] `next dev` nie modyfikuje `packages/app/AGENTS.md`.

Zmiana zachowania względem startera: strona powitalna startera (`backdrop.tsx`, `page.module.css`,
grafiki z `public/`) została zastąpiona stroną Gomoku i panelem `/backend` — starter nie miał
funkcji do zachowania poza wyrenderowaniem strony pod `/`.

### Faza 3 — automatyczna weryfikacja ✅

Dotąd smoke testy były wykonywane ręcznie (`curl`). Cel: jedna komenda sprawdzająca całość.

- `npm run smoke` — uruchamia zbudowaną aplikację na wolnym porcie, sprawdza trasy i bazę, sprząta proces.
- `npm run check` — `lint` → `typecheck` → `build` → `smoke`.
- `AGENTS.md` (krok weryfikacji) i `README.md` wskazują `npm run check`.

Kryteria ukończenia:
- [x] `npm run smoke` przechodzi przy działającej bazie i kończy się błędem (exit ≠ 0) z czytelnym
  komunikatem, gdy baza jest niedostępna.
- [x] `npm run smoke` nie zostawia procesów serwera (także po błędzie).
- [x] `npm run check` przechodzi z roota.
- [x] (dodatkowo) zajęty port → smoke odmawia startu zamiast testować cudzy serwer.

### Faza 4 — zamknięcie migracji ✅

- Commit zmian na gałęzi `chore/monorepo-migration` (na prośbę użytkownika). Push/PR — osobna decyzja.

Kryteria ukończenia:
- [x] Zmiany zacommitowane, drzewo robocze czyste po `npm run dev` / `npm run build`.

## Następny etap po migracji

Silnik gry w `@gomoku/core` (plansza, ruchy, wykrywanie 5 w linii, remis — BR-10 z briefu)
wraz z runnerem testów jednostkowych dla pakietów — osobna specyfikacja.

## Dziennik postępu

- 2026-10-18 — fazy 1–2 wdrożone i zweryfikowane na czystej kopii repo (`npm ci`, lint, typecheck,
  build, dev z komendą podglądu, trasy, migracje). Rozpoczęta faza 3.
- 2026-10-18 — faza 3: `scripts/smoke.mjs` + `npm run smoke` / `npm run check`. Wyniki: `check` zielony
  (4/4 trasy); baza niedostępna → exit 1, `/api/health` 503; zajęty port → exit 1; po każdym
  przebiegu brak pozostawionych procesów serwera. Następnie: faza 4 (commit/PR) po zgodzie użytkownika.
- 2026-10-18 — faza 4: commit na gałęzi `chore/monorepo-migration`; drzewo czyste po `npm run check`.
