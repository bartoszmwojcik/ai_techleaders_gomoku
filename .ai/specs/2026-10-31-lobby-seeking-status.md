# Status „szukający gry” i widok lobby (E03-S01 #25, E03-S01-T01 #31)

> Status: **szkic autonomiczny** (`om-auto-write-spec`, 2026-10-31) — założenia odwracalne, do przeglądu i zatwierdzenia przed implementacją. Źródło: zgłoszenia #25 (E03-S01), #31 (E03-S01-T01, migracja), epik #17, `.ai/specs/product-brief.md` (BR-09, BR-12, BR-13, BR-20, BR-26, D-07, D-09, D-21, D-23), specyfikacje wdrożone: `implemented/2026-10-24-game-invitations.md` (#21: slot BR-13, `is_active`, leniwe zamykanie, kolejność blokad), `implemented/2026-10-26-game-clock.md`, `implemented/2026-10-29-game-reconnection.md` (odpytywanie, `visibilitychange`), `implemented/2026-10-29-game-rematch.md` (wzór tworzenia partii poza zaproszeniem), `implemented/2026-10-24-expired-records-cleanup.md` (rejestr reguł sprzątania), `implemented/2026-10-24-account-deletion.md` (#37, kolejność blokad). Standardy: `.ai/docs/2026-09-01-engineering-standards.md`. Wybór przeciwnika z listy i powstanie partii to **#26 (E03-S02)** — poza tą specyfikacją, jej kontrakty zostawiamy otwarte (sekcja „Interfejs dla #26”).

## 📝 TLDR

Dziś nie ma lobby: strona główna mówi „znajdź przeciwnika w lobby”, ale jedyną drogą do partii są zaproszenia (kod/link). Po wdrożeniu (zachowanie przyszłe) zalogowany użytkownik bez partii otwiera `/lobby`, klika „Szukam przeciwnika” i pojawia się na liście innych szukających na **5 minut** (BR-12). Widzi swój status z odliczaniem i przyciskiem „Wycofaj”; status znika po 5 minutach, po wycofaniu, przy utworzeniu/dołączeniu do partii oraz przy wylogowaniu. Użytkownik z partią (oczekującą albo w toku) nie może się oznaczyć (BR-13). Lista innych szukających jest w tym PR **tylko do odczytu** (bez przycisku wyboru) — wybór dochodzi w #26. Zmiany: nowa tabela `lobby_seekers` (migracja, #31), `LobbyService`, `GET /api/lobby`, `PUT`/`DELETE /api/lobby/seeking`, strona `/lobby`, reguła sprzątania.

## Resolved assumptions (autonomous defaults)

| # | Pytanie | Zastosowane założenie | Dlaczego | Potwierdzenie |
|---|---|---|---|---|
| Q1 | Gdzie żyje status? | Nowa tabela `lobby_seekers` (jeden wiersz na konto: `user_id` unikalny, `created_at`, `expires_at`), nie kolumna w `users` ani w `game_players`. | Status nie jest partią ani slotem (BR-13 dotyczy partii); osobna tabela ma własny cykl życia, własny indeks i regułę sprzątania, a `users` zostaje bez zmian. | odwracalne |
| Q2 | Czas życia | `SEEKING_TTL_MS = 5 min` w `core` (BR-12, D-09); czas liczony od oznaczenia, **bez odnawiania**. Wygasanie leniwe: odczyt filtruje `expires_at > now`, wiersz usuwa sprzątanie (#39) i kolejne oznaczenie. | Brief: „wygasa po 5 minutach, jeśli nikt go nie wybierze”; standardy zabraniają zadań w tle dla poprawności. | odwracalne (CP-1: wartość już potwierdzona przez właściciela 2026-10-24) |
| Q3 | Ponowne kliknięcie „Szukam” w trakcie statusu | Idempotentne: zwraca istniejący status bez zmiany `expires_at`. Po wygaśnięciu oznaczenie tworzy nowy status (`INSERT … ON CONFLICT (user_id) DO UPDATE … WHERE expires_at <= :now`). | Brak „przedłużania w nieskończoność” (to byłby ukryty matchmaking-presence); brak wyścigu dwóch kart tego samego użytkownika. | odwracalne |
| Q4 | Kto może się oznaczyć | Tylko zalogowane **konto** (sesja); gość nie (BR-22, `401`). Bez wymogu potwierdzonego e-maila (BR-26) — brak `emailVerifiedAt` w kodzie. Użytkownik z partią w statusie `waiting` lub `active` (slot `is_active`, Q4 z #21) dostaje `409 ACTIVE_GAME_EXISTS` (BR-13). Przed sprawdzeniem wołamy `timeoutSettler.settleFor` i `closeStaleSlotsOfUser`, jak `GameService.create`. | Spójność z #21: wygasła oczekująca partia nie może blokować lobby. | odwracalne |
| Q5 | Stan sprzeczny z partią | Utworzenie partii (`GameService.create`), przyjęcie zaproszenia jako konto (`InvitationService.accept`) i przyjęcie rewanżu przez konto (`RematchService.accept`) **usuwają wiersz `lobby_seekers` użytkownika w tej samej transakcji** (`DELETE … WHERE user_id = ?`). | Kto zaczął grać, nie może zostać wybrany z lobby (BR-13); kasowanie w transakcji nie zostawia okna wyścigu. Alternatywa „tylko filtr przy odczycie” zostawiałaby martwy status, który ożywa po końcu krótkiej partii. | odwracalne |
| Q6 | Wylogowanie i usunięcie konta | Wylogowanie usuwa status użytkownika (jedno `DELETE` w ścieżce wylogowania, błąd tego usunięcia nie blokuje wylogowania). Usunięcie konta — `ON DELETE CASCADE`. Wygaśnięcie sesji bez wylogowania: bez obsługi szczególnej (TTL 5 min ogranicza skutek). | Ktoś, kto się wylogował, nie powinien dalej figurować na liście. | odwracalne |
| Q7 | Widoczność listy | Lista pokazuje: publiczną nazwę gracza (`users.display_name`, BR-14), „szuka od …” i pozostały czas statusu; **bez** własnego wiersza użytkownika, bez wygasłych i bez kont z aktywnym slotem (defensywny filtr). Identyfikatorem wiersza dla klienta jest `lobby_seekers.id` (uuid), nie `user_id` — E-mail i `user_id` nie opuszczają serwera. | Prywatność (e-mail niewidoczny, BR-14); identyfikator wiersza wystarczy dla #26. | odwracalne |
| Q8 | Transport aktualizacji (Q-01) | **Krótkie odpytywanie** `GET /api/lobby` co 3 s, tylko gdy karta jest widoczna (`use-page-visibility`), z natychmiastowym odczytem przy `visibilitychange` — jak partia (#21 Q6, #24). Odpowiedź zawiera czasy względne liczone przez serwer (`expiresInMs`), nie bezwzględne. Wymiana na inny transport (spike #30) nie zmienia kontraktu `GET`. | Lobby nie może czekać na spike; skala MVP (jedna instancja na VPS, kilkadziesiąt osób) nie uzasadnia WebSocketu, a odpytywanie nie dodaje stanu w pamięci procesu. | odwracalne |
| Q9 | Limity | Oznaczenie: 30 na użytkownika na godzinę (`RateLimiter.hit`, klucz `lobby-mark:{userId}`); `GET` i wycofanie bez limitu (jak odczyt partii). | Chroni przed pętlą „oznacz/wycofaj”; zwykły użytkownik nie zbliży się do progu. | odwracalne |
| Q10 | Granica z #26 | Ten PR dostarcza listę **tylko do odczytu**. `LobbyRow` z DS ma dziś wymagany przycisk wyboru — dodajemy tryb bez przycisku (propsy wyboru opcjonalne), a #26 je wypełnia. | Kryterium #25: „pojawia się w lobby u innych” wymaga widocznej listy, ale wybór jest osobną historyjką z własną współbieżnością. | odwracalne |
| Q11 | Wejście do lobby | Link „Lobby” na stronie głównej dla zalogowanego (obok „Konto”); niezalogowany na `/lobby` jest przekierowany na `/login?next=/lobby`; gość nie ma wejścia (BR-22). Użytkownik z partią widzi na `/lobby` ostrzeżenie „Masz już partię” i link powrotu (stan `has-active-game` z `docs/screens/lobby.stories.tsx`). | Zgodnie z prototypem i storybookiem DS. | odwracalne |
| Q12 | Migracja i #31 | #31 (tabela) jest **krokiem 1 tego samego PR-a**, nie osobnym: encja i migracja bez serwisu byłyby martwym kodem. | Reguła „jeden PR na funkcję” (kod + testy + dokumentacja). | odwracalne |

## 📝 Problem Statement

- **Kto:** zalogowany użytkownik, który chce zagrać z kimkolwiek aktualnie dostępnym, a nie zna nikogo, komu mógłby wysłać zaproszenie (brief: ścieżka b; grupa docelowa bez dowodu popytu — A-01/A-02 w briefie).
- **Dziś:** jedyna droga do partii to zaproszenie konkretnej osoby; strona główna obiecuje lobby, którego nie ma.
- **Kryteria #25:** (1) zalogowany bez partii oznacza się i pojawia się u innych; (2) status wygasa po 5 min i użytkownik znika (BR-12); (3) szukający może sam się wycofać; (4) użytkownik z aktywną partią jest odrzucony (BR-13); ~~niepotwierdzony e-mail~~ (zastąpione, BR-26 — kryterium nie ma kodu).
- **Poza zakresem:** matchmaking algorytmiczny, rankingi (brief); wybór przeciwnika i tworzenie partii `lobby` (#26); powiadomienia poza stroną.

## 📝 Proposed Solution

Trzy warstwy, zgodnie z wzorcem #21:

1. **Dane (#31).** Encja `LobbySeeker` (`defineEntity`, wpis w `packages/db/src/entities/index.ts`) i migracja generowana (`npm run db:migration:create`), sprawdzona w górę i w dół na PostgreSQL.
2. **Serwis `LobbyService`** (scoped, `{ em, clock, rateLimiter, timeoutSettler }`): `markSeeking(userId)`, `withdraw(userId)`, `view(userId)`. Zapisy w `em.transactional` przez `tx`, surowy SQL przez `?` (lekcje: `em.execute` wiąże `?`, daty jako teksty — warunki czasowe liczone w SQL). Kolejność blokad jak w #37/#21: najpierw wiersz `users` (`select … for no key update`), potem `lobby_seekers`, potem `games`/`game_players`.
   - `markSeeking`: limit (Q9) → `settleFor` + `closeStaleSlotsOfUser` → w transakcji: blokada użytkownika (usunięte konto → `401`), sprawdzenie slotu (`game_players` `is_active`; zajęty → `409 ACTIVE_GAME_EXISTS`), `INSERT … ON CONFLICT (user_id) DO UPDATE SET created_at = :now, expires_at = :expires WHERE lobby_seekers.expires_at <= :now RETURNING …`; brak zwróconego wiersza (status nadal ważny) → odczyt istniejącego. Odpowiedź: aktualny status.
   - `withdraw`: `DELETE FROM lobby_seekers WHERE user_id = ?`; idempotentne, zawsze `200`.
   - `view`: status użytkownika (jeśli ważny) + `currentGame` (przez `gameParticipation.currentGame`, żeby klient mógł przekierować, gdy #26 utworzy partię) + lista innych ważnych szukających, limit 50 najstarszych statusów (`order by created_at, id`).
3. **HTTP i UI.** Route handlery przez `apiHandler` (CSRF: `Origin` + `X-Gomoku-Request`, `requireSession`), strona `/lobby` (dynamiczna, `await connection()`), komponent kliencki `LobbyPanel` z odpytywaniem; elementy DS: `SeekingStatus`, `LobbyList`/`LobbyRow` (tryb odczytu), `Panel`, `EmptyState`, `ErrorState`, `Skeleton`, `Alert` — wyłącznie z `@gomoku/ui/game/*`, bez wbudowanych tekstów (teksty po polsku z propsów, wg `docs/screens/lobby.stories.tsx`).

**Odrzucone:** WebSocket/SSE/`LISTEN/NOTIFY` (stan w procesie, nieuzasadniony skalą; spike #30); kolumna `seeking_until` w `users` (miesza cykle życia, blokuje wiersz konta przy każdym odczycie listy); status jako wiersz `games` ze `status = 'seeking'` (psuje CHECK-i i `is_active`, mylące z partią); odnawianie statusu przy odpytywaniu (status nigdy by nie wygasał).

## 📝 Data Model

| Encja → tabela | Kolumny | Ograniczenia i indeksy |
|---|---|---|
| `LobbySeeker` → `lobby_seekers` | `id` uuid pk (`gen_random_uuid()`), `user` → `users.id` **`ON DELETE CASCADE`**, `createdAt` timestamptz (`now()`), `expiresAt` timestamptz | unique `(user_id)`; `CHECK (expires_at > created_at)`; indeks `expires_at` (sprzątanie i filtr listy); indeks `(created_at, id)` nie jest potrzebny przy limicie 50 i małej tabeli (do oceny z `EXPLAIN`, jak w #39 L5) |

Migracja jest wyłącznie addytywna (nowa tabela); `down` usuwa tabelę. Rejestr sprzątania (`packages/db/src/cleanup/rules.ts`): reguła `lobbySeekers` — `expires_at < now − 1 h` (margines na rozjazd zegarów; poprawności nie dotyczy, bo odczyt filtruje), partiami jak pozostałe; wynik `db:cleanup` dostaje klucz `lobbySeekers`, a test-strażnik „każda encja z `expiresAt` ma regułę” (z #39) przejdzie tylko z regułą. Najgorszy przebieg `db:cleanup` wydłuża się o kolejne 15 s budżetu reguły (dziś 10 reguł × 15 s).

## 📝 API Contracts

Wszystkie odpowiedzi w kopercie `api-result`; zapisy wymagają nagłówków CSRF.

| Metoda i ścieżka | Wejście | Sukces | Błędy |
|---|---|---|---|
| `GET /api/lobby` | sesja | `200` `{ me: null \| { id, createdAt, expiresInMs }, currentGame: null \| { gameId, status }, seekers: [{ id, displayName, sinceMs, expiresInMs }] }` | `401` brak sesji |
| `PUT /api/lobby/seeking` | brak ciała | `200` `{ me: { id, createdAt, expiresInMs } }` (nowy status albo istniejący — Q3) | `401`; `409 ACTIVE_GAME_EXISTS` („Masz już partię. Dokończ ją albo anuluj oczekującą.”, `data.gameId`); `429 RATE_LIMITED`; `403` CSRF |
| `DELETE /api/lobby/seeking` | brak ciała | `200` `{ me: null }` (także gdy nie było statusu) | `401`; `403` CSRF |

Czasy względne (`expiresInMs`, `sinceMs`) licz serwer w SQL; klient odlicza lokalnie zegarem monotonicznym i koryguje przy każdym odczycie (wzorzec `use-server-now`/`use-game-clock`). Nowe ścieżki są addytywne (`BACKWARD_COMPATIBILITY.md`).

## 📝 UI

- `/lobby` (s-lobby w prototypie/`Ekrany/Lobby`): tytuł „Lobby”; stan „nie szukam” — przycisk „Szukam przeciwnika”; stan „szukam” — `SeekingStatus` (tytuł „Szukasz gry”, „Status wygasa za m:ss”, „Wycofaj”); panel „Gracze szukający gry” ze stanami: ładowanie (`Skeleton`), pusto („Nikt teraz nie szuka gry. Oznacz się jako szukający gry, a pojawisz się tu na 5 minut, albo zaproś znajomego kodem.”), błąd wczytania („Spróbuj ponownie”), lista; „Masz już partię” z linkiem powrotu.
- Po wygaśnięciu własnego statusu (odliczanie do 0 → natychmiastowy odczyt) przycisk wraca do „Szukam przeciwnika” i pojawia się krótki komunikat `role="status"` „Status wygasł”.
- Przyciski blokowane przed podwójnym kliknięciem przez `useRef` (lekcja 2026-10-29), stan `loading` tylko do wyglądu.
- Wąski ekran (320 px) i oba motywy sprawdzone w przeglądarce; teksty tylko przez propsy; wartości tylko z tokenów (`npm run check:tokens -w @gomoku/ui`).
- Strona główna: dla zalogowanego link „Lobby” (`Button asChild variant="secondary"`) obok „Konto”.

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Skutek |
|---|---|
| Dwie karty tego samego użytkownika oznaczają się jednocześnie | Unikalność `user_id` + `ON CONFLICT`: jeden wiersz, obie odpowiedzi `200` z tym samym statusem. |
| Użytkownik oznacza się i w tym samym czasie tworzy partię (inna karta) | Blokada wiersza `users` serializuje obie operacje; kolejność A: partia, potem oznaczenie → `409`; kolejność B: oznaczenie, potem partia → `DELETE` z Q5 usuwa status. Nigdy status i slot jednocześnie. |
| Status wygasa w trakcie odpytywania | Odczyt go nie zwraca; klient po odliczeniu do 0 robi natychmiastowy odczyt. |
| Zegar bazy i Node rozjeżdżają się | Wszystkie porównania w jednym zapytaniu używają tego samego `:now` z `Clock` (wstrzykiwany); sprzątanie ma 1 h marginesu. |
| Baza niedostępna | `GET`/`PUT` → `500` standardowym błędem; UI pokazuje stan błędu z „Spróbuj ponownie”. |
| Usunięcie konta w trakcie szukania | Kaskada usuwa wiersz; blokada `users` w `markSeeking` zamienia wyścig w `401`. |
| Użytkownik oznaczony, wygasła jego oczekująca partia | Nie dotyczy: oznaczenie jest możliwe tylko bez slotu; `closeStaleSlotsOfUser` zwalnia wygasły slot przed sprawdzeniem. |
| Lista pusta albo >50 szukających | Pusty stan z zachętą; powyżej 50 — pierwsze 50 według `created_at` (ograniczenie MVP, do rewizji, jeśli lobby urośnie). |
| Gość otwiera `/lobby` albo woła API | Przekierowanie na `/login?next=/lobby` / `401`. |
| Użytkownik w trakcie szukania zostaje wybrany (po #26) | `currentGame` w odpowiedzi `GET` zawiera partię; klient przekierowuje na `/games/{id}` (kontrakt zaplanowany tu, obsługa kliencka w #26). |

## 📝 Risks & Impact Review

`risk-high` (zgodnie z etykietą zgłoszenia: migracja schematu, przepływ wrażliwy na wyścigi z BR-13, dotyka tworzenia partii/zaproszeń/rewanżu). Główne ryzyka i środki:

- **Regresja w `GameService.create` / `InvitationService.accept` / `RematchService.accept`** (Q5): dodajemy jedno `DELETE` w istniejących transakcjach. Środek: testy jednostkowe istniejących serwisów rozszerzone o asercję wywołania + test integracyjny na PostgreSQL „status znika po utworzeniu/dołączeniu/rewanżu”; blokada `users` już jest pierwsza w tych transakcjach, więc kolejność blokad się nie zmienia.
- **Wyścig oznaczenia ze slotem**: rozstrzygany blokadą `users` i testem współbieżnym na prawdziwej bazie (lekcja: mock `em` nie wykryje błędu SQL).
- **Koszt odpytywania**: 1 zapytanie na 3 s na otwartą kartę, tylko widoczna karta; lista z limitem 50 i indeksem `expires_at`. Przy większej skali — wymiana transportu bez zmiany kontraktu (Q8).
- **Rollback**: `npm run db:migration:down` (tabela addytywna, brak migracji danych), revert PR-a; strona główna traci link.
- **Hipoteza popytu nietestowana** (brief A-01/A-02): pusta lista jest realnym stanem na starcie — pusty stan kieruje do zaproszeń.

## 📝 Interfejs dla #26 (E03-S02) — kontrakty, nie zakres

Aby #26 nie przebudowywało tego PR-a: (1) wiersz listy ma `id` = `lobby_seekers.id`; (2) wybór to `POST /api/lobby/seekers/{id}/pick` (osobna specyfikacja), w jednej transakcji: blokady `users` obu graczy rosnąco po `id` (reguła z #37), `DELETE … WHERE id = ? AND expires_at > :now RETURNING user_id` (0 wierszy → komunikat „zagrał już z kimś innym”/wygasł), usunięcie statusu wybierającego, sprawdzenie slotów obu, wstawienie partii `origin = 'lobby'`, `active`, dwóch `game_players` (wzór: SQL z `RematchService`, losowanie koloru `ColorDraw`); (3) `currentGame` w `GET /api/lobby` służy szukającemu do przekierowania. Dokładne kryteria współbieżności („dokładnie jedna partia”) należą do #26.

## 📝 Decisions in play

BR-09, BR-12, BR-13, D-07, D-09, D-21, D-23, BR-26 (brak bramki e-mail), BR-22 (gość bez lobby), BR-20 (telefon). Otwarte w briefie: CP-1 (5 min — zatwierdzone zbiorczo, wartość stała w `core`, łatwa do zmiany), CP-3/Q-01 (transport — tu odpytywanie, Q8). Właściciel: Bartosz Wójcik.

## 📋 Phasing

Jedna faza, jeden PR implementacyjny (`Refs #25`, `Refs #31`; zamknięcie zgłoszeń przez właściciela po akceptacji kryteriów): kod + testy + dokumentacja (adnotacja w `README` o nowej regule `db:cleanup`, aktualizacja `.ai/specs/backlog.md`). #26 po zatwierdzeniu własnej specyfikacji, w osobnym PR-ze.

## 📋 Implementation Plan

1. **#31 — dane.** `LobbySeeker` w `packages/db/src/entities/games/lobby-seeker.ts`, wpis w `entities/index.ts`, migracja wygenerowana i przejrzona; test `index.test.ts`; sprawdzenie up/down/up na PostgreSQL (zgodnie z `AGENTS.md`, najpierw `echo $DATABASE_URL`).
2. **Stałe i typy w `core`:** `SEEKING_TTL_MS`, `LOBBY_MARK_LIMIT`/`LOBBY_MARK_WINDOW_MS`, `LOBBY_LIST_LIMIT`, widok `LobbyView`; testy 100%.
3. **`LobbyService`** + rejestracja w `container.ts` (scoped) + testy jednostkowe na fałszywym `em` (gałęzie: slot zajęty, usunięte konto, status ważny/wygasły, limit).
4. **`DELETE` statusu** w `GameService.create`, `InvitationService.accept`, `RematchService.accept` (konta) i w wylogowaniu; rozszerzenie ich testów.
5. **Reguła sprzątania `lobbySeekers`** + test progu i test-strażnik; wynik CLI.
6. **Route handlery** `GET /api/lobby`, `PUT`/`DELETE /api/lobby/seeking` + testy (CSRF, `401`, `409`, `429`).
7. **DS:** tryb odczytu `LobbyRow` (propsy wyboru opcjonalne) + test i story; **UI:** `LobbyPanel`, `/lobby/page.tsx`, link na stronie głównej; testy komponentów (`@testing-library/react`, fałszywe timery: `shouldAdvanceTime` + `userEvent.setup({ delay: null })`).
8. **Integracja (PostgreSQL):** współbieżne oznaczenie (jeden wiersz), slot vs oznaczenie (oba kierunki), wygasanie (granica 5 min), kasowanie po utworzeniu partii/zaproszeniu/rewanżu, kaskada przy usunięciu konta, sprzątanie. **Scenariusz przeglądarkowy (`agent-browser`):** użytkownik A oznacza się → użytkownik B widzi A na liście; A wycofuje → znika; użytkownik z partią widzi „Masz już partię”.
9. **Weryfikacja ręczna:** `npm run dev`, 320 px i oba motywy, stan pusty/błąd/ładowanie; `npm run check` (z Dockerem), `npm run check:tokens -w @gomoku/ui`; build przed `test:integration`.
10. **Dokumentacja:** adnotacja wdrożenia w tej specyfikacji, przeniesienie do `implemented/` po spełnieniu kryteriów, wpis w README o `db:cleanup`.

## 📝 Acceptance criteria (mapowanie)

- [ ] Zalogowany bez partii oznacza się i inny zalogowany widzi go w `/lobby` (testy integracyjne + przeglądarkowy).
- [ ] Po 5 minutach status wygasa i użytkownik znika z listy (test granicy: tuż przed/po).
- [ ] Szukający wycofuje status i znika z listy innych.
- [ ] Użytkownik z partią `waiting`/`active` dostaje `409` i widzi „Masz już partię”.
- [ ] Brak kodu zależnego od `emailVerifiedAt` (BR-26).
- [ ] Migracja przechodzi w górę i w dół na PostgreSQL (#31).
- [ ] 100% pokrycia per plik; `npm run check` zielone.

## ⚠️ Open Questions (do decyzji człowieka; żadne nie blokuje zatwierdzenia szkicu)

1. **Zakres granicy S01/S02.** Czy lista w #25 ma być tylko do odczytu (Q10), czy #25 i #26 wdrożyć jednym PR-em (mniej pracy w DS, ale większa zmiana wysokiego ryzyka)? Domyślnie: osobne PR-y.
2. **Kasowanie statusu przy starcie partii i wylogowaniu (Q5, Q6)** dotyka trzech wdrożonych serwisów i ścieżki wylogowania — czy akceptujesz to zamiast samego filtrowania przy odczycie?
3. **Odpytywanie 3 s (Q8)** zamiast transportu z #30 — potwierdzenie, że na MVP wystarcza.
4. **Czy własny status ma być widoczny dla innych dłużej niż 5 min po „odświeżeniu”?** Domyślnie nie: brak odnawiania (Q3); jeśli produktowo chcesz „jeszcze 5 minut”, to osobna decyzja z konsekwencjami dla BR-12.
