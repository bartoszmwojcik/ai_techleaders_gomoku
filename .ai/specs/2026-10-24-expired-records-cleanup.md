# Sprzątanie wygasłych sesji, liczników i tokenów (E01-S02-T01, #39)

> Status: **szkic autonomiczny** (`om-auto-write-spec`, 2026-10-24) — założenia odwracalne, do przeglądu przed merge'em. Źródło: issue #39, `.ai/specs/product-brief.md` (BR-18), standardy (`no background worker` dla poprawności), specyfikacje #19 (G5), #20, #34, #35. Hosting: VPS mikr.us (G1).

## 📝 TLDR

Wygasłe sesje, liczniki limitu prób oraz zużyte/wygasłe tokeny potwierdzenia e-maila i resetu hasła zostają w bazie na zawsze — poprawności to nie psuje (wszystko jest filtrowane przy odczycie), ale tabele rosną (BR-18 wymaga usuwania). Po wdrożeniu (zachowanie przyszłe): komenda `npm run db:cleanup` usuwa takie wiersze partiami; na VPS uruchamia ją systemowy `cron` raz na godzinę.

## Resolved assumptions (autonomous defaults)

| # | Pytanie | Zastosowane założenie | Dlaczego | Potwierdzenie |
|---|---|---|---|---|
| Q1 | Mechanizm | Komenda CLI w `packages/db` (`db:cleanup`) uruchamiana przez `cron` systemu na mikr.us; brak workera w procesie aplikacji. | Standardy zabraniają workerów w tle **dla poprawności** — sprzątanie poprawności nie dotyczy; osobny proces nie obciąża pętli zdarzeń gry. | odwracalne |
| Q2 | Progi | Sesje: `expires_at < now() − 1 h` (margines na wyjątek G5 — partia trwa najwyżej ~20 min). Liczniki: `window_start < now() − 24 h` (najdłuższe okno to 1 h). Tokeny e-mail/resetu: `expires_at < now() − 24 h` lub `used_at < now() − 24 h`. | Żaden próg nie usuwa wiersza, który mógłby być jeszcze ważny. | odwracalne |
| Q3 | Rozmiar partii | Usuwanie partiami po 1000 wierszy w pętli do wyczerpania, z limitem czasu 60 s na przebieg. | Krótkie transakcje, brak długich blokad na małym VPS. | odwracalne |
| Q4 | Tabele z kolejnych specyfikacji (#34, #35, token gościa z #21) | Rejestr reguł sprzątania w `packages/db/src/cleanup/rules.ts` — każda specyfikacja dodaje swoją regułę razem ze swoją encją; ten PR zawiera reguły dla `sessions` i `rate_limit_buckets`. Wymaganie wobec #34, #35 i #21 (token gościa — wygasa z końcem partii + 1 h, BR-22). | Query builder MikroORM potrzebuje metadanych encji, których przed tymi PR-ami nie ma. | odwracalne |
| Q5 | Jak uruchamiać na mikr.us, skoro aplikacja działa w kontenerze? | `cron` systemu: `docker exec <kontener-aplikacji> npm run db:cleanup`; niezerowy kod wyjścia → wpis w logu systemowym i (opcjonalnie) `MAILTO` crona. | Kod, `node_modules` i `.env` są w kontenerze, nie na hoście. | odwracalne |

## 📝 Problem Statement

- **Kto:** właściciel jako operator (BR-18: „wygasłe sesje i liczniki limitu prób są usuwane bez udziału człowieka”). Kryterium z #39: wygasłe rekordy usuwane bez udziału człowieka; poprawność nie zależy od sprzątania.
- Klucze limitu są hashami, a tokeny przechowywane jako hashe — sprzątanie nie jest wymogiem prywatności, tylko utrzymania rozmiaru bazy na planie z małym dyskiem (mikr.us).

## 📝 Proposed Solution

`packages/db/src/cli/cleanup.ts` (czysta funkcja `cleanupExpired({ em, now, batchSize, deadline })` zwracająca liczby usuniętych wierszy) + `cleanup-cli.ts` (wywołanie z ORM jak `status-cli.ts`, wynik jako JSON) + skrypt `db:cleanup` w roocie. Zapytania przez query builder MikroORM z parametrami; partie usuwane po kluczu głównym encji (`id` dla `sessions` i tokenów, `key` dla `rate_limit_buckets`); `now` przekazywane jako parametr (nie SQL `now()`), żeby testy granic były deterministyczne. Margines sesji wynika ze wspólnej stałej maksymalnego czasu partii (`MAX_GAME_DURATION_MS`, 2 × `CLOCK_BUDGET_MS`) + zapas. **Odrzucone:** sprzątanie przy okazji żądań użytkowników (losowy koszt w żądaniu gry), `setInterval` w aplikacji (standardy), rozszerzenie `pg_cron` (niedostępne na kontenerze mikr.us — brak danych, a instalacja rozszerzeń wymaga uprawnień).

## 📝 Data Model

Brak zmian schematu. Opcjonalnie indeksy pod zapytania sprzątające (`sessions.expires_at`, `rate_limit_buckets.window_start`) — dodawane w tym PR migracją, jeśli plan zapytań pokaże pełny skan na danych testowych (decyzja przy implementacji, z wynikiem `EXPLAIN` w PR).

## 📝 API Contracts

Brak API HTTP. Kontrakt CLI: `npm run db:cleanup` → kod wyjścia `0` i JSON `{ "sessions": n, "rateLimitBuckets": n, "emailVerificationTokens": n | null, "passwordResetTokens": n | null }` (`null` = tabela nieobecna); kod `1` przy błędzie bazy (komunikat bez danych dostępowych). Nowy skrypt npm jest addytywny (`BACKWARD_COMPATIBILITY.md` — skrypty).

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Skutek |
|---|---|
| Baza niedostępna | Kod `1`, `cron` spróbuje za godzinę; aplikacja działa normalnie. |
| Bardzo dużo rekordów | Przebieg kończy się po 60 s; reszta w następnym. |
| Sesja w wyjątku G5 | Nieusunięta (próg 1 h po `expires_at`). |
| Dwa przebiegi naraz | Bezpieczne — `delete` po identyfikatorach jest idempotentne. |

## 📝 Risks & Impact Review

`risk-medium` (zmiana w jednym obszarze bez zmiany zachowania widocznego dla użytkownika). Błędny próg mógłby wylogować graczy — testy granic każdego progu. Rollback: usunięcie wpisu `cron` / revert.

## 📝 Decisions in play

BR-18, specyfikacje #19 (G1 hosting, G5 wyjątek partii), #20 (klucze limitu), #34, #35 (tabele tokenów). Właściciel: Bartosz Wójcik.

## 📋 Phasing

Jedna faza, jeden PR (`Closes #39`), po #19 (tabele `sessions`, `rate_limit_buckets`).

## 📋 Implementation Plan

1. `cleanupExpired` z testami jednostkowymi na fałszywym `em` (progi, partie, limit czasu, brak tabel).
2. `cleanup-cli.ts` + skrypt `db:cleanup`; test jak `status-cli` (kody wyjścia, JSON).
3. Test w `tests/integration/` (ta sama baza z `global-setup.ts`): wiersze tuż przed i tuż za każdym progiem, uruchomienie `cleanupExpired` bezpośrednio na bazie kontenera testowego.
4. README: wpis `cron` dla mikr.us (`0 * * * * docker exec <kontener> npm run db:cleanup`), opis wyniku i sygnału błędu.
