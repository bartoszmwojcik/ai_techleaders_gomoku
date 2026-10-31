# Sprzątanie wygasłych sesji, liczników i tokenów (E01-S02-T01, #39)

> Rozszerzone przez 2026-10-30-guest-only-games-cleanup.

> **Zmienione przez `2026-10-26-account-onboarding-simplification.md` (decyzje właściciela 2026-10-26, brief D-24…D-26, BR-26…BR-28).** Punkty poniżej są zastąpione; tekst niżej zostaje jako historia i jest oznaczony w miejscach zmian.
> - Konta niepotwierdzone: kasowane po **14 dniach od założenia, tylko gdy nie mają żadnej partii** (BR-28; zastępuje 7 dni i Q14). Konto z partią zostaje (partie w historii przeciwników). Reguła wymaga tabeli uczestników z #29 (`E02-S01-T01`) i dochodzi dopiero po niej (pozycja w #39).


> Status: **szkic autonomiczny** (`om-auto-write-spec`, 2026-10-24) — założenia odwracalne, do przeglądu przed merge'em. Źródło: issue #39, `.ai/specs/product-brief.md` (BR-18), standardy (`no background worker` dla poprawności), specyfikacje #19 (G5), #20, #34, #35. Hosting: VPS mikr.us (G1).

## 📝 TLDR

Wygasłe sesje, liczniki limitu prób oraz zużyte/wygasłe tokeny potwierdzenia e-maila i resetu hasła zostają w bazie na zawsze — poprawności to nie psuje (wszystko jest filtrowane przy odczycie), ale tabele rosną (BR-18 wymaga usuwania). Po wdrożeniu (zachowanie przyszłe): komenda `npm run db:cleanup` usuwa takie wiersze partiami; na VPS uruchamia ją systemowy `cron` raz na godzinę.

## Resolved assumptions (autonomous defaults)

| # | Pytanie | Zastosowane założenie | Dlaczego | Potwierdzenie |
|---|---|---|---|---|
| Q1 | Mechanizm | Komenda CLI w `packages/db` (`db:cleanup`) uruchamiana przez `cron` systemu na mikr.us; brak workera w procesie aplikacji. | Standardy zabraniają workerów w tle **dla poprawności** — sprzątanie poprawności nie dotyczy; osobny proces nie obciąża pętli zdarzeń gry. | odwracalne |
| Q2 | Progi | Sesje: `expires_at < now() − 1 h` (margines na wyjątek G5 — partia trwa najwyżej ~20 min). Liczniki: `window_start < now() − 48 h` (najdłuższe okno to 24 h — dzienne pule `email-daily:*`; zapas 24 h na rozjazd zegarów bazy i Node; zob. adnotacja 2026-10-28). Tokeny e-mail/resetu: `expires_at < now() − 24 h` lub `used_at < now() − 24 h`. | Żaden próg nie usuwa wiersza, który mógłby być jeszcze ważny. | odwracalne |
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

Brak API HTTP. Kontrakt CLI: `npm run db:cleanup` → kod wyjścia `0` i JSON `{ "sessions": n, "rateLimitBuckets": n, "emailVerificationTokens": n, "passwordResetTokens": n, "unverifiedUsers": null, "errors": [], "truncated": false }`; kod `1` przy błędzie (komunikat bez danych dostępowych). **[uzupełnione 2026-10-28: `errors`, `truncated`, `null` tylko dla reguł opcjonalnych — zob. adnotacje]** Nowy skrypt npm jest addytywny (`BACKWARD_COMPATIBILITY.md` — skrypty).

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

## 📝 Ustalenia z przesłuchania (grill-me, 2026-10-24)

Potwierdzone przez właściciela — Bartosza Wójcika.

- **Test strażnik (Q4):** test jednostkowy po metadanych encji — każda encja z kolumną `expiresAt` musi mieć regułę w `cleanup/rules.ts` albo jawny wyjątek. Plany #34 i #35 dostają krok „dodaj regułę sprzątania”.
- **Konta niepotwierdzone:** reguła dla `users`: `email_verified_at IS NULL` i `created_at < now() − 7 dni`; kaskada usuwa sesje i tokeny. Takie konto nie mogło grać (BR-23), więc nie ma partii. Reguła dochodzi razem z #34 (kolumna `emailVerifiedAt` z #19); JSON CLI dostaje klucz `unverifiedUsers`. **[zastąpione 2026-10-26: 14 dni i tylko bez partii (BR-28); poprzednie zdanie „takie konto nie mogło grać (BR-23)” nieaktualne, BR-26]**
- **Kontrakt CLI:** wynik `db:cleanup` rozszerzony o `unverifiedUsers: n | null`.

## 📝 Adnotacje z wdrożenia (2026-10-28)

- **Implementacja odstępuje od szkicu nazewnictwa:** kod leży w `packages/db/src/cleanup/` (`cleanup-expired.ts`, `rules.ts`, `run-cleanup.ts`), a wejście CLI w `packages/db/src/cli/cleanup-cli.ts`. Zapytania to surowy SQL przez `em.execute` (z `for update skip locked`), nie query builder — tabele sprzątania są opisane statycznymi regułami.
- **Błąd wykryty dopiero na PostgreSQL:** `em.execute` wiąże placeholdery `?`, nie `$n` (`there is no parameter $1`); testy jednostkowe na fałszywym `em` tego nie pokazały. Reguły używają teraz `?` (po jednym związanym punkcie odcięcia na każde `?` warunku), a test integracyjny `tests/integration/cleanup.test.ts` sprawdza progi, partie, równoległość i komendę na prawdziwej bazie.
- **Krok 3 planu** zrealizowany w `tests/integration/cleanup.test.ts` (progi: tuż przed, na i tuż za; partie; dwa równoległe przebiegi; idempotencja; `runCleanup`; `npm run -s db:cleanup` jako proces, kod `0` i `1`).
- **Krok 4 planu:** README, sekcja „Sprzątanie wygasłych rekordów”; wpis `cron` w formie `/etc/cron.d/gomoku-cleanup` z `flock -n` i logiem (nie `docker exec` w gołym `crontab`). Obraz produkcyjny nie wymagał zmian — `tsx` i pakiet `db` są w obrazie (sprawdzone lokalnie: `docker build`, `docker exec … npm run -s db:cleanup` → kod `0` i JSON, kod `1` przy nieosiągalnej bazie).
- **Nadal niedostępne:** `unverifiedUsers` (reguła BR-28) — `null` do czasu tabel partii (#29).
- **Do wykonania ręcznie na serwerze po wdrożeniu:** dodać `/etc/cron.d/gomoku-cleanup` (treść w README).

## 📝 Adnotacje z review Fazy 9 (2026-10-28)

- **Próg liczników (M1):** najdłuższe okno limitu to **24 h** (`email-daily:verification`, `email-daily:reset`; `DAILY_WINDOW_MS`), nie 1 h — zdanie w Q2 było nieprawdziwe. Limiter liczy czas zegarem bazy, sprzątanie zegarem Node, więc próg 24 h (koniec okna bez zapasu) mógłby przy rozjeździe zegarów wyzerować pulę przed końcem okna. Próg liczników to teraz **48 h** (okno + 24 h zapasu); test jednostkowy pilnuje `graceMs ≥ najdłuższe okno + 24 h`, a test w `email-verification-service.test.ts` pilnuje, że okno dzienne nie przekracza stałej `LONGEST_RATE_LIMIT_WINDOW_MS`.
- **Błąd jednej reguły (M2):** błąd w regule jest łapany, pętla przechodzi do następnych, a wynik zawiera `errors: [{ rule, code? }]` (nazwa reguły i kod SQL lub nazwa klasy błędu, bez komunikatu) oraz liczby usuniętych do chwili błędu. `db:cleanup` wypisuje JSON na stdout także wtedy, a przy niepustym `errors` zwraca kod `1` i `{"ok":false,"errors":[…]}` na stderr.
- **Budżet czasu (M3):** zamiast wspólnego terminu 60 s każda reguła ma własny budżet **15 s** (stała na regułę — prostsze niż dzielenie łącznego budżetu); wynik ma `truncated: boolean` (`true`, gdy jakaś reguła przerwała z powodu budżetu, zanim skończyły się wiersze). Opcja `deadline` zastąpiona przez `ruleTimeLimitMs`.
- **Brak tabeli (L4):** `42P01` daje `null` tylko dla reguł z `optional: true` (dziś żadna); dla pozostałych jest błędem w `errors` (kod `1`). `unverifiedUsers` jest `null` zawsze (reguła BR-28 niezaimplementowana).
- **Indeksy (L5):** na tym etapie **bez indeksów** na `sessions.expires_at` i `rate_limit_buckets.window_start` (sekcja Data Model zostaje opcją): skan sekwencyjny partiami jest akceptowalny przy małej bazie (VPS mikr.us). Do ponownej oceny z `EXPLAIN` przy wzroście tabel.
- **Cron (L6):** wpis w README loguje datę i kod wyjścia, opisuje rotację (`logrotate`) i podkreśla, że `flock -n` jest optymalizacją (dwa przebiegi naraz są bezpieczne dzięki `skip locked`).
