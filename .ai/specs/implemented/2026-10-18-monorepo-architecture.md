# Architektura monorepo Gomoku

Status: wdrożona (2026-10-18)

## Cel

Przekształcić starter Next.js w monorepo z jasnym podziałem na pakiety i ustalonym stackiem,
tak by kolejne funkcje (konta, lobby, partie, historia — patrz `product-brief.md`) można było
dokładać bez zmian w fundamentach.

## Wymagania (od właściciela)

- Next.js (najnowszy, App Router), TypeScript, React.
- PostgreSQL + MikroORM (migracje, pula połączeń).
- Awilix jako kontener DI.
- Tailwind CSS dla stron frontendowych, shadcn/ui dla stron backendowych (panel administracyjny).
- Monorepo, katalog `packages/` z minimum: `app`, `core`, `db`, `ui`.
- `AGENTS.md` z tymi założeniami, `README.md` z opisem architektury.

## Decyzje techniczne

- **npm workspaces** (`"workspaces": ["packages/*"]`), bez dodatkowego narzędzia (Turbo/Nx) —
  najprostsze, zgodne z istniejącym `package-lock.json`. Skrypty root delegują do pakietów.
- Nazwy pakietów: `@gomoku/app`, `@gomoku/core`, `@gomoku/db`, `@gomoku/ui`.
- Pakiety biblioteczne publikują **źródła TS** (`exports` → `./src/*.ts`), bez kroku build.
  Turbopack transpiluje pakiety workspace automatycznie
  (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/transpilePackages.md`).
- Wspólny `tsconfig.base.json` (strict, `moduleResolution: bundler`), każdy pakiet ma własny
  `tsconfig.json` i skrypt `typecheck`.
- Wszystkie pakiety `"type": "module"`.
- Graf zależności (bez cykli): `app → core, db, ui`; `db → core`; `ui` i `core` niezależne.
- **core**: czysty TypeScript bez zależności od Next/React/ORM — logika domenowa
  (zasady gry w przyszłości), helpery DI (fabryka kontenera Awilix), typy wspólne.
- **db**: konfiguracja MikroORM (`@mikro-orm/postgresql`), rejestr encji (`defineEntity`, bez
  dekoratorów — działa z Turbopack bez `reflect-metadata`), migracje, konfiguracja CLI, pula
  połączeń z env (`DATABASE_URL`, `DATABASE_POOL_MIN/MAX`). Pakiety MikroORM jako
  `serverExternalPackages` w Next.
- **ui**: shadcn/ui w układzie monorepo (`components.json`, `src/components`,
  `src/styles/globals.css` z tokenami motywu). Aktualny rejestr shadcn generuje `import { cn } from "cn"`
  (pakiet `cn` od shadcn zamiast `clsx` + `tailwind-merge`) — przyjęte. Komponenty dla backendu.
- **app**: Next.js; dwa route groupy z osobnymi root layoutami i osobnym CSS:
  - `(frontend)` — strony dla graczy, własne komponenty na czystym Tailwind, bez shadcn;
  - `(backend)` — panel `/backend`, komponenty z `@gomoku/ui` (shadcn).
  - Kontener DI: `src/server/container.ts` (`server-only`), asynchroniczna inicjalizacja ORM,
    singleton na `globalThis` (odporny na HMR), scope per request (`em` forkowany).
  - `GET /api/health` — sprawdza połączenie z bazą przez kontener.
- PostgreSQL lokalnie: `compose.yaml` (postgres:17) + `.env.example`. Pliki `.env*` w roocie monorepo,
  ładowane przez `@next/env` w `next.config.ts` i w konfiguracji CLI MikroORM.
- Healthcheck wykonuje `select 1` — w MikroORM v7 `checkConnection()` zwraca „not established”
  przed pierwszym `connect()` (lekcja `2026-10-18-mikro-orm-v7-lazy-connection`).
- `build`/`start` w `packages/app` wymuszają `NODE_ENV=production` (sandbox eksportuje `development`).

## Kryteria akceptacji

- [x] `packages/{app,core,db,ui}` istnieją, root `package.json` definiuje workspaces.
- [x] `npm run lint`, `npm run typecheck`, `npm run build` przechodzą z roota.
- [x] `npm run dev` z roota uruchamia aplikację (zgodnie z `openmercato.toml`).
- [x] Strona `/` (frontend, Tailwind) i `/backend` (shadcn) renderują się — zweryfikowane przez HTTP
  (treść, osobne arkusze CSS: frontend bez tokenów shadcn, backend z motywem shadcn). Wizualnie
  niesprawdzone: w sandboxie brak bibliotek systemowych dla headless Chromium.
- [x] `GET /api/health` zwraca status bazy (ok przy działającym Postgresie, błąd 503 bez niego).
- [x] CLI MikroORM działa (`npm run db:migration:create`, `db:migration:up`) na prawdziwym Postgresie.
- [x] `AGENTS.md` opisuje stack, pakiety, granice zależności i konwencje.
- [x] `README.md` opisuje architekturę i uruchomienie.
