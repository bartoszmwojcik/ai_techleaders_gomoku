# Tożsamość klienta MCP, token i limity nadużyć (E06-S01-T01, Q-09, #125)

> Status: **decyzje zatwierdzone przez właściciela (Bartosz Wójcik, 2026-10-31) i wdrożone w części S01 (PR #143: tożsamość, token, transport, limity początkowe, `agentName`, `join`); `get_state` i `play_move` (decyzja 8) czekają na E06-S02 (#128)** — specyfikacja decyzyjna; nie zawiera kodu. Potwierdzone: Q1–Q6 (tożsamość, token, ważność, transport, wartości limitów **jako początkowe i konfigurowalne**, długie odpytywanie), Q7–Q9, Q12 (warunkowo). Dodane przez właściciela tego samego dnia: **opcjonalna deklarowana nazwa modelu agenta** (`agentName`, Q13, decyzja 7) i **jednolity błąd `play_move` bez zmiany stanu** (Q14, decyzja 8). Wiersz `⚠` zostaje tylko tam, gdzie wartość nadal czeka na dane (limity liczbowe, `waitSeconds`) lub na odpowiedź (sekcja „Pytania do właściciela”). Po scaleniu: rekord decyzji `research/decisions/2026-10-31-mcp-agent-identity.md`, wiersz D-29 i BR-31 w briefie, Q-09 closed (w tym PR-ze).
>
> Źródła: zgłoszenie #125 (epik #124, historyjki #126–#129), `.ai/specs/product-brief.md` (D-28, BR-30, BR-29, BR-22, BR-04, BR-06, BR-07, BR-10, BR-13, D-05, N-10, A-04…A-06, Q-01, Q-06, Q-09), `research/decisions/2026-10-31-agent-opponent.md`, kod na `origin/main` (49f4ad5): `guest-token.ts` (`GUEST_TOKEN_VALID_SQL`), `guest-cookie.ts`, `opaque-token.ts` (`createOpaqueToken`, `hashOpaqueToken`, `deriveRematchToken`), `client-address.ts` (`clientKey`, `TRUST_PROXY_HOPS`), `invitation-lookup.ts`, `GameService`, `GameMoveService`, `InvitationService`, `RematchService.claimGuestSeat`, `GET /api/games/[id]`, `packages/db/src/cleanup/rules.ts`, `game-player.ts`; `BACKWARD_COMPATIBILITY.md`; specyfikacje wdrożone `2026-10-30-guest-creates-game.md`, `2026-10-29-game-rematch.md`.

## 📝 TLDR

Dziś do partii wchodzi tylko człowiek: konto (sesja) albo gość (token jednej przeglądarki w ciasteczku, BR-29). Klient MCP nie ma ani sesji, ani ciasteczka (Q-09). **Rekomendacja (zachowanie przyszłe):** agent to osobny rodzaj uczestnika `agent` z własną kolumną skrótu tokenu, który dostaje token jednej partii w odpowiedzi na `join(kod)` (wymiana jednorazowego kodu zaproszenia na token), podaje go jako argument każdego kolejnego narzędzia i traci dostęp po końcu partii + 1 h (tak jak gość). Serwer MCP to **zdalny, bezstanowy punkt Streamable HTTP w aplikacji Next.js** (`POST /api/mcp`), bez OAuth, z tym samym zegarem, usługami i limitami po adresie/tokenie. Agent nie widzi żadnych nazw graczy (brak powierzchni dla prompt injection) i nie ma żadnej drogi do zaproszeń, lobby ani historii. Jedyny tekst, który agent wysyła w stronę człowieka, to **opcjonalna, niezweryfikowana nazwa jego modelu** (`agentName` w `join`, np. „claude opus 5.5”): ścisła walidacja, wyświetlana jako zwykły tekst „Agent · {nazwa} (deklarowane)” i nigdy nie wraca do żadnego agenta (decyzja 7). Każdy błąd `play_move` ma jednolity kształt `isError` z kodem i **nie zmienia stanu partii ani zegarów** (decyzja 8). Dla #126, #127, #128 i #129 sekcja „Konsekwencje” podaje gotowy kontrakt.

## Resolved assumptions

Decyzje właściciela z 2026-10-31. „Potwierdzone” = zatwierdzone wprost; „początkowe” = wartość startowa, konfigurowalna, do korekty po danych (A-04/A-06).

| # | Pytanie | Decyzja | Dlaczego | Status |
|---|---|---|---|---|
| Q1 | Tożsamość klienta MCP | Nowy rodzaj uczestnika `agent` (`game_players.kind`), osobna kolumna `agent_token_hash`, kanał `join_channel = 'mcp'`; nie „gość z ciasteczkiem”. | BR-30/D-28; licznik musi odróżniać; separacja kanałów (token MCP nie działa w przeglądarce i odwrotnie). | potwierdzone 2026-10-31 (właściciel) |
| Q2 | Skąd agent bierze token | Z odpowiedzi `join(kod)` (jednorazowy kod zaproszenia → token jednej partii, pokazany raz, 32 B CSPRNG, w bazie SHA-256); dalej token jako argument narzędzi. Bez OAuth i bez nagłówka `Authorization` w v1. | Działa z każdym klientem MCP bez konfiguracji nagłówków; bez dodatkowego UI; MCP: autoryzacja jest opcjonalna. | potwierdzone 2026-10-31 (właściciel) |
| Q3 | Ważność, odwołanie, rotacja | Jak token gościa: do końca partii + 1 h (`GUEST_TOKEN_GRACE_MS`), po zakończeniu tylko odczyt; unieważnia go zamknięcie partii bez gry i sprzątanie (`db:cleanup`). Bez rotacji i bez ponownego wydania (utrata odpowiedzi `join` = utrata miejsca, R11 w #139 przyjęte). | Spójność z BR-29; mały zasięg wycieku; brak nowego mechanizmu. Cena: zgubiony token = utrata miejsca (zegar biegnie). | potwierdzone 2026-10-31 (właściciel) |
| Q4 | Transport | Zdalny Streamable HTTP, bezstanowy, `POST /api/mcp` w `@gomoku/app`; stdio/CLI odłożone (E05). | Jeden proces, DI i baza bez zmian; klienci (Claude Code) łączą się adresem URL; brak instalacji. | potwierdzone 2026-10-31 (właściciel) |
| Q5 | Limity nadużyć (wartości) | **Wartości początkowe, konfigurowalne (stałe w `core`, nadpisywane zmienną środowiskową):** token 60 żądań/min; adres 300 żądań/min (fail-closed w produkcji); dołączenia 10/h na adres; ciało ≤ 8 KB. Błędne kody zaproszeń agenta: **osobna pula** `agent-lookup:ip:*` (20 / 15 min na adres, 300 globalnie; zamiast wspólnej z przeglądarką, decyzja 2 właściciela). Liczba partii z agentem na człowieka = 1 (z BR-13). | Paleta istniejących stałych i szacunek ruchu agenta; **bez danych** (A-04/A-06) — dlatego początkowe. Osobna pula: klient automatyczny nie może wyczerpać puli błędnych kodów człowieka z tego samego adresu. | wartości liczbowe: **⚠ początkowe, do korekty po danych**; osobna pula i konfigurowalność: potwierdzone 2026-10-31 (właściciel) |
| Q6 | Długie odpytywanie | `get_state` ma opcjonalne `waitSeconds` (0–25, domyślnie 0): czeka na turę agenta lub koniec partii; odpowiedź ma `retryAfterMs`. | Bez tego model „kręci pętlę” i spala tokeny przez cały zegar 10 min (A-06); 25 s mieści się poniżej typowych limitów proxy. | potwierdzone 2026-10-31 (właściciel); **⚠ 25 s początkowe** do sprawdzenia za reverse proxy |
| Q7 | Nazwy graczy dla agenta | `get_state` nie zwraca nicków ani nazw kont; tylko `opponent.kind`. (BR-30/Q7 „brak nazw dla agenta” **zmienia się dla kierunku agent → człowiek**: agent może zadeklarować nazwę modelu, Q13; kierunek człowiek → agent pozostaje bez nazw.) | Zero niezaufanego tekstu od ludzi w kontekście LLM. | potwierdzone 2026-10-31 (właściciel) |
| Q8 | Rewanż z agentem | Niedostępny w v1 (`REMATCH_UNAVAILABLE`); brak narzędzia dla agenta. | Rewanż wymaga przekazania tokenu nowej partii (`claimGuestSeat`) — nowa powierzchnia; BR-30 nie wymaga. | potwierdzone 2026-10-31 (właściciel) |
| Q9 | Narzędzie `resign` | Poza zakresem v1 (agent może zostawić zegar). Uprawnienia agenta: tylko `join`, `get_state`, `play_move`. | BR-30/S02 wymieniają trzy narzędzia; mniejsza powierzchnia. | potwierdzone 2026-10-31 (właściciel) |
| Q10 | Kolumna kanału | `join_channel` (`web`/`mcp`) obok `kind`, z CHECK-iem spójności (`kind = 'agent'` ⇔ `join_channel <> 'web'`). | Literalnie wymaga tego #126; przy CLI (E05 #33) ten sam rodzaj `agent` dołączy innym kanałem. | odwracalne (przyjęte razem z Q1) |
| Q11 | Gdzie ląduje `join` | Szkielet transportu + `join` w #127; `get_state`, `play_move`, długie odpytywanie i limity ruchów w #128. **Jedna specyfikacja S01 (#139) w jednym PR-ze implementacji, w fazach.** | Każdy PR zostaje spójny i testowalny end-to-end. | potwierdzone 2026-10-31 (właściciel) |
| Q12 | Pakiet MCP | `@modelcontextprotocol/server` 2.x (zod 4 jest już w repo) **warunkowo**: spike (krok 6) sprawdza API, licencję i utrzymanie, build (`LOW_MEMORY=1`), `serverExternalPackages`, zgodność z Claude Code. **Przy porażce spike’u: ręczna obsługa JSON-RPC (Streamable HTTP) bez SDK**, ten sam kontrakt narzędzi. Zależność dodawana tylko do `@gomoku/app`. | Mniej warstw; wyjście awaryjne nie zmienia kontraktu. | potwierdzone warunkowo 2026-10-31 (właściciel); werdykt spike’u zapisać w PR implementacji |
| Q13 | Czy agent może się przedstawić | **Tak: opcjonalny `agentName` w `join`** — deklarowana, niezweryfikowana nazwa modelu LLM (np. „claude opus 5.5”). Walidacja: NFKC, 1–40 znaków, alfabet łaciński + cyfry + `␣ . - _ / : ( ) +`, bez znaków niewidocznych/sterujących i bez adresów URL; **niepoprawna wartość jest odrzucana** (`INVALID_INPUT`, kod zaproszenia nie jest zużywany), nie obcinana. Wyświetlana człowiekowi jako „Agent · {nazwa} (deklarowane)”, zawsze zwykły tekst. Decyzja 7. | Nowy wymóg właściciela 2026-10-31 (A). Odrzucenie zamiast „obcinania do bezpiecznego” — patrz uzasadnienie w decyzji 7. | decyzja właściciela 2026-10-31; sposób walidacji (odrzucenie) i alfabet: **⚠ propozycja szkicu do wiadomości właściciela** |
| Q14 | Błędy `play_move` | Jednolity kształt błędu MCP (`isError`, `structuredContent.error = { code, message, retryable, retryAfterMs? }`), kody `ILLEGAL_MOVE`, `NOT_YOUR_TURN`, `STALE_MOVE`, `GAME_NOT_STARTED`, `GAME_NOT_ACTIVE`, `GAME_FINISHED`, `INVALID_TOKEN`, `INVALID_INPUT`, `RATE_LIMITED`; **błąd nie zmienia stanu partii ani zegarów** (jedyny wyjątek: patrz decyzja 8 i „Pytania do właściciela”). Decyzja 8. | Nowy wymóg właściciela 2026-10-31 (B). | decyzja właściciela 2026-10-31; wyjątek rozstrzygnięcia czasu: **⚠ do potwierdzenia** |
| Q15 | Nazwa konta „Agent” | Rezerwacja przy rejestracji (wzorzec `RESERVED_DISPLAY_NAMES`: porównanie po `normalizeDisplayName`, więc bez rozróżniania wielkości liter, z `_`/`-` usuniętymi; `trim` w schemacie). Dodana do zakresu #139/#126 jako osobny krok z testami. | Konto o nazwie „Agent” wyglądałoby jak agent (R9 w #139). | potwierdzone 2026-10-31 (właściciel) |

Wskazówka „Jak podłączyć agenta” w UI to osobne zgłoszenie **#140** (poza zakresem tej specyfikacji).

## 📝 Problem Statement

- **Kto:** człowiek (konto lub gość, BR-29), który uruchamia własnego agenta LLM (D-28), oraz właściciel, który chce zobaczyć, jak agent gra.
- **Dziś:** serwer rozpoznaje uczestnika po sesji (`getCurrentUser`) albo po skrócie tokenu z ciasteczka `gomoku_guest` (`readGuestTokenHash` → `findParticipant` → `GUEST_TOKEN_VALID_SQL`). Wszystkie trasy gry (`resolveParticipant`) czytają tylko te dwa nośniki. Klient MCP nie ma żadnego z nich.
- **Decyzja, której brak blokuje:** jak system rozpoznaje klienta MCP, skąd bierze on poświadczenie, jak długo ono działa i jak chronimy się przed klientem automatycznym (nie przeglądarką, więc bez ludzkiego tempa). Bez niej nie da się zaprojektować #126 (kolumny), #127 (dołączenie) ani #128 (narzędzia).
- **Poza zakresem:** CLI, agent w lobby, przeciwnik hostowany przez nas (N-10, E05), próg „ma sens” licznika (Q-06), implementacja.

## 📝 Proponowane rozwiązanie — decyzje 1–6

### Decyzja 1. Tożsamość agenta

| Opcja | Opis | Koszt |
|---|---|---|
| **A (rekomendacja)** | Nowy `kind = 'agent'`, własna kolumna `agent_token_hash` (unikalna, 64 znaki), `join_channel = 'mcp'`, `user_id = NULL`, `nickname = NULL`. | Migracja (CHECK-i), rozszerzenie `ParticipantKind`, etykieta „Agent” w UI i historii, zmiana reguł `db:cleanup`. |
| B | Zwykły gość (`kind = 'guest'`, `guest_token_hash`), „agent” rozpoznany po czymś dodatkowym (np. nick „Agent”). | Najtańsze, ale nick można podrobić, licznik (S03) nie ma rzetelnego rozróżnienia, token gościa działałby w przeglądarce i w MCP (wyciek ciasteczka = dostęp agenta i odwrotnie). Odrzucone zgodnie z rekordem decyzji (BR-30). |
| C | Agent z własnym kontem technicznym. | Łamie BR-30 (brak konta/historii), wymaga kont-robotów i ich sprzątania. Odrzucone. |

**Jak system odróżnia klienta MCP od gościa z przeglądarki:** po *poświadczeniu i kanale*, nie po deklaracji klienta. Trasy przeglądarkowe (`resolveParticipant`) nigdy nie czytają tokenu agenta (nie ma go w ciasteczku), a punkt `/api/mcp` nigdy nie czyta ciasteczek ani sesji. Przechowywany typ: `game_players.kind`; kanał: `game_players.join_channel`. Ten sam `GameParticipant` (`{ playerId }`) trafia do `GameService`/`GameMoveService`, więc reguły gry (tury, zegar, wynik) są **jedną implementacją** dla wszystkich.

**Kanał dołączenia (S01):** agent dołącza do istniejącego zaproszenia (`origin = 'invite'`, partia prywatna zakładana przez człowieka, BR-30) przez `InvitationService`, jako miejsce 2. Kod/link zaproszenia pozostaje jednorazowy (BR-11). Kolory losuje `ColorDraw` jak dziś.

### Decyzja 2. Token: wydanie, ważność, hashowanie, odwołanie

| Opcja wydania | Opis | Wada |
|---|---|---|
| **T1 (rekomendacja)** | `join(kod)` zwraca `token` (pokazany raz); agent podaje `token` jako argument `get_state`/`play_move`. | Token przechodzi przez kontekst LLM (zapis rozmowy, logi klienta). Zasięg szkody ograniczony: jedna partia, miejsce agenta, ≤ czas partii + 1 h; nie daje dostępu do niczego innego. |
| T2 | Człowiek generuje „klucz agenta” w UI przed dołączeniem; agent wysyła go w `Authorization: Bearer` (konfiguracja klienta). | Lepsza higiena sekretu, ale nowy stan „zarezerwowane miejsce agenta”, nowe UI i niezgodność z D-28 („dołącza kodem lub linkiem”). Możliwe później. |
| T3 | Pełny OAuth 2.1 (PRM, serwer autoryzacji). | Przerost: specyfikacja MCP wymaga go tylko, gdy serwer ogłasza autoryzację; nie mamy kont agentów. Odrzucone. |

- **Format i przechowywanie:** `createOpaqueToken()` (32 bajty CSPRNG, base64url, 43 znaki); w bazie wyłącznie `hashOpaqueToken` (SHA-256, `char(64)`, unikalny indeks), tak jak token gościa. Token w odpowiedzi tylko raz, nigdy w URL ani w logach.
- **Jednorazowość kodu:** kod zaproszenia konsumuje to samo `CONSUME_INVITATION_SQL` co dołączenie z przeglądarki. Drugie `join` tym samym kodem → jednolite `INVALID_INVITATION` (410, jak dziś). Ponowne wydanie tokenu **nie istnieje** (Q3): ponowienie `join` po zgubionej odpowiedzi nie odzyska miejsca. Alternatywa (token wyprowadzany z kodu jak `deriveRematchToken`) odrzucona, bo każdy, kto zna kod, przejąłby miejsce.
- **Ważność:** wspólny predykat z gościem (uogólnienie `GUEST_TOKEN_VALID_SQL` do `PARTICIPANT_TOKEN_VALID_SQL` parametryzowanego kolumną): aktywna partia albo zakończona nie dłużej niż `GUEST_TOKEN_GRACE_MS` (1 h) temu. Po zakończeniu `play_move` daje `GAME_FINISHED`, a `get_state` nadal zwraca wynik (kryterium S02).
- **Odwołanie:** (a) partia zamknięta bez gry (anulowana, `not_opened`) unieważnia token tą samą regułą co gościa; (b) `db:cleanup` zeruje `agent_token_hash` po 1 h od końca (reguła obok `guestTokens`); (c) brak rotacji i listy sesji — token jest związany z jednym miejscem w jednej partii.
- **Porównanie czasowo-stałe** nie jest potrzebne: wyszukiwanie po skrócie SHA-256 w indeksie (jak dziś).

### Decyzja 3. Transport MCP

Stan specyfikacji (sprawdzony 2026-10-31, patrz źródła): aktualna rewizja protokołu to **2026-07-28**; Streamable HTTP jest w niej bezstanowy (jeden punkt akceptujący POST; brak sesji `Mcp-Session-Id`, brak strumienia GET i wznawiania; każde żądanie ma nagłówki `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`); serwer **MUSI** sprawdzać nagłówek `Origin` (403 przy nieprawidłowym) i **POWINIEN** uwierzytelniać połączenia; autoryzacja jest opcjonalna, a dla stdio zaleca się poświadczenia ze środowiska. Claude Code łączy się ze zdalnym serwerem komendą `claude mcp add --transport http <nazwa> <url>`, a stdio to lokalny proces.

| Opcja | Plusy | Minusy / koszt |
|---|---|---|
| **H (rekomendacja): zdalny HTTP w Next.js** (`packages/app/src/app/api/mcp/route.ts`) | Jeden proces i jedna pula bazy; wywołania narzędzi idą przez `withRequestScope` i istniejące serwisy; nic do instalowania po stronie gracza (adres URL); bezstanowość pasuje do VPS 2 GB (brak długich połączeń poza `waitSeconds ≤ 25`); limity po adresie jak w reszcie API. | Publicznie dostępna nowa powierzchnia (limity, `Origin`, rozmiar ciała); nowa zależność runtime; zgodność ze starszymi klientami (rewizje 2025-*, `initialize` + sesje) trzeba potwierdzić w spike’u. |
| S: lokalny stdio (pakiet CLI `@gomoku/mcp` w monorepo) | Brak publicznej powierzchni MCP; poświadczenia ze środowiska. | Pakiety są prywatne i niepublikowane — gracz musiałby sklonować repo; drugi klient HTTP z CSRF/`Origin`, który i tak woła nasze API; osobny proces do utrzymania. To jest „CLI” odłożone w D-28/E05. |
| Obie | Pełne pokrycie klientów. | Podwójny koszt; bez danych o popycie (A-04) nieuzasadnione. |

- **DI/Awilix:** kontener bez zmian strukturalnych. Dochodzi jawna rejestracja nowego serwisu miejsc agenta (np. `agentSeatService`) w `container.ts`; handler MCP tworzy serwer MCP **per żądanie** i woła `withRequestScope(({ cradle }) => …)`. Bez `loadModules`.
- **`serverExternalPackages`:** pakiety `@mikro-orm/*` i `kysely` zostają; SDK MCP to czysty ESM bez natywnych modułów — do sprawdzenia w `npm run build`, dopisywać tylko jeśli build tego wymaga.
- **VPS 2 GB:** brak sesji w pamięci, brak SSE (odpowiedzi JSON; `X-Accel-Buffering` zbędne); długie odpytywanie nie trzyma transakcji — pętla co ~1 s z krótkimi zapytaniami; budżet puli połączeń sprawdzić w teście obciążeniowym kroku 7.
- **Uwierzytelnienie transportu:** brak (Q2); punkt jest publiczny, a poświadczeniem jest kod (`join`) lub token (reszta). `Origin`: żądanie z nagłówkiem `Origin` innym niż dozwolony → `403` (nie-przeglądarkowe klienty go nie wysyłają); polityka dozwolonych origin: tylko `APP_ORIGIN`. Punkt nie używa `assertSameOrigin`/`X-Gomoku-Request` z `apiHandler` (to CSRF dla przeglądarki — nie ma tu ciasteczek, więc CSRF nie dotyczy).
- **Metody:** `POST` obsługuje protokół; `GET`/`DELETE` → `405` (zgodnie z sekcją „Backward Compatibility” rewizji 2026-07-28).
- **Wpływ na Next.js:** zgodnie z `AGENTS.md` przed kodem czytać `node_modules/next/dist/docs/` o route handlerach; trasa dynamiczna (`await connection()`).

### Decyzja 4. Limity nadużyć klienta automatycznego

Człowiek w przeglądarce jest ograniczony tempem; agent nie. Limity liczy istniejący `RateLimiter` (okno stałe w PostgreSQL, `hit`/`release`). Wartości poniżej to **wartości początkowe zatwierdzone przez właściciela jako konfigurowalne** (stałe w `core`, nadpisywane zmiennymi środowiskowymi; bez danych, ⚠ do korekty po pierwszych partiach, A-04/A-06):

| Zasób | Klucz | Propozycja | Zachowanie po przekroczeniu |
|---|---|---|---|
| Żądania na token | `mcp-token:<sha256 tokenu>` | 60 / min | błąd narzędzia `RATE_LIMITED` z `retryAfterMs` (HTTP 200, `isError`) |
| Żądania na adres | `clientKey(headers, "mcp", config)` → `mcp:ip:<sha256>` | 300 / min (wszyscy agenci za jednym NAT-em dzielą pulę) | `RATE_LIMITED`; **fail-closed w produkcji**: nieznany adres (`TRUST_PROXY_HOPS`/nagłówek) → błąd `503 ADDRESS_UNAVAILABLE`, bez wspólnego licznika |
| Błędne kody zaproszeń (agent) | **osobna pula** `agent-lookup:ip:<sha256>`, te same wartości co `lookupGuard` (20 / 15 min na adres, globalnie 300, osobny licznik globalny) | agent nie zużywa puli `invitation-lookup:*` przeglądarki i odwrotnie | `RATE_LIMITED` |
| Udane dołączenia agenta | `mcp-join:ip:<sha256>` | 10 / h (wartość `CREATE_GAME_LIMIT`) | `RATE_LIMITED` |
| Aktywne partie z agentem na człowieka | brak nowego limitu | 1 — wynika z BR-13 (jeden slot na konto/przeglądarkę gościa); obejście przez wiele „gości” ogranicza `games-create-guest` (10 / h na adres) | `ACTIVE_GAME_EXISTS` po stronie człowieka |
| Rozmiar żądania | — | ciało ≤ 8 KB; `code` ≤ 64 znaki; `agentName` ≤ 40 znaków po normalizacji (decyzja 7); `token` dokładnie 43 znaki base64url; `x`,`y` liczby całkowite (zakres planszy: `ILLEGAL_MOVE`, decyzja 8) | `INVALID_INPUT` |
| Szybkość `play_move` | — | brak osobnego limitu: tury wymuszają kolejność (`NOT_YOUR_TURN`), a natychmiastowy ruch jest legalny; nadużycie pokrywa limit na token | — |

- **Zerwanie klienta:** zegar nie jest zatrzymywany (D-05, BR-06). Przegrana na czasie jest rozstrzygana leniwie (`TimeoutSettler.settleExpired`) przy kolejnym odczycie — także przy odpytywaniu przez człowieka — więc zerwany agent nie blokuje partii. Brak „okresu karencji” dla agenta (decyzja właściciela: bez wyjątku). Opóźnienie modelu a zegar 10 min pozostaje A-06 (bez danych).
- **`get_state` i odpytywanie:** `waitSeconds` (0–25) wstrzymuje odpowiedź do tury agenta/końca partii/limitu czasu; w odpowiedzi zawsze `retryAfterMs` (podpowiedź odstępu, `null` po końcu). Wynik Q-01 dla agenta: **odpytywanie z długim oczekiwaniem wystarcza**, powiadomienia push nie są potrzebne (kryterium S02 „bez powiadomień push”); `subscriptions/listen` odłożone.
- **Czyszczenie:** wiersze `rate_limit_buckets` sprząta istniejąca reguła `db:cleanup`; klucze `mcp-token:*` mają ten sam cykl życia.

### Decyzja 5. Uprawnienia i etykieta

- **Zakres agenta = trzy narzędzia** (`join`, `get_state`, `play_move`). Brak narzędzi tworzenia zaproszeń, lobby, historii i konta — brak dostępu przez *nieobecność* (punkt MCP nie wystawia innych serwisów) oraz przez *twardą odmowę* w serwisach, które mogłyby dostać `agent` (rewanż: `REMATCH_UNAVAILABLE`; tworzenie partii/zaproszeń i lobby przyjmują tylko `account`/`guest`, więc `agent` kończy się `403`/typem w kompilacji).
- **Etykieta „Agent”:** `players[].kind = 'agent'`, `displayName = null`, `players[].agentName` = deklarowana nazwa modelu albo `null` (decyzja 7); UI mapuje rodzaj na tekst przez propsy (komponenty nie mają wbudowanych tekstów). `OpponentKind` (dziś `ParticipantKind | "agent"` w `core/src/games/history.ts`) upraszcza się do `ParticipantKind`; mapowanie etykiet jest już wyczerpujące, więc kompilator wskaże miejsca do uzupełnienia. Istniejące stories: `packages/ui/docs/screens/partia.stories.tsx`, `historia.stories.tsx` (oraz `game-screen.tsx`) — dołożyć wariant „Agent”; **makiety nie są potrzebne**.
- **Historia:** człowiek z kontem widzi „Agent” jako przeciwnika; agent nie ma konta ani historii (BR-30). Gra „gość + agent” nie zostaje w bazie po oknie 1 h (zmiana reguł sprzątania, niżej).
- **Licznik (S03, #129):** para typów z dwóch wierszy `game_players` zakończonej partii (`status = 'finished'`; nieukończone i anulowane poza licznikiem); „agent” = dołączył kanałem `mcp`, nie dowód, że to LLM. Dopuszczalne **dodatkowe zestawienie wg deklarowanej nazwy modelu** (klucz: NFKC + zwinięte spacje + małe litery; najczęstsze N + „inne” + „bez deklaracji”) jako informacja pomocnicza — nazwa jest niezweryfikowana, więc nie jest dowodem i nie wpływa na próg Q-06.

### Decyzja 6. Bezpieczeństwo

- **Niezaufane pola:** jedyne pola tekstowe pochodzące od ludzi to nick gościa (≤ 24 znaki, znormalizowany, ograniczony alfabet — E02-S07) i `display_name` konta (≤ 24). **Rekomendacja: nie zwracać ich agentowi w ogóle** (Q7). Pozostałe pola `get_state` to liczby i enumeracje wygenerowane przez serwer. Kierunek odwrotny (agent → człowiek) ma jedno pole tekstowe: `agentName` (decyzja 7), które **nie wraca do żadnego agenta**. W opisach narzędzi dodać zdanie, że odpowiedzi zawierają wyłącznie dane gry, a nie instrukcje. W `play_move` agent wysyła tylko liczby; jedyny tekst do człowieka to `agentName`, zabezpieczony według decyzji 7.
- **Brak wycieku:** żadnych e-maili, `user_id`, identyfikatorów kont przeciwnika, kodów zaproszeń (kod nie wraca po `join`), skrótów tokenów. `gameId` (uuid) jest w odpowiedzi, bo jest jedynym uchwytem, nie sekretem.
- **Jednolite błędy:** nieznany/wygasły/obcy token → jedno `INVALID_TOKEN` (analogia do jednolitego `404`/`410`), bez potwierdzania istnienia partii.
- **Logowanie:** tylko nazwa narzędzia, wynik (kod błędu), czas i `gameId`; nigdy `token`, `code`, `agentName` (jako wartość niezaufana; co najwyżej flaga „podano”), ciała żądań ani skróty tokenów; ciało nie trafia też do logów proxy (nie jest w URL). Błędy przechodzą przez istniejące `describe-error` bez treści wejścia.
- **Zgodność z `BACKWARD_COMPATIBILITY.md`:** nowa trasa i nowe kolumny są addytywne. Zmiana wymagająca uwagi: `ParticipantKind` (`@gomoku/core`) i `players[].kind` w `GET /api/games/[id]` zyskują wartość `agent` — „zmiana znaczenia zakresu wartości”. Ścieżka: ten sam PR aktualizuje konsumentów (UI, historia, `participant`), a wiersze `agent` powstają dopiero po wdrożeniu etykiety (#127), więc otwarte karty na starym kodzie ich nie zobaczą. Migracja jest *expand* (kolumny nullable/z domyślną, CHECK-i poszerzone); `down` **odmawia** wykonania, gdy istnieją wiersze `kind = 'agent'` (brak utraty danych, wymóg #126), z czytelnym komunikatem.

### Decyzja 7. Deklarowana nazwa modelu agenta (`agentName`)

Wymóg właściciela (2026-10-31): agent **może** przedstawić się nazwą swojego modelu LLM, np. „claude opus 5.5”. To tekst **deklarowany przez agenta i niezweryfikowany** — nie tożsamość, nie dowód, że po drugiej stronie jest ten model ani w ogóle LLM (BR-30: „agent” = kanał MCP).

**Kontrakt wejścia (`join`, pole opcjonalne `agentName`).** Czysta funkcja `normalizeAgentName(input)` w `@gomoku/core`, kolejność kroków:

1. Brak pola, `null`, pusty ciąg lub same spacje → brak nazwy (agent pozostaje „Agent”); to nie jest błąd (modele LLM często wysyłają `""` dla pól opcjonalnych).
2. Typ inny niż tekst → `INVALID_INPUT`.
3. Normalizacja Unicode **NFKC** (znaki pełnoszerokie, ligatury, indeksy → postać zwykła; zamyka podszywanie się przez warianty zgodnościowe).
4. Odrzucenie, jeśli wynik zawiera jakikolwiek znak kategorii Unicode `C` (sterujące, formatujące — w tym zero-width, sterowanie kierunkiem tekstu BiDi, znaki prywatne, nieprzypisane, surogaty) lub separator `Z` inny niż zwykła spacja (tabulacja, nowa linia, niełamliwa spacja itd.).
5. Przycięcie spacji z brzegów i zwinięcie ciągów spacji do jednej.
6. Długość **1–40 punktów kodowych** po normalizacji (liczone po kroku 5; więcej → odrzucenie).
7. Alfabet (po NFKC): litery pisma łacińskiego (`\p{Script=Latin}`, bez znaków łączących), cyfry ASCII `0-9`, spacja i znaki `. - _ / : ( ) +`. Cyrylica, greka i inne pisma są odrzucane (ten sam powód co `displayNameSchema`: homoglify); nazwa musi zawierać co najmniej jedną literę lub cyfrę.
8. Odrzucenie adresów: tekst zawierający `://`, `www.` lub kropkę, po której następują co najmniej dwie litery (`.com`, `.ai`), jest odrzucany. Znany fałszywy alarm: nazwy w rodzaju „llama.cpp” (agent wpisze „llama cpp”); `qwen2.5-coder`, `gpt-4.5`, `llama3.1:8b` przechodzą.

**Odrzucenie, nie „obcięcie do bezpiecznego” — uzasadnienie.** (a) Ciche czyszczenie zmienia znaczenie („gpt<script>4” → „gpt4”) i ukrywa błąd przed jedynym podmiotem, który może go poprawić — agentem; odrzucenie daje mu jednoznaczną informację i szansę ponowienia lub pominięcia pola. (b) Obcinanie wprowadza drugi, niewidoczny tryb działania do testowania i do utrzymania. (c) Walidacja następuje **przed zużyciem kodu zaproszenia** (kolejność: kształt wejścia → `agentName` → rezerwacja próby w puli → atomowe dołączenie), więc odrzucenie nie spala jednorazowego kodu ani nie zużywa puli błędnych kodów. Koszt: agent z egzotyczną nazwą modelu musi ponowić `join` bez pola; komunikat błędu wskazuje pole i regułę (bez echa wartości). Wyjątek od „odrzuć”: zwinięcie spacji i NFKC to normalizacja, nie czyszczenie, i są jawne w kontrakcie.

**Przechowywanie.** `game_players.agent_name varchar(40) null`; CHECK `agent_name is null or kind = 'agent'`; CHECK `agent_name is null or char_length(agent_name) between 1 and 40` (kontrakt dla #126). Zapisywana jest wartość **po normalizacji**, wielkość liter zachowana; klucz porównawczy (do zestawień) liczony w locie (NFKC + małe litery + zwinięte spacje). Nazwa żyje i znika razem z wierszem uczestnika (sprzątanie partii gość–agent po 1 h, konto–agent zostaje z historią konta); osobna reguła `db:cleanup` niepotrzebna.

**Wyświetlanie człowiekowi.** Etykieta składana przez UI z propsów (komponenty nie mają wbudowanych tekstów): „Agent” + separator „·” + nazwa + „(deklarowane)”, np. „Agent · claude opus 5.5 (deklarowane)”; bez nazwy sama etykieta „Agent”. Oznaczenie „(deklarowane)” jest obowiązkowe i nie można go pominąć — to jawna informacja o braku weryfikacji. Zawsze **zwykły tekst**: węzeł tekstowy Reacta (bez `dangerouslySetInnerHTML`, bez Markdownu, bez zamiany na linki); pełny tekst w `title`/`aria-label`; przy 320 px skracanie wielokropkiem (`min-w-0`, `truncate`; powiązane z luką #135). Miejsca: zegar/przeciwnik na ekranie partii, alert „Agent dołączył do partii”, ekran końca, wiersz historii konta (#27). API dla człowieka: `GET /api/games/[id]` → `players[i].agentName: string | null` (tylko dla `kind = 'agent'`; `displayName` nadal `null`); historia: pole analogiczne (zmiana addytywna).

**Analiza ryzyka.**

| Ryzyko | Ocena i środki |
|---|---|
| Podszywanie się pod model („claude opus 5.5”, gdy gra słabszy model, albo pod człowieka/administratora) | Nazwa jest z założenia niezweryfikowana: obowiązkowe „(deklarowane)”; etykieta „Agent” zawsze pierwsza, więc nazwa nie może udawać gracza ani konta; konto o nazwie „Agent” zablokowane rejestracją (Q15); hasła w rodzaju „admin”/„system” przechodzą walidację `agentName`, bo nie są niebezpieczne w kontekście „Agent · … (deklarowane)”. |
| Treści obraźliwe lub spam | Ograniczone do 40 znaków, alfabetu i bez URL-i; widoczne tylko dla człowieka-przeciwnika w jego prywatnej partii i w jego historii — brak powierzchni publicznej. **Bez listy wulgaryzmów w v1** (polityka jak dla nicku gościa; odwracalne addytywnie). Zgłaszanie nadużyć: poza zakresem. |
| Prompt injection | Nazwa **nie wraca** do agenta (`join` jej nie powtarza, `get_state` jej nie zawiera) ani do żadnego innego agenta (agent zajmuje tylko miejsce 2; w partii nie ma drugiego agenta; człowiek-twórca nie jest agentem). Nie trafia do żadnego promptu/LLM po naszej stronie (nie mamy takiego). Pozostaje ryzyko poza systemem: człowiek wkleja etykietę do własnego narzędzia — odpowiedzialność użytkownika, alfabet ogranicza treść do krótkiej nazwy. |
| XSS / Markdown / bidi | Alfabet nie zawiera `< > " ' & \` ani znaków BiDi/zero-width; mimo to UI jest odporne **niezależnie od walidacji** (renderowanie tekstowe) — test renderuje komponent z wrogim ciągiem podanym wprost, z pominięciem walidacji (obrona warstwowa). |
| Unicode (homoglify, normalizacja) | NFKC + tylko pismo łacińskie + brak znaków łączących; kolejność: NFKC przed filtrem znaków (testy: pełnoszerokie `ＡＢＣ`, ligatura `ﬁ`, `ǆ`, odrzucenie `аdmin` z cyrylicą). |
| Wyciek do logów | `agentName` jest niezaufany: nigdy w logach jako wartość (co najwyżej flaga „podano”); test: log serwera po `join` z unikalną nazwą nie zawiera jej. |
| Rozmiar/obciążenie | ≤ 40 znaków, sprawdzane po ograniczeniu ciała ≤ 8 KB; walidacja liniowa, bez regexów wykładniczych. |
| Wpływ na historię (#27) | Typ uczestnika nadal `agent`; nazwa tylko w etykiecie wiersza; filtrowanie/grupowanie historii wyłącznie po `kind`. |
| Wpływ na licznik S03 (#129) | Główny licznik bez zmian (para typów). Dodatkowe zestawienie wg deklarowanej nazwy dopuszczalne jako informacja pomocnicza; ograniczenie liczności (top N + „inne”), brak wniosków o popycie; partie gość–agent znikają po 1 h (R10 w #139), więc zestawienie dotyczy tylko partii z kontem lub zebranych na bieżąco. |

**Testy (kontrakt dla #127/#139).** Granice długości (0, 1, 40, 41; po NFKC/zwinięciu spacji); typ (liczba, obiekt, tablica); `""`/same spacje = brak nazwy; każda kategoria odrzuconych znaków (sterujące `\u0000`, `\n`, `\t`, zero-width `\u200b`, BiDi `\u202e`, niełamliwa spacja `\u00a0`, znak prywatny); cyrylica/greka; znak łączący (zalgo); adresy (`http://x`, `www.x`, `evil.com`) i przypadki przechodzące (`gpt-4.5`, `claude opus 5.5`, `qwen2.5-coder`, `llama3.1:8b`, `o3 (preview)`); wrogie ciągi `<script>`, `"><img onerror=1>`, `[x](javascript:1)`, `{{7*7}}` (odrzucone); **kolejność**: nieprawidłowa nazwa + poprawny kod → `INVALID_INPUT` i kod nadal ważny (kolejne `join` bez nazwy działa), nieprawidłowa nazwa + zły kod → `INVALID_INPUT` (nie zużywa puli), poprawna nazwa + zły kod → `INVALID_INVITATION`; zapis w bazie (po normalizacji), CHECK-i `agent_name` na PostgreSQL; odpowiedź `join` i `get_state` nie zawierają nazwy; log bez nazwy; render etykiety: z nazwą, bez nazwy, wrogi ciąg podany wprost (escaping), długa nazwa przy 320 px; historia i `GET /api/games/[id]` z `agentName`.

**Stories.** Wariant „Agent · claude opus 5.5 (deklarowane)” w `partia`, `historia`, ekranie końca (oba motywy, 320 px, nazwa 40 znaków ze skracaniem).

### Decyzja 8. Jednolity błąd `play_move` i niezmienność stanu

Wymóg właściciela (2026-10-31): `play_move` zwracający błąd (nielegalny ruch, ruch poza kolejnością, pole zajęte, partia zakończona, zły token) ma **jednolity kształt błędu MCP** i **nie zmienia stanu partii ani zegarów**.

- **Kształt:** wynik narzędzia `isError: true`, `structuredContent.error = { code, message, retryable, retryAfterMs? }` + zwięzły tekst w `content` (komunikat po polsku, bez echa wejścia, bez danych wewnętrznych: bez SQL, identyfikatorów miejsc, kont przeciwnika, skrótów tokenu, śladu stosu). Ten sam kształt dla wszystkich narzędzi (`join`, `get_state`, `play_move`).
- **Kody `play_move`:** `INVALID_INPUT` (zły typ/brak pola), `INVALID_TOKEN` (nieznany, wygasły, obcy token — jednolity), `ILLEGAL_MOVE` (pole zajęte — `reason: "cell_occupied"`; współrzędne poza planszą — `reason: "out_of_board"`; mapowane z `CELL_OCCUPIED` i `ValidationError` z `GameMoveService`), `NOT_YOUR_TURN`, `STALE_MOVE` (`moveNumber` nieaktualne), `GAME_NOT_STARTED`, `GAME_NOT_ACTIVE` (partia anulowana), `GAME_FINISHED`, `RATE_LIMITED` (`retryable: true`, `retryAfterMs`). Wewnętrzne nieoczekiwane błędy → `INTERNAL` bez szczegółów (HTTP 200 z `isError`, nie 5xx; 5xx zostaje dla awarii transportu).
- **Niezmienność stanu — inwarianty.** Dla każdego z kodów błędu powyżej: (1) żaden zapis do `games`, `game_players`, ruchów, zegarów (`clock_ms_*`, `turn_started_at`), statusu ani wyniku; (2) tura nie przechodzi; (3) kolejny `get_state` zwraca stan identyczny jak przed wywołaniem (z dokładnością do upływu czasu zegara biegnącego, który jest wyliczany, nie zapisywany). Dziś gwarantuje to kolejność w `GameMoveService.play`: wszystkie kontrole (status, tura, `moveNumber`, pole) są wykonywane pod blokadą wiersza partii **przed** jedynym zapisem (`MOVE_SQL`), a błąd wyrzucany w transakcji ją cofa; adapter MCP tylko mapuje wyjątek na kształt błędu i **nie może** dopisywać żadnych skutków ubocznych (np. odjęcia czasu za błędną próbę).
- **Wyjątek (do potwierdzenia, ⚠):** jeśli w chwili `play_move` czas strony na ruchu już upłynął, istniejące zachowanie (`TimeoutSettler.settleGame` pod blokadą) kończy partię przegraną na czasie i zwraca `GAME_FINISHED`. To jest zapis, ale nie skutek błędnego ruchu — jest to rozstrzygnięcie upływu czasu, które nastąpiłoby przy dowolnym odczycie (`get_state`, odczyt człowieka), idempotentne i niezależne od treści ruchu. Szkic zakłada, że to dopuszczalne i zgodne z BR-04/BR-07 (zegar bez wyjątków); alternatywa (błąd bez rozstrzygania, rozstrzygnięcie dopiero przy `get_state`) jest możliwa, ale tworzy dwie ścieżki zakończenia partii.
- **Równoległe ruchy:** dwa jednoczesne `play_move` z tym samym tokenem i tym samym `moveNumber`: dokładnie jeden zapis (blokada wiersza + warunkowy `UPDATE` wg `move_count`), drugi dostaje `STALE_MOVE` (lub `NOT_YOUR_TURN`), a stan końcowy równa się stanowi po jednym udanym ruchu; ponowienie **tego samego** ruchu po utraconej odpowiedzi zwraca stan (zachowanie `play`), nie błąd.
- **Testy (kontrakt dla #128, kryteria S02):** dla każdego kodu błędu test na PostgreSQL: migawka stanu (liczba ruchów, plansza, tura, `clock_ms_1/2`, `turn_started_at`, status, wynik) przed = po; dotyczy także `INVALID_TOKEN` i `INVALID_INPUT`; test współbieżny N równoległych ruchów (jeden poprawny, reszta błędnych/duplikatów) → stan równy stanowi po samym poprawnym; test jednolitego kształtu (`isError`, dokładny zestaw pól, brak pól spoza kontraktu); test braku danych wewnętrznych w komunikatach (np. brak „sql”, uuid przeciwnika, skrótu tokenu); test wyjątku rozstrzygnięcia czasu (jawnie oznaczony).

## 📝 Architecture

- **Nowe/zmienione elementy** (`planned`):
  - `@gomoku/core`: `PARTICIPANT_KINDS += 'agent'`, `PARTICIPANT_JOIN_CHANNELS = ['web','mcp']`, schematy Zod wejść narzędzi (`join`, `get_state`, `play_move`), stałe limitów MCP, typ `AgentGameState` (widok bez nazw).
  - `@gomoku/db`: migracja (#126), encja `GamePlayer` z kolumnami `agentTokenHash`, `joinChannel`; zmiana reguł `cleanup/rules.ts`.
  - `@gomoku/app`: `AgentSeatService` (dołączenie agenta, rozpoznanie tokenu → `GameParticipant`), trasa `api/mcp/route.ts` + moduł `server/mcp/` (budowa serwera MCP, mapowanie błędów na `isError`, limity), rejestracja w `container.ts`.
  - `@gomoku/ui`: wariant „Agent” w stories/komponentach partii i historii.
- **Reużyte (istnieją):** `GameMoveService.play`, `GameService.getState/stateOf`, `TimeoutSettler`, `InvitationService` (konsumpcja kodu w jednej transakcji z blokadami w ustalonej kolejności), `RateLimiter`, `clientKey`/`clientAddress`, `Clock`, `createOpaqueToken`/`hashOpaqueToken`, `normalizeInvitationCode`.
- **Kierunek zależności** bez zmian: `app → core, db, ui`; `core` bez Next/React/MikroORM; SDK MCP wyłącznie w `app`.

```mermaid
flowchart LR
  Agent[Klient MCP agenta] -- POST /api/mcp --> Route[route.ts: Origin, rozmiar, limity adresu]
  Route --> Tools[narzędzia join / get_state / play_move]
  Tools --> Seat[AgentSeatService (planowany)]
  Seat --> Inv[InvitationService (istnieje)]
  Tools --> Game[GameService / GameMoveService (istnieją)]
  Human[Przeglądarka człowieka] -- /api/games/id --> Game
  Game --> DB[(PostgreSQL: game_players.kind, agent_token_hash)]
```

Wniosek: agent i człowiek współdzielą jedną implementację gry; różni je tylko sposób rozpoznania uczestnika i kanał.

## 📝 Data Model (kontrakt dla #126)

Zmiany `game_players` (migracja addytywna, nazwa pliku z sufiksem, np. `Migration2026…_agent_participant.ts`; po `migration:create` usunąć obce instrukcje snapshotu — lekcja 2026-10-31):

| Kolumna / ograniczenie | Zmiana |
|---|---|
| `kind` | CHECK `game_players_kind_check`: `kind in ('account','guest','agent')` |
| `agent_token_hash` | nowa, `char(64)`, nullable, unikalna; CHECK `game_players_token_only_agent_check`: `kind = 'agent' or agent_token_hash is null`; CHECK `game_players_token_only_guest_check` bez zmian (`guest_token_hash` tylko dla gościa) |
| `join_channel` | nowa, `varchar(16)`, `NOT NULL DEFAULT 'web'`; CHECK `in ('web','mcp')`; CHECK spójności `(kind = 'agent') = (join_channel <> 'web')` |
| `game_players_agent_no_user_check` | `kind <> 'agent' or user_id is null` (i istniejący `nickname_only_guest` już wyklucza nick) |
| `agent_name` | nowa, `varchar(40)`, nullable; CHECK `game_players_agent_name_only_agent_check`: `agent_name is null or kind = 'agent'`; CHECK `game_players_agent_name_length_check`: `agent_name is null or char_length(agent_name) between 1 and 40` (decyzja 7) |
| istniejące wiersze | `kind` bez zmian (`account`/`guest`), `join_channel = 'web'` (default); żadnej migracji danych |
| `down` | usuwa nowe ograniczenia i kolumny; **przerywa**, jeśli istnieje wiersz `kind = 'agent'` |

**Reguły sprzątania (`packages/db/src/cleanup/rules.ts`) — znalezisko, bez którego wystąpi wyciek danych:** warunek „partie wyłącznie gości” to dziś `p.kind <> 'guest'`; partia gość + agent nie spełniałaby go i **nigdy by nie zniknęła**. Musi stać się `p.kind not in ('guest','agent')` (agent nie ma konta, więc nie ma historii, BR-24/BR-30). Dodać regułę zerującą `agent_token_hash` po `finished_at + 1 h` (obok `guestTokens`) i przypiąć obie do tego samego okna `GUEST_TOKEN_GRACE_MS`. Partia konto + agent zostaje (historia konta). Reguły `GUEST_TOKEN_VALID_SQL` użyte w `lazy-closing.ts`, `timeout-settler.ts`, `game-service.ts`, `rematch-service.ts`, `invitation-service.ts` przejrzeć pod kątem drugiej kolumny (grep `guest_token_hash` pokazuje komplet miejsc).

## 📝 API Contracts — minimalny kontrakt narzędzi MCP (dla #127/#128)

Jeden punkt: `POST /api/mcp` (JSON-RPC, rewizja protokołu 2026-07-28; wymagane nagłówki MCP). Tylko trzy narzędzia (`tools/list` je zwraca). Wszystkie wejścia walidowane Zod; nieznane pola odrzucane. Błąd wykonania narzędzia = wynik `isError: true` z `structuredContent.error = { code, message, retryable, retryAfterMs? }` (komunikaty po polsku, bez echa wejścia); błędy protokołu (zły JSON-RPC, `Origin` → `403`, ciało > 8 KB → `413`, `GET`/`DELETE` → `405`) według specyfikacji.

**`join`** — wejście `{ code: string, agentName?: string }` (kod `XXXX-XXXX` lub pełny link zaproszenia; normalizacja jak `normalizeInvitationCode`, link → ostatni segment ścieżki; `agentName` — opcjonalna deklarowana nazwa modelu, reguły w decyzji 7; opis narzędzia mówi wprost, że pole jest opcjonalne i niezweryfikowane). Kolejność walidacji: kształt wejścia → `agentName` → rezerwacja próby w puli `agent-lookup` → atomowe dołączenie.
Wyjście: `{ token, gameId, you: { seat: 2, color: "black"|"white" }, status: "active", opponent: { kind: "account"|"guest" }, expiresNote }` — `token` tylko tu. Odpowiedź **nie powtarza** `agentName`. Błędy: `INVALID_INVITATION` (uniwersalny: nieznany/zużyty/wygasły/anulowany kod), `ACTIVE_GAME_EXISTS` nie dotyczy (agent nie ma slotu), `RATE_LIMITED`, `INVALID_INPUT` (w tym niepoprawny `agentName`, bez echa wartości; kod zaproszenia pozostaje ważny).

**`get_state`** — wejście `{ token: string, waitSeconds?: 0..25, afterMove?: int >= 0 }`.
Wyjście:
```
{ status: "active"|"finished"|"cancelled",
  you: { seat, color }, opponent: { kind },
  turn: "you"|"opponent"|null,          // null poza active
  nextMoveNumber: int,                  // wartość dla play_move.moveNumber
  board: string[15],                    // wiersze y=0..14; znaki "." "B" "W"; x = kolumna 0..14
  moves: [{ n, x, y, color }],          // od afterMove
  clock: { youMs, opponentMs, runningSide: "you"|"opponent"|null, serverNow },
  result: null | { outcome: "win"|"loss"|"draw", reason: "five_in_row"|"timeout"|"resignation"|"draw", winLine?: [{x,y}] },
  retryAfterMs: int|null }
```
Zawsze zwraca stan także po zakończeniu (do końca okna tokenu). Błędy: `INVALID_TOKEN`, `RATE_LIMITED`, `INVALID_INPUT`. Zapis uboczny identyczny jak dziś w `GameService.getState` (leniwe zamknięcia, start zegara, rozstrzygnięcie czasu).

**`play_move`** — wejście `{ token, x: 0..14, y: 0..14, moveNumber: int 1..225 }` (`moveNumber` = `nextMoveNumber` ze stanu; chroni przed ruchem na nieaktualnej planszy i czyni ponowienie bezpiecznym, jak `moveCreateSchema`).
Wyjście: stan jak `get_state` (bez oczekiwania). Błędy — **jednolity kształt** `isError: true` + `structuredContent.error = { code, message, retryable, retryAfterMs? }`, kody: `ILLEGAL_MOVE` (pole zajęte, poza planszą; `reason`), `NOT_YOUR_TURN`, `STALE_MOVE`, `GAME_NOT_STARTED`, `GAME_NOT_ACTIVE`, `GAME_FINISHED`, `INVALID_TOKEN`, `INVALID_INPUT`, `RATE_LIMITED` (decyzja 8). **Każdy błąd pozostawia stan partii i zegary niezmienione** (tura nie przechodzi, brak zapisu; wyjątek rozstrzygnięcia upływu czasu — decyzja 8); ten sam ruch ponowiony po utraconej odpowiedzi zwraca stan, nie błąd (zachowanie `play`).

## 📝 UI/UX

Poza etykietą „Agent” (z opcjonalną deklarowaną nazwą modelu: „Agent · claude opus 5.5 (deklarowane)”, decyzja 7) brak nowego UI w S01: ekran partii (przeciwnik), ekran końca i historia pokazują tę etykietę (przez props) zamiast nicku. Stories do rozszerzenia: `packages/ui/docs/screens/partia.stories.tsx`, `historia.stories.tsx`, `game-screen.tsx`. Wskazówka „Jak podłączyć agenta” (adres `/api/mcp`, komenda `claude mcp add --transport http …`) to osobne zgłoszenie **#140** — poza zakresem tej specyfikacji. Wartości tylko z tokenów (`check:tokens`), 320 px i oba motywy.

## 📝 Edge Cases & Failure Scenarios

- Agent dołączył, ale nie wywołuje `get_state`: `join` ustawia `seen_at` agenta jak przy dołączeniu z przeglądarki (komentarz w `INSERT_GUEST_SQL`: dołączający „właśnie otworzył stronę”), więc 15-minutowy termin `READY_DEADLINE_MS` (Q21) jest spełniony po stronie agenta; zegar rusza, gdy twórca otworzy partię. Agent czarny zaczyna z biegnącym zegarem od razu — to ryzyko A-06.
- Zgubiony token (reset kontekstu) lub utracona odpowiedź `join`: partia aktywna bez sterowania; agent przegra na czasie, człowiek może się poddać. Bez odzysku (Q3) — świadomy koszt.
- Dwa klienty z tym samym tokenem: oba działają (jak dwie karty gościa); tura i `moveNumber` wymuszają spójność.
- Dwa równoległe `join` tym samym kodem: jedno wygrywa (`CONSUME_INVITATION_SQL`), drugie dostaje `INVALID_INVITATION` (wzorzec z E02-S08; test współbieżny na PostgreSQL).
- Kod zaproszenia przeznaczony dla człowieka-znajomego użyty przez agenta: dopuszczalne (posiadanie kodu = prawo dołączenia, BR-11); człowiek-twórca widzi „Agent”.
- Adres klienta nieznany w produkcji: fail-closed (`503 ADDRESS_UNAVAILABLE`), jak `clientKey`; poza produkcją wspólna pula `…:ip:local`.
- `join` z niepoprawnym `agentName`: `INVALID_INPUT`, kod zaproszenia i pula błędnych prób nietknięte; agent ponawia bez pola lub z poprawioną nazwą (decyzja 7).
- `play_move` z błędem w trakcie biegnącego zegara agenta: zegar nie jest cofany ani zatrzymywany przez błąd (ani nie jest karany); czas płynie jak dotąd (decyzja 8).
- Rozłączenie człowieka w trakcie: bez zmian względem dzisiejszych zasad (zegar biegnie).
- `get_state` z `waitSeconds` przerwane przez klienta (zamknięcie połączenia): serwer zatrzymuje pętlę przy najbliższej iteracji (sygnał `request.signal`); brak zapisu ubocznego poza leniwymi aktualizacjami.

## 📝 Risks & Impact Review

- **Trudno odwracalne:** nazwy narzędzi i kształt odpowiedzi (kontrakt zewnętrzny dla klientów agentów po wdrożeniu; zmiana = łamiąca → wersjonować przez nowe narzędzie/pole opcjonalne), wartość `agent` w `kind` (dane w bazie), identyfikator kolumn. Wartości limitów i `waitSeconds` łatwo zmienić (stałe w `core`).
- **Kierunek produktowy (nie defekt):** cała funkcja opiera się na A-04 (brak dowodu popytu) i A-06; koszt zasadności ponosi właściciel (zapis w rekordzie decyzji).
- **Zasięg wpływu:** `risk-high` dla #126 (schemat) i #127/#128 (nowa publiczna powierzchnia); plan wycofania: wyłączenie trasy `/api/mcp` (usunięcie pliku) bez ruszania danych; migracja `down` odmawia przy istniejących wierszach agenta.
- **Powierzchnia ataku:** publiczny punkt bez uwierzytelnienia transportu — kod 8-znakowy (alfabet 30 znaków ≈ 2^39) jest chroniony istniejącym limitem błędnych prób; token 256-bitowy nie jest zgadywalny.
- **Nowa powierzchnia tekstowa (`agentName`):** jedyny niezaufany tekst płynący od agenta do człowieka; ryzyka i środki w decyzji 7. Kształt błędu i kody `play_move` (decyzja 8) są częścią kontraktu zewnętrznego — po wydaniu zmiany tylko addytywne.
- **Zależność od zewnętrznej specyfikacji:** MCP szybko się zmienia (rewizja 2026-07-28 usunęła sesje i GET); SDK 2.x nie zweryfikowany w repo.

## 📝 Decisions in play

D-28 (MCP, partie prywatne, osobny typ), BR-30 (osobny typ uczestnika, bez zaproszeń/lobby/historii, etykieta „Agent”), BR-29/BR-22 (gość i token — wzór ważności), BR-04/D-05/BR-06/BR-07 (zegar bez wyjątku), BR-11/BR-13 (kod jednorazowy, jeden slot), BR-10, N-10 (bez przeciwnika hostowanego). Ta specyfikacja po zatwierdzeniu zamyka Q-09 wierszem **D-29** („tożsamość, token, transport, limity i deklarowana nazwa modelu klienta MCP”) i **nadpisuje BR-30 wierszem BR-31** (opcjonalna deklarowana nazwa modelu, rezerwacja nazwy konta „Agent”); wspólny rekord: `research/decisions/2026-10-31-mcp-agent-identity.md`. Właściciel: Bartosz Wójcik.

## 📋 Phasing

1. **Faza 0 (ta decyzja, #125):** decyzje właściciela zatwierdzone 2026-10-31; rekord decyzji, D-29/BR-31 w briefie, Q-09 closed — w tym PR-ze.
2. **Faza 1 (#126, T02):** migracja + encja + reguły sprzątania.
3. **Faza 2 (#127, S01):** `AgentSeatService.join`, uogólniony predykat tokenu, szkielet `/api/mcp` z narzędziem `join`, etykieta „Agent” (partia, koniec, historia), odmowy BR-30, rewanż niedostępny.
4. **Faza 3 (#128, S02):** `get_state` (+ `waitSeconds`), `play_move`, limity z tabeli, scenariusz integracyjny z klientem MCP.
5. **Faza 4 (#129, S03):** licznik wg pary typów (poza tą specyfikacją).

## 📋 Implementation Plan

Każdy krok: testy jednostkowe razem z kodem (100% pokrycia, bez `v8 ignore`), PostgreSQL tam, gdzie dotyka SQL, aplikacja działa po kroku.

**Faza 1 — #126**
0. (Rejestracja, #126/#127 — osobny krok z testami) Dodać `"agent"` do `RESERVED_DISPLAY_NAMES` w `register-schema.ts`; testy: „Agent”, „agent”, „AGENT”, „ agent ” (schemat przycina), „A_g-ent” (normalizacja usuwa `_`/`-`) → „Ta nazwa jest zastrzeżona.”; nazwa „Agentka” nadal dozwolona; przed wdrożeniem sprawdzić na bazie, czy istnieje konto o takiej nazwie (konflikt = decyzja właściciela, nie cicha zmiana).
1. Rozszerzyć `PARTICIPANT_KINDS` i dodać `PARTICIPANT_JOIN_CHANNELS` w `core` (testy typów/stałych); uzupełnić miejsca, które kompilator wskaże (history `OpponentKind`).
2. Encja `GamePlayer` (kolumny, w tym `agent_name`, CHECK-i) + `migration:create`; przeczytać plik, usunąć obce instrukcje snapshotu; migracja w górę i w dół na świeżym kontenerze i na bazie z danymi (wiersze gość/konto → `web`); test: `down` odmawia przy wierszu `agent`; testy każdego CHECK-a osobno (kolejność CHECK-ów, lekcja 2026-10-29).
3. `cleanup/rules.ts`: `not in ('guest','agent')`, reguła `agentTokens`; testy na PostgreSQL (gość+agent znika po oknie, konto+agent zostaje, hash wyzerowany).

**Faza 2 — #127**
4. Uogólnić `GUEST_TOKEN_VALID_SQL` → `PARTICIPANT_TOKEN_VALID_SQL(column)`; `GameService.findParticipant` dostaje wariant po `agentTokenHash`; test współbieżny i czasowy (granice 1 h).
5. `normalizeAgentName` w `core` (decyzja 7, pełna lista testów) i `AgentSeatService.join(code, agentName, guard, ctx)`: reużycie transakcji `InvitationService` (konsumpcja kodu, blokady, start gry) z wstawieniem wiersza `agent` (`INSERT … kind='agent', agent_token_hash, join_channel='mcp', seat 2, seen_at`); zwraca token. Testy: wyścig dwóch `join` (PostgreSQL), kod zużyty/wygasły/anulowany → `INVALID_INVITATION`, limit błędnych prób.
6. Szkielet `app/api/mcp/route.ts` + `server/mcp/`: kontrola `Origin` (403), limit rozmiaru, `GET`/`DELETE` → 405, narzędzie `join`, limity adresu (`clientKey`, fail-closed). **Spike w kroku 0:** potwierdzić pakiet i wersję SDK, `npm run build` (2 GB: `LOW_MEMORY=1`), `serverExternalPackages`, połączenie z Claude Code (`claude mcp add --transport http`) i ze starszym klientem; wynik zapisać w specyfikacji/PR.
7. Etykieta „Agent”: `game-view`, strony partii/końca, historia (`GameHistoryService`), rewanż → `REMATCH_UNAVAILABLE`; stories (`partia`, `historia`) w obu motywach; odmowy BR-30 (agent bez dostępu do zaproszeń/lobby — testy, że żadna trasa nie rozpoznaje tokenu agenta).
8. Scenariusz integracyjny (`tests/integration`): człowiek tworzy partię → klient MCP wykonuje `tools/call join` → partia `active`, człowiek widzi „Agent”.

**Faza 3 — #128**
9. `get_state`: widok bez nazw, `waitSeconds` z pętlą krótkich zapytań i anulowaniem, `retryAfterMs`; testy czasowe z fałszywym zegarem, brak transakcji trzymanej podczas oczekiwania.
10. `play_move`: delegacja do `GameMoveService.play`, mapowanie kodów na jednolity kształt błędu (decyzja 8), `INVALID_INPUT`; testy wszystkich kodów błędów, migawka stanu przed = po (w tym równoległe ruchy) i test wyjątku rozstrzygnięcia czasu.
11. Limity na token (`mcp-token:*`) i dołączenia (`mcp-join:ip`); testy `RATE_LIMITED`/`retryAfterMs`, fail-closed bez adresu w trybie produkcyjnym.
12. Scenariusz integracyjny pełnej partii przez klienta MCP (zwycięstwo, przegrana na czasie przy zerwanym kliencie, odmowa po końcu), plus logi serwera bez tokenu/kodu (test).

## 🧪 Granice dowodów

- **Zweryfikowane w kodzie (`origin/main`):** mechanizmy gościa, limitów, sprzątania, `GameService`/`GameMoveService`, schemat `game_players`; wniosek o regule sprzątania `<> 'guest'` pochodzi z lektury `cleanup/rules.ts`, nie z uruchomienia.
- **Zweryfikowane w sieci (2026-10-31):** rewizja MCP 2026-07-28 (transport Streamable HTTP, `Origin`, brak sesji, `405` dla GET/DELETE, autoryzacja opcjonalna, stdio bez OAuth); dokumentacja Claude Code (transport `http`, nagłówki, limity wyjścia i czasu narzędzi).
- **Zweryfikowane w kodzie (2026-10-31, dla decyzji 7–8):** `RESERVED_DISPLAY_NAMES` i `normalizeDisplayName` (rezerwacja „Agent” to jeden wpis + testy); kolejność kontroli i jedyny zapis w `GameMoveService.play` (kontrole pod blokadą przed `MOVE_SQL`; rozstrzygnięcie czasu przez `TimeoutSettler.settleGame`).
- **Niezweryfikowane:** dokładne API i wersja `@modelcontextprotocol/server` 2.x (wynik wyszukiwania, nie lektura dokumentacji SDK), zgodność ze starszymi klientami, zachowanie za naszym reverse proxy (limity czasu odczytu dla `waitSeconds`), wszystkie wartości liczbowe limitów (propozycje).

## Po decyzji

Decyzje zatwierdzone 2026-10-31. W tym PR-ze: rekord `research/decisions/2026-10-31-mcp-agent-identity.md`, wiersz D-29 i BR-31 w briefie, Q-09 `closed` → D-29. Dalej: kontrakty #126–#128 zgodne z tą specyfikacją (komentarze decyzji na #125, #128, #129); #139 (S01) przejmuje `agentName`, osobną pulę błędnych kodów i rezerwację nazwy „Agent”.

## Pytania do właściciela (nowe, niezablokujące)

1. **Rozstrzygnięcie upływu czasu przy błędnym `play_move`** (decyzja 8): zostawić dotychczasowe zachowanie (ruch po upływie czasu kończy partię przegraną na czasie i zwraca `GAME_FINISHED`; to jedyny zapis przy błędzie), czy zwracać błąd bez rozstrzygania i rozstrzygać dopiero przy `get_state`? Domyślnie: zostawić.
2. **Odrzucenie vs obcięcie `agentName`** i alfabet łaciński (decyzja 7): domyślnie odrzucenie; zmiana na tryb „obetnij do bezpiecznego” jest odwracalna.
3. **Lista wulgaryzmów dla `agentName` i nicku:** domyślnie brak w v1.
4. **Istniejące konto o nazwie „Agent”** (jeśli w bazie jest): zostawić (rezerwacja działa od teraz), czy wymusić zmianę nazwy?

## Źródła

- MCP, rewizja 2026-07-28: Transports — https://modelcontextprotocol.io/specification/latest/basic/transports ; Streamable HTTP — https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http ; Authorization — https://modelcontextprotocol.io/specification/latest/basic/authorization
- Claude Code, MCP — https://code.claude.com/docs/en/mcp
- SDK i wrapper (wyniki wyszukiwania, do weryfikacji): https://ts.sdk.modelcontextprotocol.io/v2/documents/Documents.Server_Guide.html ; https://github.com/vercel/mcp-handler

## Odstępstwa wdrożenia i dowody

Wdrożenie części dotyczącej S01 (dołączenie, tożsamość, token, transport, limity, `agentName`) opisuje sekcja „Odstępstwa wdrożenia i dowody” w [`2026-10-31-agent-joins-private-game.md`](2026-10-31-agent-joins-private-game.md) (spike SDK, tabela odstępstw, dowody, czego nie sprawdzono). Dotyczące tej decyzji: transport to `POST /api/mcp` w Next.js (opcja H) na `@modelcontextprotocol/server` 2.4.0; limit adresu jest HTTP `429`/`503` (przed odczytem ciała), limity dołączeń i błędnych kodów — błędami narzędzia; wartości limitów są konfigurowalne przez `MCP_*`. Poza wdrożeniem pozostają: `get_state`, `play_move`, `waitSeconds`, limit `mcp-token:*`, jednolity błąd `play_move` i test obciążeniowy puli połączeń (#128).
