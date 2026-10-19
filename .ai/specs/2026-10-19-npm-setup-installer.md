# Idempotentny instalator `npm run setup`

**Status:** zaproponowana (2026-10-19) · zgłoszenie: #6

## 📝 TLDR

Dziś deweloper (lub agent) przygotowuje repozytorium ręcznie, wykonując po kolei komendy z sekcji **Uruchomienie** w `README.md`. **Proponujemy** jedną komendę `npm run setup`, która wykona te kroki w poprawnej kolejności, przy każdym kolejnym uruchomieniu pominie to, co jest już zrobione, i nigdy nie dotknie bazy innej niż ta, której użyje `npm run dev`. Ręczne kroki zostają w README jako alternatywa.

## 📝 Problem Statement

Przygotowanie środowiska to dziś cztery komendy (`npm install`, `cp .env.example .env.local`, `docker compose up -d`, `npm run db:migration:up`), które trzeba znać i wykonać w kolejności. Typowe potknięcia:

- migracje uruchomione, zanim PostgreSQL przyjmuje połączenia — błąd połączenia z CLI MikroORM;
- brak `.env.local` albo nadpisanie go przy ponownym `cp` (utrata własnych ustawień);
- `DATABASE_URL` z otoczenia procesu (np. sandbox) wskazujący obcą bazę — migracje lądują w niej (incydent z lekcji `2026-10-18-sandbox-env-overrides`);
- drugi PostgreSQL na porcie 5432, gdy działa już inna instancja (ta sama lekcja);
- pominięcie Chrome dla `agent-browser`, bez którego nie przechodzi `npm run check`.

Dotyczy każdego nowego współpracownika i każdego agenta, który startuje w świeżym klonie lub worktree (skille `om-*` tworzą worktree w `.ai/tmp/`).

## 📝 Proposed Solution

Skrypt Node w `scripts/setup/` uruchamiany przez `npm run setup`. Kroki wykonują się sekwencyjnie; każdy najpierw **sprawdza**, czy jego efekt już istnieje (`pominięto`), i dopiero wtedy **działa** (`wykonano`). Pierwszy błąd zatrzymuje instalator z podpowiedzią i kodem wyjścia ≠ 0; wykonane kroki nie są cofane — każdy jest bezpieczny do powtórzenia.

| # | Krok | „Już zrobione”, gdy | Działanie |
|---|---|---|---|
| 1 | Wymagania | `process.versions.node` spełnia `engines.node` | brak — przy niespełnieniu błąd z wymaganą wersją |
| 2 | Zależności | `node_modules/.gomoku-setup.json` zawiera SHA-256 aktualnego `package-lock.json` | `npm ci`, potem zapis znacznika |
| 3 | Konfiguracja | `.env.local` istnieje | kopia `.env.example` → `.env.local` (nigdy nadpisanie) |
| 4 | Cel bazy | — (krok kontrolny, zawsze drukuje cel) | ustalenie docelowego `DATABASE_URL` i jego źródła; blokada obcej bazy z otoczenia (niżej) |
| 5 | Baza danych | `db:status` zwraca `ok` | `docker compose up -d`, potem ponawianie `db:status` do 60 s |
| 6 | Migracje | `db:status` zwraca `pending: 0` | `npm run db:migration:up` |
| 7 | Przeglądarka (tylko z `--with-browser`) | — | `npx agent-browser install` (sam nie pobiera Chrome ponownie; sprawdzone 2026-10-19 — ~2 s bez pobierania). Bez flagi krok jest `pominięto (bez --with-browser)` |

Na końcu podsumowanie: lista kroków ze statusem i następny krok (`npm run dev`). Drugie uruchomienie na przygotowanym repo daje wyłącznie `pominięto` (krok 4 jest informacyjny i nie ma statusu „wykonano”).

### Cel bazy (krok 4)

Instalator ładuje środowisko **tak jak `npm run dev`**: `loadEnvConfig(root, true)` z `@next/env` (dostępny po kroku 2), czyli `.env.development.local` → `.env.local` → `.env.development` → `.env`, a zmienne procesu mają pierwszeństwo. Wynik (`DATABASE_URL`, albo domyślny z `packages/db/src/config.ts`, gdy brak) jest przekazywany **jawnie** do wszystkich komend bazy w krokach 5–6, więc sonda i migracje trafiają dokładnie w bazę, której użyje aplikacja.

Krok drukuje zamaskowany cel i źródło, np. `postgresql://gomoku:***@localhost:5432/gomoku (z .env.local)`.

**Blokada obcej bazy:** gdy `DATABASE_URL` pochodzi ze zmiennej procesu i różni się od wartości wynikającej z samych plików, instalator kończy się błędem z oboma (zamaskowanymi) adresami, chyba że podano `--db-from-env` (świadoma zgoda na bazę z otoczenia). Zapobiega to powtórce incydentu z sandboxa.

Znane ograniczenie (istniejące, poza zakresem): ręczne `npm run db:migration:*` ładuje pliki w trybie *production* (`packages/db/src/mikro-orm.config.ts`), więc `DATABASE_URL` tylko w `.env.development*` widzi aplikacja i instalator, ale nie ręczne CLI. Zostanie zgłoszone jako osobne zgłoszenie uzupełniające.

### Sonda `db:status` (kroki 5–6)

Nowy, mały skrypt w `@gomoku/db` (`packages/db/src/cli/status.ts`, uruchamiany przez `tsx`, root: `npm run db:status`). Używa istniejącego `createOrm` i:

1. wykonuje `select 1` (bez DDL — w odróżnieniu od `migration:list`, które tworzy tabelę `mikro_orm_migrations`);
2. tylko gdy (1) się uda — liczy oczekujące migracje (`orm.migrator.getPending()`, ta sama konfiguracja migracji co CLI, wydzielona do wspólnego modułu);
3. drukuje jedną linię JSON i kończy się kodem 0:
   - `{"ok":true,"pending":<n>}`
   - `{"ok":false,"kind":"unreachable"|"auth"|"database-missing"|"other","message":"…"}` — klasyfikacja z kodów błędów `pg`/Node (`ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`, `EHOSTUNREACH` → `unreachable`; `28P01`, `28000` → `auth`; `3D000` → `database-missing`), komunikat z zamaskowanym hasłem.

JSON to wewnętrzny kontrakt instalator ↔ `db:status`, testowany po obu stronach. Klasyfikacja na obiektach błędów (zamiast parsowania stderr) jest odporna na zmiany formatu logów MikroORM.

### Baza danych (krok 5) — decyzja

```mermaid
flowchart TD
  A["db:status"] -->|ok| S[pominięto]
  A -->|auth / database-missing / other| F0["błąd: oryginalny komunikat — sprawdź dane w DATABASE_URL"]
  A -->|unreachable| B{"host lokalny (localhost / 127.0.0.1 / ::1),<br/>port 5432 i jest docker compose?"}
  B -->|nie| F1["błąd: baza nieosiągalna — uruchom PostgreSQL 17<br/>i ustaw DATABASE_URL"]
  B -->|tak| C{"port 5432 zajęty przez coś innego<br/>niż kontener projektu compose?"}
  C -->|tak| F2["błąd: inny PostgreSQL na 5432 — ustaw DATABASE_URL<br/>na tę instancję albo zwolnij port"]
  C -->|nie| D["docker compose up -d → ponawianie db:status co 1 s, ≤ 60 s"]
  D -->|ok| OK[wykonano]
  D -->|błąd inny niż unreachable| F0
  D -->|60 s minęło| F3["błąd + ostatnie linie docker compose logs postgres"]
```

- **Gotowość** sprawdza sama sonda w pętli, nie `pg_isready`: przy pierwszym starcie z pustym wolumenem entrypoint `postgres:17` uruchamia tymczasowy serwer (initdb), który `pg_isready` uznałby za gotowy za wcześnie.
- **„Zajęty przez coś innego”**: port 5432 przyjmuje połączenia (próba na `127.0.0.1` i `::1`) **i** `docker compose ps --status running --services` nie zawiera `postgres`.
- **Nazwa projektu compose** zostaje przypięta w `compose.yaml` (`name: ai_techleaders_gomoku` — dotychczasowa domyślna nazwa głównego klonu, więc istniejący kontener i wolumen `ai_techleaders_gomoku_postgres-data` zostają użyte bez zmian). Dzięki temu worktree w `.ai/tmp/*` i klony w katalogach o innej nazwie współdzielą ten sam kontener zamiast stawiać nowy z pustym wolumenem.

**Argumenty:** `--with-browser` (krok 7), `--db-from-env` (krok 4), `--help`.

**Odrzucone alternatywy:**

- *Skrypt powłoki* — nie działa natywnie na Windows i jest trudny do pokrycia testami w Vitest (wymóg 100% z `AGENTS.md`).
- *`npm install` zamiast `npm ci`* — przepisuje `package-lock.json` (usuwa pola `libc`, lekcja `2026-10-19-npm-lockfile-libc`) i brudzi drzewo robocze; `npm ci` instaluje dokładnie z lockfile.
- *`node_modules/.package-lock.json` jako znacznik* — wewnętrzny, nieudokumentowany format npm.
- *`db:migration:list` / sonda TCP jako sonda bazy* — pierwsza tworzy tabelę w bazie przed decyzją i nie rozróżnia przyczyn błędu; druga przechodzi także dla cudzego PostgreSQL.
- *`pg_isready`* — fałszywy sukces przy inicjalizacji wolumenu (wyżej).
- *Instalator w TypeScript* — musi działać **przed** `npm ci`, a Node 22.17 (minimum z `engines`) nie usuwa typów bez flagi eksperymentalnej; zostajemy przy ESM `.mjs` z typami JSDoc sprawdzanymi przez `tsc`. `db:status` jest w TS, bo działa po kroku 2 (przez `tsx`, jak CLI MikroORM).

Wzorzec: `bin/setup` z Rails (idempotentne kroki „sprawdź → zrób”, `db:prepare`). Różnica: Rails domyślnie startuje serwer (`--skip-server` go wyłącza) — tu domyślnie nie (Q2).

## 📝 Architecture

- **Nowe pliki — instalator** (wyłącznie moduły wbudowane Node w krokach 1–3; `@next/env` ładowany dynamicznie dopiero w kroku 4):
  - `scripts/setup/cli.mjs` — punkt wejścia: `process.exitCode = await main(process.argv.slice(2))`;
  - `scripts/setup/main.mjs` — parsowanie argumentów, kolejność kroków, podsumowanie, kod wyjścia;
  - `scripts/setup/steps.mjs` — kroki 1–7 jako `(ctx) => Promise<StepResult>`, `StepResult = { status: "done" | "skipped" | "failed" | "info", detail }`;
  - `scripts/setup/env.mjs` — ustalenie celu bazy i źródła, porównanie env vs pliki, maskowanie URL;
  - `scripts/setup/system.mjs` — wstrzykiwane adaptery: `run(cmd, args, { env, timeoutMs })` (obowiązkowy timeout, zabicie procesu po przekroczeniu), `isPortInUse(port)`, `fs`, `sleep`, `log`;
  - testy obok: `scripts/setup/*.test.ts`.
- **Nowe pliki — `@gomoku/db`:**
  - `packages/db/src/cli/status.ts` — sonda (wyżej) z testem;
  - `packages/db/src/migrations-config.ts` — opcje migracji (`path`, `glob`, `emit`, `transactional`, `allOrNothing`) wydzielone z `mikro-orm.config.ts`, używane przez CLI i `status.ts`.
- **Wstrzykiwanie zależności:** `main(argv, deps = defaultDeps)` — testy kroków podają fałszywe `run`/`fs`/`isPortInUse`/`sleep`/`log`. Same adaptery z `system.mjs` też mają 100% pokrycia: `run` przez `vi.mock("node:child_process")` (sukces, kod ≠ 0, timeout), `isPortInUse` przez prawdziwy `net.createServer` na porcie efemerycznym (lokalnie, bez sieci zewnętrznej).
- **Zmiany istniejących plików:**
  - `package.json` (root) — skrypty `"setup": "node scripts/setup/cli.mjs"` i `"db:status": "npm run status -w @gomoku/db --silent"`;
  - `packages/db/package.json` — skrypt `"status": "tsx src/cli/status.ts"`;
  - `packages/db/src/mikro-orm.config.ts` — używa `migrations-config.ts` (bez zmiany zachowania);
  - `compose.yaml` — `name: ai_techleaders_gomoku`;
  - `vitest.config.ts` — projekt `scripts` (`root: "."`, `include: ["scripts/**/*.test.ts"]`) i `scripts/setup/**/*.mjs` w `coverage.include` (próg 100% obowiązuje instalator; brak nowych wyjątków);
  - `tsconfig.json` (root) — `scripts/setup` w `include`, `allowJs` + `checkJs`;
  - `.github/workflows/ci.yml` — job `setup` (Implementation Plan, krok 8);
  - `README.md`, `AGENTS.md`, `BACKWARD_COMPATIBILITY.md` — zob. UI/UX.
- **Uruchamianie procesów:** sekrety tylko przez `env`, nigdy przez argv. Na Windows komenda jest przekazywana jako jeden string ze stałymi argumentami (`shell: true` bez tablicy argumentów — DEP0190); wyjście procesów potomnych w komunikatach błędów jest maskowane tak jak `DATABASE_URL`.
- **Komunikaty** po polsku; kod, identyfikatory i komentarze po angielsku (`AGENTS.md`).
- Bez wpływu na `packages/app`, runtime aplikacji i schemat bazy.

## 📝 UI/UX

Interfejs to wyjście terminala — jedna linia na krok:

```
✓ Wymagania — Node 22.23.3 (wymagane >=22.17)
– Zależności — pominięto: node_modules zgodne z package-lock.json
✓ Konfiguracja — utworzono .env.local z .env.example
ℹ Cel bazy — postgresql://gomoku:***@localhost:5432/gomoku (z .env.local)
– Baza danych — pominięto: baza odpowiada
✓ Migracje — zastosowano 2 migracje
– Przeglądarka — pominięto (bez --with-browser)
Gotowe. Uruchom aplikację: npm run dev  (http://localhost:3000)
```

Błąd kończy listę linią `✗ <krok> — <powód>` i podpowiedzią (komenda ręczna z README). `--help` wypisuje kroki i flagi. Żadne wyjście nie zawiera hasła.

**Dokumentacja (w tym samym PR — konsumenci z `BACKWARD_COMPATIBILITY.md` §7):**

- `README.md` — sekcja „Uruchomienie” zaczyna się od `npm run setup` (co robi, idempotentność, `--with-browser`, `--db-from-env`); dotychczasowe komendy zostają poniżej jako „Instalacja ręczna”; `setup` i `db:status` w tabeli „Komendy”.
- `AGENTS.md` (lista komend) i `BACKWARD_COMPATIBILITY.md` §7 (lista skryptów) — dopisz `setup`, `db:status`.
- `SDLC.md` i `.ai/agentic.config.json` — sprawdzić, że nie wymagają zmian (bramka walidacyjna się nie zmienia).

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Zachowanie |
|---|---|
| Drugie i kolejne uruchomienie | wszystkie kroki `pominięto` (krok 4 informacyjny), kod 0 |
| `package-lock.json` zmieniony (np. po `git pull`) | hash się różni → `npm ci` i nowy znacznik |
| Istniejący klon bez znacznika | jednorazowe `npm ci` (przebudowa `node_modules`), potem znacznik |
| `npm ci` przerwany lub nieudany (np. EPERM na Windows przy działającym `npm run dev`) | znacznik niezapisany, kod ≠ 0, podpowiedź „zatrzymaj `npm run dev` i uruchom ponownie”; następne uruchomienie powtarza krok |
| Edytowany `.env.local` | nigdy nienadpisany; brakujące klucze nie są dopisywane |
| `DATABASE_URL` w otoczeniu procesu, różny od plików (sandbox) | błąd w kroku 4 z oboma zamaskowanymi adresami; `--db-from-env` świadomie go akceptuje |
| `DATABASE_URL` w otoczeniu równy plikom | bez blokady |
| Brak Dockera, baza odpowiada | krok 5 `pominięto` |
| Brak Dockera, baza nie odpowiada | błąd F1 z podpowiedzią |
| Złe hasło / brak bazy `gomoku` / inny błąd | natychmiastowy błąd F0 z komunikatem (bez startu kontenera) |
| Port 5432 zajęty przez obcą instancję | błąd F2, bez startu drugiej instancji |
| Kontener zatrzymany | `docker compose up -d` go wznawia (dane w wolumenie) |
| Pierwszy start z pustym wolumenem | pętla `db:status` przeczekuje initdb (≤ 60 s) |
| Host gubi pakiety (VPN/firewall) | `run` z timeoutem zabija sondę → `unreachable`; brak zawieszenia |
| Worktree w `.ai/tmp/*` lub klon w katalogu o innej nazwie | ten sam projekt compose (`name:` w `compose.yaml`) — współdzielony kontener i wolumen |
| Zbyt stary Node | błąd w kroku 1, zanim cokolwiek się zmieni |
| `engines.node` w formacie innym niż `>=X.Y[.Z]` | jawny błąd „nieobsługiwany format engines” (bez cichego przepuszczenia) |
| Windows | `npm`/`npx`/`docker` przez `shell: true` z komendą jako jednym stringiem |

## 📝 Risks & Impact Review

- **Kontrakty:** nowe skrypty npm `setup` i `db:status` (`BACKWARD_COMPATIBILITY.md` §7) — addytywne; konsumenci z §7 aktualizowani w tym samym PR. Wewnętrzny format JSON `db:status` — konsumentem jest tylko instalator.
- **`compose.yaml`:** przypięcie `name:` do dotychczasowej domyślnej nazwy głównego klonu nie zmienia jego kontenera ani wolumenu. Klony w katalogach o innej nazwie przechodzą jednorazowo na wspólny projekt (ich dotychczasowy wolumen zostaje nieużywany — dane deweloperskie, aplikacja przed pierwszym wdrożeniem). Cofnięcie: usunąć linię `name:`.
- **Środowisko dewelopera:** instalator tworzy `.env.local`, `node_modules` i kontener — wszystko łatwe do cofnięcia (`rm .env.local`, `rm -rf node_modules`, `docker compose down`). Nie usuwa danych: nie wywołuje `docker compose down -v` ani `db:migration:down`.
- **Bezpieczeństwo:** blokada obcej bazy z otoczenia (krok 4); hasła maskowane we wszystkich komunikatach; sekrety tylko przez `env`.
- **CI:** nowy job `setup` (~2 min) — kandydat na wymagany status check.
- Bez wpływu na runtime aplikacji i schemat bazy; `risk-medium` z powodu operacji na środowisku dewelopera i bazie.

## 📝 Decisions in play

Brak — to narzędzie deweloperskie; nie dotyczy reguł biznesowych ani non-goals z `product-brief.md`.

## Resolved assumptions (autonomous defaults)

| # | Pytanie | Przyjęta odpowiedź | Uzasadnienie |
|---|---|---|---|
| Q1 | Czy instalator ma też instalować Chrome dla `agent-browser`? | Tylko z flagą `--with-browser`. | Najmniejszy zakres: ~150 MB nie jest potrzebne do uruchomienia aplikacji; flaga jest addytywna i odwracalna. |
| Q2 | Czy na końcu uruchamiać `npm run dev`? | Nie — wypisać komendę. | Instalator pozostaje skończony i powtarzalny (agenci, CI); serwer to jedna komenda. |
| Q3 | Brak Dockera, ale baza pod `DATABASE_URL` odpowiada? | Pominąć krok kontenera, bez błędu. | Wspiera lokalny PostgreSQL bez Dockera; zgodne z lekcją o nieuruchamianiu drugiej instancji. |
| Q4 | Jeden spec czy kilka? | Jeden. | Kroki 1–6 zależą od siebie (sonda wymaga zależności, migracje — bazy). Krok 7 (`--with-browser`) jest niezależny, ale to jedna komenda za flagą — osobny spec byłby droższy niż jego wartość. |
| Q5 | Jaka nazwa projektu compose? | `ai_techleaders_gomoku` (dotychczasowa domyślna nazwa głównego klonu). | Zachowuje istniejący kontener i wolumen; worktree współdzielą bazę; jedna linia, łatwa do cofnięcia. |
| Q6 | Co z `DATABASE_URL` z otoczenia procesu różnym od plików? | Błąd, chyba że `--db-from-env`. | Wzmacnia bezpieczeństwo danych (lekcja z sandboxa); świadome obejście jednym przełącznikiem. |

Żadna odpowiedź nie osłabia bezpieczeństwa, kontraktów ani decyzji produktowych — brak pozycji `⚠ NEEDS HUMAN CONFIRMATION`.

## 📋 Phasing

Jedna faza, jeden PR: instalator, sonda `db:status`, job CI i dokumentacja (konsumenci skryptów npm muszą być zaktualizowani w tym samym PR — `BACKWARD_COMPATIBILITY.md` §7). Każdy krok planu zostawia działające repozytorium (`npm run check` zielone).

## 📋 Implementation Plan

### Faza 1 — instalator `npm run setup`

1. **Szkielet i testowalność.** `scripts/setup/{cli,main,system}.mjs` z `main(argv, deps)` (zwraca kod wyjścia; `--help`; nieznana flaga → kod 1); skrypt `setup` w `package.json`; projekt `scripts` w `vitest.config.ts` + `scripts/setup/**/*.mjs` w `coverage.include`; `scripts/setup` w root `tsconfig.json` (`allowJs`, `checkJs`). Testy: `--help`, nieznana flaga, `cli.mjs` (przez `vi.mock("./main.mjs")`: przekazuje argv, ustawia `process.exitCode`), `system.run` (sukces / kod ≠ 0 / timeout przez `vi.mock("node:child_process")`), `system.isPortInUse` (port zajęty / wolny na prawdziwym `net.createServer`). `npm run check` zielone.
2. **Krok 1 i podsumowanie.** Parsowanie `engines.node` (`>=X.Y[.Z]`, inny format → błąd); linie statusu, podsumowanie, zatrzymanie na pierwszym `failed`. Testy: wersja spełniona / niespełniona / nieobsługiwany format; kolejność i zatrzymanie.
3. **Krok 2.** SHA-256 `package-lock.json`, znacznik `node_modules/.gomoku-setup.json`, `npm ci` przez `run` z timeoutem. Testy: brak znacznika, zgodny hash (pominięto), inny hash, błąd `npm ci` (znacznik niezapisany, podpowiedź).
4. **Krok 3.** Kopia `.env.example` → `.env.local` tylko przy braku. Testy: istniejący plik nietknięty, utworzenie, brak `.env.example` → błąd.
5. **`db:status` w `@gomoku/db`.** Wydziel `migrations-config.ts` (bez zmiany zachowania CLI); `src/cli/status.ts` z `select 1`, `migrator.getPending()`, klasyfikacją błędów i maskowaniem; skrypty `status` (db) i `db:status` (root). Testy jednostkowe z fałszywym `orm`: ok + pending, każda klasa błędu, maskowanie; sprawdzenie ręczne na kontenerze. `npm run check` zielone.
6. **Krok 4 (cel bazy).** `loadEnvConfig(root, true)` (dynamiczny import `@next/env`), źródło wartości, porównanie env procesu vs pliki, `--db-from-env`, maskowanie. Testy: wartość z pliku, z env równa plikom, z env różna (błąd / z flagą OK), brak wartości (domyślna z `config.ts`).
7. **Kroki 5–7.** Sonda i ścieżki z diagramu: ok, F0, F1 (host nielokalny / brak `docker compose`), F2 (port zajęty, kontener nieuruchomiony), start + pętla ≤ 60 s (sukces, błąd inny niż `unreachable`, timeout z logami); migracje (`pending: 0` → pominięto, `> 0` → `db:migration:up` z jawnym `DATABASE_URL`, błąd); `--with-browser`. `name:` w `compose.yaml`. Testy dla każdej gałęzi z fałszywym `run`/`sleep`/`isPortInUse`.
8. **Job CI `setup`.** W `.github/workflows/ci.yml`: świeży checkout, `npm run setup` dwa razy; drugi przebieg musi zakończyć się kodem 0 i zawierać wyłącznie statusy `pominięto` (asercja na wyjściu). Sprawdza prawdziwy kontrakt z `npm ci`, Docker Compose i MikroORM, którego nie widzą testy z atrapami.
9. **Dokumentacja.** README („Uruchomienie” z `npm run setup` + „Instalacja ręczna”, tabela „Komendy”), `AGENTS.md`, `BACKWARD_COMPATIBILITY.md` §7; potwierdzenie, że `SDLC.md` i `.ai/agentic.config.json` nie wymagają zmian. Zgłoszenie uzupełniające o rozjeździe trybów `@next/env` (dev vs production) w CLI MikroORM.
10. **Weryfikacja ręczna** (kryteria z #6): świeży klon → `npm run setup` → `npm run dev` pokazuje „Połączono” w `/backend`; drugie uruchomienie — wszystko „pominięto”, kod 0; zatrzymany kontener — wznowiony; edytowany `.env.local` — nietknięty; `DATABASE_URL` obcej bazy w env — blokada. `npm run check` przechodzi.
