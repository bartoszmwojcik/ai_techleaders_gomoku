# Twórca zamyka publiczność w trakcie partii — kill-switch (E10-S05, #211)

> Status: **zaimplementowana (2026-11-02)**; zatwierdzona autonomicznie na mocy delegacji właściciela (2026-11-02) — właściciel może ją nadpisać. Brak wierszy ⚠ NEEDS HUMAN CONFIRMATION: każde założenie jest odwracalne.
>
> Źródło: zgłoszenie #211, epik #201; `.ai/specs/product-brief.md` (D-33, BR-43, BR-44, BR-45, N-13, A-14, A-15, Q-17); `.ai/specs/implemented/2026-11-02-spectate-live-game.md`, `2026-11-02-spectator-chat-and-public-flag.md`, `2026-11-02-public-game-review.md`; kod: `GameService`, `SpectatorService`, `GameReviewService`, `play-field.tsx`, `spectator-room.tsx`.
>
> Zakres: akcja twórcy „Zamknij publiczność”, natychmiastowe odłączenie widzów, zamknięcie wejścia kodem/linkiem i przeglądu po zakończeniu, informacja dla graczy. Poza zakresem: wyrzucanie pojedynczych osób, moderacja, zgłaszanie (N-13, Q-10), ponowne otwarcie publiczności, MCP (S06).

## 📝 TLDR

Twórca partii publicznej (miejsce 1: konto albo gość) w trakcie partii — albo po jej zakończeniu — naciska „Zamknij publiczność” i potwierdza. Serwer jednym zapisem ustawia `games.is_public = false` i `games.audience_closed_at` oraz kasuje wiadomości widzów z czatu. Od tej chwili każdy odczyt widza (`GET /api/games/[id]/spectate`, strona) dostaje `410 AUDIENCE_CLOSED`, a ekran widza pokazuje „Twórca zamknął publiczność”; kod/link nie przyjmuje nowych widzów (`410 INVALID_INVITATION`, już dziś) ani nie otwiera przeglądu po zakończeniu (`canReview` czyta `is_public` przy każdym otwarciu). Partia toczy się dalej jako prywatna. Nie ma ponownego otwarcia. Obaj gracze widzą informację „Publiczność zamknięta przez twórcę”.

## Resolved assumptions (autonomous defaults)

| # | Pytanie | Zastosowane założenie | Dlaczego |
|---|---|---|---|
| S5-1 | Kto może zamknąć | Uczestnik na miejscu 1 (twórca): konto albo gość (token). Każdy inny uczestnik i obcy: `404`. | „Twórca” z BR-43; jak `cancel`. |
| S5-2 | Kiedy | Partia publiczna w toku (`active`) **lub zakończona** (`finished`): zamknięcie po zakończeniu blokuje przegląd kodem (BR-43). W `waiting`/`cancelled`: `409 GAME_NOT_ACTIVE` (w `waiting` twórca anuluje zaproszenie). Partia, która nie jest publiczna i nie została zamknięta: `409 GAME_NOT_PUBLIC`. | Zgłoszenie: „zamknięcie po zakończeniu” to pytanie do specyfikacji; BR-43 mówi „ani przeglądu”. |
| S5-3 | Ponowne otwarcie | Brak. Nie ma akcji ani pola, które ustawia `is_public = true` po utworzeniu. | Propozycja ze zgłoszenia; kill-switch ma być jednokierunkowy. |
| S5-4 | Powtórka | Idempotentna: drugie zamknięcie (`audience_closed_at` ustawione) → `200` ze stanem, bez zmian. | Podwójne kliknięcie / ponowienie po błędzie sieci. |
| S5-5 | „Od razu odłączeni” | Wiersze `game_spectators` zostają (potrzebne do jasnego komunikatu), ale **każdy odczyt widza sprawdza `is_public`** przed ślizganiem dostępu: `410 AUDIENCE_CLOSED`, czat widza `404` (już dziś). Widz traci dostęp przy następnym odczycie (≤ 2 s polling). Wiersze sprząta `db:cleanup` jak dotąd. | Rozróżnienie „zamknięto” od „wygasło” wymaga rozpoznania widza; stan w bazie jest jedynym źródłem prawdy (brak kanału push). |
| S5-6 | Wiadomości widzów | Zamknięcie **kasuje wiadomości widzów** (`chat_messages.spectator_id is not null`) z partii; wiadomości graczy zostają. | Kill-switch odpowiada na nękanie (Q-10): nękające wiadomości nie zostają na czacie graczy. |
| S5-7 | Skąd wiadomo, że zamknięto | Nowa kolumna `games.audience_closed_at timestamptz null` (migracja). `is_public` nadal jedyna brama; kolumna służy informacji (odróżnia „prywatna od początku” od „zamknięta”). | Bez niej drugi gracz nie dowie się, co się stało. |
| S5-8 | Informacja dla graczy | `GameState.audienceClosed: true` (po zamknięciu) — oba miejsca widzą zdanie „Publiczność zamknięta przez twórcę”; `GameState.canCloseAudience: true` tylko dla twórcy, gdy `is_public` i status `active`/`finished`. | Drugi gracz nie zgaduje; twórca nie widzi przycisku, który serwer odrzuci. |
| S5-9 | Widz po zamknięciu | Strona i polling: ekran „Twórca zamknął publiczność” (bez planszy), polling staje; kod nie otworzy ponownie (`410`). | BR-43; widz nie dostaje stanu planszy po zamknięciu. |
| S5-10 | Spójność z #210 | Flaga „Partia publiczna · widzów” znika, gdy `is_public = false` (już w `readAudience`); nie budujemy nic poza kontrolką twórcy i zdaniem o zamknięciu. | Zakres tej historii. |

## 📝 Architecture

- **db:** `Game.audienceClosedAt` (nullable) + migracja (tylko ta kolumna; szum snapshotu usunięty).
- **app/service:** `GameService.closeAudience(participant, gameId): Promise<GameState>` (transakcja, blokada wiersza gry, `update games`, `delete chat_messages` widzów); `stateOf` dodaje `canCloseAudience` i `audienceClosed`; `SpectatorService.getState` rzuca `GoneError("AUDIENCE_CLOSED")` gdy `!is_public`.
- **app/http:** `POST /api/games/[id]/audience/close` (CSRF, `resolveParticipant`, odświeżenie ciasteczka gościa); `loadSpectatorView` zwraca znacznik zamknięcia dla strony.
- **UI:** `CloseAudience` w `play-field` obok flagi (przycisk + `ConfirmDialog`), zdanie o zamknięciu; `SpectatorRoom` — ekran „publiczność zamknięta” przy `410 AUDIENCE_CLOSED` (polling i czat).
- **Bez zmian:** `canReview` (już czyta `is_public` przy otwarciu), `SpectatorService.join` (już `410` dla nie-publicznej), trasy czatu.

## 📝 API

`POST /api/games/[id]/audience/close` (bez ciała) → `200` stan partii gracza (`audience` zniknęło, `audienceClosed: true`, `canCloseAudience` brak). Błędy: `403` CSRF, `404` nie-twórca/obcy, `409 GAME_NOT_ACTIVE`, `409 GAME_NOT_PUBLIC`. `GET /api/games/[id]/spectate` po zamknięciu → `410 AUDIENCE_CLOSED`.

## ✅ Acceptance criteria

- [x] Twórca (konto i gość) zamyka publiczność w trwającej partii; widz przy następnym odczycie dostaje `410 AUDIENCE_CLOSED`, a strona pokazuje ekran zamknięcia.
- [x] Po zamknięciu kod/link nie otwiera oglądania (`410`) ani przeglądu po zakończeniu (`404`).
- [x] Partia toczy się dalej jako prywatna (ruchy i czat graczy działają).
- [x] Drugi gracz i twórca widzą informację o zamknięciu; flaga z licznikiem znika.
- [x] Zamknięcie po zakończeniu partii blokuje przegląd kodem; powtórka jest idempotentna; brak ponownego otwarcia.
- [x] Nie-twórca (drugi gracz, widz, obcy) dostaje `404`; nie ma wyrzucania pojedynczych osób (N-13).
- [x] 100% pokrycia, migracja w górę i w dół na PostgreSQL, scenariusze integracyjne.

## Adnotacje implementacji

- **Zgodnie ze specyfikacją.** Migracja `Migration20261102221540_audience_closed` (tylko kolumna `games.audience_closed_at`; wygenerowane instrukcje `chat_messages` to szum snapshotu — usunięte; snapshot odświeżony, więc zawiera też wcześniejsze zmiany czatu widza), `GameService.closeAudience`, `canCloseAudience`/`audienceClosed` w stanie gracza, `410 AUDIENCE_CLOSED` w `SpectatorService.getState`, trasa `POST /api/games/[id]/audience/close`, `CloseAudience` (w `play-field`), `AudienceClosedScreen` (strona i `SpectatorRoom`).
- **Odstępstwo od założenia „wiersze widzów”:** wiersze `game_spectators` nie są usuwane ani unieważniane — dostęp odcina sprawdzenie `is_public` przy każdym odczycie (S5-5), dzięki czemu widz dostaje jasny komunikat zamiast `404`. Czat widza po zamknięciu daje `404`; pokój widza pyta wtedy serwer o stan (`read`), by odróżnić „zamknięto” od „wygasło”.
- **Testy:** jednostkowe (serwis, trasa, `CloseAudience`, ekran zamknięcia, pokój widza, strona; 100% pokrycia), integracyjne API (`game-close-audience-api.test.ts`: konto i gość jako twórca, 404 dla nie-twórcy, powtórka, partia prywatna/oczekująca, przegląd kodem po zakończeniu) i migracja w górę/w dół (`game-audience-closed-migration.test.ts`).
- **Nie zweryfikowano:** zachowania w przeglądarce (dialog potwierdzenia sprawdzony tylko testami jsdom, bez `npm run dev`), hosta Mikrus.
