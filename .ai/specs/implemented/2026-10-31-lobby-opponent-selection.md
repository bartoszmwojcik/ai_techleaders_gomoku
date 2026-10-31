# Wybór przeciwnika z lobby i partia z lobby (E03-S02, #26)

> Status: **wdrożona** (2026-10-31; specyfikacja zatwierdzona przez właściciela w #118, szkic autonomiczny `om-auto-write-spec`). Odstępstwa i dowody: sekcja „Odstępstwa wdrożenia i dowody” na końcu. Źródło: zgłoszenie #26 (E03-S02), epik #17, `.ai/specs/product-brief.md` (BR-09, BR-12, BR-13, BR-26, BR-29, D-07, D-21, D-23), specyfikacje wdrożone: `implemented/2026-10-24-game-invitations.md` (#21: slot BR-13, `is_active`, leniwe zamykanie, kolejność blokad), `implemented/2026-10-29-game-rematch.md` (wzór tworzenia partii poza zaproszeniem w jednej transakcji), `implemented/2026-10-24-account-deletion.md` (kolejność blokad), `implemented/2026-10-26-game-clock.md`.
>
> Zależność od #25 (wdrożona w #117/#119): tabela `lobby_seekers`, `LobbyService`, `GET /api/lobby`, `PUT`/`DELETE /api/lobby/seeking`.

## 📝 TLDR

Po wdrożeniu #25 zalogowany użytkownik widzi w `/lobby` listę szukających, ale tylko do odczytu. Po wdrożeniu #26 (zachowanie przyszłe) każdy wiersz ma przycisk „Zagraj”; potwierdzenie wyboru woła `POST /api/lobby/seekers/{id}/pick`, które w **jednej transakcji** usuwa status wybranego i wybierającego i tworzy partię `origin = 'lobby'` (status `active`, dwóch graczy-kont, kolory losowane). Wybierający przechodzi na `/games/{id}`, wybrany dostaje przekierowanie z odpytywania `GET /api/lobby` (`currentGame`). Gdy kilku wybiera tego samego szukającego jednocześnie, powstaje dokładnie jedna partia, a pozostali dostają `409` z komunikatem „zagrał już z kimś innym”; wygasły status nie daje partii. Bez nowej tabeli i migracji (`origin = 'lobby'` istnieje w CHECK `games_origin_check`).

## Resolved assumptions (autonomous defaults)

| # | Pytanie | Zastosowane założenie | Dlaczego | Potwierdzenie |
|---|---|---|---|---|
| Q1 | Baza specyfikacji: #117 jest niescalony | Piszemy względem treści PR #117 (kontrakty z jego sekcji „Interfejs dla #26”); implementacja #26 po wdrożeniu #25; przy zmianie kontraktu w #117 ta specyfikacja jest poprawiana. | Spójność z już napisanym projektem zamiast dubli; brak kodu do oparcia się na nim. | ⚠ NEEDS HUMAN CONFIRMATION (czy #117 zostaje w obecnym kształcie; PR pozostaje draftem do czasu jego akceptacji) |
| Q2 | Czy wybierający musi sam być szukającym? | Nie. Wybierać może każdy zalogowany użytkownik bez aktywnej partii; jeśli ma własny status, jest usuwany w tej samej transakcji. | Kryterium: „obaj znikają z lobby”, a nie „obaj muszą być w lobby”; mniej kroków dla gracza, brak nowego warunku w BR-12. | odwracalne |
| Q3 | Czy wybrany szukający musi potwierdzić? | Nie — partia powstaje od razu (ręczny wybór jednej strony, BR-09); wybrany dowiaduje się z odpytywania (`currentGame`) i jest przekierowany. | Status „szukam gry” jest zgodą na partię z kimkolwiek; potwierdzenie dodałoby stan i nowy wyścig. Wygaśnięcie 5 min dalej chroni przed „zapomnianym” statusem. | odwracalne |
| Q4 | Kolory i miejsca | Kolor losuje `ColorDraw` (jak w zaproszeniu); miejsca i `black_seat` ustawiane tak samo jak przy dołączeniu do zaproszenia; `seen_at` zostaje `NULL` (zegar rusza, gdy obaj otworzą partię — #21 Q20). | Spójność z istniejącym zegarem i rewanżem; D-21 (`origin = 'lobby'`). | odwracalne |
| Q5 | Kod błędu dla przegranego wyścigu i wygasłego statusu | Dwa kody `409`: `LOBBY_SEEKER_TAKEN` („Ten gracz zagrał już z kimś innym. Wybierz kogoś innego z listy.”) i `LOBBY_SEEKER_EXPIRED` („Status tego gracza wygasł.”). Nieistniejący `id` (nigdy nie było) — `404 NOT_FOUND`. | Dwa komunikaty z prototypu (`LobbyGraczZajetyPrzedWyborem`) i kryteriów #26; rozróżnienie wygasły/zajęty wymaga jednego dodatkowego `select` w tej samej transakcji. | odwracalne |
| Q6 | Wybór samego siebie i wybór konta z aktywną partią | `409 CANNOT_PICK_SELF` (nie powinno się zdarzyć: lista nie pokazuje własnego wiersza); wybrany z aktywnym slotem (defensywnie, wyścig z Q5 z #117) traktowany jak `LOBBY_SEEKER_TAKEN`. Wybierający z aktywnym slotem — `409 ACTIVE_GAME_EXISTS` (BR-13, `data.gameId`). | Zamknięte wyliczenie przypadków; zgodne z #21. | odwracalne |
| Q7 | Limit | 60 wyborów na użytkownika na godzinę (`RateLimiter.hit`, klucz `lobby-pick:{userId}`), liczone również przy błędach `409`. | Chroni przed skanowaniem listy przez automat; człowiek tego nie osiągnie. | odwracalne |
| Q8 | Co po stronie wybranego | Bez nowego kanału: `GET /api/lobby` (odpytywanie 3 s z #117) zwraca `currentGame`, klient przekierowuje na `/games/{id}`. Brak powiadomień poza stroną. | Kontrakt zaplanowany w #117; nie wprowadzamy transportu przed spike #30 (Q-01). | odwracalne |
| Q9 | Gość | Bez lobby (`401`), zgodnie z BR-29 i #117 Q4. Brak bramki `emailVerifiedAt` (BR-26). | Decyzje właściciela. | odwracalne |
| Q10 | Migracja | Brak. Tabela `lobby_seekers` pochodzi z #31; `origin = 'lobby'` jest już w CHECK. Żadnej nowej reguły sprzątania. | Najmniejszy zakres; krok 0 implementacji sprawdza to na bazie. | odwracalne |

## 📝 Problem Statement

- **Kto:** zalogowany użytkownik, który chce zagrać z kimkolwiek dostępnym i widzi listę szukających (grupa docelowa bez dowodu popytu — A-01/A-02 w briefie).
- **Dziś:** lista z #25 jest tylko do odczytu; jedyna droga do partii to zaproszenie.
- **Kryteria #26:** (1) lista aktualnych szukających bez siebie i bez wygasłych (zapewnia #25 — tu dochodzi odświeżenie po wyborze); (2) potwierdzony wybór tworzy partię `lobby`, a obaj znikają z lobby; (3) dwóch jednocześnie wybierających tego samego szukającego → dokładnie jedna partia, drugi dostaje komunikat; (4) status wygasły przed potwierdzeniem → partia nie powstaje; ~~niepotwierdzony e-mail~~ (zastąpione, BR-26 — brak kodu).
- **Poza zakresem:** algorytmiczny matchmaking, rankingi (brief); oznaczanie się jako szukający (#25); zmiana transportu (#30).

## 📝 Proposed Solution

Jedna operacja serwisowa `LobbyService.pick(pickerId, seekerId)` (rozszerzenie serwisu z #25) i jeden endpoint. Wszystko w jednej `em.transactional`, zapisy wyłącznie przez `tx`, surowy SQL przez `?`, warunki czasowe liczone w SQL z wstrzykniętego `Clock` (lekcje: `tx`, `?`, daty jako teksty). Kolejność blokad jak w #37/#21/rewanżu: **`users` obu graczy rosnąco po `id`**, potem wiersze `lobby_seekers`, potem sloty (`game_players`) i wstawienia.

Przebieg:

1. Limit (Q7) → `timeoutSettler.settleFor(picker)` i `closeStaleSlotsOfUser(picker)` (jak `GameService.create`).
2. Poza transakcją, bez blokady: `select user_id from lobby_seekers where id = ?` — poznanie właściciela statusu (brak wiersza → `404`; `user_id == picker` → `CANNOT_PICK_SELF`).
3. Transakcja: blokada `users` `{picker, owner}` `order by id for no key update` (usunięte konto → `401`/`LOBBY_SEEKER_TAKEN`).
4. `DELETE FROM lobby_seekers WHERE id = ? AND user_id = ? AND expires_at > :now RETURNING id`. **To jest bramka wyścigu**: blokady `users` serializują wszystkich chętnych na tego samego szukającego, więc pierwszy usuwa wiersz, a kolejni dostają 0 wierszy. 0 wierszy → w tej samej transakcji `select expires_at <= :now` (wiersz jeszcze jest → `LOBBY_SEEKER_EXPIRED`, brak wiersza → `LOBBY_SEEKER_TAKEN`) i wyjątek (nic nie zapisano, więc rollback jest niczym nie kosztujący).
5. `DELETE FROM lobby_seekers WHERE user_id = :picker` (własny status; Q2).
6. Sprawdzenie slotów obu graczy (`game_players … is_active`): picker zajęty → `ACTIVE_GAME_EXISTS`; wybrany zajęty → `LOBBY_SEEKER_TAKEN` (rollback przywraca usunięte statusy — nikt nie traci miejsca w lobby przez cudzy błąd).
7. `INSERT INTO games (origin, status, created_at, started_at, black_seat) VALUES ('lobby', 'active', …) RETURNING id` + dwa `game_players` (`kind = 'user'`, `is_active = true`, `seen_at` NULL), kolor z `ColorDraw` — wzór: `INSERT_GAME_SQL`/`INSERT_PLAYER_SQL` z `RematchService`. Zwraca `{ gameId }`.

**Błąd po zapisie cofa zapis** (lekcja o `throw` w transakcji): wszystkie odrzucenia następują *przed* wstawieniem partii, więc rollback jedynie przywraca statusy; wyjątek `409` może być rzucony w callbacku bez utraty zapisów, bo żaden zapis „do utrzymania” jeszcze nie powstał (testujemy na PostgreSQL).

**Odrzucone:** `SELECT … FOR UPDATE SKIP LOCKED` na `lobby_seekers` (ukrywa przegranych jako „brak wiersza” bez rozróżnienia wygasły/zajęty i nie serializuje z innymi ścieżkami tworzenia partii, które blokują `users`); blokada advisory (druga kolejność blokad, rozjazd z #37); potwierdzenie przez wybranego (Q3); wiersz „propozycji” jako nowa tabela (nowy stan i sprzątanie bez wartości w MVP).

## 📝 Architecture

- **Rozszerzane:** `LobbyService` i jego rejestracja w `container.ts` (z #25); reużywane: `Clock`, `RateLimiter`, `ColorDraw`, `timeoutSettler`, `closeStaleSlotsOfUser`, SQL wstawiania partii (wydzielić wspólne stałe z `RematchService` do modułu `games/game-sql.ts`, jeśli duplikacja przekroczy ~15 linii — bez zmiany zachowania rewanżu).
- **Zależności:** `GET /api/lobby` (`currentGame`) i `lobby_seekers` z #25; `GameService`/`InvitationService`/`RematchService` mają po #25 `DELETE` statusu — ścieżka `pick` jest czwartą ścieżką tworzącą partię i **musi** zachować niezmiennik „status i slot nie współistnieją”.
- Bez zmian w pakietach: `core` dostaje wyłącznie stałe/typy/schemat Zod (`LOBBY_PICK_LIMIT`, `LOBBY_PICK_WINDOW_MS`, `pickSeekerParamsSchema` = uuid), `db` bez zmian, `ui` — wiersz listy w trybie wyboru.

## 📝 Data Model

Brak zmian schematu. Wykorzystywane: `lobby_seekers` (#31), `games.origin = 'lobby'` (istnieje w `games_origin_check`), `games`, `game_players`. Do potwierdzenia w kroku 0 planu na prawdziwym PostgreSQL (`\d games`).

## 📝 API Contracts

Koperta `api-result`; CSRF (`Origin` + `X-Gomoku-Request`), `requireSession`.

| Metoda i ścieżka | Wejście | Sukces | Błędy |
|---|---|---|---|
| `POST /api/lobby/seekers/{id}/pick` | `id` w ścieżce = `lobby_seekers.id` (uuid), brak ciała | `200` `{ gameId }` | `401`; `403` CSRF; `404 NOT_FOUND` (nieznany/niepoprawny `id`); `409 ACTIVE_GAME_EXISTS` (`data.gameId`); `409 LOBBY_SEEKER_TAKEN`; `409 LOBBY_SEEKER_EXPIRED`; `409 CANNOT_PICK_SELF`; `429 RATE_LIMITED` |

`GET /api/lobby` bez zmian kontraktu (addytywnie: `currentGame` już zaplanowane w #117). Nowa ścieżka jest addytywna (`BACKWARD_COMPATIBILITY.md`).

## 📝 UI/UX

- `/lobby`: wiersze listy z przyciskiem „Zagraj” (`selectLabel`, `selectAriaLabel` „Zagraj z {nazwa}”) — komponent `LobbyRow` z propsami wyboru, które #25 uczynił opcjonalnymi; teksty po polsku przez propsy.
- Stany (prototyp: `packages/ui/docs/screens/lobby.stories.tsx`): **wybieranie trwa** (`selecting` na klikniętym wierszu, pozostałe przyciski zablokowane), **zajęty przed wyborem** (`Alert warning` „Ten gracz zagrał już z kimś innym”, lista odświeżona natychmiast), **wygasły** (komunikat `role="status"` „Status tego gracza wygasł”, odświeżenie listy), **ma aktywną partię** (istniejący stan z #25).
- Sukces: `router.push('/games/{gameId}')`. Wybrany: przekierowanie z odpytywania, gdy `currentGame` jest niepuste.
- Potwierdzenie wyboru: jedno kliknięcie przycisku „Zagraj” jest potwierdzeniem (brak okna dialogowego — przycisk ma jawną etykietę z nazwą gracza); blokada podwójnego kliknięcia `useRef` (lekcja 2026-10-29), stan `selecting` tylko do wyglądu.
- 320 px i oba motywy w przeglądarce; wartości tylko z tokenów (`check:tokens`).

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Skutek |
|---|---|
| N użytkowników wybiera tego samego szukającego jednocześnie | Blokady `users` + `DELETE … RETURNING`: jedna partia, reszta `LOBBY_SEEKER_TAKEN`; ich własne statusy zostają (rollback). |
| A wybiera B, a B jednocześnie wybiera A | Ten sam zbiór blokad `{A,B}` — wygrywa pierwszy; drugi nie znajduje wiersza docelowego (usunięty w kroku 5 zwycięzcy) → `TAKEN`. Dokładnie jedna partia. |
| A wybiera B, B jednocześnie tworzy zaproszenie/partię w innej karcie | Blokada `users` serializuje; `GameService.create` po #25 usuwa status B, więc `pick` → `TAKEN`; albo `pick` wygrywa i `create` → `409 ACTIVE_GAME_EXISTS`. Nigdy dwa sloty. |
| Status wygasł tuż przed kliknięciem | `expires_at > :now` w `DELETE` → 0 wierszy → `LOBBY_SEEKER_EXPIRED`; partia nie powstaje. Porównanie w SQL z jednym `:now` z `Clock`. |
| Wybrany wycofał status w trakcie | `DELETE` zwraca 0 wierszy i wiersza brak → `TAKEN` (komunikat „zagrał już z kimś innym” jest akceptowalnym uproszczeniem; patrz Q5). |
| Konto wybranego usunięte | Kaskada usuwa status; wynik jak wyżej; blokada `users` zamienia wyścig w deterministyczny wynik. |
| Wybierający z oczekującą, wygasłą partią | `closeStaleSlotsOfUser` zwalnia slot przed transakcją. |
| Baza niedostępna / błąd SQL | `500`; nic nie zapisano; UI: stan błędu „Spróbuj ponownie” bez zmiany listy. |
| Zerwane połączenie po commicie (klient nie dostał odpowiedzi) | Kolejny odczyt `GET /api/lobby` zwraca `currentGame` → klient przechodzi do partii; ponowne `pick` → `ACTIVE_GAME_EXISTS` z `data.gameId` (UI kieruje do partii). |
| Wybierający i wybrany to ta sama osoba (zmanipulowane żądanie) | `CANNOT_PICK_SELF`. |

## 📝 Risks & Impact Review

`risk-high` (etykieta zgłoszenia: przepływ wrażliwy na wyścigi, stan partii, czwarta ścieżka tworzenia partii). Główne ryzyka:

- **Zakleszczenie / kolejność blokad:** `users` rosnąco po `id` w każdej ścieżce; test współbieżny na PostgreSQL z wieloma wybierającymi i wzajemnym wyborem A↔B.
- **Dwie partie dla jednego szukającego:** brama `DELETE … RETURNING` wewnątrz blokad; test „N=8 wybierających → dokładnie jeden wiersz `games` z `origin='lobby'` i dwa `game_players`”. Mock `em` nie wykryje błędu SQL (lekcja `?`) — SQL uruchamiany na prawdziwej bazie.
- **Rozjazd z #25 (PR #117):** kontrakty (`id` wiersza, `currentGame`, `DELETE` statusu w pozostałych ścieżkach) są założeniem — Q1, ⚠.
- **Prywatność:** `user_id` nie opuszcza serwera (klient zna tylko `lobby_seekers.id`); odpowiedź `pick` zawiera wyłącznie `gameId`.
- **Rollback:** brak migracji; revert PR-a usuwa przycisk i endpoint, lista wraca do trybu odczytu, partie `lobby` już utworzone pozostają poprawnymi partiami.
- **Hipoteza popytu nietestowana** (A-01/A-02) — to funkcja zgodna z decyzją D-07, nie dowód potrzeby.

## 📝 Decisions in play

BR-09, BR-12, BR-13, BR-26, BR-29 (gość bez lobby), D-07, D-21 (`origin`), D-23; otwarte: Q-01/CP-3 (transport — tu odpytywanie z #117). Brak propozycji nadpisania decyzji. Właściciel: Bartosz Wójcik.

## 📋 Phasing

Jedna faza, jeden PR implementacyjny (`Refs #26`; zamknięcie zgłoszenia przez właściciela po akceptacji kryteriów): kod + testy + dokumentacja, **po wdrożeniu #25**.

## 📋 Implementation Plan

0. **Weryfikacja bazy:** po wdrożeniu #25 sprawdzić `games_origin_check` i `lobby_seekers` na PostgreSQL; potwierdzić brak potrzeby migracji.
1. **`core`:** stałe `LOBBY_PICK_LIMIT`/`LOBBY_PICK_WINDOW_MS`, schemat parametru `id`, typ wyniku; testy 100%.
2. **`LobbyService.pick`** + wydzielenie wspólnego SQL wstawiania partii (jeśli uzasadnione) bez zmiany zachowania `RematchService`; testy jednostkowe na fałszywym `em` (gałęzie: limit, brak wiersza, self, `TAKEN`, `EXPIRED`, slot pickera, slot wybranego, sukces z własnym statusem i bez).
3. **Route handler** `POST /api/lobby/seekers/[id]/pick` przez `apiHandler`; testy (CSRF, `401`, `404`, `409` ×4, `429`, `200`).
4. **UI:** przycisk „Zagraj” w `LobbyPanel`, stany wybierania/zajęty/wygasły, przekierowanie po sukcesie i z `currentGame`; testy komponentów (`@testing-library/react`, `userEvent.setup({ delay: null })`, dwa `click()` w jednym `act`).
5. **Integracja (PostgreSQL):** wyścig N wybierających jednego szukającego; wzajemny wybór A↔B; wybór vs `create`/`accept` zaproszenia drugiej strony; wygaśnięcie na granicy 5 min (tuż przed/po); rollback nie usuwa statusów przegranych; statusy obu znikają po sukcesie; `origin = 'lobby'`, kolory losowane, `seen_at` NULL.
6. **Scenariusz przeglądarkowy (`agent-browser`):** A oznacza się, B wybiera A → obaj w `/games/{id}`; drugi wybierający widzi komunikat; wygasły status.
7. **Weryfikacja ręczna:** `npm run dev` (restart po zmianie serwisu), 320 px, oba motywy; `npm run check` (z Dockerem), `npm run check:tokens -w @gomoku/ui`; `npm run build` przed `test:integration`.
8. **Dokumentacja:** adnotacja wdrożenia, przeniesienie specyfikacji do `implemented/`, aktualizacja `.ai/specs/backlog.md`.

## 📝 Acceptance criteria (mapowanie)

- [x] Użytkownik widzi aktualnych szukających, bez siebie i bez wygasłych (#25 + odświeżenie po wyborze).
- [x] Potwierdzony wybór tworzy jedną partię `origin = 'lobby'`, a obaj znikają z lobby.
- [x] Równoczesny wybór tego samego szukającego → dokładnie jedna partia, pozostali `LOBBY_SEEKER_TAKEN` z komunikatem (test na PostgreSQL).
- [x] Status wygasły przed potwierdzeniem → brak partii (`LOBBY_SEEKER_EXPIRED`).
- [x] Brak kodu zależnego od `emailVerifiedAt` (BR-26); gość bez dostępu (BR-29).
- [x] 100% pokrycia per plik; `npm run check` zielone.

## ⚠️ Pytania do człowieka (zamknięte przy zatwierdzeniu specyfikacji)

1. Q1: czy #117 (#25) zostaje w obecnym kształcie — ta specyfikacja od niego zależy (⚠).
2. Q3: czy partia ma powstawać od razu po wyborze, bez potwierdzenia przez wybranego?
3. Q2: czy wybierać może także ktoś, kto sam nie jest szukającym?

## 📝 Odstępstwa wdrożenia i dowody (2026-10-31)

Założenia Q1–Q10 zastosowane bez zmian, poza punktami 1–2 poniżej. Pozostają decyzjami produktowymi do potwierdzenia przy odbiorze: Q3 (partia od razu, bez potwierdzenia przez wybranego) i Q2 (wybierać może także nieszukający).

### Odstępstwa od treści specyfikacji

1. **Brak wiersza statusu to `409 LOBBY_SEEKER_TAKEN`, nie `404`.** Tabela API przewidywała `404` dla nieistniejącego `id`. Po wygranej jednego z wybierających wiersz znika, więc przegrany, którego żądanie dotarło później niż commit zwycięzcy, nie odróżniłby „nigdy nie było” od „zajęty” — a kryterium 3 wymaga, by **wszyscy** pozostali dostali komunikat „zagrał już z kimś innym” (test z 8 równoległymi żądaniami byłby niestabilny przy `404`). `404` zostaje wyłącznie dla `id`, które nie jest uuid (sprawdza route, przed bazą). Skutek: ten sam komunikat przy wycofaniu statusu i przy posprzątanym wierszu.
2. **Przycisk blokowany w pozostałych wierszach.** `LobbyRow` dostał opcjonalny prop `selectDisabled` (DS, test i dokumentacja), żeby podczas wyboru jednego wiersza przyciski pozostałych były zablokowane, bez wyglądu „zajęty”; prototyp tego nie miał. Przycisk „Zagraj” ma `shrink-0 whitespace-nowrap` (przy 320 px nazwa gracza łamie się, nie etykieta; wykryte na zrzucie).
3. **`closeStaleSlotsOfUser` poza transakcją** (na `em`, nie `tx`), przed odczytem właściciela statusu, jak `InvitationService.#closeStaleSlots`: zamknięcie przeterminowanej oczekującej partii jest idempotentne i ma przetrwać odrzucenie `409`, a wszystkie odrzucenia po bramce wyścigu rzucają w transakcji (rollback przywraca statusy).
4. **SQL wstawiania partii nie został wydzielony** do wspólnego modułu: lobby wstawia tylko dwa wiersze kont (stała liczba kolumn) i duplikacja z `RematchService` nie przekracza progu ~15 linii z planu, więc rewanż pozostał nietknięty.
5. **Stały układ miejsc:** wybierający ma miejsce 1, wybrany 2; losowany jest tylko kolor (`black_seat`) przez `ColorDraw`.
6. **Przekierowanie wybranego** wykonuje `LobbyPanel`, gdy odczyt zwraca `currentGame`, którego strona wcześniej nie znała (`knowsGame`); kto otworzył `/lobby` z już trwającą partią, nadal widzi „Masz już partię” z linkiem zamiast przekierowania.
7. **Brak wpisu w `.ai/specs/backlog.md`:** tabela backlogu nie ma kolumny statusu, więc plan z kroku 8 ograniczył się do `track-e03.md` (Faza 2 odhaczona).

### Dowody

- Testy jednostkowe: `npm test` z progiem 100% per plik (statements, branches, functions, lines), w tym `LobbyService.pick` (limit, brak wiersza, self, `TAKEN`, `EXPIRED`, slot wybierającego, slot wybranego, usunięte konto, kolejność SQL), route, `LobbyPanel` (wybór, podwójne kliknięcie dwoma `click()` w jednym `act`, odmowy, przekierowanie wybranego), `LobbyRow`.
- Testy integracyjne na PostgreSQL (`lobby-api.test.ts`): 8 równoległych wybierających jednego szukającego daje dokładnie jedną partię `lobby` i siedem `LOBBY_SEEKER_TAKEN` (statusy przegranych zostają); wzajemny wybór A↔B (4 rundy) — jedna partia; wybór kontra `POST /api/games` szukającego — nigdy dwa sloty; `LOBBY_SEEKER_EXPIRED` i wybór na 2 s przed końcem statusu; `CANNOT_PICK_SELF`; `ACTIVE_GAME_EXISTS` (BR-13); przeterminowana oczekująca partia wybierającego nie blokuje; `401`/`403`; `429` po 60 wyborach z `Retry-After`; partia `origin = 'lobby'`, `status = 'active'`, `seen_at` puste, oba statusy usunięte.
- Przeglądarka (`lobby-pages.test.ts`, dwie sesje `agent-browser`): B wybiera A → B na `/games/{id}`, A przekierowany odpytywaniem na tę samą partię; nieaktualna lista (karta ukryta) → „Ten gracz zagrał już z kimś innym…” i „Status tego gracza wygasł.” bez opuszczania `/lobby`. Zrzuty obejrzane w obu motywach przy 320 px, 360 px i 1280 px (lista z „Zagraj”, komunikaty), bez poziomego przewijania.
- Nie sprawdzono: obciążenia powyżej 8 równoległych wybierających; zachowania na VPS z 2 GB RAM; testów Storybooka (`test:stories`) dla zmiany `LobbyRow`.
