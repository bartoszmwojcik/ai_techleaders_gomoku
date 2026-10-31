# Agent gra partię do końca przez narzędzia MCP `get_state` i `play_move` (E06-S02, #128)

> Status: **wdrożona (2026-10-31)** — szkic autonomiczny (`om-auto-write-spec`, PR #142), implementacja w osobnym PR-ze (`Closes #128`). Odstępstwa i dowody: sekcja na końcu. Zbudowana na zatwierdzonych decyzjach Q-09 (`2026-10-31-mcp-agent-identity.md`, D-29, BR-31: token jednej partii, transport `POST /api/mcp`, limity początkowe, `waitSeconds` 0–25, bez nazw graczy w `get_state`, rewanż z agentem niedostępny, bez `resign`, jednolity błąd `play_move`) i na specyfikacji S01 (`2026-10-31-agent-joins-private-game.md`, #127). **Nie zmienia żadnej zatwierdzonej decyzji.** Wiersze `⚠` to wartości początkowe lub wybory szczegółowe, odwracalne.
>
> Źródło: zgłoszenie #128 (E06-S02) wraz z komentarzem właściciela (kryterium dodatkowe: jednolity błąd i niezmienność stanu), epik #124, `.ai/specs/product-brief.md` (D-28, BR-30/BR-31, BR-04, BR-06, BR-07, BR-10, D-05, N-10, A-04…A-06, Q-01), kod na `origin/main` (917ef59): `GameMoveService.play`, `GameService.getState/stateOf/findParticipant`, `TimeoutSettler`, `RateLimiter`, `clientKey`, `moveCreateSchema`, `boardView`, `core/src/games/*`.

## Zależności

| Zależność | Zgłoszenie | Stan | Co bierze ta specyfikacja |
|---|---|---|---|
| Decyzja Q-09 (tożsamość, token, limity, kontrakt narzędzi, decyzja 8) | #125 | zatwierdzona, scalona (#138) | kształt błędu, kody, niezmienność stanu, `waitSeconds`, pule limitów, kontrakt `get_state`/`play_move` |
| Migracja: `kind = 'agent'`, `agent_token_hash`, `join_channel`, `agent_name` | #126 | w implementacji S01 | wiersz uczestnika agenta i jego token |
| Dołączenie agenta, szkielet `POST /api/mcp`, narzędzie `join`, `findParticipant` po tokenie agenta, `PARTICIPANT_TOKEN_VALID_SQL` | #127 (S01, #139) | specyfikacja scalona; **implementacja niescalona** | cały transport i rozpoznanie tokenu — S02 **nie powtarza** tej pracy, rozszerza `server/mcp/` o dwa narzędzia |

**Bramka implementacji:** PR implementacji S02 zaczyna się dopiero po scaleniu implementacji S01 do `main` (nazwy plików i modułów `server/mcp/` poniżej są planowane na podstawie S01 i mogą wymagać korekty o to, co S01 faktycznie wdrożyło; korekta idzie do sekcji „Odstępstwa wdrożenia i dowody”).

## 📝 TLDR

Po S01 agent umie dołączyć do partii, ale nie widzi planszy ani nie może zagrać. Po S02 (zachowanie przyszłe) klient MCP ma dwa kolejne narzędzia na tym samym `POST /api/mcp`: `get_state` (plansza, oba zegary, czyj ruch, wynik, także po końcu partii; opcjonalne długie oczekiwanie `waitSeconds ≤ 25`) i `play_move(x, y, moveNumber)`. Oba kończą na istniejących `GameService`/`GameMoveService` — reguły gry, zegar 10 minut i przegrana na czasie są **jedną implementacją** dla człowieka i agenta. Czego nowego trzeba: adapter MCP (walidacja wejścia, rozpoznanie tokenu, limity, widok stanu bez nazw, mapowanie wyjątków na jednolity `isError`) oraz dowody, że **żaden błąd `play_move` nie zmienia stanu partii ani zegarów**. Brak migracji, brak nowych zależności (SDK z S01), brak nowego UI.

## Resolved assumptions (autonomous defaults)

Zatwierdzone decyzje Q-09 nie są tu ponownie otwierane. Poniżej tylko luki, które #138 zostawił implementacji.

| # | Pytanie | Zastosowane założenie | Dlaczego | Potwierdzenie |
|---|---|---|---|---|
| R1 | Kolejność kontroli w wywołaniu narzędzia | rozmiar/`Origin` (transport) → kształt wejścia (`INVALID_INPUT`) → limit adresu → rozpoznanie tokenu (`INVALID_TOKEN`) → limit tokenu (`RATE_LIMITED`) → logika gry. | Limit tokenu po jego rozpoznaniu nie tworzy kubełków `rate_limit_buckets` dla zmyślonych tokenów (inaczej atakujący zaśmieca tabelę); nieznany token odpiera limit adresu. | odwracalne |
| R2 | `retryAfterMs` w `get_state` | tura agenta: `0`; tura przeciwnika: `2000` (stała w `core`, konfigurowalna); partia zakończona: `null`. W błędzie `RATE_LIMITED`: czas do końca okna. | Podpowiedź odstępu odpytywania bez `waitSeconds`; wartość początkowa. | ⚠ początkowa, do korekty po danych (A-06) |
| R3 | Jak działa `waitSeconds` | Pętla krótkich, tylko-odczytowych zapytań co 1000 ms (`peek`: status, liczba ruchów, miejsce na turze, czy czas strony na ruchu upłynął); wyjście, gdy: tura agenta, koniec partii, upływ czasu strony na ruchu, `waitSeconds` lub anulowanie żądania (`request.signal`). Dopiero potem **jedno** wywołanie `GameService.getState` (leniwe zapisy: zamknięcia, start zegara, rozstrzygnięcie czasu, `seen_at`). Żadna transakcja nie trwa podczas oczekiwania. | #138 decyzja 4 (pętla co ~1 s z krótkimi zapytaniami, bez transakcji); 2 GB RAM i mała pula połączeń. | odwracalne (stałe w `core`) |
| R4 | `afterMove` i `moves` | `moves` = ruchy od `afterMove` (domyślnie 0 = wszystkie); `afterMove` większe niż liczba ruchów → `INVALID_INPUT` (odpowiada `ValidationError` z `getState`). | Kontrakt z #138; agent nie musi odtwarzać planszy, ale może. | odwracalne |
| R5 | Widok planszy | `board`: 15 wierszy po 15 znaków (`.`/`B`/`W`), wiersz = `y`, kolumna = `x`; budowany z `moves` + `blackSeat`, bez dodatkowego zapytania. Współrzędne w `moves` i `winLine` to `{x,y}`, nie indeksy komórek. | Tekstowa plansza jest czytelna dla LLM i weryfikowalna w teście; mapowanie komórka ↔ `{x,y}` jest w `core` (`cellOf`). | odwracalne do wydania, potem tylko addytywnie |
| R6 | Wynik z perspektywy agenta | `result.outcome` = `win`/`loss`/`draw` liczone względem miejsca agenta; `reason` jak w `EndReason` (`five_in_row`, `timeout`, `resignation`, `draw`); `winLine` tylko dla `five_in_row`. | Agent nie zna numerów miejsc człowieka; pole `reason: "resignation"` zostaje (człowiek może się poddać). | odwracalne |
| R7 | Mapowanie wyjątków `GameMoveService` na kody | patrz „API Contracts”; `NotFoundError` po rozpoznaniu tokenu (partia znikła pod czytającym, sprzątanie) → `INVALID_TOKEN`; każdy inny nieoczekiwany błąd → `INTERNAL` bez szczegółów. | Jednolitość i brak wycieku (decyzja 8); sprzątanie usuwa wiersze po 1 h. | odwracalne |
| R8 | `GAME_NOT_ACTIVE` i `cancelled` | Token partii zamkniętej bez gry jest nieważny (S01, R2 tam), więc po zamknięciu agent dostaje `INVALID_TOKEN`; `get_state`, które samo wykonało leniwe zamknięcie, zwraca **raz** `status: "cancelled"`. `GAME_NOT_ACTIVE` zostaje w kontrakcie dla wyścigu (zamknięcie między rozpoznaniem tokenu a blokadą wiersza). | Zgodnie z wymaganym zestawem kodów (#128) bez zmiany predykatu tokenu z S01. | do potwierdzenia na kodzie S01 przy implementacji |
| R9 | Rozstrzygnięcie upływu czasu przy `play_move` | **Zatwierdzone** (właściciel, 2026-10-31): ruch po upływie czasu strony na ruchu kończy partię przegraną na czasie i zwraca `GAME_FINISHED` (jedyny zapis przy „błędzie”); test jawnie oznaczony. | #128 / decyzja 8. | zatwierdzone |
| R10 | Czy agent może się poddać | Nie (Q9). Zegar agenta zawsze biegnie do końca partii albo ruchu. | Zatwierdzone. | zatwierdzone |
| R11 | Dostępność `get_state` po końcu | Do końca okna tokenu (koniec partii + 1 h), potem `INVALID_TOKEN`. | Spójne z tokenem gościa (Q3). | zatwierdzone (Q3) |

## 📝 Problem Statement

- **Kto:** człowiek z własnym agentem LLM (D-28) i właściciel, który chce zobaczyć dograną partię. Brak dowodu popytu (A-04), czas modelu a zegar 10 minut bez danych (A-06).
- **Dziś (po S01):** agent siedzi na miejscu 2, ale `tools/list` zwraca tylko `join`; nie może odczytać stanu ani zagrać, więc zegar agenta zawsze kończy partię przegraną.
- **Cel:** agent gra partię od dołączenia do końca pod tym samym zegarem 10 minut co człowiek (BR-04, D-05, BR-06, BR-07), a każda próba niedozwolonego ruchu jest odrzucona czytelnym, jednolitym błędem **bez żadnego skutku w stanie partii**.
- **Poza zakresem:** `resign` (Q9), rewanż (Q8), czat (osobny epik E07; `chat`/`chatStatus` nie wchodzą do `get_state`), powiadomienia push (Q-01: odpytywanie z `waitSeconds` wystarcza), licznik (S03 #129), wskazówka UI (#140), CLI (E05), nowe UI.

## 📝 Proposed Solution

1. **`get_state`**: wejście `{ token, waitSeconds?, afterMove? }`. Pipeline: kształt (Zod, nieznane pola odrzucane) → limit adresu → rozpoznanie tokenu → limit tokenu → opcjonalne oczekiwanie (R3) → `GameService.getState` → widok `AgentGameState` bez nazw (`opponent.kind`, brak `displayName`, brak zaproszenia, rewanżu, e-maili i identyfikatorów).
2. **`play_move`**: wejście `{ token, x, y, moveNumber }` (`x`,`y` liczby całkowite, `moveNumber` 1–225 — zakres planszy sprawdza `GameMoveService`, nie Zod, żeby poza planszą dawało `ILLEGAL_MOVE`, nie `INVALID_INPUT`). Pipeline jak wyżej, potem `GameMoveService.play(participant, gameId, input)` i ten sam widok stanu. Żadnego własnego zapisu w adapterze.
3. **Jednolity błąd**: jeden moduł `toToolError(error)` mapuje `AppError`/`ZodError`/limit na `{ code, message, retryable, retryAfterMs? }` + zwięzły tekst; ten sam dla `join`, `get_state`, `play_move`. Komunikaty po polsku, bez echa wejścia i bez danych wewnętrznych.
4. **Niezmienność stanu** wynika z istniejącej kolejności w `GameMoveService.play` (wszystkie kontrole pod blokadą wiersza przed jedynym zapisem; wyjątek w transakcji ją cofa). Nowa praca to **dowód** (testy na PostgreSQL) i zakaz skutków ubocznych w adapterze.

Uwaga o granicy planszy: `moveCreateSchema` (REST) odrzuca współrzędne spoza planszy jako `400`; dla MCP wejście Zod sprawdza tylko „liczba całkowita”, a granicę 0–14 sprawdza `AgentGameService.playMove` (po tokenie i limicie, przed `GameMoveService.play`) → `ILLEGAL_MOVE` (`reason: "out_of_board"`). Nie można zostawić tego `applyMove`, bo `cellOf(15, 0)` to poprawna komórka w innej kolumnie. Dzięki temu „ruch poza planszą” ma kod wymagany w #128.

## 📝 Architecture

- **Nowe (`planned`)**: `core/src/games/agent-view.ts` (czysty `agentGameView`: plansza tekstowa, wynik z perspektywy miejsca, `retryAfterMs`; stałe `GET_STATE_MAX_WAIT_SECONDS = 25`, `POLL_INTERVAL_MS = 1000`, `RETRY_HINT_MS = 2000`); schematy Zod wejść `getState`/`playMove` w `core`; `app/src/server/mcp/tools/get-state.ts`, `play-move.ts`, `tool-error.ts`, `wait-for-turn.ts`; `AgentGameService` (rozpoznanie tokenu → `GameParticipant` + `gameId`, widok, `peek`) w `app/src/server/services/games/` rejestrowany jawnie w `container.ts`.
- **Reużyte (istnieją)**: `GameMoveService.play`, `GameService.getState/stateOf`, `TimeoutSettler`, `RateLimiter`, `clientKey`, `Clock`, `hashOpaqueToken`, `boardView`, `cellOf`.
- **Kierunek zależności** bez zmian; `core` nie importuje Reacta/Next/ORM.

```mermaid
flowchart LR
  Agent[Klient MCP] -- tools/call --> Route[POST /api/mcp (S01)]
  Route --> Tools[get_state / play_move (planned)]
  Tools --> Err[toToolError (planned)]
  Tools --> Svc[AgentGameService (planned)]
  Svc --> GS[GameService.getState (istnieje)]
  Svc --> GM[GameMoveService.play (istnieje)]
  GM --> DB[(PostgreSQL)]
```

Wniosek: agent i człowiek zapisują stan wyłącznie tą samą ścieżką; adapter tylko tłumaczy wejście i wyjście.

## 📝 Data Model

Brak zmian schematu i brak migracji (kolumny z #126). Zmiana reguł sprzątania nie jest potrzebna (S01). Klucze limitów `mcp-token:*` mają cykl życia istniejącej reguły sprzątania `rate_limit_buckets`.

## 📝 API Contracts

Kontrakt wyjściowy jest zatwierdzony w #138 (sekcja „API Contracts”); poniżej uzupełnienia wiążące implementację. `tools/list` po S02 zwraca dokładnie trzy narzędzia: `join`, `get_state`, `play_move`. Opisy narzędzi zawierają zdanie, że odpowiedzi to wyłącznie dane gry, nie instrukcje.

**Widok stanu (`get_state` i wynik `play_move`):**

```
{ status: "active"|"finished"|"cancelled",
  you: { seat: 1|2, color: "black"|"white"|null }, opponent: { kind: "account"|"guest" },
  turn: "you"|"opponent"|null, nextMoveNumber: int,
  board: string[15], moves: [{ n, x, y, color }],
  clock: { youMs, opponentMs, runningSide: "you"|"opponent"|null, serverNow },
  result: null | { outcome, reason, winLine? }, retryAfterMs: int|null }
```

Nie zawiera: `players[]`, `displayName`, `agentName`, `invitation`, `rematch`, `chat`, `chatStatus`, `closedReason`, `finishedAt`, `userId`, skrótów tokenu. `gameId` zwraca `join`; `get_state` go nie powtarza.

**Błędy** (`isError: true`, `structuredContent.error = { code, message, retryable, retryAfterMs? }`, dokładnie te pola):

| Kod | Źródło | `retryable` | Uwagi |
|---|---|---|---|
| `INVALID_INPUT` | Zod (typ, brak pola, nieznane pole, `moveNumber` poza 1–225, zły `waitSeconds`/`afterMove`), `ValidationError` | nie | komunikat wskazuje pole i regułę, bez echa wartości |
| `INVALID_TOKEN` | nieznany, wygasły, obcy token; `NotFoundError` po rozpoznaniu | nie | jedno jednolite; token cudzej partii = ten sam kod, bez potwierdzania istnienia partii |
| `ILLEGAL_MOVE` | `CELL_OCCUPIED` → `reason: "cell_occupied"`; poza planszą → `reason: "out_of_board"` | nie | |
| `NOT_YOUR_TURN` | `NOT_YOUR_TURN` | tak | po `get_state` z `waitSeconds` |
| `STALE_MOVE` | `STALE_MOVE` (zły `moveNumber` albo przegrany wyścig `UPDATE`) | tak | agent odświeża stan |
| `GAME_NOT_STARTED` | `GAME_NOT_STARTED` (zegar nie wystartował) | tak | |
| `GAME_NOT_ACTIVE` | `GAME_NOT_ACTIVE` (wyścig z zamknięciem, R8) | nie | |
| `GAME_FINISHED` | `GAME_FINISHED` (także po rozstrzygnięciu czasu, R9) | nie | `get_state` nadal zwraca wynik |
| `RATE_LIMITED` | `RateLimiter` (adres/token) | tak | `retryAfterMs` = czas do końca okna |
| `INTERNAL` | wszystko inne | nie | bez szczegółów; HTTP 200 z `isError`, nie 5xx |

Błędy protokołu (`Origin` → 403, ciało > 8 KB → 413, `GET`/`DELETE` → 405) i fail-closed adresu (`503 ADDRESS_UNAVAILABLE`) jak w S01.

**Retry tego samego ruchu** po utraconej odpowiedzi zwraca stan (zachowanie `play`), nie błąd.

## 📝 UI/UX

Brak zmian UI i brak makiet. Człowiek widzi ruchy agenta istniejącym ekranem partii (S01: etykieta „Agent”). Wskazówka połączenia to #140.

## 📝 Edge Cases & Failure Scenarios

- **Zerwany klient / agent nie odpytuje:** zegar nie jest zatrzymywany; przegrana na czasie rozstrzygana leniwie przy kolejnym odczycie (człowieka lub agenta). Jeśli nikt nie czyta, wiersz zostaje `active` do pierwszego odczytu (istniejące zachowanie E02-S03; poza zakresem).
- **Ruch po upływie czasu:** `GAME_FINISHED`, partia zapisana jako przegrana agenta (R9); kolejny `get_state` zwraca `result.outcome = "loss"`, `reason = "timeout"`.
- **Równoległe `play_move`** (ten sam token, ten sam `moveNumber`): dokładnie jeden zapis (blokada wiersza + warunkowy `UPDATE`); reszta `STALE_MOVE`/`NOT_YOUR_TURN`; duplikat tego samego ruchu zwraca stan. Stan końcowy = stan po samym poprawnym ruchu.
- **Wyścig o ostatni ruch** (agent i człowiek jednocześnie na końcu zegara albo piąty kamień vs czas): rozstrzyga blokada wiersza; test na PostgreSQL, wynik deterministyczny (kto pierwszy wziął blokadę).
- **Token cudzej partii / obcy token:** `INVALID_TOKEN`, brak zapisu, brak informacji o istnieniu partii.
- **`waitSeconds` przerwane przez klienta:** pętla kończy się przy najbliższej iteracji; brak zapisu poza leniwymi aktualizacjami z końcowego `getState`.
- **`get_state` jako zapis uboczny:** jak dziś `GameService.getState` (leniwe zamknięcia, start zegara, `seen_at`); to **nie** jest błąd `play_move` i nie narusza inwariantu decyzji 8.
- **Limity jako zapis:** inkrementacja kubełka `rate_limit_buckets` to nie stan partii; inwariant dotyczy `games`, `game_players`, ruchów i zegarów.
- **Agent gra czarnymi (zaczyna):** zegar biegnie od dołączenia, jeśli obie strony widziały partię (S01); `get_state` pokazuje `turn: "you"`, `nextMoveNumber: 1`.
- **Wyciek:** odpowiedzi i logi bez nicków, e-maili, `user_id`, `agentName`, kodu, tokenu, skrótów, SQL; logowane tylko nazwa narzędzia, kod błędu, czas, `gameId`.

## 📝 Risks & Impact Review

- **Trudne do odwrócenia:** nazwy narzędzi, kształt `AgentGameState` i kody błędów — publiczny kontrakt zewnętrzny (po wydaniu tylko addytywnie). Dlatego widok jest czystą funkcją w `core` z testami kształtu (dokładny zestaw pól).
- **Rozjazd ze stanem człowieka:** brak, bo zapis idzie `GameMoveService`; test porównuje stan z `GET /api/games/[id]` dla człowieka.
- **Obciążenie:** `waitSeconds` trzyma żądanie do 25 s; budżet puli połączeń i limit czasu odczytu za reverse proxy do sprawdzenia (⚠ niezweryfikowane, jak w #138); pętla bez transakcji.
- **Zgodność:** `BACKWARD_COMPATIBILITY.md` — trasa i narzędzia addytywne, brak zmian istniejących kontraktów REST.
- **Zależność od A-04/A-06:** funkcja eksperymentalna, bez dowodu popytu; czas modelu a zegar 10 minut może sprawić, że agent często przegrywa na czasie (świadomy koszt, bez karencji).
- **Plan wycofania:** usunięcie narzędzi z rejestru (`tools/list` wraca do `join`); brak danych do cofania.

## 📝 Decisions in play

D-28, D-29 (zatwierdzona), BR-30/BR-31, BR-04, D-05, BR-06, BR-07, BR-10 (swobodne gomoku 15×15), N-10; założenia A-04, A-06 bez danych; Q-01 (odpytywanie z `waitSeconds` wystarcza dla agenta — wniosek #138, weryfikowany tu testem pełnej partii). Czat to E07 — poza zakresem. Specyfikacja nie proponuje zmiany żadnej aktywnej decyzji.

## 📋 Phasing

Jeden PR implementacji (`Closes #128`), po scaleniu implementacji S01. Fazy = kolejność commitów.

- **Faza 1 — domena:** widok, stałe, schematy, mapowanie błędów.
- **Faza 2 — narzędzia:** `get_state` (+ `waitSeconds`), `play_move`, limity, rejestr `tools/list`.
- **Faza 3 — dowody:** testy PostgreSQL (niezmienność stanu, współbieżność), scenariusze integracyjne klienta MCP, dokumentacja.

## 📋 Implementation Plan

Każdy krok: testy jednostkowe razem z kodem (100% pokrycia na plik, bez `v8 ignore`; `AbortSignal.timeout` nie jest objęty fałszywymi timerami — sygnał wstrzykiwany w testach); PostgreSQL tam, gdzie dotyka SQL.

0. Rebase na `main` z zaimplementowanym S01; przeczytać faktyczny `server/mcp/` i dopasować nazwy; sprawdzić R8 (predykat tokenu a `cancelled`).
1. `core`: `agentGameView`, stałe, schematy Zod `getState`/`playMove`; testy kształtu (dokładny zestaw pól), planszy (czarny/biały, pusta, pełna linia), wyniku z perspektywy (`win`/`loss`/`draw`, `timeout`, `winLine`), `retryAfterMs` (R2), granic wejścia.
2. `app`: `toToolError` (tabela kodów, brak echa wejścia, `INTERNAL` bez szczegółów); test tabelaryczny na każdy kod i na nieznany wyjątek.
3. `AgentGameService`: rozpoznanie tokenu (`INVALID_TOKEN` dla obcego/wygasłego), `peek`, widok; testy na PostgreSQL (token cudzej partii, granica 1 h).
4. `get_state` + `waitSeconds` (R3): fałszywy zegar i wstrzyknięty `AbortSignal`; testy: natychmiast przy swojej turze, czeka na turę przeciwnika, kończy się na `waitSeconds`, kończy na końcu partii, na upływie czasu, na anulowaniu; brak otwartej transakcji w trakcie (asercja na `em`).
5. `play_move`: delegacja do `GameMoveService.play`, mapowanie (R7); testy każdego kodu.
6. Limity (R1): adres → token; `RATE_LIMITED` z `retryAfterMs`; brak kubełka dla nieznanego tokenu; fail-closed w produkcji.
7. Rejestr `tools/list` (3 narzędzia, brak narzędzi zaproszeń/lobby/historii/konta/resign), kontraktowy test opisów.
8. **Testy PostgreSQL niezmienności stanu** (kryterium #128): dla każdego kodu błędu migawka (liczba ruchów, plansza, tura, `clock_ms_1/2`, `turn_started_at`, status, wynik) przed = po — także `INVALID_TOKEN`, `INVALID_INPUT`, `RATE_LIMITED`; N równoległych ruchów (jeden poprawny, reszta błędnych/duplikatów) → stan równy stanowi po samym poprawnym; wyjątek R9 jawnie oznaczony.
9. Scenariusze integracyjne (`tests/integration`, klient MCP przez `fetch`/SDK z Testcontainers): (a) poprawna partia do końca (`join` → pętla `get_state`/`play_move` aż do piątki, człowiek gra przez API; wynik widoczny po obu stronach); (b) każdy kod błędu z migawką stanu; (c) równoległe ruchy; (d) wyścig o ostatni ruch; (e) limit czasu (zegar agenta wyczerpany bez ruchów → przegrana na czasie, ruch po upływie → `GAME_FINISHED`); (f) odmowa po końcu partii (`GAME_FINISHED`, `get_state` nadal zwraca wynik); (g) token cudzej partii → `INVALID_TOKEN`; (h) brak wycieku nicków/e-maila/`user_id` w żadnej odpowiedzi i w `server.log` (bez tokenu/kodu/`agentName`).
10. Dokumentacja: `track-e06.md` (utworzony w S01 — uzupełnić o S02), wiersze backlogu, przeniesienie specyfikacji do `implemented/` z sekcją „Odstępstwa wdrożenia i dowody”, lekcje.
11. Weryfikacja: `npm run check` (z Dockerem), po rebase `npm run typecheck`, środowisko QA `sh .ai/scripts/test-env-up.sh`, odhaczenie kryteriów.

### Kryteria akceptacji #128 → kroki

| Kryterium | Kroki |
|---|---|
| 1. `get_state` zwraca planszę, oba zegary, czyj ruch i wynik, także po końcu | 1, 3, 4, 9(a, f) |
| 2. `play_move` legalny: zapis, zegar agenta zatrzymany, tura na człowieka | 5, 9(a) |
| 3. Nielegalny ruch (zajęte, poza planszą, nie jego tura): błąd bez zmiany stanu | 2, 5, 8, 9(b) |
| 4. Zegar wyczerpany albo zerwany klient: przegrana agenta, zegar nie zatrzymywany | 4, 9(e) |
| 5. Partia zakończona: odmowa ruchu | 5, 9(f) |
| Dodatkowe (komentarz właściciela): jednolity kształt błędu, kody, brak danych wewnętrznych, stan przed = po, równoległe ruchy | 2, 7, 8, 9(b, c, h) |

## Pytania do właściciela (nowe, niezablokujące)

1. **`retryAfterMs` 2000 ms w turze przeciwnika i `RETRY_HINT_MS`** (R2): wartość początkowa bez danych; zostawić?
2. **Plansza jako 15 napisów `.`/`B`/`W`** (R5) vs. wyłącznie lista ruchów: domyślnie obie (plansza + `moves`), bo kontrakt wydany jest trudny do zmiany.
3. **Wyjątek rozstrzygnięcia czasu przy błędnym `play_move`** — zatwierdzony (R9); brak dalszych pytań.

## Odstępstwa wdrożenia i dowody

Wdrożono jednym PR-em (`Closes #128`) po scaleniu implementacji S01 (#143). Kryteria #128: 1 — `agent-view.test.ts`, `agent-game-service.test.ts`, `agent-play-api.test.ts` („a whole game over MCP”); 2 — te same oraz `play_move` w pętli pełnej partii (zegar stron przełącza się: `runningSide`); 3 — „the errors of play_move” (każdy kod osobno, migawka `games` przed = po); 4 — „the clock of the agent” (przegrana na czasie bez zapytań agenta, spóźniony ruch, wygrana agenta przy upływie czasu człowieka); 5 — `GAME_FINISHED` po końcu, `get_state` nadal zwraca wynik. Kryterium dodatkowe (jednolity błąd): ten sam test wylicza dokładny zestaw pól błędu, brak SQL, uuid i tokenu w treści; współbieżność: „parallel moves” (osiem równoległych wywołań, jeden zapis) i wyścig ruchu wygrywającego z poddaniem człowieka.

| # | Odstępstwo lub doprecyzowanie | Dlaczego |
|---|---|---|
| 1 | Granicę planszy (0–14) sprawdza `AgentGameService.playMove`, nie `GameMoveService`; Zod przyjmuje każdą liczbę całkowitą | `cellOf(15, 0)` jest poprawną komórką w następnym wierszu, więc `applyMove` nie wykryłby ruchu poza planszą |
| 2 | Błąd nieoczekiwany to **wynik narzędzia `INTERNAL`** (`isError`, HTTP 200), także dla `join`; S01 rzucało wyjątek, który SDK zamieniał na błąd protokołu | decyzja 8: jedno kształt błędu dla wszystkich narzędzi; zmieniono `toolErrorOf` i jego testy |
| 3 | `toolErrorOf` mapuje każdy `NotFoundError` na `INVALID_TOKEN` z jednym komunikatem | partia znikła pod ważnym tokenem (sprzątanie) = ten sam kod co nieznany token (R7) |
| 4 | Błąd `ILLEGAL_MOVE` ma dodatkowe pole `reason` (`cell_occupied` / `out_of_board`) | #138 wymienia `reason`; pozostałe kody mają dokładnie `code`, `message`, `retryable` (+ `retryAfterMs` przy `RATE_LIMITED`) |
| 5 | Nieznane pola wejścia `get_state` i `play_move` są ignorowane (jak w `join`, odstępstwo 5 z S01) | luźny schemat wejścia, by każdy zły kształt miał ten sam błąd (lekcja o SDK) |
| 6 | Pole `null` dla opcjonalnych `waitSeconds` i `afterMove` znaczy „brak” | modele często wysyłają `null` |
| 7 | `afterMove` większe niż liczba ruchów jest sprawdzane **po** `GameService.getState` (leniwe zapisy już wykonane) | `getState` z `after = 0` zawsze zwraca pełną listę ruchów potrzebną do planszy; błąd wejścia nie dotyczy `play_move`, więc inwariant decyzji 8 nie jest naruszony |
| 8 | Wynik `play_move` to osobny `GameService.getState` po udanym ruchu (druga transakcja) | `play` zwraca ruchy tylko od `moveNumber - 1`, a widok agenta potrzebuje całej planszy |
| 9 | Limit tokenu jest konfigurowalny: `MCP_TOKEN_LIMIT` (domyślnie 60 / min; `ServerConfig.mcp.tokenLimit`, `compose.prod.yaml`); `.env.example` nie zaktualizowano (plik niedostępny dla agenta) | wymóg „początkowe i konfigurowalne” |
| 10 | `waitSeconds` liczy rundy (jedna na sekundę), nie czas zegara | ograniczenie niezależne od zegara; testy bez prawdziwego czasu (lekcja o `AbortSignal.timeout`) |
| 11 | W teście kontenera DI wydłużono limit czasu pierwszego testu do 30 s | test importuje cały kontener i liczy bcrypt (koszt 12); pod obciążeniem 200 plików przekraczał 5 s (niezwiązane z logiką) |

**Nie sprawdzono:** rzeczywiste wywołania `get_state` / `play_move` z Claude Code lub innego modelu (test używa klienta HTTP JSON-RPC); `waitSeconds` za prawdziwym reverse proxy (limity czasu odczytu); test obciążeniowy puli połączeń przy wielu równoczesnych oczekujących `get_state`; GAME_NOT_ACTIVE osiągalny tylko w wyścigu z zamknięciem partii (pokryty mapowaniem w testach jednostkowych, nie integracyjnie); R8 (`get_state` zwracający `cancelled`) w teście integracyjnym.
