# Gość tworzy partię: gra bez konta przez zaproszenie kodem (E02-S08)

> Status: **zatwierdzona do implementacji** po prototypie (`om-spec-writing`, tryb interaktywny, 2026-10-30; przegląd fresh-context: werdykt „revise”, poprawki naniesione; trzy decyzje kierunkowe rozstrzygnięte przez właściciela 2026-10-30). Źródło: żądanie właściciela z 2026-10-30; decyzje Q1–Q8 („1 c; 2 ok; 3 ok; 4 tak; 5 ok; 6 ok; 7 ok; 8 b”). **Zależy od** `2026-10-30-participant-nickname.md` (nick uczestnika, E02-S07 — wdrażany pierwszy; zależność jest kontraktowa: gość-twórca przekazuje `nickname`, a odczyt używa `defaultNickname(seat)`). Zmienia: BR-22, D-23 z `.ai/specs/product-brief.md` (zastępowane przez BR-29 / D-27) i adnotację L14 w #21; #21 (`POST /api/games`, `GUEST_TOKEN_VALID_SQL`, Q7/Q10/Q19), #87 i #88 (gość w poddaniu i rewanżu — bez zmian kontraktu).

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
- Gość jest uczestnikiem miejsca 1 (`kind = guest`, `user_id = NULL`); partia ma `origin = invite` (`games_origin_check` już to dopuszcza).
- Tożsamość w dalszych wywołaniach: `resolveParticipant` (sesja konta, potem token gościa).
- **Zdolność pomocnicza wewnątrz tego PR (nazwana, żeby nie była ukryta):** *zarządzanie slotem przeglądarki-gościa* — bo dziś gość istnieje tylko jako dołączający do trwającej partii, a gość-twórca potrzebuje: anulowania przez uczestnika (nie przez `userId`), leniwego zamykania wygasłej oczekującej partii gościa, wygaszania slotu po przegranej na czas, ciasteczka o zmiennym czasie życia i odczytu „moja partia” po tokenie. Realizowana jako pierwsze commity tego samego PR (refaktor bez zmiany zachowania widocznego dla użytkownika), z własnymi testami.
- **Alternatywy odrzucone:** konto-widmo w `users` (zanieczyszcza unikalne indeksy; odrzucone w #21), tymczasowa sesja w `sessions` (inny cykl życia, G7 z #19), CAPTCHA (poza MVP, Q5).

## 📝 Architecture
- **`GameService.create`** przyjmuje twórcę jako `{ kind: "account", userId }` albo `{ kind: "guest", nickname, tokenHash }`; wspólny kod: BR-13, limit, wstawienie `games`/`game_players`/`invitations` w jednej transakcji (zapis przez `tx`).
- **Limit (Q5) — nowy, nie „jak dla kont”:** dla kont obowiązuje limit **na użytkownika** (`games-create:${userId}`, `game-service.ts`); limitu na adres dziś nie ma. Dla gościa klucz `games-create-guest:ip:{adres}` z `CREATE_GAME_LIMIT` (10/godz.). Adres z `clientKey` (`client-address.ts`): **gdy adres jest nieustalony, produkcja zwraca błąd 500 (fail closed)**; puli globalnej tu nie ma (ta należy do `lookupGuard`, osobnego limitera wyszukań kodu). `normalizeAddress` sprowadza IPv6 do /64, więc napastnik z większą pulą adresów ma wiele kluczy (ryzyko opisane niżej); sieci współdzielone (CGNAT, biuro) dzielą klucz.
- **BR-13 dla gościa (Q7):** przed utworzeniem odczyt tokenu z ciasteczka; jeśli wskazuje uczestnika partii `waiting`/`active` → `409 ACTIVE_GAME_EXISTS` lub `409 OWN_WAITING_GAME` (`data.gameId`); `cancelOwnWaitingGame: true` anuluje własną oczekującą partię i tworzy nową w jednej transakcji. Indeks `(user_id) WHERE is_active` nie obejmuje gości (`user_id = NULL`, a każdy token jest inny), więc gwarancję daje serwis: sprawdzenie i wstawienie pod `pg_advisory_xact_lock(hashtext(token_hash))` **dla żądań z tym samym ciasteczkiem**; dwa równoległe żądania **bez** ciasteczka nadal dadzą dwie partie (druga nadpisze ciasteczko, pierwsza zostanie osierocona do wygaśnięcia po 24 h; limit adresu ogranicza skalę).
- **Anulowanie przez uczestnika:** `POST /api/games/{id}/cancel` używa dziś `requireSession()` i `GameService.cancel(userId, gameId)` (liczy wiersze z `user_id`), więc **nie działa dla gościa**. Zmiana: `cancel(participant, gameId)` z `resolveParticipant`; warunek twórcy = `seat = 1` i `playerId` uczestnika.
- **`GUEST_TOKEN_VALID_SQL`:** dziś `active` lub `finished` w ciągu 1 h; rozszerzone o `waiting` z niewygasłym zaproszeniem.
- **Leniwe zamykanie dla gościa:** dziś istnieje tylko `CANCEL_NOT_STARTED_OF_GUEST`; dochodzi `EXPIRE_WAITING_OF_GUEST` (wygasła oczekująca partia gościa → `cancelled`, `is_active = false`) wywoływane w `create`, `preview`, `accept` i przy odczycie (`getState`). Bez tego po wygaśnięciu zaproszenia token przestaje być rozpoznawany (404), a `is_active` zostaje `true`, więc ta przeglądarka dostawałaby `409` wskazujące partię, której nie może otworzyć.
- **Przegrana na czas:** `timeoutSettler.settleFor(userId)` zna tylko konta; dla gościa `settleForGuest(tokenHash)` (rozstrzyga przeterminowaną partię `active` tej przeglądarki przed sprawdzeniem BR-13), inaczej fałszywy `409` do czasu odczytu starej partii.
- **Własne zaproszenie:** `OWN_INVITATION` wykrywane po tokenie uczestnika (`#memberOf`); działa dopiero po rozszerzeniu `GUEST_TOKEN_VALID_SQL`. Gość z innej przeglądarki tej samej osoby nadal niewykrywalny (#21 Q8).
- **Strona zaproszenia i `preview`:** `creator_name` bierze się z `users` (`left join`), dla gościa `NULL`; dla gościa-twórcy nazwa z `nickname ?? defaultNickname(1)` + sufiks „(gość)”, a `creator_id NULL` nie oznacza „konta usuniętego” — rozróżnia `kind` (dziś ekran zaproszenia ma zapas „Gracz” dla `null`).
- **Ciasteczko (Q6):** `setGuestCookie`/`refreshGuestCookie` mają dziś stałe `maxAge` 2 h bez parametru; dochodzi parametr czasu życia: przy utworzeniu do wygaśnięcia zaproszenia (≤ 24 h); przy odczycie `waiting` → do wygaśnięcia zaproszenia (to wartość znana tylko twórcy i tylko w stanie `waiting`), `active` → 2 h. Atrybuty bez zmian (`httpOnly`, `secure`, `sameSite=lax`, `__Host-`).
- **Strona główna:** `GameParticipation.currentGame` czyta po `userId`; dla gościa-twórcy dodatkowy odczyt po tokenie z ciasteczka („Masz partię”), inaczej po zamknięciu karty jedyną drogą powrotu byłby zapisany link.
- **Sprzątanie wygasłych partii (warunek konieczny, #39):** reguły sprzątania dla `games` nie istnieją (`packages/db/src/cleanup/rules.ts`: „arrive with the games cleanup (#39, E02)”); „wygasanie” dziś tylko zmienia `status` leniwie przy odczycie, a nieodczytane wiersze zostają `waiting` i `is_active` na zawsze. Ten PR dodaje regułę sprzątania: usuwanie partii `waiting` z wygasłym zaproszeniem oraz `cancelled` starszych niż 24 h (wraz z uczestnikami i zaproszeniem) i czyszczenie tokenów gości po `finished_at + 1 h`.

## 📝 Data Model
Bez nowych tabel; kolumna `nickname` pochodzi z `participant-nickname` (E02-S07). `kind = 'guest'` dopuszczone dla miejsca 1; `Game.createdBy` nie istnieje (twórca = uczestnik miejsca 1), więc brak migracji. Jedyna zmiana w `packages/db` poza regułami sprzątania: ewentualny indeks pod regułę sprzątania `(status, created_at)` już istnieje (#21).

## 📝 API Contracts
`POST /api/games` — `{ "acknowledgedGuestWarning"?: true, "nickname"?: string, "cancelOwnWaitingGame"?: boolean }` (pola gościa ignorowane przy sesji konta; `acknowledgedGuestWarning` wymagane bez sesji):

| Wynik | Status | Treść |
|---|---|---|
| Utworzono (konto lub gość) | `201` | `{ data: { gameId, invitation: { code, url, expiresAt } } }`; dla gościa `Set-Cookie: __Host-gomoku_guest` |
| Bez sesji, bez `acknowledgedGuestWarning: true` | `400` | `VALIDATION`, `fieldErrors.acknowledgedGuestWarning` |
| `nickname` niepoprawny | `400` | `VALIDATION`, `fieldErrors.nickname` |
| Przeglądarka ma już partię `waiting`/`active` (Q7) | `409` | `ACTIVE_GAME_EXISTS` lub `OWN_WAITING_GAME` (`data.gameId`) |
| Limit adresu (Q5) | `429` | `RATE_LIMITED` + `Retry-After` |
| Adres klienta nieustalony (produkcja) | `500` | fail closed, jak `clientKey` |

**Zmiana kontraktu:** wcześniejsze `401` bez sesji znika (test `api/games/route.test.ts` zmienia się razem z kodem). Aplikacja wysyła dziś `apiCall("/api/games")` bez ciała, co pozostaje zgodne (ciało opcjonalne). Klientów spoza aplikacji nie ma; produkcja istnieje (mikr.us), więc zmiana jest rozszerzająca i bezpieczna dla poprzedniej wersji interfejsu.

`POST /api/games/{id}/cancel`: dotąd `401` bez sesji, po zmianie działa przez `resolveParticipant` także dla gościa-twórcy (`seat = 1`); `GET /api/games/{id}`: bez zmian kontraktu. Przejście z `requireSession` na `resolveParticipant` w `cancel` to ten sam wzorzec co `moves` i `GET`.

## 📝 UI/UX
- Strona główna dla niezalogowanego: dodatkowa akcja „Zagraj ze znajomym bez konta” → ekran: pole nicku („Zostaw puste, a będziesz „Gracz 1””), ostrzeżenie „Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii” i „Rozumiem, utwórz zaproszenie”; po utworzeniu `/games/{id}` jak dla konta (Karta kodu, kopiuj/udostępnij, anuluj). Dla zalogowanego bez zmian. Gość-twórca z trwającą partią widzi na stronie głównej „Masz partię” z przejściem do niej.
- `/join` i `/invite/[code]`: bez zmian względem `participant-nickname`; ekran zaproszenia pokazuje twórcę-gościa jako „{nick} (gość)”.
- Prototyp i mapa: nowe stany p01 (akcja gościa), ekran „nick + ostrzeżenie”, p03 dla gościa-twórcy; **wymagana rewizja klikalnego prototypu** przed ekranami (D3).

## 📝 Edge Cases & Failure Scenarios
| Sytuacja | Zachowanie |
|---|---|
| Gość usuwa ciasteczka/zmienia przeglądarkę w trakcie oczekiwania | Traci dostęp (404); zaproszenie wygasa po 24 h; ostrzeżenie przed utworzeniem (Q6). |
| Gość-twórca otwiera własny link jako dołączający | `409 OWN_INVITATION` (ten sam token). |
| Przeglądarka z tokenem gościa innej trwającej partii tworzy nową | `409` (Q7); `cancelOwnWaitingGame` tylko dla oczekującej, nie aktywnej. |
| Dwa równoległe żądania utworzenia z tym samym ciasteczkiem | Blokada doradcza po `hash(token)`: jedna partia, drugie `409`. |
| Dwa równoległe żądania **bez** ciasteczka | Dwie partie, druga nadpisuje ciasteczko, pierwsza osierocona do wygaśnięcia; skala ograniczona limitem adresu. |
| Poprzednia partia gościa przegrana na czas, nikt jej nie odczytał | `settleForGuest` rozstrzyga ją przed sprawdzeniem BR-13. |
| Zaproszenie gościa wygasło, nikt nie odczytał partii | `EXPIRE_WAITING_OF_GUEST` przy `create`/`preview`/`accept`/odczycie; sprzątanie usuwa wiersze. |
| Gość tworzy partię, potem loguje się lub zakłada konto w tej samej przeglądarce | **Decyzja do potwierdzenia (niżej):** domyślnie bez blokady; konsekwencje: ta sama osoba może mieć partię gościa i partię konta naraz, a własne zaproszenie gościa przyjęte z konta nie jest wykrywane po tokenie (jak #21 Q8). |
| Wyczerpany limit adresu (wspólne IP) | `429`; ryzyko przyjęte, bez CAPTCHA (Q5). |
| Gość–gość i rewanż/poddanie | Kontrakty #87/#88 bez zmian; nowy token gościa przy rewanżu, nick zachowany. |

## 📝 Risks & Impact Review
- **Kontrakt:** `POST /api/games` przestaje zwracać `401` bez sesji, `cancel` przestaje wymagać sesji — oba tylko dla własnego UI; zmiana w tym samym PR co UI. Produkcja istnieje (mikr.us), więc obowiązują reguły `BACKWARD_COMPATIBILITY.md`: zmiana jest rozszerzająca (nowe ścieżki, żadna dotychczasowa odpowiedź sukcesu nie znika).
- **Nadużycia anonimowego tworzenia:** limit adresu zmniejsza, ale nie eliminuje ryzyka: IPv6 /64, botnet, rotacja adresów. Bez sprzątania tabele `games`/`game_players`/`invitations` rosłyby bez ograniczenia na małym dysku mikr.us, dlatego reguła sprzątania jest częścią tego PR (nie opcją), a CAPTCHA/limit na token to rezerwa w razie nadużyć.
- **Brak gwarancji „jedna partia na przeglądarkę”** na poziomie bazy dla żądań bez ciasteczka (opis wyżej).
- **Spójność z E01:** brief i prototyp E01 mówią, że gość z partią nie może się zalogować ani zarejestrować; backend E01 tego nie egzekwuje (brak powiązania ciasteczka gościa z `/api/auth/*`). Domyślnie zostaje bez blokady (decyzja niżej).

## 📝 Decisions in play
- **Zastępuje:** BR-22 i D-23 z `.ai/specs/product-brief.md` nową regułą **BR-29** i decyzją **D-27** (gość tworzy i przyjmuje zaproszenie, ma nick, bez lobby i historii); dodane do briefu razem ze specyfikacją; zatwierdził właściciel 2026-10-30. L14 jest adnotacją w #21 (nie wpisem briefu).
- **Opiera się na:** BR-11, BR-13, BR-21, #21 Q10 (token i ciasteczko), #22/#23 bez zmian.

## ✅ Decyzje kierunkowe (właściciel, 2026-10-30: „1 ok, 2 ok, 3 ok na domyślnie bez blokady”)

1. **Zdolność pomocnicza (zarządzanie slotem gościa)** w tym samym PR jako osobne pierwsze commity, bez zmiany zachowania widocznego dla użytkownika.
2. **Brief** (BR-22 → BR-29, BR-24, D-23 → D-27) zmieniony w osobnym PR dokumentacyjnym przed implementacją (ten PR).
3. **Gość po zalogowaniu lub rejestracji w tej samej przeglądarce:** **bez blokady** i bez ostrzeżenia; konsekwencje (partia gościa i partia konta naraz, brak wykrycia własnego zaproszenia przyjętego z konta) przyjęte świadomie. Rozbieżność z prototypem E01 (blokada gościa z partią) i z opisem w briefie jest rozstrzygnięta na korzyść kodu; prototyp E01 i jego notatki do poprawienia przy aktualizacji prototypu (Faza 6.2).

## 📋 Phasing

Jedna faza, jeden PR (zgłoszenie E02-S08), **po** PR z `participant-nickname`.

## 📋 Implementation Plan
1. **Brief i adnotacje (dokumentacja):** BR-29 i D-27 zastępują BR-22 i D-23, BR-24 przeredagowane, zgłoszenie E02-S08; tylko dokumentacja (może iść z PR specyfikacji).
2. **Slot gościa (refaktor bez zmiany zachowania):** `GUEST_TOKEN_VALID_SQL` dla `waiting`; `EXPIRE_WAITING_OF_GUEST` + wywołania w `create`/`preview`/`accept`/odczycie; `settleForGuest`; parametr czasu życia w `setGuestCookie`/`refreshGuestCookie`; `cancel(participant, gameId)` z `resolveParticipant`; testy na PostgreSQL każdej gałęzi (wygasła oczekująca partia, token twórcy ważny/nieważny, przegrana na czas przed BR-13, anulowanie przez gościa-twórcę).
3. **Sprzątanie `games` (#39, część):** reguła usuwania wygasłych `waiting`/starych `cancelled`, czyszczenie tokenów po `finished_at + 1 h`; test strażnik reguł (`CLEANUP_EXEMPT_TABLES`), test na PostgreSQL.
4. **`GameService.create` dla gościa:** limit adresu (`games-create-guest:ip`), BR-13 przez token z blokadą doradczą, `cancelOwnWaitingGame`, ciasteczko do wygaśnięcia zaproszenia; testy równoległe (to samo ciasteczko: jedna partia; bez ciasteczka: dwie, druga nadpisuje) i rollback przez `tx`.
5. **`POST /api/games` bez sesji + `preview`/widok z nickiem twórcy + „Masz partię” gościa na stronie głównej:** testy HTTP (gość–gość, gość–konto, `OWN_INVITATION`, `429`, `500` przy nieustalonym adresie w produkcji, `400`).
6. **UI po zatwierdzeniu zaktualizowanego prototypu:** akcja i ekran „nick + ostrzeżenie”, gość-twórca w p03, „Masz partię” gościa; testy przeglądarki (dwie sesje, oba motywy, 360 px).
7. **Dokumentacja** (README, lekcje), mapa ekranów, zgłoszenia #21/#87/#88.

