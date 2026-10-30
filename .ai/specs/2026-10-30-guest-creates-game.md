# Gość tworzy partię: gra bez konta przez zaproszenie kodem (E02-S08)

> Status: **do przeglądu** (`om-spec-writing`, tryb interaktywny, 2026-10-30). Źródło: żądanie właściciela z 2026-10-30; decyzje Q1–Q8 („1 c; 2 ok; 3 ok; 4 tak; 5 ok; 6 ok; 7 ok; 8 b”). **Zależy od** `2026-10-30-participant-nickname.md` (nick uczestnika, E02-S07 — wdrażany pierwszy). Zmienia: BR-22, D-23, L14 z `.ai/specs/product-brief.md`; #21 (`POST /api/games`, `GUEST_TOKEN_VALID_SQL`, Q7/Q10/Q19), #87 i #88 (gość w poddaniu i rewanżu — bez zmian kontraktu).

## Resolved decisions

| # | Pytanie | Decyzja (właściciel, 2026-10-30) |
|---|---|---|
| Q4 | Dwie osoby bez kont | **Tak**: gość-twórca i gość-dołączający mogą zagrać ze sobą; partia nie trafia do żadnej historii (BR-24). |
| Q5 | Ochrona przed nadużyciem | Limit tworzenia na **adres klienta** (jak dla kont: `CREATE_GAME_LIMIT`, 10/godz.), bez CAPTCHA w MVP. |
| Q6 | Ważność ciasteczka twórcy-gościa | Do wygaśnięcia zaproszenia (24 h) przy oczekującej partii, potem jak u dołączającego (do końca partii + 1 h); utrata ciasteczka = utrata partii, ostrzeżenie przed utworzeniem. |
| Q7 | Jedna partia na przeglądarkę | **Tak**, BR-13 dla gości przez token przeglądarki, jak dla kont (`cancelOwnWaitingGame`). |
| Q8 | Podział | Nick osobno (`participant-nickname`), ta specyfikacja po nim. |

## 📝 TLDR

Dziś partię tworzy wyłącznie zalogowany użytkownik (`POST /api/games` → `401` bez sesji), a gość może tylko przyjąć zaproszenie (BR-22). Po wdrożeniu (zachowanie przyszłe) osoba **niezalogowana** tworzy partię sama: podaje nick (lub zatwierdza „Gracz 1”), dostaje kod i link `ABCD-EFGH` i wysyła je komuś; ta osoba przyjmuje zaproszenie jako konto albo jako drugi gość. Nadal tylko przez kod/link: bez lobby, historii i konta.

## 📝 Problem Statement

Zapraszający musi dziś mieć konto, więc dwie osoby bez kont nie zagrają ze sobą, choć zaproszony może już dołączyć bez konta. Próg wejścia (rejestracja) blokuje najprostszy scenariusz: „zagraj ze mną, oto kod”. Dowód popytu: brak (A-01); benchmarki (papergames.io, PlayOK) pozwalają grać jako gość `[BENCHMARK]`.

## 📝 Proposed Solution

- `POST /api/games` obsługuje dwie ścieżki: **z sesją** (bez zmian) i **bez sesji** (gość): ciało `{ acknowledgedGuestWarning: true, nickname? }`. Gość dostaje token (jak dołączający: `createOpaqueToken`, hash w `game_players.guest_token_hash`) i ciasteczko `__Host-gomoku_guest`.
- Gość jest uczestnikiem miejsca 1 (`kind = guest`, `user_id = NULL`); partia ma `origin = invite`.
- Tożsamość w dalszych wywołaniach: bez zmian `resolveParticipant` (sesja konta, potem token gościa).
- **Alternatywy odrzucone:** konto-widmo w `users` (zanieczyszcza unikalne indeksy; już odrzucone w #21), tymczasowa sesja w `sessions` (inny cykl życia, G7 z #19), CAPTCHA (poza MVP, Q5).

## 📝 Architecture

- **`GameService.create`** przyjmuje twórcę jako `{ kind: "account", userId }` albo `{ kind: "guest", nickname, tokenHash }`; wspólny kod: sprawdzenie BR-13, limit, wstawienie `games`/`game_players`/`invitations` w jednej transakcji (zapis przez `tx`).
- **Limit:** klucz `create-game:ip:{adres}` w `RateLimiter` (jak limit wyszukań z Q13 #21); adres z `lookupGuard`/`client-address`; gdy adres nieustalony — pula globalna (jak dziś). Limit liczy utworzenia (także anulowane).
- **BR-13 dla gościa (Q7):** przed utworzeniem sprawdzamy token z ciasteczka; jeśli wskazuje uczestnika partii `waiting`/`active` → `409 ACTIVE_GAME_EXISTS` lub `409 OWN_WAITING_GAME` z `data.gameId`; opcjonalnie `cancelOwnWaitingGame: true` anuluje własną oczekującą partię i tworzy nową w jednej transakcji (jak dla kont). **Ograniczenie:** indeks `(user_id) WHERE is_active` nie obejmuje gości (`user_id = NULL`), a każdy token jest inny, więc bazy nie da się skonstruować jako „jeden na przeglądarkę”; gwarancja jest po stronie serwisu i nie obejmuje dwóch równoległych żądań bez ciasteczka (druga partia osierocona do wygaśnięcia po 24 h; zaakceptowane, jak „dwie karty gościa” w #21 Q7).
- **`GUEST_TOKEN_VALID_SQL`:** dziś `active` lub `finished` w ciągu 1 h; rozszerzone o `waiting` z niewygasłym zaproszeniem, żeby gość-twórca widział własną partię i mógł ją anulować.
- **Własne zaproszenie:** próba przyjęcia przez ten sam token (`OWN_INVITATION`) wykrywana po `guest_token_hash` twórcy; gość z innej przeglądarki tej samej osoby nadal niewykrywalny (jak #21 Q8).
- **`preview`/widok zaproszenia:** `creator_name` dziś z `users` (`NULL` dla gościa) → dla gościa-twórcy z `nickname`; `creator_id` `NULL` nie może być traktowane jak „konto usunięte” — rozróżnia `kind`.
- **Ciasteczko (Q6):** `Max-Age` ustawiany do wygaśnięcia zaproszenia (≤ 24 h) przy utworzeniu; `refreshGuestCookie` przy odczycie: `waiting` → do wygaśnięcia zaproszenia, `active` → 2 h (jak dziś); atrybuty bez zmian (`httpOnly`, `secure`, `sameSite=lax`, `__Host-`).

## 📝 Data Model

Bez nowych tabel i kolumn poza `nickname` z `participant-nickname`. Zmiany logiki, nie schematu: `kind = 'guest'` dopuszczone dla miejsca 1; `Game.createdBy` nie istnieje (twórca = uczestnik miejsca 1), więc brak migracji. Sprzątanie (#39): oczekująca partia gościa wygasa po 24 h tym samym mechanizmem co partie kont; token gościa czyszczony po `finished_at + 1 h` (bez zmian).

## 📝 API Contracts

`POST /api/games` — `{ "acknowledgedGuestWarning"?: true, "nickname"?: string, "cancelOwnWaitingGame"?: boolean }` (pola gościa ignorowane przy sesji konta, `acknowledgedGuestWarning` wymagane bez sesji):

| Wynik | Status | Treść |
|---|---|---|
| Utworzono (konto lub gość) | `201` | `{ data: { gameId, invitation: { code, url, expiresAt } } }`; dla gościa `Set-Cookie: __Host-gomoku_guest` |
| Bez sesji, bez `acknowledgedGuestWarning: true` | `400` | `VALIDATION`, `fieldErrors.acknowledgedGuestWarning` |
| `nickname` niepoprawny | `400` | `VALIDATION`, `fieldErrors.nickname` |
| Przeglądarka ma już partię `waiting`/`active` (Q7) | `409` | `ACTIVE_GAME_EXISTS` lub `OWN_WAITING_GAME` (`data.gameId`) |
| Limit adresu (Q5) | `429` | `RATE_LIMITED` + `Retry-After` |

Wcześniejsze `401` bez sesji **znika** (BC: zmiana kontraktu `POST /api/games`; klienci poza aplikacją nie istnieją). `POST /api/games/{id}/cancel` i `GET /api/games/{id}`: bez zmian kontraktu, działają przez `resolveParticipant` także dla gościa-twórcy.

## 📝 UI/UX

- Strona główna dla niezalogowanego: dodatkowa akcja „Zagraj ze znajomym bez konta” → ekran: pole nicku („Zostaw puste, a będziesz „Gracz 1””), ostrzeżenie „Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii” i „Rozumiem, utwórz zaproszenie”; po utworzeniu `/games/{id}` jak dla konta (Karta kodu, kopiuj/udostępnij, anuluj). Dla zalogowanego bez zmian.
- `/join` i `/invite/[code]`: bez zmian względem `participant-nickname` (przeciwnik może być kontem albo gościem; „{nick} (gość)”).
- Prototyp i mapa: nowe stany p01 (akcja gościa), ekran „nick + ostrzeżenie”, p03 dla gościa-twórcy; **wymagana rewizja klikalnego prototypu** przed ekranami (D3).

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Zachowanie |
|---|---|
| Gość usuwa ciasteczka/zmienia przeglądarkę w trakcie oczekiwania | Traci dostęp do partii (404 dla niego); zaproszenie wygasa po 24 h; ostrzeżenie przed utworzeniem (Q6). |
| Gość-twórca otwiera własny link jako dołączający | `409 OWN_INVITATION` (ten sam token). |
| Przeglądarka z tokenem gościa innej trwającej partii tworzy nową | `409` (Q7); `cancelOwnWaitingGame` tylko dla oczekującej, nie aktywnej. |
| Dwa równoległe żądania utworzenia bez ciasteczka | Dwie partie, druga nadpisuje ciasteczko, pierwsza osierocona do wygaśnięcia; limit adresu ogranicza skalę (Q5). |
| Gość tworzy partię, potem loguje się lub zakłada konto w tej samej przeglądarce | **Założenie robocze (do weryfikacji):** bez blokady; `resolveParticipant` sprawdza sesję, potem token gościa, więc partia pozostaje dostępna; konto nie przejmuje partii (BR-22). |
| Wyczerpany limit adresu przy wspólnym IP (np. sieć firmowa) | `429`; ryzyko przyjęte, bez CAPTCHA (Q5). |
| Gość–gość i rewanż/poddanie | Kontrakty #87/#88 bez zmian (uczestnik jest zasadą, nie konto); nowy token gościa przy rewanżu, nick zachowany. |

## 📝 Risks & Impact Review

- **Kontrakt:** `POST /api/games` przestaje zwracać `401` bez sesji — jedyny konsument to aplikacja (zmiana ma zostać w tym samym PR co UI).
- **Nadużycia:** anonimowe tworzenie partii bez CAPTCHA to większa powierzchnia ataku (wypełnianie tabel `games`/`invitations`); mitygacje: limit adresu, wygasanie 24 h, sprzątanie #39; poprawka w razie nadużyć: CAPTCHA lub limit na token — poza zakresem.
- **Brak gwarancji „jedna partia na przeglądarkę”** na poziomie bazy (opis w Architecture); wystarczające w skali edukacyjnej.
- **Luka E01 do świadomej decyzji:** prototyp i brief mówią, że gość z partią nie może się zalogować/zarejestrować, ale backend E01 tego nie egzekwuje (brak powiązania ciasteczka gościa z `/api/auth/*`); specyfikacja przyjmuje „bez blokady” (wiersz w Edge Cases) — do potwierdzenia przy przeglądzie.

## 📝 Decisions in play

- **Zastępuje:** BR-22 („gość … nie tworzy zaproszeń, nie ma nazwy”) — nowa reguła w briefie; D-23 („z wyjątkiem gościa dołączającego”) → „z wyjątkiem gościa tworzącego i dołączającego przez zaproszenie”; wymagane zatwierdzenie właściciela (jest: 2026-10-30).
- **Opiera się na:** BR-11, BR-13, BR-21, #21 Q10 (token i ciasteczko), #22/#23 bez zmian.

## 📋 Phasing

Jedna faza, jeden PR (zgłoszenie E02-S08), **po** PR z `participant-nickname`.

## 📋 Implementation Plan

1. Brief: nowa reguła BR-29 (gość tworzy i dołącza przez zaproszenie, ma nick) zastępująca BR-22 i D-23; aktualizacja #21 (adnotacje); tylko dokumentacja.
2. `GUEST_TOKEN_VALID_SQL` dla `waiting`; test: token gościa-twórcy ważny, wygasłe zaproszenie nieważne.
3. `GameService.create` dla gościa: limit adresu, BR-13 przez token, ciasteczko z `Max-Age` do wygaśnięcia zaproszenia; testy na PostgreSQL (równoległe utworzenia, rollback przez `tx`).
4. `POST /api/games` bez sesji + `cancelOwnWaitingGame` dla gościa; `preview`/widok z nickiem twórcy; testy integracyjne HTTP (gość–gość, gość–konto, `OWN_INVITATION`, `429`).
5. UI po zatwierdzeniu zaktualizowanego prototypu: akcja i ekran „nick + ostrzeżenie”, gość-twórca w p03, testy przeglądarki (dwie sesje, oba motywy, 360 px).
6. Dokumentacja (README, lekcje), mapa ekranów, zgłoszenia.
