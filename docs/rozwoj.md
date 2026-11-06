# Praca nad projektem

Przeniesione z README: pełna instalacja i konfiguracja, komendy, testy, CI, praca z agentami AI.

## Uruchomienie

Wymagania: Node.js ≥ 22.17 i PostgreSQL 17 (najprościej Docker z `docker compose`).

```bash
npm run setup                    # przygotowuje repozytorium (można powtarzać)
npm run dev                      # http://localhost:3000
```

`npm run setup` wykonuje po kolei wszystkie kroki instalacji ręcznej (niżej): sprawdza wersję Node.js, instaluje zależności (`npm ci`), tworzy `.env.local` z `.env.example`, uruchamia PostgreSQL w Dockerze, jeśli baza nie odpowiada, i stosuje migracje. Każdy krok najpierw sprawdza, czy jest już wykonany, więc kolejne uruchomienia pomijają gotowe kroki i dokańczają tylko braki. Instalator:

- nigdy nie nadpisuje istniejącego `.env.local`;
- łączy się z tą samą bazą co `npm run dev` (pliki `.env*` jak w trybie deweloperskim) i wypisuje ją z ukrytym hasłem;
- odmawia użycia `DATABASE_URL` ze zmiennych środowiskowych, gdy różni się od plików `.env*` — świadomie: `npm run setup -- --db-from-env`;
- nie uruchamia drugiego PostgreSQL, gdy port 5432 zajmuje już inna instancja.

Opcja `npm run setup -- --with-browser` dodatkowo instaluje Chrome dla testów integracyjnych, a `npm run setup -- --help` pokazuje wszystkie opcje.

### Jedno polecenie: `scripts/gomoku-local.sh`

Skrypt łączy przygotowanie i start (sprawdza Node.js, npm, Docker i wolność portu, uruchamia `npm run setup`, a potem serwer), więc nowa osoba potrzebuje jednej komendy. Jest idempotentny i działa w `sh` (macOS, Linux, WSL2, Git Bash).

```bash
scripts/gomoku-local.sh                 # serwer deweloperski, http://localhost:3000
scripts/gomoku-local.sh --bot           # z włączonym botem (BOT_ENABLED=true; domyślnie wyłączony)
scripts/gomoku-local.sh --prod          # build produkcyjny i next start (jak na serwerze, HTTP, poczta do pliku)
scripts/gomoku-local.sh --port 3100     # inny port (APP_ORIGIN dopasowuje się, żeby ochrona CSRF działała)
scripts/gomoku-local.sh --no-setup      # pomiń npm run setup
scripts/gomoku-local.sh --check         # tylko sprawdź wymagania, nic nie uruchamiaj
scripts/gomoku-local.sh --stop          # zatrzymaj lokalny PostgreSQL (dane zostają w wolumenie)
```

Tryb `--prod` ustawia zmienne wymagane przez produkcyjną konfigurację na HTTP w sieci lokalnej: `TRUST_PROXY_HOPS=1`, `ADMIN_EMAIL` (domyślnie `admin@example.test`), `SESSION_COOKIE_SECURE=false`, `EMAIL_TRANSPORT=file` z plikiem w katalogu tymczasowym (`GOMOKU_EMAIL_OUTBOX` zmienia ścieżkę). Zmienne ustawione w środowisku mają pierwszeństwo. Skrypt nie ma testów jednostkowych (to powłoka, poza progiem pokrycia) i CI go nie uruchamia, więc zmiany w nim sprawdzaj ręcznie opcjami `--help` i `--check`.

### Instalacja ręczna

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
| `DATABASE_POOL_MAX` | `10` | Maksymalna liczba połączeń w puli; build produkcyjny ma dwie pule (strony i route'y), więc realnie do dwukrotności |
| `DATABASE_DEBUG` | `false` | Logowanie zapytań SQL |
| `APP_ORIGIN` | brak (dev: `http://localhost:<port>`) | Dokładny origin aplikacji, np. `https://gomoku.byst.re`; porównywany z nagłówkiem `Origin` (CSRF). **Wymagany w produkcji** |
| `ADMIN_EMAIL` | brak (dev: nikt nie jest administratorem) | Adres administratora instalacji (E08, BR-35), normalizowany jak e-mail przy rejestracji. **Wymagany w produkcji** (`compose.prod.yaml` odmawia startu, `readServerConfig` rzuca). Konto powstaje tylko poleceniem `npm run admin:create`; rejestracja na ten adres jest odrzucana jak zajęty e-mail, konta nie da się usunąć, a `db:cleanup` je pomija |
| `TRUST_PROXY_HOPS` | brak (dev: wspólny klucz `local`) | Liczba własnych proxy przed aplikacją (liczba całkowita ≥ 1). **Wymagana w produkcji** |
| `CLIENT_IP_HEADER` | `x-forwarded-for` | Nagłówek z adresem klienta: `x-forwarded-for`, `x-real-ip` albo `cf-connecting-ip` |
| `PASSWORD_HASH_COST` | `12` | Koszt bcrypt (liczba całkowita 4–31); obniża go tylko `global-setup` testów integracyjnych (4), żeby setki prób logowania nie trwały minutami. W produkcji zostaw nieustawione |
| `SESSION_COOKIE_SECURE` | `true` | `false` tylko dla testów integracyjnych (HTTP bez TLS); przy `APP_ORIGIN` z `https://` przerywa start |

## Komendy

Uruchamiane z katalogu głównego:

| Komenda | Opis |
| --- | --- |
| `npm run setup` | Idempotentna instalacja: zależności, `.env.local`, PostgreSQL, migracje (`-- --with-browser`, `-- --db-from-env`, `-- --help`) |
| `npm run dev` | Serwer deweloperski Next.js |
| `npm run build` / `npm run start` | Build produkcyjny i jego uruchomienie |
| `npm run lint` | ESLint dla całego monorepo |
| `npm run typecheck` | Sprawdzenie typów we wszystkich pakietach i w testach integracyjnych |
| `npm test` | Testy jednostkowe (Vitest) z raportem pokrycia w `coverage/`; próg 100% dla każdego pliku |
| `npm run test:watch` | Testy jednostkowe w trybie watch |
| `npm run test:integration` | Testy integracyjne zbudowanej aplikacji (Docker, wcześniej `npm run build`) |
| `npm run smoke` | Uruchamia zbudowaną aplikację i sprawdza `/`, `/backend` (oczekuje `404`), `/api/health` (z bazą) i 404; port: `SMOKE_PORT` (domyślnie 3100) |
| `npm run check` | Pełna weryfikacja: `lint` → `typecheck` → `test` → `build` → `test:integration` |
| `npm run db:migration:create` | Nowa migracja na podstawie różnic między encjami a schematem (`-- --blank`: pusta) |
| `npm run db:migration:up` / `db:migration:down` | Zastosowanie / cofnięcie migracji |
| `npm run db:migration:list` | Lista wykonanych migracji |
| `npm run db:status` | Czy baza z `DATABASE_URL` odpowiada i ile migracji czeka (JSON) |
| `npm run stats:games` | Licznik zakończonych partii wg pary typów uczestników (JSON, **tylko odczyt**; w produkcji przez `docker exec`, zob. [Licznik zakończonych partii](#licznik-zakończonych-partii)) |
| `npm run admin:create -- [--name <nazwa>] [--yes]` | Zakłada konto administratora instalacji (`ADMIN_EMAIL`) albo je **przejmuje** (nowe hasło, potwierdzony e-mail, wylogowanie wszystkich sesji). Hasło tylko z monitu bez echa (dwukrotnie) lub z jednej linii stdin; wypisuje bazę docelową (`host:port/nazwa`) na stderr. Szczegóły: [Konto administratora](wdrozenie-i-utrzymanie.md#konto-administratora) |
| `npm run db:cleanup` | Usuwa wygasłe sesje, liczniki limitów, tokeny i nieodebrane partie z bazy z `DATABASE_URL` (JSON z liczbami; **kasuje dane**, zob. [Sprzątanie](#sprzątanie-wygasłych-rekordów)) |

## Testy i CI

**Testy jednostkowe** (Vitest 5) leżą obok kodu jako `*.test.ts(x)`. Każdy pakiet z `packages/*` to osobny projekt Vitest. Próg pokrycia wynosi 100% (instrukcje, gałęzie, funkcje, linie) dla każdego pliku. Poza progiem są tylko komponenty shadcn/ui (lista `SHADCN_COMPONENTS` w `vitest.config.ts`) i wygenerowane migracje.

**Testy integracyjne** (`tests/integration`) uruchamiają produkcyjny build aplikacji na tymczasowym PostgreSQL w kontenerze ([Testcontainers](https://testcontainers.com/)) i sprawdzają strony i przepływy (np. rejestrację) w prawdziwej przeglądarce przez [agent-browser](https://agent-browser.dev). Wymagają Dockera i jednorazowej instalacji Chrome:

```bash
npx agent-browser install        # Chrome for Testing (raz; albo npm run setup -- --with-browser)
npm run build
npm run test:integration
```

Log serwera z ostatniego przebiegu: `tests/integration/server.log`.

**CI** (GitHub Actions, `.github/workflows/ci.yml`) na każdym pull requeście i pushu na `main` uruchamia równolegle: lint, typecheck, testy jednostkowe z progiem pokrycia, build, testy integracyjne oraz dwukrotne `npm run setup` na świeżym checkoucie (drugie uruchomienie musi pominąć wszystkie kroki). PR zmieniający wyłącznie dokumentację (`*.md`, `.ai/`, `docs/`, `LICENSE`) pomija ciężkie joby; zmiany w `.agents/`, `.claude/`, `.github/`, `skills-lock.json` i w `.ai/{skills,scripts,trackers,browsers}/` zawsze uruchamiają pełne CI, bo skille to instrukcje wykonywane przez agentów (reguła: `scripts/ci/scope.mjs`). Job `skills-lock` sprawdza hashe skilli (`node scripts/ci/cli.mjs skills-lock`), akcje w workflow są przypięte do SHA, a Dependabot co tydzień proponuje aktualizacje npm, akcji i obrazów bazowych (przypiętych do digestów w `Dockerfile` i `compose.prod.yaml`). Job `audit` („Audit zależności”) uruchamia `npm audit --omit=dev --audit-level=high` tylko informacyjnie: nie blokuje scalenia i nie jest wymaganym checkiem; wynik czytaj w logu joba.

## Praca z agentami AI

Zasady dla agentów kodujących (stack, granice pakietów, konwencje, przepływ pracy) są w [`AGENTS.md`](../AGENTS.md). Specyfikacje, lekcje i logi przebiegów znajdują się w katalogu `.ai/`.
