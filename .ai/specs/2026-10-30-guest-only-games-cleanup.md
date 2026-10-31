# Sprzątanie partii złożonych wyłącznie z gości (follow-up przeglądu #101, #102, część #39)

> Status: **zatwierdzona przez właściciela 2026-10-31 („spec ok”)** — Wariant A (usuwanie bez rozstrzygania zegara), rozszerzenie na zakończone partie samych gości, margines 1 h (`om-auto-write-spec`, 2026-10-30). Rozszerza `2026-10-24-expired-records-cleanup.md` (#39; reguły `games` dodane w E02-S08). Źródło: issue #102, przegląd PR #101 (finding Medium), `2026-10-30-guest-creates-game.md` (Risks), `product-brief.md` (BR-24, BR-29, D-27), kod na `main` (`2dcac0a`). Rozstrzygnięcia Q1, Q2 i Q4 zostały **potwierdzone przez właściciela 2026-10-31**; pozostałe wynikają z kodu i są odwracalne.

## 📝 TLDR

Od E02-S08 dwie osoby bez kont mogą utworzyć i rozegrać partię (BR-29). Taka partia nie trafia do żadnej historii (BR-24), a mimo to **żadna reguła sprzątania jej nie usuwa**: reguły `games` w `packages/db/src/cleanup/rules.ts` dotykają tylko `waiting` (wygasłe zaproszenie) i `cancelled`; `active` i `finished` nie są usuwane wcale (test integracyjny „never deletes games in progress or finished ones” utrwala to dla historii kont), a rozliczenie zegara dzieje się wyłącznie leniwie przy odczycie. Napastnik z jednego adresu tworzy więc ok. 240 partii na dobę (limit 10/h), przyjmuje je drugą przeglądarką jako drugi gość, otwiera obie strony i zostawia — wiersze `games`, `game_players` i `invitations` zostają na zawsze.

Po wdrożeniu (zachowanie przyszłe) `npm run db:cleanup` usuwa:
1. partie `active` złożone wyłącznie z gości, które są martwe od godziny (zegar gracza na ruchu wygasł albo nikt nie rozpoczął zegara w 15 min), oraz
2. partie `finished` złożone wyłącznie z gości, zakończone ponad godzinę temu.

Partii z choć jednym kontem (także później usuniętym) reguły nie dotykają. Bez UI, bez zmiany schematu.

## Resolved assumptions (autonomous defaults)

Wejście decyzyjne: rekomendacja asystenta właściciela (Wariant A). Wiersze Q1, Q2 i Q4 (dawniej ⚠) potwierdził właściciel 2026-10-31 („spec ok”); żaden wiersz nie blokuje już scalenia.

| # | Pytanie | Zastosowane założenie | Dlaczego | Potwierdzenie |
|---|---|---|---|---|
| Q1 | Co robić z martwą partią `active` samych gości | **Wariant A:** usunąć wiersz `games` (kaskada `game_players`, `invitations`), gdy zegar gracza na ruchu wygasł (albo zegar nie ruszył w `READY_DEADLINE_MS`) i od tego momentu minęła **1 h** (`GUEST_TOKEN_GRACE_MS`). Bez rozstrzygania wyniku. | Partia gości nie ma historii (BR-24, BR-29); 1 h to okno ważności tokenu gościa, więc gracz, który wraca, nadal może otworzyć partię i leniwie zobaczyć „przegrana na czas” (token `active` jest ważny zawsze, `GUEST_TOKEN_VALID_SQL`). Jedna reguła, bez zmiany semantyki wyniku. | potwierdzone przez właściciela 2026-10-31 (wybór wariantu A zamiast B, niżej) |
| Q2 | Zakończone partie samych gości (AC 2 z #102) | Druga reguła: `finished` bez uczestnika `account`, `finished_at < now − 1 h` → usunięcie wiersza. Dziś **nic ich nie usuwa**: reguła `guestTokens` tylko zeruje `guest_token_hash` (wiersze zostają); test „never deletes … finished ones” dotyczy partii kont i musi zostać zachowany dla nich. | Bez tego partie przyspieszone przez Q1 (rozliczone leniwie przez odczyt) i każda normalnie skończona partia gości rosłyby bez końca; AC 2 wprost tego wymaga. | potwierdzone przez właściciela 2026-10-31 (rozszerza zakres poza wejście „tylko `active`”) |
| Q3 | Partia `active`, w której zegar nigdy nie ruszył (`turn_started_at IS NULL`: ktoś nie otworzył strony) | Ta sama reguła z Q1, termin = `started_at + READY_DEADLINE_MS` (15 min), potem 1 h. **Nie** zakładamy, że `CANCEL_NOT_STARTED` to załatwia: to leniwe SQL-e (`lazy-closing.ts`) uruchamiane tylko przy dotknięciu partii przez uczestnika, a sprzątanie ich nie woła. | Atakujący może przyjąć zaproszenie i nigdy nie otworzyć strony; wtedy nic nie dotyka wiersza. Nakładanie się: brak, bo reguła i leniwe anulowanie działają na tym samym terminie (15 min), a reguła czeka jeszcze 1 h. | odwracalne |
| Q4 | Rozstrzygać zegar w sprzątaniu (zapisać `finished/timeout`) przed usunięciem? | Nie. Reguła tylko usuwa; sprzątanie nie zmienia statusu ani sloty. | Prostsze; uczestnik mającego token i tak rozlicza partię leniwie w ciągu godziny. | potwierdzone przez właściciela 2026-10-31 (Alternatywa B) |
| Q5 | Sloty BR-13 i tokeny po usunięciu | Nic do zwolnienia ręcznie: unikalny indeks `game_players_user_id_active_unique` (`where is_active`) dotyczy kont, a reguła ich nie dotyka; gość nie ma `user_id`. Wiersze `game_players` znikają kaskadą razem z `guest_token_hash` (unikalny indeks tokenu też). Ciasteczko przeglądarki wskazuje wtedy nieistniejący token = zachowanie jak bez ciasteczka. | Sprawdzone w encjach `game.ts`, `game-player.ts`. | odwracalne |
| Q6 | Co widzi gracz po usunięciu | `404` jak dla obcego (`GAME_NOT_FOUND_MESSAGE`); strona partii pokazuje stan „brak dostępu/nie znaleziono”. Zakładamy, że 1 h wystarcza, by gracz zobaczył wynik; po tym czasie token i tak jest nieważny dla `finished`. | `getState` rzuca `NotFoundError` dla braku uczestnika (`game-service.ts`). | odwracalne |
| Q7 | Limit na `accept` per adres lub globalny sufit gości | **Poza zakresem** (rozważone i odrzucone w Alternatives). | Sprzątanie usuwa przyczynę (nieograniczony wzrost); limit `accept` nie usuwa istniejących wierszy i dotyka uczciwych graczy za wspólnym adresem (CGNAT, biuro). | odwracalne |
| Q8 | Migracja/indeks | **Bez migracji.** Istniejący `games_status_created_at_index (status, created_at)` zawęża skan do `status = 'active'`/`'finished'`; wiersze `active` to partie w toku (bardzo mało, ~minuty życia), `finished` — skan sekwencyjny przy `status='finished'` zależy od liczby partii kont w historii. Plan zapytań sprawdzany w kroku 5 na jednorazowej bazie testowej; indeks częściowy (osobna migracja) tylko gdy `EXPLAIN` pokaże problem. | Konwencja z #39 („bez indeksów, do ponownej oceny z `EXPLAIN`”). Plan zapytania **nie był** sprawdzany przy pisaniu tej specyfikacji. | odwracalne |
| Q9 | Budżet czasu | Każda z 2 nowych reguł ma standardowy budżet 15 s i partie po 1000; łączny najgorszy przypadek rośnie ze 105 s (7 reguł) do **135 s** (9 reguł) — poprawić komentarz przy `DEFAULT_RULE_TIME_LIMIT_MS` w `cleanup-expired.ts` i README. | `cron` co godzinę z `flock -n`; przebieg przerwany budżetem kończy następny (`truncated`). | odwracalne |
| Q10 | Kontrakt wyniku CLI | Dwa nowe klucze w JSON `db:cleanup`: `guestOnlyActiveGames`, `guestOnlyFinishedGames` (liczby). Zmiana addytywna; konsumenci (cron) czytają kod wyjścia i log. | `BACKWARD_COMPATIBILITY.md`: skrypty npm nie zmieniają nazwy ani znaczenia. | odwracalne |

## 📝 Problem Statement

- **Kto:** właściciel jako operator (BR-18: baza nie rośnie bez ograniczenia) na VPS mikr.us z małym dyskiem.
- **Luka:** wcześniej partie mogły tworzyć tylko konta (limit na użytkownika, partie w historii). Po E02-S08 tworzyć może anonim; `accept` ma tylko `lookupGuard`, więc jedna osoba obsługuje obie strony. Przegląd #101 zakwalifikował to jako Medium.
- **Dlaczego sprzątanie jest właściwym lekarstwem:** partia samych gości nie ma wartości po końcu (BR-24: historia tylko dla kont) i nie niesie roszczeń (token gościa wygasa, BR-29).

## 📝 Proposed Solution

Dwie nowe reguły w `packages/db/src/cleanup/rules.ts` (rejestr z #39), obie na tabeli `games`, usuwające wiersz (kaskada `game_players`, `invitations`; `rematch_game_id` ma `on delete set null`). Wspólny fragment SQL „tylko goście”:

```
not exists (select 1 from game_players p where p.game_id = games.id and p.kind <> 'guest')
```

Kryterium to `kind`, nie `user_id IS NULL`: konto usunięte (#37) ma `user_id = NULL`, ale `kind = 'account'`, więc jego partia (historia przeciwnika) jest chroniona.

**`guestOnlyActiveGames`** (`graceMs = GUEST_TOKEN_GRACE_MS`, jeden punkt odcięcia `?`):

```
status = 'active' and <tylko goście> and
coalesce(
  turn_started_at + (case when (case when move_count % 2 = 0 then black_seat else 3 - black_seat end) = 1
                          then clock_ms_1 else clock_ms_2 end) * interval '1 millisecond',
  started_at + <READY_DEADLINE_MS> * interval '1 millisecond'
) < ?
```

To ten sam termin co `deadlineMs`/`seatOnTurn` z `@gomoku/core` (czarny gra przy parzystym `move_count`; `black_seat` jest wymagany dla `active` przez CHECK) i co `cancelNotStartedSql` (`started_at <= now − READY_DEADLINE_MS`). `READY_DEADLINE_MS` wstawiane jako liczba z `@gomoku/core` (`db → core` jest dozwolone; statyczny tekst, bez wartości od wywołującego). Test w `core`/`db` pilnuje zgodności SQL z `deadlineMs` na tabeli przypadków (wartości graniczne).

**`guestOnlyFinishedGames`** (`graceMs = GUEST_TOKEN_GRACE_MS`): `status = 'finished' and <tylko goście> and finished_at < ?`. Reguła `guestTokens` zostaje bez zmian (zeruje hash dla partii kont i gości). Kolejność w rejestrze **nie wpływa na poprawność**, bo obie reguły używają tego samego progu `finished_at + 1 h` i obie działają w tym samym przebiegu na tych samych wierszach. Reguła `guestOnlyFinishedGames` stoi w rejestrze **przed** `guestTokens` wyłącznie po to, żeby nie wykonywać zbędnego `UPDATE` na wierszach, które w tym samym przebiegu znikną; test strażnik rejestru pilnuje tej kolejności (`guestOnlyActiveGames`, `guestOnlyFinishedGames`, potem `guestTokens`).

Komentarz nad `CLEANUP_RULES`/`CLEANUP_EXEMPT_TABLES` i test strażnik reguł dostają nowe klucze. Typ `CleanupRule['key']` i `CleanupResult` rozszerzone o dwa klucze (domyślnie `0`).

### Zbadane w kodzie (`main` @ `2dcac0a`)

1. **`CANCEL_NOT_STARTED` a nowa reguła.** `CANCEL_NOT_STARTED_OF_*` (`lazy-closing.ts`) to leniwe `update … set status='cancelled'`, wołane z `GameService`, `InvitationService`, `GameParticipation`; sprzątanie ich nie uruchamia. Nie nakładają się: leniwe anulowanie zmienia status na `cancelled` po 15 min; istniejąca reguła `cancelledGames` usuwa takie wiersze po 25 h od utworzenia; nowa reguła usuwa niedotknięty wiersz `active` po 15 min + 1 h. Obie ścieżki są idempotentne i wzajemnie bezpieczne (anulowana partia przestaje być `active`).
2. **Zakończone partie samych gości.** `rules.ts` ich **nie** usuwa (tylko `guestTokens` zeruje hash). Stąd Q2.
3. **Sloty i tokeny.** Patrz Q5.
4. **Wyścig z rozliczeniem leniwym i odczytem** — niżej.
5. **Budżet** — Q9.
6. **Rematch.** Propozycja rewanżu wygasa po 5 min (`2026-10-29-game-rematch.md`), czyli przed usunięciem po 1 h; przyjęty rewanż tworzy osobny wiersz `active` (ta sama reguła `guestOnlyActiveGames` go obejmuje), a `rematch_game_id` poprzedniej partii przejdzie na `NULL`. Usunięcie wiersza partii kontowej rewanżu nie dotyczy.

## 📝 Race: sprzątanie kontra odczyt i rozliczenie

Kolejność blokad w aplikacji: `users → games → game_players` (`timeout-settler.ts`). Sprzątanie bierze `games` (`select … for update skip locked` w podzapytaniu `delete … where id in (…)`), potem kaskada blokuje `game_players` i `invitations` — ta sama kolejność, bez odwrócenia.

| Sytuacja | Zachowanie |
|---|---|
| Gracz (token) odczytuje/rozlicza partię, gdy sprzątanie jest w trakcie `delete` | `settleExpired` robi migawkę bez blokady, potem `LOCK_GAME_SQL (for update)` czeka na commit sprzątania; po commicie zapytanie zwraca 0 wierszy, `settleGame` nie znajduje partii i zwraca `false` (bez zapisu). Następne zapytania odczytu nie znajdują uczestnika → `404`. **Wymaganie:** żaden `500`/niezłapany wyjątek; test wyścigu to potwierdza. |
| Rozliczenie leniwe trzyma blokadę `games`, sprzątanie przychodzi w tym czasie | `skip locked` pomija wiersz; usunie go następny przebieg (po rozliczeniu wiersz jest `finished` i spełni warunek reguły `guestOnlyFinishedGames` po 1 h od `finished_at`, a `finished_at` rozliczenia = termin zegara, więc zwykle od razu). |
| Dwa przebiegi sprzątania naraz | Bezpieczne (`skip locked`, `delete` po kluczu); test z `tests/integration/cleanup.test.ts` (równoległe przebiegi) rozszerzony o nowe reguły. |
| Gracz wykonuje ruch w partii w chwili usunięcia | Ruch bierze blokadę `games` (`game-move-service`); po usunięciu 0 wierszy; **wymaganie:** odpowiedź jak dla nieistniejącej partii (`404`), nie `500` (zachowanie `game-move-service` nie było sprawdzane przy pisaniu specyfikacji — pokrywa je test z kroku 4). |
| Partia zmienia stan między podzapytaniem a `delete` | Warunek jest oceniany pod blokadą wiersza (`for update` ponownie sprawdza warunek po oczekiwaniu); ruch/rozliczenie, które się powiodło, przesuwa termin zegara (`turn_started_at`), więc wiersz przestaje pasować. Test: ruch tuż przed punktem odcięcia. |

Jest to wyścig o rząd 1 h po terminie: uczciwy gracz zwykle nie wraca po tak długim czasie; nie wymaga zmian w serwisach, tylko testów.

## 📝 Alternatives considered

- **Alternatywa B — rozstrzygnąć zegar w sprzątaniu i dopiero usunąć jako `finished`.** Odrzucona w rekomendacji: wymaga większej liczby reguł i testów (zapis `finished/timeout` z poprawnym zwycięzcą, zwolnienie slotów, następnie reguła usuwania), a **zmienia wynik partii bez udziału graczy** (sprzątanie zapisywałoby „przegrana na czas” w imieniu uczestnika, który mógł wrócić w oknie godziny). Zaletą byłby spójny stan, gdyby ktoś odczytał partię w oknie. potwierdzone przez właściciela 2026-10-31 — to wybór właściciela.
- **Limit na `accept` per adres** (`lookupGuard` już istnieje, ale nie limituje przyjęcia). Poza zakresem: nie usuwa istniejących wierszy, wspólne adresy (CGNAT, biuro) blokowałyby uczciwych graczy, a napastnik z pulą adresów (IPv6 /64) omija limit. Zostaje rezerwą, gdyby sprzątanie okazało się niewystarczające.
- **Globalny sufit liczby `waiting`/`active` gości.** Odrzucony: atakujący mógłby zająć sufit i zablokować uczciwych gości (DoS), przy dodatkowym stanie do utrzymania.
- **Usuwanie przy odczycie lub w tle w aplikacji.** Odrzucone w #39 (`no background worker`, losowy koszt żądania).

## 📝 Data Model

Bez zmian schematu i bez migracji (Q8). Opcjonalny indeks częściowy `games (started_at) where status = 'active'` — tylko po wyniku `EXPLAIN` w kroku 5, jako osobna migracja generowana (`db:migration:create`), sprawdzana w górę i w dół na PostgreSQL.

## 📝 API Contracts

Brak zmian HTTP. CLI `npm run db:cleanup`: dwa nowe klucze w JSON (`guestOnlyActiveGames`, `guestOnlyFinishedGames`), addytywnie; kody wyjścia i `errors`/`truncated` bez zmian. Błąd jednej reguły nie przerywa pozostałych (istniejące zachowanie). `db:cleanup` **nigdy** na bazie dev bez sprawdzenia `DATABASE_URL` (testy tylko na bazie z Testcontainers).

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Zachowanie |
|---|---|
| Partia `active`, jedno z miejsc to konto | Nietknięta (`kind <> 'guest'`). |
| Partia z kontem usuniętym (#37, `user_id NULL`, `kind = 'account'`) | Nietknięta. |
| Zegar wygasł 59 min temu | Zostaje; gracz z tokenem rozlicza ją leniwie i widzi wynik. |
| Zegar wygasł dokładnie 1 h temu | Zostaje (warunek `<`, wiersz na progu zostaje). |
| Zegar nie ruszył, `started_at` 74 min temu | Zostaje; 76 min → usunięta. |
| Partia gości w toku (zegar ma jeszcze czas, wielu ruchów) | Nietknięta. |
| `finished` gości, `finished_at` < 1 h | Zostaje; po 1 h usunięta. |
| `finished` z kontem | Nietknięta (historia, E04). |
| `rematch_game_id` wskazuje usuniętą partię | `NULL` (`on delete set null`). |
| Ciasteczko gościa wskazuje usuniętą partię | Jak brak ciasteczka: brak konfliktu BR-13, `404` dla starej partii. |
| Duży zaległy zbiór (po wdrożeniu) | Partie po 1000 wierszy, budżet 15 s na regułę, reszta w następnym przebiegu (`truncated: true`). |

## 📝 Risks & Impact Review

`risk-medium`: reguły **kasują** dane produkcyjne, więc błędny warunek `kind`/zegara mógłby usunąć partię z kontem. Łagodzenie: testy progów na PostgreSQL w obie strony (konto, konto usunięte, jeden gość + jedno konto), test zgodności SQL zegara z `deadlineMs`, rollback = revert wpisów reguł (usunięte wiersze nieodwracalne, ale to dane bez wartości po 1 h). Residual: partie `active` z kontem nadal nie są sprzątane (poza zakresem; konta mają limit na użytkownika); wyścig opisany wyżej.

## 📝 Decisions in play

BR-24 (historia tylko kont), BR-29 / D-27 (gość tworzy i przyjmuje), BR-13 (sloty), BR-18 (sprzątanie), L29 (okno 1 h tokenu), #39. Właściciel: Bartosz Wójcik. **Do potwierdzenia:** wariant A vs B (Q1, Q4) oraz rozszerzenie na `finished` (Q2).

## 📋 Phasing

Jedna faza, jeden PR (kod + testy + README), po zatwierdzeniu tej specyfikacji; `Refs #102`, część #39.

## 📋 Implementation Plan

1. **Reguły.** W `packages/db/src/cleanup/rules.ts` dodać `guestOnlyActiveGames` i `guestOnlyFinishedGames` (przed `guestTokens`), wspólny fragment „tylko goście”, `READY_DEADLINE_MS`/`GUEST_TOKEN_GRACE_MS` z `@gomoku/core`; rozszerzyć typ klucza i `CleanupResult` (domyślnie `0`) w `cleanup-expired.ts`; poprawić komentarz o budżecie (9 × 15 s = 135 s). Test: jednostkowy (fałszywy `em`) liczby i kolejności reguł, test strażnik rejestru.
2. **Progi na PostgreSQL** (`tests/integration/cleanup.test.ts`, Testcontainers, nigdy baza dev): dla każdej reguły wiersz tuż przed / na / tuż za progiem; partia z kontem, z kontem usuniętym (`user_id NULL`, `kind = 'account'`), jeden gość + konto; zegar graczy 1 i 2 na ruchu (parzysty/nieparzysty `move_count`, `black_seat` 1 i 2); zegar nieuruchomiony (`turn_started_at NULL`); kaskada `game_players`/`invitations`; `rematch_game_id` → `NULL`; sloty `is_active` kont nietknięte.
3. **Zgodność zegara SQL z `deadlineMs`:** test tabelaryczny (wartości graniczne, `clock_ms` 0 i `INITIAL_CLOCK_MS`) porównujący decyzję reguły z `seatOutOfTime` z `@gomoku/core`.
4. **Test wyścigu** (PostgreSQL, dwa połączenia): (a) otwarta transakcja z `delete`, równoległy `settleExpired`/`getState` → po commicie `404`, brak `500`; (b) blokada `games` przez rozliczenie, sprzątanie pomija wiersz (`skip locked`) i usuwa go w następnym przebiegu; (c) ruch tuż przed punktem odcięcia chroni partię; (d) dwa równoległe przebiegi usuwają każdy wiersz raz.
5. **Plan zapytań:** `EXPLAIN` obu warunków na jednorazowej bazie testowej z dużą liczbą wierszy `finished`/`active`; wynik w PR. Indeks (migracja) tylko gdy konieczny.
6. **README** (sekcja „Sprzątanie wygasłych rekordów”): dwa wiersze tabeli, przykład JSON z nowymi kluczami, budżet 135 s, ostrzeżenie o `DATABASE_URL`; opis w `cron` bez zmian. Adnotacja w `2026-10-24-expired-records-cleanup.md`.
7. **Weryfikacja:** `npm run check` (100% pokrycia per plik, bez `v8 ignore`), migracje (jeśli powstały) w górę i w dół, adnotacja „Odstępstwa wdrożenia”; lekcja w `.ai/lessons/`, jeśli napotkany błąd (np. wiązanie `?` i daty jako tekst — liczyć w SQL).
