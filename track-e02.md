# Śledzenie implementacji Epiku 02 (partia z zaproszenia)

- Start: 2026-10-29. Plan zatwierdzony przez właściciela 2026-10-29 (wersja z fazą projektową D0–D3 równolegle do fundamentu bez ekranów).
- Źródła: `.ai/specs/implemented/2026-10-24-game-invitations.md` (#21), `.ai/specs/implemented/2026-10-25-game-moves-win-detection.md` (#22), `.ai/specs/implemented/2026-10-26-game-clock.md` (#23), mapa ekranów `lekcja-07/mapa-ekranow-partia.md`, design system `packages/ui/docs/epics/partia.mdx`. Specyfikacje #24 (powrót po rozłączeniu), poddania i rewanżu **jeszcze nie istnieją** (faza D0).
- Zasady pracy jak w `track.md` (E01): jedno zadanie = jeden subagent = jeden commit z odhaczeniem; testy 100%, lint, typecheck; zmiany w `packages/db` sprawdzone na prawdziwym PostgreSQL (nigdy `down`/`drop` na bazie dev `gomoku` — lekcja `2026-10-28-migration-down-on-dev-database`); po każdej fazie lista kroków do ręcznego testu i PR; po fazie code review agentem bez kontekstu; **ekrany powstają dopiero po zatwierdzeniu prototypu (D3)**, a każda faza z UI kończy się porównaniem z prototypem i testem w przeglądarce w obu motywach (360 i 1280 px).
- Przerwane lub puste raporty subagentów weryfikuj w repozytorium (`git log`, `git status`), nie z raportu.
- Legenda: `[ ]` do zrobienia, `[x]` wykonane, `[!]` zablokowane.

## Ścieżka projektowa (D0–D3) — równolegle do ścieżki fundamentu

### D0 — Specyfikacje brakujących funkcji (interaktywne, pytania do właściciela)
- [x] D0.1 Specyfikacja #24: powrót po rozłączeniu (zegar biegnie, widok po powrocie, odświeżenie po końcu partii, status „rozłączony” przeciwnika)
- [x] D0.2 Specyfikacja poddania (nowe zgłoszenie; zmiana #22 Q6; BR-21; tekst potwierdzenia, L23)
- [x] D0.3 Specyfikacja rewanżu (odwrócone kolory, zaproszenie 5 min, rozstrzygnięcie L21, L22, L24; gość)
- [x] D0.4 Poprawka #22 Q8 (start zegara po `seen_at` obu) i adnotacje w #21/#22 o decyzjach z mapy (Gość, aktywne wyjście)

### D1 — Mapa ekranów do zatwierdzenia
- [x] D1.1 Aktualizacja `lekcja-07/mapa-ekranow-partia.md` po D0 (stany, luki, role, scenariusze); zatrzymanie na zatwierdzenie

### D2 — Szary prototyp (`om-mockup-prototype`, przepływ „partia z zaproszenia”, etapami)
- [x] D2.1 Etap A: tworzenie zaproszenia, `/join`, `/invite/[code]`, oczekiwanie na przeciwnika; Twój przegląd
- [x] D2.2 Etap B: gotowość, plansza, ruchy, zegary, koniec partii, poddanie, rewanż, powrót po rozłączeniu; Twój przegląd (rev. 002 zatwierdzona 2026-10-29, 282 PASS/0 FAIL)
- [x] D2.3 Kopia do Storybooka: `npm run prototypes`

### D3 — Klikalny prototyp z design systemu (jak `prototypes/konta-i-role`)
- [x] D3.1 Etap A: symulator, ekrany p01–p04, pasek scenariuszy, testy nawigacji; Twój przegląd (zatwierdzony 2026-10-29, 249 PASS/0 FAIL, 41 testów nawigacji)
- [x] D3.2 Etap B: ekrany p05–p07 (plansza, zegary, wynik, rewanż, poddanie), Twój przegląd i zatwierdzenie (zatwierdzony 2026-10-29, 329 PASS/0 FAIL, regresja A 250 PASS)

## Ścieżka implementacji

### Faza 1 — Fundament backendu (bez ekranów; równolegle do D0–D3)
Ręczny test po fazie: sprawdzenie schematu w DBeaverze (tabele, indeksy, `CHECK`), `GameParticipation` zwraca prawdę dla partii w toku (test integracyjny).
- [x] 1.1 Domena `core/src/games/`: stałe, `generateInvitationCode`, `normalizeInvitationCode`, typy, `acceptInvitationSchema` (#21 krok 1)
- [x] 1.2 Encje i migracja (#29): `game`, `game_player` (w tym `seen_at`, `kind`, `is_active`, hash tokenu gościa), `invitation`; kolumny zegara z #23; up/down/up na jednorazowej bazie (nie dev)
- [x] 1.3 `GameService.create/cancel/getState` + prawdziwy `GameParticipation` (`hasActiveGame`, `occupiesSlot`) + zamykanie przeterminowanych oczekujących partii (#21 krok 3, Q16/Q17)
- [x] 1.4 Komentarz w #29 o wymaganiach schematu (tabele, indeksy, `CHECK`, `is_active`, `seen_at`, kolumny zegara i rewanżu); poprawka #22 Q8 w specyfikacjach zrobiona w D0.4

### Faza 2 — Zaproszenia i dołączanie (#21; backend kończy się przed ekranami)
Ręczny test po fazie: `curl` — utworzenie partii, kod `ABCD-EFGH`, dołączenie drugiego konta, trzecia osoba odrzucona, gość z ostrzeżeniem, anulowanie.
- [x] 2.1 `InvitationService.accept(as=user)` i `preview` (#21 krok 4)
- [x] 2.2 `resolveParticipant` (konto), route'y `POST /api/games`, `/api/invitations/[code]/accept`, `/api/games/[id]/cancel`, `GET /api/games/[id]`, testy współbieżności (#21 krok 5)
- [x] 2.3 Gość: `GuestCookie`, `accept(as=guest)`, `resolveParticipant` (gość), wygasanie tokenu (#21 krok 6)
- [x] 2.4 Strony `/invite/[code]`, `/join`, `/games/[gameId]` w stanie oczekiwania (#21 kroki 7–8) — wg zatwierdzonego prototypu etapu A (D3.1); akcja „Utwórz zaproszenie” na `/`
  - Uwagi z review Fazy 2 załatwione: (a) `preview` zamyka leniwie przeterminowane sloty widza (Q16/Q21) jak `accept` (`#closeStaleSlots`, test jednostkowy i integracyjny); (b) „Graj jako gość”, „Dołącz”, „Utwórz” i „Anuluj” wysyłają żądanie dokładnie raz (`useRef` + wyłączony przycisk).
  - Odstępstwa od prototypu: bez nagłówka strony (strony E01 go nie mają); `/join` sprawdza tylko kształt kodu (p02.3/p02.4 to s07.8/s07.9); brak p07.1 jako szkieletu (loading.tsx ukrywa status 404); „Partia gotowa” bez „Przejdź do planszy” (faza 3).
  - Poprawki po code review stron fazy 2: `retry()` zamiast `reset()` w `error.tsx` (M1); strona główna zamyka przeterminowane sloty przed odczytem (`closeStaleSlotsOfUser`, M2); `setCancelProblem(null)` przy kolejnej próbie anulowania (L2); odblokowanie `/join` po powrocie z bfcache i blokada przez `useRef` (L4); `CREATE_GAME_LIMIT` w komunikacie limitu (L7).
  - Otwarte uwagi z review (do decyzji):
    - [x] L1: anulowana przez twórcę partia była pokazywana jako „Zaproszenie wygasło” — dodano `closedReason` (`cancelled` / `expired` / `not_opened`) w `GameState`/`GameView`/`GET /api/games/[id]`; anulowanie unieważnia zaproszenie (`consumed_at` bez `consumed_by`, w jednej instrukcji SQL ze zmianą statusu), bez migracji; komunikat „Zaproszenie zostało anulowane”.
    - [x] L3: godzina „Ważne do” ma skrót strefy (CET/CEST z `Intl`, en-GB, Europe/Warsaw).
    - L5: `error.tsx` pokazuje jeden ogólny komunikat („Nie udało się połączyć z serwerem”) dla każdego błędu, nie tylko braku bazy. Rozstrzygnięte: bez zmian (decyzja właściciela, zostaje jak jest).
    - [x] L6: po `STATE_CHANGED` bardzo dyskretny komunikat „Coś się zmieniło, odświeżyliśmy stronę” (mały, stonowany, `role="status"`, znika przy kolejnej akcji lub gdy nowy stan zastąpi komponent).
  - Poza zakresem (faza 3): p05–p06 (plansza, wynik, rewanż, powrót po rozłączeniu), p07.3 dla gościa w trakcie partii (bez zegara nie ma co ukrywać).
- [x] 2.5 Dokumentacja (README: sekcja „Partia z zaproszenia” z API, odstępstwami i ręcznym testem; lekcje w `.ai/lessons/`)
- [x] Faza 10 z `track.md` (usunięcie konta, #37) po zadaniu 1.3 i 2.2 — **odblokowana po 2.2** (`GameService.cancel`, `occupiesSlot`, kolejność blokad users → games i `game_players.user_id ON DELETE SET NULL` są gotowe); wykonana w PR „Usunięcie konta” (kroki 1–8, z regułą sprzątania 9.4); punkt integracji z rewanżem (`REMATCH_UNAVAILABLE`) zostaje przy #88 (track.md 10.9)

#### Ręczny test po fazie 2 (krok po kroku)

Na świeżej bazie (osobna baza jednorazowa, nie `gomoku` z danymi: `docker compose exec postgres psql -U gomoku -d postgres -c 'create database gomoku_e02'`, `DATABASE_URL=… npm run db:migration:up`, `DATABASE_URL=… EMAIL_TRANSPORT=file npm run dev`). Wszystkie `POST` z nagłówkami `Origin: http://localhost:3000`, `X-Gomoku-Request: 1`, `Content-Type: application/json` (przykłady w README, „Partia z zaproszenia”).
1. `curl`: zarejestruj `a` i `b` (`POST /api/auth/register`, `-c a.jar`), `a` tworzy partię (`POST /api/games`): `201`, kod `ABCD-EFGH`; drugie utworzenie przez `a` to `409 ACTIVE_GAME_EXISTS`.
2. `curl`: `b` dołącza (`POST /api/invitations/{kod}/accept`, `{"as":"user"}`): `200 { gameId }`; trzecia osoba (`c`, także gość z `acknowledgedGuestWarning`) dostaje `410`; gość bez `acknowledgedGuestWarning: true` dostaje `400`.
3. `curl`: `GET /api/games/{id}` jako `a`/`b`: `status: active`; bez ciasteczka `404`; `POST …/cancel` na aktywnej partii: `409 GAME_NOT_CANCELLABLE`.
4. Strony (dwie przeglądarki albo okno prywatne): `a` rejestruje się na `/register`, na `/` klika „Utwórz zaproszenie” → `/games/{id}` z Kartą kodu, „Kopiuj” (komunikat), przy 360 px bez poziomego przewijania.
5. Druga przeglądarka: `/join`, wpisz kod małymi literami bez myślnika → `/invite/ABCD-EFGH`: „{nazwa} zaprasza Cię…”, „Zaloguj się”/„Załóż konto” (z `?next`) i „Graj jako gość”. „Graj jako gość” → ostrzeżenie → „Rozumiem, graj jako gość” → „Partia gotowa” ze stałym ostrzeżeniem; u twórcy po kilku sekundach „Przeciwnik dołączył” i „Partia gotowa”.
6. Trzecia przeglądarka: ten sam link → „To zaproszenie jest już nieważne”; `/games/{id}` → 404 „Ta partia nie istnieje albo nie masz do niej dostępu”.
7. Nowa partia: „Anuluj zaproszenie” → okno potwierdzenia → powrót na `/` z komunikatem „Zaproszenie anulowane”; stary link: „nieważne”. Konto z własną oczekującą partią otwiera cudzy link: „Anuluj moją partię i dołącz”. 21 błędnych kodów na `/invite/…` z jednego adresu: „Zbyt wiele prób”.
8. Oba motywy (przełącznik w rogu) i szerokości 360 oraz 1280 px na każdej stronie.

### Faza 3 — Ruchy i wygrana (#22)
Ręczny test po fazie: partia przez `curl`/dwie karty do piątki w linii, remis (stan 224 kamieni w bazie), ruch poza turą i na zajęte pole odrzucony.
- [x] 3.1 Rdzeń `core/src/games/`: `board`, `bitboard-codec`, `checkWin`, `applyMove` z testem równoważności (#22 kroki 1–5)
- [x] 3.2 Walidator `moveCreateSchema`, encje/migracja kolumn planszy (`stones_*` bit(225), `moves` bytea, `CHECK`-i), losowanie koloru (#22 kroki 6–8)
- [x] 3.3 `GameMoveService.play`, `POST /api/games/[id]/moves`, rozszerzony `GET` z `after`, `result`, `winLine` (#22 kroki 9–10)
- [x] 3.4 Testy integracyjne: wyścigi, idempotencja, wygrana ostatnim kamieniem (#22 krok 11)
- [x] 3.5 Plansza i stany końca na `/games/[gameId]` (#22 kroki 12–14) — wg zatwierdzonego prototypu etapu B (D3.2)
  - Zrobione: `PlayField` (plansza 15×15, dwa kroki na dotyku, ruch z `moveNumber`, ponowienie tego samego ruchu po błędzie sieci, `STALE_MOVE`/`NOT_YOUR_TURN`/`CELL_OCCUPIED`, linia wygrywająca, baner wygranej/przegranej/remisu), odpytywanie `?after=` co 2 s (wstrzymane w ukrytej karcie), powrót do partii w toku i po końcu po odświeżeniu. Stany z mapy: p05.1, p05.2, p05.4–p05.9, p05.11, p06.1, p06.2, p06.4, p06.5, p06.6 (p06.7 = bramka 404 z fazy 2). README: „Rozgrywka”.
  - Zostaje (punkty zaczepienia w `play-field.tsx`/`game-room.tsx`): zegary i „Mało czasu” p05.3, przegrana na czas p06.3, odpytywanie także na własnym ruchu (#23, 4.4: paski `data-slot="clock"` mają już układ); „Poddaj partię” p05.13–p05.14, p06.8–p06.9 i rewanż p06.10–p06.15 (faza 5); powrót po rozłączeniu p05.10 (#24); p05.12 w części „komunikat w ukrytej karcie” (odpytywanie jest wstrzymane, tekstu brak).
  - Odstępstwa od prototypu: bez nagłówka strony; paski zegarów bez cyfr; bez „Poddaj partię”; „Wróć do panelu głównego” to link do `/`; po „Przeciwnik dołączył” od razu plansza (bez ekranu „Partia gotowa” i przycisku „Przejdź do planszy” — kolory losuje serwer przy dołączeniu).

#### Ręczny test po fazie 3 (krok po kroku)

Świeża baza jednorazowa i `npm run dev` jak po fazie 2 (nie baza `gomoku` z danymi). Dwie przeglądarki / okno prywatne: konto `a` (twórca) i konto `b` albo gość.
1. `a` tworzy partię (`/`, „Utwórz zaproszenie”), `b` dołącza z linku. Obaj na `/games/{id}`: po chwili nagłówek „Partia w toku”, plansza 15×15, „Wylosowano: Ty grasz czarnymi/białymi.”; kolory różne; u gracza na ruchu „Twój ruch (czarne)”, u drugiego „Ruch przeciwnika” i plansza tylko do odczytu (klik w pole nic nie wysyła).
2. Czarne klika pole (mysz: jedno kliknięcie; klawiatura: strzałki + Enter): kamień od razu, „Ruch przeciwnika”; u drugiego gracza kamień pojawia się w ciągu ~2 s. Klik w zajęte pole nic nie robi.
3. Ekran dotykowy (DevTools, tryb mobilny): dotknięcie zaznacza przecięcie (przerywany kamień, „Zaznaczono: Kolumna H, rząd 8”), „Postaw kamień” albo drugie dotknięcie wysyła.
4. Naprzemiennie do piątki w linii (poziomo, pionowo, ukośnie): zwycięzca „Wygrałeś”, przegrany „Przegrałeś”, pięć kamieni w grubym obrysie, plansza zablokowana, „Wróć do panelu głównego”. Drugi gracz dostaje wynik po ≤ 2 s.
5. Odświeżenie w trakcie partii i po jej końcu: ta sama plansza, status i wynik. Odświeżenie przez gościa w tej samej przeglądarce działa; w innej — „Ta partia nie istnieje…”.
6. Błędy: w DevTools „Offline” i ruch → „Nie udało się połączyć z serwerem” + „Spróbuj ponownie”; po włączeniu sieci przycisk wysyła ten sam ruch (jeden kamień). Dwie karty tego samego gracza: ruch w jednej, w drugiej próba ruchu → „Teraz ruch przeciwnika. Plansza została odświeżona.”
7. Ukryta karta (przełącz na inną): w zakładce Network brak odpytywania; po powrocie od razu jeden odczyt.
8. Remis: nie do odtworzenia ręcznie (225 ruchów bez piątki); pokrywa go test integracyjny `game-moves-api.test.ts` („ends in a draw…”) i test jednostkowy `PlayField` (baner „Remis”). Opcjonalnie: wpisz planszę remisową do bazy jak ten test i odśwież stronę.
9. Oba motywy i szerokości 320, 360, 1280 px: bez poziomego przewijania, plansza skaluje się do szerokości.

### Faza 4 — Zegar (#23)
Ręczny test po fazie: start zegara po otwarciu strony przez obu, malejący zegar gracza na ruchu, przegrana na czas przy odczycie przeciwnika.
- [x] 4.1 `core/src/games/clock.ts` (#23 krok 1)
- [x] 4.2 Migracja kolumn zegara, start w `getState`, `spend`/`settleGame`/`settleFor`, `GAME_NOT_STARTED` (#23 kroki 2–6) — kolumny zegara i CHECK `timeout` istniały od fazy 1/3, migracji nie dodano
- [x] 4.3 Testy integracyjne (wyścigi, rollback, BR-13) (#23 krok 7)
- [x] 4.4 UI: `useGameClock`, `PlayerClock`, wariant „mało czasu”, baner końca przez czas (#23 kroki 8–9) — wg zatwierdzonego prototypu etapu B (D3.2)
  - Zrobione: `clock.now` (czas serwera, ms epoki) w odpowiedzi API (zatwierdzone przez właściciela; adnotacja w specyfikacji #23); `useGameClock` (odliczanie względem czasu serwera, tylko zegar na ruchu, stop na 0 i po `finished`, odczyt stanu przy zerze); `GameClock` (cyfry m:ss, wariant „mało czasu” < 60 s bez tekstu — LUKA D04 jak w prototypie, jednorazowe ogłoszenie `aria-live`); odpytywanie także na własnym ruchu; baner przegranej/wygranej na czas. Stany z mapy: p05.1 (z cyframi), p05.3, p06.3 (przegrana i wygrana na czas). Scenariusz `tests/integration/game-clock-pages.test.ts`.
  - Odstępstwa od prototypu: wariant „mało czasu” obejmuje każdy zegar poniżej 60 s (także przeciwnika, jak w prototypie), ale ogłoszenie czytnika dotyczy tylko własnego; brak „Poddaj partię” i rewanżu (faza 5).

#### Ręczny test po fazie 4 (krok po kroku)

Świeża baza jednorazowa i `npm run dev` jak po fazie 2 (nie baza `gomoku` z danymi). Dwie przeglądarki / okno prywatne: konta `a` (twórca) i `b`. Do przesuwania czasu: `docker compose exec postgres psql -U gomoku -d gomoku_e02 -c "…"` na bazie jednorazowej.
1. `a` tworzy partię, `b` dołącza. Zegary startują dopiero, gdy obaj otworzą `/games/{id}`: do tego czasu oba 10:00; potem u gracza na ruchu cyfry spadają co sekundę (w obu kartach), drugi zegar stoi.
2. Ruch zmienia bieg: po ruchu czarnych tyka zegar białych (u obu graczy), a zegar czarnych zatrzymuje się na ostatniej wartości.
3. „Mało czasu”: `update games set clock_ms_1 = 45000, turn_started_at = now() where id = '…'` (miejsce na ruchu wg `black_seat`). W ciągu ~2 s zegar zmienia kolor na jaskrawy i dostaje gruby obrys (u obu graczy), bez tekstu „Mało czasu”; czytnik ekranu ogłasza raz „Zostało mniej niż minuta” tylko właścicielowi tego zegara.
4. Przegrana na czas bez ruchu: `update games set turn_started_at = now() - interval '2 minutes' where id = '…'`. Obie karty (także karta gracza, którego czas minął, na jego własnym ruchu) w ≤ 2 s pokazują „Przegrałeś — skończył się Twój czas” / „Wygrałeś — przeciwnikowi skończył się czas”, plansza tylko do odczytu, zegary stoją (0:00 u przegranego).
5. Zero lokalnie: ustaw `clock_ms_N = 3000, turn_started_at = now()` — wynik pojawia się zaraz po dojściu do 0:00, bez czekania na kolejny odczyt.
6. Odświeżenie w trakcie partii: te same wartości zegarów (z serwera), odliczanie trwa; odświeżenie po końcu: wynik i zamrożone zegary.
7. Dwie karty tego samego gracza: obie pokazują ten sam czas (± 1 s); ukryta karta nie odpytuje, po powrocie jeden odczyt koryguje zegar.
8. Przestaw zegar systemowy komputera o kilka minut: zegary w grze nie skaczą (liczy czas serwera).
9. Oba motywy, szerokości 320, 360 i 1280 px: bez poziomego przewijania, wariant „mało czasu” czytelny w obu motywach.

### Faza 5 — Powrót po rozłączeniu (#24), poddanie (#87), rewanż (#88)
Specyfikacje (zatwierdzone): `.ai/specs/implemented/2026-10-29-game-reconnection.md`, `…-game-resignation.md`, `…-game-rematch.md`. Prototyp: p05.10, p05.13–14, p06.5–p06.15. Każda podfaza = backend przed UI; UI po porównaniu z prototypem w obu motywach (360 i 1280 px). Kolejność: 5A → 5B → 5C (5B i 5C dotykają `GameView` i `game-room.tsx`: PR-y po kolei, każdy po rebase na `main`).
Ręczny test po fazie: powrót do trwającej i zakończonej partii z drugiego urządzenia, poddanie (obie strony), rewanż z odwróconymi kolorami (konto–konto, konto–gość), wygaśnięcie i odrzucenie propozycji.

#### 5A — Powrót po rozłączeniu (#24, jeden krótki PR)
- [x] 5.1 `core`: `shouldShowReturnNotice` i stała progu (granice, odwrócony czas) + hook `usePageVisibility` z odczytem natychmiastowym przy powrocie + komunikat „Wróciłeś do partii” (p05.10), znika po ruchu i po czasie (#24 kroki 1–3)
- [x] 5.2 Wejście do zakończonej partii: wynik i tryb tylko do odczytu (p06.5, p06.6); testy integracyjne: koniec przez czas w nieobecności, drugie urządzenie konta, gość z innej przeglądarki `404`, gość po 1 h `404` (#24 krok 4)
  - Zrobione 5.1–5.2: `shouldShowReturnNotice` + `RETURN_NOTICE_THRESHOLD_MS` (30 s) w `core`; `usePageVisibility`; odczyt przy każdym powrocie i komunikat p05.10 (tekst z serwera, 8 s lub następny ruch, bez komunikatu gdy partia się skończyła); p06.5 (zdanie „Powrót do zakończonej partii…” tylko po wejściu na zakończoną partię) i p06.6 (zdanie o 1 h zamiast ostrzeżenia gościa); scenariusze `tests/integration/game-reconnection-pages.test.ts`. Do `@gomoku/ui` doszedł eksport `./game/format-clock`. Odstępstwa od prototypu: komunikat p05.10 wchodzi w układ jak w prototypie (przesuwa treść poniżej), zegar w nim nie tyka.

  - Decyzja właściciela (2026-10-30): komunikat p05.10 wsuwa się nad planszę i przesuwa ją w dół w chwili powrotu — zostaje tak jak w zatwierdzonym prototypie (bez rezerwowania miejsca), świadomie.
  - Po przeglądzie: powrót karty zawsze czeka na odczyt rozpoczęty PO powrocie (jeden dodatkowy odczyt, odczyt ma timeout 8 s); komunikat pokazuje się tylko, gdy odczyt zakończył się w ciągu 10 s od powrotu.

#### Ręczny test po fazie 5A (krok po kroku)

Świeża baza jednorazowa i `npm run dev` (nie baza `gomoku`). Dwie przeglądarki / okna prywatne: konta `a`, `b`; trzecia przeglądarka jako „drugie urządzenie” konta `a`. Czas przesuwasz `psql` na bazie jednorazowej.
1. `a` tworzy partię, `b` dołącza, obaj na `/games/{id}`. Karta `a` w tle przez ~20 s (inna karta), powrót: stan odświeża się od razu, **bez** komunikatu.
2. To samo przez ponad 30 s: po powrocie „Wróciłeś do partii. Twój zegar: m:ss.” (wartość z serwera, nie tyka); znika po ~8 s albo po następnym ruchu.
3. Odświeżenie strony w trakcie partii: bez komunikatu „Wróciłeś”, plansza i zegary z serwera.
4. Czas w nieobecności: zamknij kartę `b`, `update games set turn_started_at = now() - interval '11 minutes' where id = '…'` (gracz na ruchu przegrywa); `b` otwiera partię ponownie: wynik („Wygrałeś/Przegrałeś — …czas”), plansza tylko do odczytu, „Powrót do zakończonej partii: wynik jest ten sam, ruch nie jest możliwy.”, bez „Wróciłeś do partii”.
5. Drugie urządzenie konta `a` (trzecia przeglądarka, logowanie): ten sam wynik i tryb tylko do odczytu; po `update games set finished_at = now() - interval '3 hours'` nadal działa.
6. Gość: partia z gościem (`Graj jako gość`), koniec partii; w tej samej przeglądarce wynik + „Wynik zobaczysz w tej przeglądarce do 1 godziny…”, bez ostrzeżenia „Grasz bez konta”. Inna przeglądarka / okno prywatne na ten sam adres: „Ta partia nie istnieje albo nie masz do niej dostępu” (status `404`). `update games set finished_at = now() - interval '61 minutes'` i odświeżenie: ten sam `404`.
7. Oba motywy, 360 i 1280 px: komunikaty czytelne, bez poziomego przewijania.

#### 5B — Poddanie (#87, jeden PR)
- [x] 5.3 Backend: `resolve` w `core`; `end_reason = resignation` już jest w `CHECK` z fazy 3 (zweryfikować, migracja tylko jeśli brakuje); `GameMoveService.resign` (wyścig z ruchem i z czasem, idempotencja, rollback przez `tx`) + route `POST /api/games/[id]/resign` (200/404/409/403, konto i gość) (#87 kroki 1–4)
- [x] 5.4 UI: przycisk „Poddaj partię”, dialog (fokus na „Wróć do gry”), stany p05.13–14 i wynik p06.8–9; link do partii w komunikacie blokady usunięcia konta (#37) (#87 kroki 5–6). Link do partii w komunikacie blokady usunięcia konta idzie z #37 (usuwanie konta, Faza 10 z `track.md`, jeszcze nie istnieje).

#### 5C — Rewanż (#88, jeden PR)
- [x] 5.5 Backend: `rematchBlackSeat`, `isRematchOpen` w `core`; `RematchService.offer/accept/decline` (wyścigi, BR-13 przy przyjęciu, gość z nowym tokenem, rollback przez `tx`); route'y i rozszerzenie `GET`; migracja tylko jeśli potrzebna (kolumny rewanżu są od fazy 1) (#88 kroki 1–4)
- [x] 5.6 UI: ekran wyniku z rewanżem, oczekiwanie, przyjęcie, odrzucenie, wygaśnięcie (p06.10–p06.15) (#88 krok 5) Wymóg: proponujący gość odbiera token nowej partii tylko przez `GET /api/games/{id}` starej partii (`rematch.state === "accepted"`), więc klient musi wykonać ten `GET` PRZED nawigacją na `/games/{rematch.gameId}`, także po przeładowaniu strony (adnotacja w specyfikacji rewanżu).
- [x] 5.7 Dokumentacja (README), lekcje (komentarz w #38 o dostawcy poczty pominięty na polecenie właściciela — poza zakresem PR rewanżu); odblokowanie Fazy 10 z `track.md` (usunięcie konta, #37) po 5.3–5.4

### Faza 6 — Gra bez konta: nick (E02-S07) i gość tworzy partię (E02-S08)
Specyfikacje: `.ai/specs/implemented/2026-10-30-participant-nickname.md`, `.ai/specs/implemented/2026-10-30-guest-creates-game.md` (decyzje właściciela 2026-10-30; BR-29, D-27). Kolejność: najpierw nick (E02-S07), potem gość-twórca (E02-S08). Ekrany po zatwierdzeniu zaktualizowanego prototypu.
- [x] 6.1 Aktualizacja mapy ekranów (`lekcja-07/mapa-ekranow-partia.md`): akcja gościa na p01, ekran „nick + ostrzeżenie”, p03 gościa-twórcy, s07 z polem nicku; zatwierdzenie (mapa zatwierdzona przez właściciela 2026-10-30; luki L25–L35 otwarte, do prototypu założenia robocze w sekcji 0d mapy)
  - Status (2026-10-30): mapa zaktualizowana (sekcja 0c, ekran p08, stany p01.8–p01.9, p03.11–p03.13, s07.10–s07.11 proponowane, scenariusze Q13–Q22, konta T9–T10, luki L25–L35, D08–D12), czeka na zatwierdzenie właściciela; nie odhaczone.
- [x] 6.2 Rewizja klikalnego prototypu (`prototypes/partia-z-zaproszenia`): stany gościa-twórcy i nicku; przegląd właściciela (etap C zbudowany i zatwierdzony przez właściciela 2026-10-30; luki L25–L35 rozstrzygnięte)
- [x] 6.3 E02-S07 backend: `nicknameSchema`/`defaultNickname` w `core`, kolumna `nickname` + `CHECK`-i (expand-only), `accept` i widok z nickiem, testy
- [x] 6.4 E02-S07 UI: pole nicku w s07, „{nick} (gość)”
- [x] 6.5 E02-S08 slot gościa (refaktor): `GUEST_TOKEN_VALID_SQL` dla `waiting`, `EXPIRE_WAITING_OF_GUEST`, `settleForGuest`, ciasteczko ze zmiennym czasem życia, `cancel` przez uczestnika
  - Zrobione: token twórcy ważny dla `waiting` i dla wygasłej niedołączonej partii przez 1 h od `expires_at` (L29); `settleForGuest`; `guestCookieMaxAge`; `cancel(participant, gameId)` przez `resolveParticipant`. Przy okazji poprawka: dołączenie gościa do partii gościa nie blokuje użytkowników (puste `in ()`). Testy: `tests/integration/guest-slot.test.ts`.
- [x] 6.6 Sprzątanie `games` (#39, część): wygasłe `waiting`, stare `cancelled`, tokeny gości
  - Zrobione: reguły `waitingGames` (po oknie 1 h), `cancelledGames` (25 h od utworzenia), `guestTokens` (zerowanie hasha po `finished_at` + 1 h; reguła typu „update” przez `clearColumn`); wynik `db:cleanup` ma trzy nowe pola. README: „Sprzątanie”.
- [x] 6.7 E02-S08 backend: `create` dla gościa (limit adresu, BR-13 przez token + blokada doradcza), `POST /api/games` bez sesji
  - Zrobione: `GameService.create(GameCreator)`, `createGuestGameSchema`, `POST /api/games` bez sesji, `creatorKind` w podglądzie zaproszenia, `GameParticipation.currentGameOfGuest`. Odstępstwo od specyfikacji: nowa partia gościa przejmuje token niesiony przez przeglądarkę (inaczej blokada doradcza nie widziałaby partii z równoległego żądania). Testy: `guest-create.test.ts`, `game-guest-create-api.test.ts`. UI (6.8) zostaje.
- [x] 6.8 E02-S08 UI: „Zagraj ze znajomym bez konta”, gość-twórca w p03, „Masz partię” gościa
  - Zrobione: `/play` (p08.1–p08.8), przycisk na `/` (p01.8), „Masz partię” gościa (p01.9, `loadGuestCurrentGame`), ostrzeżenie p03.12 i „Zaproszenie wygasło” p03.13 dla gościa-twórcy, s07.11, s07.7 dla gościa-twórcy (backend: `accept` z `as: guest` przyjmuje `cancelOwnWaitingGame`, L35). Odstępstwa od prototypu: brak nagłówka z prototypu (aplikacja go nie ma), strona główna wyśrodkowana na wąskim ekranie jak dotąd. README: „Gość tworzy partię”.
- [x] 6.9 Dokumentacja, zgłoszenia E02-S07/E02-S08 (#94, #95), adnotacje w #87/#88 i `account-deletion` (2026-10-30)

## Poza zakresem tego przebiegu
- Lobby (E03), historia (E04), spike #30 (transport czasu rzeczywistego — na MVP odpytywanie co 2–3 s), produkcyjny dostawca poczty (#38).
  - Spike #30 rozstrzygnięty (decyzja właściciela, 2026-10-31, CP-3): MVP zostaje przy odpytywaniu `GET /api/games/{id}` co 2–3 s (backoff i wstrzymanie w tle dla partii zakończonej); WebSocket/SSE poza zakresem MVP, wymiana transportu nie zmienia kontraktu API (`after`/`moveCount`, `clock.now`). Zapis: `.ai/specs/implemented/2026-10-25-game-moves-win-detection.md` (Q5). Zgłoszenia #21–#24, #29, #30 domknięte 2026-10-31 (dowody w sekcjach „Odstępstwa wdrożenia i dowody” tych specyfikacji).
