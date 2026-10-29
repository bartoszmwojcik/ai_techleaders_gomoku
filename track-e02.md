# Śledzenie implementacji Epiku 02 (partia z zaproszenia)

- Start: 2026-10-29. Plan zatwierdzony przez właściciela 2026-10-29 (wersja z fazą projektową D0–D3 równolegle do fundamentu bez ekranów).
- Źródła: `.ai/specs/2026-10-24-game-invitations.md` (#21), `2026-10-25-game-moves-win-detection.md` (#22), `2026-10-26-game-clock.md` (#23), mapa ekranów `lekcja-07/mapa-ekranow-partia.md`, design system `packages/ui/docs/epics/partia.mdx`. Specyfikacje #24 (powrót po rozłączeniu), poddania i rewanżu **jeszcze nie istnieją** (faza D0).
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
    - L1: anulowana przez twórcę partia jest pokazywana jako „Zaproszenie wygasło” — potrzebne pole z powodem zamknięcia (anulowana / wygasła / nieotwarta).
    - L3: godzina „Ważne do” jest pokazywana w strefie Europe/Warsaw bez oznaczenia strefy.
    - L5: `error.tsx` pokazuje jeden ogólny komunikat („Nie udało się połączyć z serwerem”) dla każdego błędu, nie tylko braku bazy.
    - L6: brak komunikatu, gdy odpowiedź `STATE_CHANGED` nie zmienia widoku.
  - Poza zakresem (faza 3): p05–p06 (plansza, wynik, rewanż, powrót po rozłączeniu), p07.3 dla gościa w trakcie partii (bez zegara nie ma co ukrywać).
- [x] 2.5 Dokumentacja (README: sekcja „Partia z zaproszenia” z API, odstępstwami i ręcznym testem; lekcje w `.ai/lessons/`)
- [ ] Faza 10 z `track.md` (usunięcie konta, #37) po zadaniu 1.3 i 2.2 — **odblokowana po 2.2** (`GameService.cancel`, `occupiesSlot`, kolejność blokad users → games i `game_players.user_id ON DELETE SET NULL` są gotowe); nie wykonana w fazie 2

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
- [ ] 3.2 Walidator `moveCreateSchema`, encje/migracja kolumn planszy (`stones_*` bit(225), `moves` bytea, `CHECK`-i), losowanie koloru (#22 kroki 6–8)
- [ ] 3.3 `GameMoveService.play`, `POST /api/games/[id]/moves`, rozszerzony `GET` z `after`, `result`, `winLine` (#22 kroki 9–10)
- [ ] 3.4 Testy integracyjne: wyścigi, idempotencja, wygrana ostatnim kamieniem (#22 krok 11)
- [ ] 3.5 Plansza i stany końca na `/games/[gameId]` (#22 kroki 12–14) — po zatwierdzeniu prototypu etapu B (D3.2)

### Faza 4 — Zegar (#23)
Ręczny test po fazie: start zegara po otwarciu strony przez obu, malejący zegar gracza na ruchu, przegrana na czas przy odczycie przeciwnika.
- [ ] 4.1 `core/src/games/clock.ts` (#23 krok 1)
- [ ] 4.2 Migracja kolumn zegara, start w `getState`, `spend`/`settleGame`/`settleFor`, `GAME_NOT_STARTED` (#23 kroki 2–6)
- [ ] 4.3 Testy integracyjne (wyścigi, rollback, BR-13) (#23 krok 7)
- [ ] 4.4 UI: `useGameClock`, `PlayerClock`, wariant „mało czasu”, baner końca przez czas (#23 kroki 8–9) — po D3.2

### Faza 5 — Powrót po rozłączeniu, poddanie, rewanż (po D0)
- [!] 5.x zadania z nowych specyfikacji D0.1–D0.3 (rozpisać po ich zatwierdzeniu)

## Poza zakresem tego przebiegu
- Lobby (E03), historia (E04), spike #30 (transport czasu rzeczywistego — na MVP odpytywanie co 2–3 s), produkcyjny dostawca poczty (#38).
