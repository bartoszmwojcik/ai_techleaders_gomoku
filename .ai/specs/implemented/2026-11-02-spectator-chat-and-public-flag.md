# Czat widza i flaga „Partia publiczna” z licznikiem (E10-S03, #209; E10-S04, #210)

> Status: **zaimplementowana (2026-11-02)**; zatwierdzona autonomicznie na mocy delegacji właściciela (2026-11-02) — właściciel może ją nadpisać.** Brak wierszy ⚠ NEEDS HUMAN CONFIRMATION: każde założenie jest odwracalne.
>
> Źródło: zgłoszenia #209, #210, epik #201; `.ai/specs/product-brief.md` (D-33, BR-32, BR-33, BR-34, BR-41, BR-42, BR-45, N-13, A-13, A-14, Q-17); `.ai/specs/implemented/2026-11-02-spectate-live-game.md` (widz, obecność, polling 2 s), `2026-11-01-chat-disable.md`, `2026-10-31-game-chat.md`; kod: `ChatService`, `SpectatorService`, `spectator-room.tsx`, `chat-panel.tsx`.
>
> Zakres: **czat widza** (odczyt, zapis, oznaczenie, retencja), **semantyka wyłączenia czatu w partii publicznej**, **flaga z licznikiem** u graczy i widzów. Poza zakresem: kill-switch (S05), MCP (S06), moderacja i zgłaszanie (N-13, Q-10).

## 📝 TLDR

Widz z nickiem albo kontem pisze na czacie partii na zasadach BR-32 i jest oznaczony „Widz”; bez nicka tylko czyta. Nie ma przełącznika czatu. Gracz wyłącza czat tylko dla siebie: sam nie widzi i nie pisze, a drugi gracz dalej pisze (do widzów) i czyta widzów, widzowie dalej rozmawiają. Wiadomości widzów leżą w tej samej tabeli `chat_messages`, więc `db:cleanup` (BR-34) obejmuje je bez zmian reguły. Gracze i widzowie widzą flagę „Partia publiczna · oglądają: N”; licznik to liczba wierszy `game_spectators` z obecnością z ostatnich 15 s (ten sam wskaźnik, którego używa limit 20), więc maleje samoczynnie po odłączeniu widza.

## Resolved assumptions (autonomous defaults)

| # | Pytanie | Zastosowane założenie | Dlaczego |
|---|---|---|---|
| S3-1 | Podpis widza | W liście: „Widz · {nick}” (konto: nazwa konta, BR-14). Nick gościa bez dopisku „(gość)” — oznaczenie „Widz” jest ważniejsze. | BR-41 wymaga „oznaczony jako widz”; krótszy podpis. |
| S3-2 | Czy widzowie piszą po zakończeniu partii | **Tak**, w oknie 1 h jak gracze (BR-32). | Spójne ze stanem czatu graczy; widz widzi wynik i może pogadać. |
| S3-3 | Wiadomości widzów w polu `chat` agenta | **Tak, jako dane niezaufane** z `from: "spectator"` (nigdy nick). | Rozszerza A-09; agent musi wiedzieć, że to nie przeciwnik. Rozszerzenie typu `from`, nie nowe narzędzie MCP. |
| S3-4 | Co po wyłączeniu przez gracza A widzi gracz B | W partii **publicznej** stan B zostaje `open` (czyta i pisze; widzowie czytają), z notatką „Rozmówca wyłączył czat — nie zobaczy Twoich wiadomości”. W prywatnej bez zmian (`disabled_by_opponent`). | BR-33/BR-41: „drugi gracz i widzowie rozmawiają dalej”. Po zamknięciu publiczności (S05) partia wraca do reguły prywatnej. |
| S3-5 | Widz bez nicka | Czyta czat, pole zastąpione zdaniem „Aby pisać, wejdź z nickiem lub zalogowany jako konto.” Serwer odmawia zapisu (`403`) niezależnie od UI. | BR-41. |
| S3-6 | Limity | Te same co gracze-ludzie (`chatConfig.human`: 200 znaków, 1 wiadomość / 2 s na widza), ten sam limit 500 wiadomości na partię, ta sama normalizacja i brak linków. | BR-32. |
| S3-7 | Trasa | Osobna: `GET/POST /api/games/[id]/spectate/chat`, rozpoznanie przez `resolveSpectator`. Trasy graczy (`/chat`, `/chat/settings`) nie znają widza (`404`), jak dotąd. Widz nie ma trasy ustawień. | Obrona w głąb: widz nie dotrze do przełącznika ani przez API. |
| S3-8 | Przechowywanie | Migracja: `chat_messages.sender_id` nullable, nowe `spectator_id` (FK `game_spectators`, `on delete cascade`) i `author_name varchar(24)` (zrzut nicka/nazwy w chwili wysłania), CHECK „gracz albo widz”. Cascade: usunięcie konta widza kasuje jego wiadomości (BR-34); wiersz widza sprzątany przez `db:cleanup` ≥ 1 h po ostatnim odczycie, czyli nie wcześniej niż czat partii. | Brak konta/e-maila w wiadomości; reguła `chatMessages` w `cleanup` liczy po `game_id`, więc obejmuje wiadomości widzów. |
| S3-9 | Licznik: skąd i czy wiarygodny | Wynik E10-S02-T01: polling co 2 s z zapisem obecności co ≥ 10 s (`SPECTATOR_TOUCH_INTERVAL_MS`). Licznik = `count(*)` z `game_spectators` z `expires_at > now` i `last_seen_at > now − 15 s` (`SPECTATOR_PRESENCE_MS`). **Uznany za wiarygodny** (to samo źródło co limit BR-42, mierzone w E10-S02). Opóźnienie: do 15 s po odłączeniu. | Jedno źródło prawdy, bez nowej tabeli ani kanału. |
| S3-10 | Kto widzi flagę i kiedy | Gracze (GET stanu i strona) i widzowie, gdy `games.is_public` **i** `status = 'active'` (BR-45: „podczas rozgrywki”). Gdy `is_public = false` (kill-switch) pole znika. Po zakończeniu partii flagi nie ma. Licznik zawiera widza oglądającego. | BR-45. |
| S3-11 | Koszt odczytu | Jedno dodatkowe, indeksowane zapytanie `count` na odczyt stanu partii publicznej w toku (indeks `(game_id, last_seen_at)`); partie prywatne bez zmian. | A-14. |

## 📝 Architecture

- **core:** `ChatMessageView` — `seat: Seat | null` + `spectatorName?: string`; `deriveChatState({ isPublic })`; `ChatReadData.opponentDisabled?: true`; `agentChatView` — `from: "spectator"`; typ `AudienceView = { spectators: number }`.
- **db:** migracja `chat_messages` (nullable `sender_id`, `spectator_id`, `author_name`, CHECK, unikat `(spectator_id, client_id)`); encja `ChatMessage` zaktualizowana.
- **app:** `ChatService.readAsSpectator` / `sendAsSpectator`; `audience.ts` (`readAudience`) używane przez `GameService.stateOf` i `SpectatorService.getState`; `SpectatorState.canChat`; trasa `spectate/chat`; `PublicFlag` (komponent frontendowy: `Badge`-podobny, tylko tokeny); `ChatPanel` w trybie widza (bez przełącznika) w `spectator-room.tsx`; etykiety widza w `chat-message-list`.
- **Bez zmian:** tabele `game_spectators`, trasy graczy, narzędzia MCP (tylko typ `from`), reguły `cleanup` (test dowodzi pokrycia).
- **Nie dotykamy** kontrolek twórcy ani przełączania `is_public` (S05).

## 📝 API

`GET /api/games/[id]/spectate/chat?after_id&limit` → `200 { state, messages, lastId, limits, retryAfterMs? }` (jak gracz; `state` ∈ `open` | `closed`); `POST` `{ text, clientId }` → `201/200 { message, retryAfterMs }`. Błędy: `400` (tekst, `fieldErrors.text`), `403` widz bez nicka, `404` nie-widz, `409 CHAT_UNAVAILABLE` / `CHAT_FULL`, `429`. `no-store`. Stan partii (`GET /api/games/[id]`, `GET /api/games/[id]/spectate`) dostaje opcjonalne `audience: { spectators }`; widz dostaje też `canChat`.

## ✅ Acceptance criteria

- [x] Widz z nickiem (1–24) lub konto pisze; wiadomość jest widoczna z oznaczeniem widza (S3-1).
- [x] Widz bez nicka czyta, nie pisze (UI + `403`).
- [x] Widz nie ma przełącznika wyłączenia czatu ani trasy ustawień.
- [x] Gracz wyłącza czat: nie widzi wiadomości i nie pisze; drugi gracz i widzowie rozmawiają dalej (S3-4).
- [x] Wiadomość widza: limity i brak linków jak BR-32; retencja BR-34 (`db:cleanup` usuwa ją z partią; skasowanie konta widza ją usuwa).
- [x] Gracze i widzowie widzą flagę „Partia publiczna” z liczbą oglądających; liczba maleje po odłączeniu widza (≤ 15 s).
- [x] Gdy `is_public = false` albo partia nie jest w toku — flagi nie ma.
- [x] 100% pokrycia, migracja w górę i w dół na PostgreSQL, scenariusze integracyjne.

## Adnotacje implementacji

- **Zgodnie ze specyfikacją.** Pliki: migracja `Migration20261102212952_spectator_chat` (tylko zmiany `chat_messages`; szum snapshotu usunięty, `up`/`down`/`up` sprawdzone na PostgreSQL), `ChatService.readAsSpectator`/`sendAsSpectator`, `deriveSpectatorChatState`, `deriveChatState({ isPublic })`, `server/services/games/audience.ts` (wspólne zapytanie o obecność dla limitu BR-42 i licznika), trasa `GET/POST /api/games/[id]/spectate/chat`, `SpectatorChat`, `PublicFlag` (w `PlayField` i `SpectatorRoom`), `from: "spectator"` w widoku agenta.
- **Odstępstwo:** zamknięcie publiczności (`is_public = false`) powoduje `404` także na czacie widza (zapytanie kontekstu ma `and g.is_public`) — zabezpieczenie na czas S05, które dodatkowo odłącza widzów od czatu.
- **Licznik** to widzowie obecni w ostatnich 15 s, więc po odłączeniu widza maleje do 15 s później (S3-9). Obejmuje oglądającego (min. 1 dla widza).
- **Testy:** jednostkowe (serwis, trasa, komponenty, hook, `audience`), integracyjne API (`game-spectator-chat-api.test.ts`: widz z nickiem/kontem/bez nicka, limity, izolacja tras, wyłączenie czatu przez gracza, retencja i `db:cleanup`, flaga i licznik) oraz przeglądarkowe (`game-spectate-pages.test.ts`).
- **Nie zweryfikowano:** zachowania na hoście Mikrus; przypadku usunięcia *konta* widza end-to-end (sprawdzono usunięcie wiersza widza, które kaskada konta wykonuje tak samo).
