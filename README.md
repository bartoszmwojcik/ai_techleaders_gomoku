# Gomoku

Gomoku 1:1 online: dwóch zalogowanych graczy gra w czasie rzeczywistym na planszy 15×15, według swobodnych zasad (pięć w linii wygrywa), z zegarem szachowym 10 minut na gracza. Przeciwnika znajdziesz przez zaproszenie albo w otwartym lobby. Pełne wymagania produktu: [`.ai/specs/product-brief.md`](.ai/specs/product-brief.md).

## Stack

| Obszar | Technologia |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack), React 19, TypeScript |
| Baza danych | PostgreSQL + [MikroORM 7](https://mikro-orm.io) (migracje, pula połączeń) |
| Dependency Injection | [Awilix](https://github.com/jeffijoe/awilix) |
| Style — strony frontendowe | [Tailwind CSS 4](https://tailwindcss.com) |
| Style — strony backendowe | [shadcn/ui](https://ui.shadcn.com) (na Tailwind CSS 4) |
| Monorepo | npm workspaces |

## Architektura

Repozytorium to monorepo oparte na npm workspaces. Kod znajduje się w pakietach w katalogu `packages/`:

```
.
├── packages/
│   ├── app/    @gomoku/app  — aplikacja Next.js (strony, API, kompozycja DI)
│   ├── core/   @gomoku/core — logika domenowa i narzędzia wielokrotnego użytku
│   ├── db/     @gomoku/db   — MikroORM: konfiguracja, encje, migracje
│   └── ui/     @gomoku/ui   — komponenty UI wielokrotnego użytku (shadcn/ui)
├── scripts/smoke.mjs         — smoke test zbudowanej aplikacji
├── tsconfig.base.json        — wspólna konfiguracja TypeScript
├── eslint.config.mjs         — ESLint dla całego monorepo
├── compose.yaml              — lokalny PostgreSQL
└── .env.example              — zmienne środowiskowe
```

### Zależności między pakietami

```mermaid
graph LR
  app["@gomoku/app"] --> core["@gomoku/core"]
  app --> db["@gomoku/db"]
  app --> ui["@gomoku/ui"]
  db --> core
```

Zależności są jednokierunkowe. `core` nie wie nic o Next.js, Reakcie ani bazie danych, więc logikę gry można testować i używać wszędzie. `ui` nie ma dostępu do bazy ani kodu serwerowego.

Pakiety biblioteczne (`core`, `db`, `ui`) nie mają kroku build: eksportują źródła TypeScript przez pole `exports` w `package.json`, a Next.js (Turbopack) transpiluje je razem z aplikacją.

### `@gomoku/app` — aplikacja

Aplikacja Next.js z App Routerem (`packages/app/src/app`). Ma dwie części, każda z osobnym root layoutem i osobnym arkuszem stylów:

| Część | Katalog | Adres | Style |
| --- | --- | --- | --- |
| Frontend — strony dla graczy | `src/app/(frontend)` | `/` | Tailwind CSS z własnym motywem gry (`frontend.css`) |
| Backend — panel administracyjny | `src/app/(backend)` | `/backend` | shadcn/ui z `@gomoku/ui` |
| API | `src/app/api` | `/api/*` | — |

Dzięki osobnym root layoutom style frontendu i panelu się nie mieszają. Przejście między częściami przeładowuje całą stronę.

Kod serwerowy znajduje się w `src/server`:

- `container.ts` — kontener DI (Awilix) z rejestracją wszystkich serwisów. ORM i jego pula połączeń to singleton procesu, odporny na HMR w trybie deweloperskim. Każde żądanie dostaje własny scope z forkiem `EntityManager` (`withRequestScope`).
- `services/` — serwisy aplikacji. Zależności przyjmują w konstruktorze, np. `HealthService` dostaje `orm`.

```ts
// Route handler / server component / server action
const report = await withRequestScope(({ cradle }) => cradle.healthService.check());
```

`GET /api/health` zwraca stan połączenia z bazą: `200` albo `503`.

### `@gomoku/core` — części wielokrotnego użytku

Czysty TypeScript bez zależności od frameworków:

- `createAppContainer()` — fabryka kontenera Awilix z ustawieniami projektu (tryb `PROXY`, `strict`), plus reeksport `asClass`, `asFunction` i `asValue`;
- zasady gry (`BOARD_SIZE`, `WIN_LENGTH`), a w przyszłości silnik gry, zegar i typy domenowe.

### `@gomoku/db` — dane

- `createOrmConfig()` — konfiguracja MikroORM dla PostgreSQL. Adres bazy i rozmiar puli pochodzą ze zmiennych środowiskowych.
- `createOrm()` — tworzy instancję ORM z własną pulą połączeń. Łączy się leniwie, przy pierwszym zapytaniu.
- `src/entities/` — encje definiowane przez `defineEntity` (bez dekoratorów), rejestrowane jawnie w `entities/index.ts`.
- `src/migrations/` — migracje generowane przez CLI MikroORM (`src/mikro-orm.config.ts`).

### `@gomoku/ui` — komponenty interfejsu

Komponenty [shadcn/ui](https://ui.shadcn.com) w `src/components` oraz motyw (zmienne CSS i Tailwind) w `src/styles/globals.css`. Importowane przez strony backendowe, np. `import { Card } from "@gomoku/ui/components/card"`. Nowe komponenty dodajesz z katalogu `packages/ui`:

```bash
cd packages/ui && npx shadcn@latest add dialog
```

## Uruchomienie

Wymagania: Node.js ≥ 22.17 i PostgreSQL 17 (np. przez Dockera).

```bash
npm install
cp .env.example .env.local       # dostosuj DATABASE_URL, jeśli trzeba
docker compose up -d             # lokalny PostgreSQL (opcjonalnie)
npm run db:migration:up          # zastosuj migracje
npm run dev                      # http://localhost:3000
```

Zmienne środowiskowe czytane są z plików `.env*` w katalogu głównym repozytorium, wspólnych dla aplikacji i CLI MikroORM. Zmienne ustawione w środowisku procesu mają pierwszeństwo przed plikami.

| Zmienna | Domyślnie | Opis |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://gomoku:gomoku@localhost:5432/gomoku` | Adres bazy PostgreSQL |
| `DATABASE_POOL_MIN` | `0` | Minimalna liczba połączeń w puli |
| `DATABASE_POOL_MAX` | `10` | Maksymalna liczba połączeń w puli |
| `DATABASE_DEBUG` | `false` | Logowanie zapytań SQL |

## Komendy

Uruchamiane z katalogu głównego:

| Komenda | Opis |
| --- | --- |
| `npm run dev` | Serwer deweloperski Next.js |
| `npm run build` / `npm run start` | Build produkcyjny i jego uruchomienie |
| `npm run lint` | ESLint dla całego monorepo |
| `npm run typecheck` | Sprawdzenie typów we wszystkich pakietach |
| `npm run smoke` | Uruchamia zbudowaną aplikację i sprawdza `/`, `/backend`, `/api/health` (z bazą) i 404; port: `SMOKE_PORT` (domyślnie 3100) |
| `npm run check` | Pełna weryfikacja: `lint` → `typecheck` → `build` → `smoke` |
| `npm run db:migration:create` | Nowa migracja na podstawie różnic między encjami a schematem (`-- --blank`: pusta) |
| `npm run db:migration:up` / `db:migration:down` | Zastosowanie / cofnięcie migracji |
| `npm run db:migration:list` | Lista wykonanych migracji |

## Praca z agentami AI

Zasady dla agentów kodujących (stack, granice pakietów, konwencje, przepływ pracy) są w [`AGENTS.md`](AGENTS.md). Specyfikacje, lekcje i logi przebiegów znajdują się w katalogu `.ai/`.
