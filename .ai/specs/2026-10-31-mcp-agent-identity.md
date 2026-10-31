# Tożsamość klienta MCP, token i limity nadużyć (E06-S01-T01, Q-09, #125)

> Status: **szkic do decyzji właściciela** (specyfikacja decyzyjna, autonomiczny szkic `om-auto-write-spec`). Nie zawiera kodu. Wartości liczbowe limitów, ważność tokenu, tożsamość i transport są **rekomendacjami do potwierdzenia** — kryterium #125 mówi, że liczby i uzasadnienie pochodzą od właściciela, więc każda z nich ma `⚠ NEEDS HUMAN CONFIRMATION`. Po decyzji: rekord w `.ai/specs/research/decisions/`, nowy wiersz D w briefie, Q-09 → closed (poza tym PR-em, patrz „Po decyzji”).
>
> Źródła: zgłoszenie #125 (epik #124, historyjki #126–#129), `.ai/specs/product-brief.md` (D-28, BR-30, BR-29, BR-22, BR-04, BR-06, BR-07, BR-10, BR-13, D-05, N-10, A-04…A-06, Q-01, Q-06, Q-09), `research/decisions/2026-10-31-agent-opponent.md`, kod na `origin/main` (49f4ad5): `guest-token.ts` (`GUEST_TOKEN_VALID_SQL`), `guest-cookie.ts`, `opaque-token.ts` (`createOpaqueToken`, `hashOpaqueToken`, `deriveRematchToken`), `client-address.ts` (`clientKey`, `TRUST_PROXY_HOPS`), `invitation-lookup.ts`, `GameService`, `GameMoveService`, `InvitationService`, `RematchService.claimGuestSeat`, `GET /api/games/[id]`, `packages/db/src/cleanup/rules.ts`, `game-player.ts`; `BACKWARD_COMPATIBILITY.md`; specyfikacje wdrożone `2026-10-30-guest-creates-game.md`, `2026-10-29-game-rematch.md`.

## 📝 TLDR

Dziś do partii wchodzi tylko człowiek: konto (sesja) albo gość (token jednej przeglądarki w ciasteczku, BR-29). Klient MCP nie ma ani sesji, ani ciasteczka (Q-09). **Rekomendacja (zachowanie przyszłe):** agent to osobny rodzaj uczestnika `agent` z własną kolumną skrótu tokenu, który dostaje token jednej partii w odpowiedzi na `join(kod)` (wymiana jednorazowego kodu zaproszenia na token), podaje go jako argument każdego kolejnego narzędzia i traci dostęp po końcu partii + 1 h (tak jak gość). Serwer MCP to **zdalny, bezstanowy punkt Streamable HTTP w aplikacji Next.js** (`POST /api/mcp`), bez OAuth, z tym samym zegarem, usługami i limitami po adresie/tokenie. Agent nie widzi żadnych nazw graczy (brak powierzchni dla prompt injection), nie ma pola tekstowego w stronę człowieka i nie ma żadnej drogi do zaproszeń, lobby ani historii. Dla #126, #127, #128 i #129 sekcja „Konsekwencje” podaje gotowy kontrakt.

## Resolved assumptions (autonomous defaults)

Brak pytań do właściciela, na które szkic mógłby odpowiedzieć sam — wszystko poniżej to **rekomendacja szkicu**; wiersze `⚠` trzymają PR jako draft.

| # | Pytanie | Zastosowane założenie (rekomendacja) | Dlaczego | Potwierdzenie |
|---|---|---|---|---|
| Q1 | Tożsamość klienta MCP | Nowy rodzaj uczestnika `agent` (`game_players.kind`), osobna kolumna `agent_token_hash`, kanał `join_channel = 'mcp'`; nie „gość z ciasteczkiem”. | BR-30/D-28; licznik musi odróżniać; separacja kanałów (token MCP nie działa w przeglądarce i odwrotnie). | ⚠ NEEDS HUMAN CONFIRMATION |
| Q2 | Skąd agent bierze token | Z odpowiedzi `join(kod)` (jednorazowy kod zaproszenia → token jednej partii, pokazany raz); dalej token jako argument narzędzi. Bez OAuth i bez nagłówka `Authorization` w v1. | Działa z każdym klientem MCP bez konfiguracji nagłówków; bez dodatkowego UI; MCP: autoryzacja jest opcjonalna. | ⚠ NEEDS HUMAN CONFIRMATION |
| Q3 | Ważność, odwołanie, rotacja | Jak token gościa: do końca partii + 1 h (`GUEST_TOKEN_GRACE_MS`), po zakończeniu tylko odczyt; unieważnia go zamknięcie partii bez gry i sprzątanie (`db:cleanup`). Bez rotacji i bez ponownego wydania. | Spójność z BR-29; mały zasięg wycieku; brak nowego mechanizmu. Cena: zgubiony token = utrata miejsca (zegar biegnie). | ⚠ NEEDS HUMAN CONFIRMATION |
| Q4 | Transport | Zdalny Streamable HTTP, bezstanowy, `POST /api/mcp` w `@gomoku/app`; stdio/CLI odłożone (E05). | Jeden proces, DI i baza bez zmian; klienci (Claude Code) łączą się adresem URL; brak instalacji. | ⚠ NEEDS HUMAN CONFIRMATION |
| Q5 | Limity nadużyć (wartości) | Na token 60 żądań/min; na adres 300 żądań/min (fail-closed w produkcji); dołączenia 10/h na adres; błędne kody zaproszeń — istniejąca pula (20/15 min na adres, 300 globalnie); ciało ≤ 8 KB. Liczba partii z agentem na człowieka = 1 (z BR-13). | Wartości z palety istniejących stałych i szacunku ruchu agenta; **wymyślone przez szkic**, bez danych (A-04/A-06). | ⚠ NEEDS HUMAN CONFIRMATION |
| Q6 | Długie odpytywanie | `get_state` ma opcjonalne `waitSeconds` (0–25, domyślnie 0): czeka na turę agenta lub koniec partii; odpowiedź ma `retryAfterMs`. | Bez tego model „kręci pętlę” i spala tokeny przez cały zegar 10 min (A-06); 25 s mieści się poniżej typowych limitów proxy. | ⚠ NEEDS HUMAN CONFIRMATION (wartość 25 s) |
| Q7 | Nazwy graczy dla agenta | `get_state` nie zwraca nicków ani nazw kont; tylko `opponent.kind`. | Zero niezaufanego tekstu w kontekście LLM; agent nie potrzebuje imienia. | odwracalne |
| Q8 | Rewanż z agentem | Niedostępny w v1 (`REMATCH_UNAVAILABLE`); brak narzędzia dla agenta. | Rewanż wymaga przekazania tokenu nowej partii (`claimGuestSeat`) — nowa powierzchnia; BR-30 nie wymaga. | odwracalne |
| Q9 | Narzędzie `resign` | Poza zakresem v1 (agent może zostawić zegar). | BR-30/S02 wymieniają trzy narzędzia; mniejsza powierzchnia. | odwracalne |
| Q10 | Kolumna kanału | `join_channel` (`web`/`mcp`) obok `kind`, z CHECK-iem spójności (`kind = 'agent'` ⇔ `join_channel <> 'web'`). | Literalnie wymaga tego #126; przy CLI (E05 #33) ten sam rodzaj `agent` dołączy innym kanałem. | odwracalne |
| Q11 | Gdzie ląduje `join` | Szkielet transportu + `join` w #127 (S01 wymaga dołączenia „przez MCP”); `get_state`, `play_move`, długie odpytywanie i limity ruchów w #128. | Każdy PR zostaje spójny i testowalny end-to-end. | odwracalne |
| Q12 | Pakiet MCP | `@modelcontextprotocol/server` 2.x (zod 4 jest już w repo) bezpośrednio, bez nakładki `mcp-handler`; wersję i zgodność z Claude Code potwierdza krok 0 planu. | Mniej warstw; **niezweryfikowane** w tym szkicu (patrz „Granice dowodów”). | odwracalne |

PR pozostaje draftem, dopóki właściciel nie potwierdzi Q1–Q6. Aby zmienić odpowiedź, edytuj tę specyfikację lub odpowiedz w #125.

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

Człowiek w przeglądarce jest ograniczony tempem; agent nie. Limity liczy istniejący `RateLimiter` (okno stałe w PostgreSQL, `hit`/`release`). Wartości poniżej to **propozycje szkicu bez danych** (⚠):

| Zasób | Klucz | Propozycja | Zachowanie po przekroczeniu |
|---|---|---|---|
| Żądania na token | `mcp-token:<sha256 tokenu>` | 60 / min | błąd narzędzia `RATE_LIMITED` z `retryAfterMs` (HTTP 200, `isError`) |
| Żądania na adres | `clientKey(headers, "mcp", config)` → `mcp:ip:<sha256>` | 300 / min (wszyscy agenci za jednym NAT-em dzielą pulę) | `RATE_LIMITED`; **fail-closed w produkcji**: nieznany adres (`TRUST_PROXY_HOPS`/nagłówek) → błąd `503 ADDRESS_UNAVAILABLE`, bez wspólnego licznika |
| Błędne kody zaproszeń | istniejące `lookupGuard` (`invitation-lookup:ip:…`, 20 / 15 min, globalnie 300) | bez zmian | `RATE_LIMITED` (jak w `accept`) |
| Udane dołączenia agenta | `mcp-join:ip:<sha256>` | 10 / h (wartość `CREATE_GAME_LIMIT`) | `RATE_LIMITED` |
| Aktywne partie z agentem na człowieka | brak nowego limitu | 1 — wynika z BR-13 (jeden slot na konto/przeglądarkę gościa); obejście przez wiele „gości” ogranicza `games-create-guest` (10 / h na adres) | `ACTIVE_GAME_EXISTS` po stronie człowieka |
| Rozmiar żądania | — | ciało ≤ 8 KB; `code` ≤ 64 znaki; `token` dokładnie 43 znaki base64url; `x`,`y` całkowite 0–14 | `INVALID_INPUT` |
| Szybkość `play_move` | — | brak osobnego limitu: tury wymuszają kolejność (`NOT_YOUR_TURN`), a natychmiastowy ruch jest legalny; nadużycie pokrywa limit na token | — |

- **Zerwanie klienta:** zegar nie jest zatrzymywany (D-05, BR-06). Przegrana na czasie jest rozstrzygana leniwie (`TimeoutSettler.settleExpired`) przy kolejnym odczycie — także przy odpytywaniu przez człowieka — więc zerwany agent nie blokuje partii. Brak „okresu karencji” dla agenta (decyzja właściciela: bez wyjątku). Opóźnienie modelu a zegar 10 min pozostaje A-06 (bez danych).
- **`get_state` i odpytywanie:** `waitSeconds` (0–25) wstrzymuje odpowiedź do tury agenta/końca partii/limitu czasu; w odpowiedzi zawsze `retryAfterMs` (podpowiedź odstępu, `null` po końcu). Wynik Q-01 dla agenta: **odpytywanie z długim oczekiwaniem wystarcza**, powiadomienia push nie są potrzebne (kryterium S02 „bez powiadomień push”); `subscriptions/listen` odłożone.
- **Czyszczenie:** wiersze `rate_limit_buckets` sprząta istniejąca reguła `db:cleanup`; klucze `mcp-token:*` mają ten sam cykl życia.

### Decyzja 5. Uprawnienia i etykieta

- **Zakres agenta = trzy narzędzia** (`join`, `get_state`, `play_move`). Brak narzędzi tworzenia zaproszeń, lobby, historii i konta — brak dostępu przez *nieobecność* (punkt MCP nie wystawia innych serwisów) oraz przez *twardą odmowę* w serwisach, które mogłyby dostać `agent` (rewanż: `REMATCH_UNAVAILABLE`; tworzenie partii/zaproszeń i lobby przyjmują tylko `account`/`guest`, więc `agent` kończy się `403`/typem w kompilacji).
- **Etykieta „Agent”:** `players[].kind = 'agent'`, `displayName = null`; UI mapuje rodzaj na tekst przez propsy (komponenty nie mają wbudowanych tekstów). `OpponentKind` (dziś `ParticipantKind | "agent"` w `core/src/games/history.ts`) upraszcza się do `ParticipantKind`; mapowanie etykiet jest już wyczerpujące, więc kompilator wskaże miejsca do uzupełnienia. Istniejące stories: `packages/ui/docs/screens/partia.stories.tsx`, `historia.stories.tsx` (oraz `game-screen.tsx`) — dołożyć wariant „Agent”; **makiety nie są potrzebne**.
- **Historia:** człowiek z kontem widzi „Agent” jako przeciwnika; agent nie ma konta ani historii (BR-30). Gra „gość + agent” nie zostaje w bazie po oknie 1 h (zmiana reguł sprzątania, niżej).
- **Licznik (S03, #129):** para typów z dwóch wierszy `game_players` zakończonej partii (`status = 'finished'`; nieukończone i anulowane poza licznikiem); „agent” = dołączył kanałem `mcp`, nie dowód, że to LLM.

### Decyzja 6. Bezpieczeństwo

- **Niezaufane pola:** jedyne pola tekstowe pochodzące od ludzi to nick gościa (≤ 24 znaki, znormalizowany, ograniczony alfabet — E02-S07) i `display_name` konta (≤ 24). **Rekomendacja: nie zwracać ich agentowi w ogóle** (Q7). Pozostałe pola `get_state` to liczby i enumeracje wygenerowane przez serwer. W opisach narzędzi dodać zdanie, że odpowiedzi zawierają wyłącznie dane gry, a nie instrukcje. Kierunek odwrotny: agent wysyła tylko `x`,`y` — brak tekstu do człowieka, więc nie wstrzyknie treści w jego UI.
- **Brak wycieku:** żadnych e-maili, `user_id`, identyfikatorów kont przeciwnika, kodów zaproszeń (kod nie wraca po `join`), skrótów tokenów. `gameId` (uuid) jest w odpowiedzi, bo jest jedynym uchwytem, nie sekretem.
- **Jednolite błędy:** nieznany/wygasły/obcy token → jedno `INVALID_TOKEN` (analogia do jednolitego `404`/`410`), bez potwierdzania istnienia partii.
- **Logowanie:** tylko nazwa narzędzia, wynik (kod błędu), czas i `gameId`; nigdy `token`, `code`, ciała żądań ani skróty tokenów; ciało nie trafia też do logów proxy (nie jest w URL). Błędy przechodzą przez istniejące `describe-error` bez treści wejścia.
- **Zgodność z `BACKWARD_COMPATIBILITY.md`:** nowa trasa i nowe kolumny są addytywne. Zmiana wymagająca uwagi: `ParticipantKind` (`@gomoku/core`) i `players[].kind` w `GET /api/games/[id]` zyskują wartość `agent` — „zmiana znaczenia zakresu wartości”. Ścieżka: ten sam PR aktualizuje konsumentów (UI, historia, `participant`), a wiersze `agent` powstają dopiero po wdrożeniu etykiety (#127), więc otwarte karty na starym kodzie ich nie zobaczą. Migracja jest *expand* (kolumny nullable/z domyślną, CHECK-i poszerzone); `down` **odmawia** wykonania, gdy istnieją wiersze `kind = 'agent'` (brak utraty danych, wymóg #126), z czytelnym komunikatem.

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
| istniejące wiersze | `kind` bez zmian (`account`/`guest`), `join_channel = 'web'` (default); żadnej migracji danych |
| `down` | usuwa nowe ograniczenia i kolumny; **przerywa**, jeśli istnieje wiersz `kind = 'agent'` |

**Reguły sprzątania (`packages/db/src/cleanup/rules.ts`) — znalezisko, bez którego wystąpi wyciek danych:** warunek „partie wyłącznie gości” to dziś `p.kind <> 'guest'`; partia gość + agent nie spełniałaby go i **nigdy by nie zniknęła**. Musi stać się `p.kind not in ('guest','agent')` (agent nie ma konta, więc nie ma historii, BR-24/BR-30). Dodać regułę zerującą `agent_token_hash` po `finished_at + 1 h` (obok `guestTokens`) i przypiąć obie do tego samego okna `GUEST_TOKEN_GRACE_MS`. Partia konto + agent zostaje (historia konta). Reguły `GUEST_TOKEN_VALID_SQL` użyte w `lazy-closing.ts`, `timeout-settler.ts`, `game-service.ts`, `rematch-service.ts`, `invitation-service.ts` przejrzeć pod kątem drugiej kolumny (grep `guest_token_hash` pokazuje komplet miejsc).

## 📝 API Contracts — minimalny kontrakt narzędzi MCP (dla #127/#128)

Jeden punkt: `POST /api/mcp` (JSON-RPC, rewizja protokołu 2026-07-28; wymagane nagłówki MCP). Tylko trzy narzędzia (`tools/list` je zwraca). Wszystkie wejścia walidowane Zod; nieznane pola odrzucane. Błąd wykonania narzędzia = wynik `isError: true` z `structuredContent.error = { code, message, retryable, retryAfterMs? }` (komunikaty po polsku, bez echa wejścia); błędy protokołu (zły JSON-RPC, `Origin` → `403`, ciało > 8 KB → `413`, `GET`/`DELETE` → `405`) według specyfikacji.

**`join`** — wejście `{ code: string }` (kod `XXXX-XXXX` lub pełny link zaproszenia; normalizacja jak `normalizeInvitationCode`, link → ostatni segment ścieżki).
Wyjście: `{ token, gameId, you: { seat: 2, color: "black"|"white" }, status: "active", opponent: { kind: "account"|"guest" }, expiresNote }` — `token` tylko tu. Błędy: `INVALID_INVITATION` (uniwersalny: nieznany/zużyty/wygasły/anulowany kod), `ACTIVE_GAME_EXISTS` nie dotyczy (agent nie ma slotu), `RATE_LIMITED`, `INVALID_INPUT`.

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
Wyjście: stan jak `get_state` (bez oczekiwania). Błędy (kody z `GameMoveService`): `NOT_YOUR_TURN`, `CELL_OCCUPIED`, `STALE_MOVE`, `GAME_NOT_STARTED`, `GAME_NOT_ACTIVE`, `GAME_FINISHED`; ponadto `INVALID_INPUT` (poza planszą), `INVALID_TOKEN`, `RATE_LIMITED`. Błąd nie zmienia stanu; ten sam ruch ponowiony po utraconej odpowiedzi zwraca `200` ze stanem (zachowanie `play`).

## 📝 UI/UX

Poza etykietą „Agent” brak nowego UI w S01: ekran partii (przeciwnik), ekran końca i historia pokazują tekst „Agent” (przez props) zamiast nicku. Stories do rozszerzenia: `packages/ui/docs/screens/partia.stories.tsx`, `historia.stories.tsx`, `game-screen.tsx`. Strona dla człowieka może zawierać krótką wskazówkę „Jak podłączyć agenta” (adres `/api/mcp`, komenda `claude mcp add --transport http …`) — **decyzja produktowa poza zakresem** tej specyfikacji (zgłosić w #127). Wartości tylko z tokenów (`check:tokens`), 320 px i oba motywy.

## 📝 Edge Cases & Failure Scenarios

- Agent dołączył, ale nie wywołuje `get_state`: `join` ustawia `seen_at` agenta jak przy dołączeniu z przeglądarki (komentarz w `INSERT_GUEST_SQL`: dołączający „właśnie otworzył stronę”), więc 15-minutowy termin `READY_DEADLINE_MS` (Q21) jest spełniony po stronie agenta; zegar rusza, gdy twórca otworzy partię. Agent czarny zaczyna z biegnącym zegarem od razu — to ryzyko A-06.
- Zgubiony token (reset kontekstu) lub utracona odpowiedź `join`: partia aktywna bez sterowania; agent przegra na czasie, człowiek może się poddać. Bez odzysku (Q3) — świadomy koszt.
- Dwa klienty z tym samym tokenem: oba działają (jak dwie karty gościa); tura i `moveNumber` wymuszają spójność.
- Dwa równoległe `join` tym samym kodem: jedno wygrywa (`CONSUME_INVITATION_SQL`), drugie dostaje `INVALID_INVITATION` (wzorzec z E02-S08; test współbieżny na PostgreSQL).
- Kod zaproszenia przeznaczony dla człowieka-znajomego użyty przez agenta: dopuszczalne (posiadanie kodu = prawo dołączenia, BR-11); człowiek-twórca widzi „Agent”.
- Adres klienta nieznany w produkcji: fail-closed (`503 ADDRESS_UNAVAILABLE`), jak `clientKey`; poza produkcją wspólna pula `…:ip:local`.
- Rozłączenie człowieka w trakcie: bez zmian względem dzisiejszych zasad (zegar biegnie).
- `get_state` z `waitSeconds` przerwane przez klienta (zamknięcie połączenia): serwer zatrzymuje pętlę przy najbliższej iteracji (sygnał `request.signal`); brak zapisu ubocznego poza leniwymi aktualizacjami.

## 📝 Risks & Impact Review

- **Trudno odwracalne:** nazwy narzędzi i kształt odpowiedzi (kontrakt zewnętrzny dla klientów agentów po wdrożeniu; zmiana = łamiąca → wersjonować przez nowe narzędzie/pole opcjonalne), wartość `agent` w `kind` (dane w bazie), identyfikator kolumn. Wartości limitów i `waitSeconds` łatwo zmienić (stałe w `core`).
- **Kierunek produktowy (nie defekt):** cała funkcja opiera się na A-04 (brak dowodu popytu) i A-06; koszt zasadności ponosi właściciel (zapis w rekordzie decyzji).
- **Zasięg wpływu:** `risk-high` dla #126 (schemat) i #127/#128 (nowa publiczna powierzchnia); plan wycofania: wyłączenie trasy `/api/mcp` (usunięcie pliku) bez ruszania danych; migracja `down` odmawia przy istniejących wierszach agenta.
- **Powierzchnia ataku:** publiczny punkt bez uwierzytelnienia transportu — kod 8-znakowy (alfabet 30 znaków ≈ 2^39) jest chroniony istniejącym limitem błędnych prób; token 256-bitowy nie jest zgadywalny.
- **Zależność od zewnętrznej specyfikacji:** MCP szybko się zmienia (rewizja 2026-07-28 usunęła sesje i GET); SDK 2.x nie zweryfikowany w repo.

## 📝 Decisions in play

D-28 (MCP, partie prywatne, osobny typ), BR-30 (osobny typ uczestnika, bez zaproszeń/lobby/historii, etykieta „Agent”), BR-29/BR-22 (gość i token — wzór ważności), BR-04/D-05/BR-06/BR-07 (zegar bez wyjątku), BR-11/BR-13 (kod jednorazowy, jeden slot), BR-10, N-10 (bez przeciwnika hostowanego). Ta specyfikacja **niczego nie nadpisuje**; po akceptacji zamyka Q-09 nowym wierszem D (np. „D-29: tożsamość, token i limity klienta MCP”) — numer nadaje właściciel. Właściciel: Bartosz Wójcik.

## 📋 Phasing

1. **Faza 0 (ta decyzja, #125):** akceptacja Q1–Q6, rekord decyzji, wiersz D, Q-09 closed.
2. **Faza 1 (#126, T02):** migracja + encja + reguły sprzątania.
3. **Faza 2 (#127, S01):** `AgentSeatService.join`, uogólniony predykat tokenu, szkielet `/api/mcp` z narzędziem `join`, etykieta „Agent” (partia, koniec, historia), odmowy BR-30, rewanż niedostępny.
4. **Faza 3 (#128, S02):** `get_state` (+ `waitSeconds`), `play_move`, limity z tabeli, scenariusz integracyjny z klientem MCP.
5. **Faza 4 (#129, S03):** licznik wg pary typów (poza tą specyfikacją).

## 📋 Implementation Plan

Każdy krok: testy jednostkowe razem z kodem (100% pokrycia, bez `v8 ignore`), PostgreSQL tam, gdzie dotyka SQL, aplikacja działa po kroku.

**Faza 1 — #126**
1. Rozszerzyć `PARTICIPANT_KINDS` i dodać `PARTICIPANT_JOIN_CHANNELS` w `core` (testy typów/stałych); uzupełnić miejsca, które kompilator wskaże (history `OpponentKind`).
2. Encja `GamePlayer` (kolumny, CHECK-i) + `migration:create`; przeczytać plik, usunąć obce instrukcje snapshotu; migracja w górę i w dół na świeżym kontenerze i na bazie z danymi (wiersze gość/konto → `web`); test: `down` odmawia przy wierszu `agent`; testy każdego CHECK-a osobno (kolejność CHECK-ów, lekcja 2026-10-29).
3. `cleanup/rules.ts`: `not in ('guest','agent')`, reguła `agentTokens`; testy na PostgreSQL (gość+agent znika po oknie, konto+agent zostaje, hash wyzerowany).

**Faza 2 — #127**
4. Uogólnić `GUEST_TOKEN_VALID_SQL` → `PARTICIPANT_TOKEN_VALID_SQL(column)`; `GameService.findParticipant` dostaje wariant po `agentTokenHash`; test współbieżny i czasowy (granice 1 h).
5. `AgentSeatService.join(code, guard, ctx)`: reużycie transakcji `InvitationService` (konsumpcja kodu, blokady, start gry) z wstawieniem wiersza `agent` (`INSERT … kind='agent', agent_token_hash, join_channel='mcp', seat 2, seen_at`); zwraca token. Testy: wyścig dwóch `join` (PostgreSQL), kod zużyty/wygasły/anulowany → `INVALID_INVITATION`, limit błędnych prób.
6. Szkielet `app/api/mcp/route.ts` + `server/mcp/`: kontrola `Origin` (403), limit rozmiaru, `GET`/`DELETE` → 405, narzędzie `join`, limity adresu (`clientKey`, fail-closed). **Spike w kroku 0:** potwierdzić pakiet i wersję SDK, `npm run build` (2 GB: `LOW_MEMORY=1`), `serverExternalPackages`, połączenie z Claude Code (`claude mcp add --transport http`) i ze starszym klientem; wynik zapisać w specyfikacji/PR.
7. Etykieta „Agent”: `game-view`, strony partii/końca, historia (`GameHistoryService`), rewanż → `REMATCH_UNAVAILABLE`; stories (`partia`, `historia`) w obu motywach; odmowy BR-30 (agent bez dostępu do zaproszeń/lobby — testy, że żadna trasa nie rozpoznaje tokenu agenta).
8. Scenariusz integracyjny (`tests/integration`): człowiek tworzy partię → klient MCP wykonuje `tools/call join` → partia `active`, człowiek widzi „Agent”.

**Faza 3 — #128**
9. `get_state`: widok bez nazw, `waitSeconds` z pętlą krótkich zapytań i anulowaniem, `retryAfterMs`; testy czasowe z fałszywym zegarem, brak transakcji trzymanej podczas oczekiwania.
10. `play_move`: delegacja do `GameMoveService.play`, mapowanie kodów, `INVALID_INPUT`; testy wszystkich kodów błędów i braku zmiany stanu.
11. Limity na token (`mcp-token:*`) i dołączenia (`mcp-join:ip`); testy `RATE_LIMITED`/`retryAfterMs`, fail-closed bez adresu w trybie produkcyjnym.
12. Scenariusz integracyjny pełnej partii przez klienta MCP (zwycięstwo, przegrana na czasie przy zerwanym kliencie, odmowa po końcu), plus logi serwera bez tokenu/kodu (test).

## 🧪 Granice dowodów

- **Zweryfikowane w kodzie (`origin/main`):** mechanizmy gościa, limitów, sprzątania, `GameService`/`GameMoveService`, schemat `game_players`; wniosek o regule sprzątania `<> 'guest'` pochodzi z lektury `cleanup/rules.ts`, nie z uruchomienia.
- **Zweryfikowane w sieci (2026-10-31):** rewizja MCP 2026-07-28 (transport Streamable HTTP, `Origin`, brak sesji, `405` dla GET/DELETE, autoryzacja opcjonalna, stdio bez OAuth); dokumentacja Claude Code (transport `http`, nagłówki, limity wyjścia i czasu narzędzi).
- **Niezweryfikowane:** dokładne API i wersja `@modelcontextprotocol/server` 2.x (wynik wyszukiwania, nie lektura dokumentacji SDK), zgodność ze starszymi klientami, zachowanie za naszym reverse proxy (limity czasu odczytu dla `waitSeconds`), wszystkie wartości liczbowe limitów (propozycje).

## Po decyzji (poza tym PR-em)

Właściciel potwierdza lub zmienia Q1–Q6 → zapis `research/decisions/YYYY-MM-DD-mcp-client-identity.md` (opcje, odrzucone alternatywy, wartości limitów **jako jego decyzja**), nowy wiersz D w briefie, Q-09 `closed` z odnośnikiem; aktualizacja kontraktów w #126–#128 jeśli wartości się zmienią.

## Źródła

- MCP, rewizja 2026-07-28: Transports — https://modelcontextprotocol.io/specification/latest/basic/transports ; Streamable HTTP — https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http ; Authorization — https://modelcontextprotocol.io/specification/latest/basic/authorization
- Claude Code, MCP — https://code.claude.com/docs/en/mcp
- SDK i wrapper (wyniki wyszukiwania, do weryfikacji): https://ts.sdk.modelcontextprotocol.io/v2/documents/Documents.Server_Guide.html ; https://github.com/vercel/mcp-handler
