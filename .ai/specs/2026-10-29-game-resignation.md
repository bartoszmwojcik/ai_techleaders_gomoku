# Poddanie partii

> Status: **zatwierdzona do implementacji** (Q1–Q6 rozstrzygnięte) (`om-spec-writing`, tryb interaktywny, 2026-10-29). Źródło: decyzja właściciela z 2026-10-26 (L12: poddanie wchodzi do MVP), `.ai/specs/product-brief.md` (BR-13, BR-21: „Najpierw dokończ albo poddaj partię”), #22 Q6 (poddanie było poza zakresem — ta specyfikacja je zmienia), #21 (`resolveParticipant`, `is_active`), #23 (zegar, `settleGame`), mapa `lekcja-07/mapa-ekranow-partia.md` (p05.13, p05.14, p06.8, p06.9, L23). Wymaga nowego zgłoszenia w trackerze (E02-S05) — do utworzenia po zatwierdzeniu.

## 📝 TLDR

Dziś partię kończy tylko piątka, remis albo czas. Gracz, który chce wyjść z przegranej partii, albo użytkownik, który chce usunąć konto (BR-21 każe „najpierw dokończyć albo poddać”), nie ma jak jej zakończyć. Po wdrożeniu (zachowanie przyszłe) gracz poddaje partię jednym potwierdzonym działaniem; przeciwnik wygrywa z powodem `resignation`, obaj gracze są zwolnieni z BR-13, a usunięcie konta przestaje być zablokowane.

## Resolved decisions

| # | Pytanie | Decyzja (właściciel, 2026-10-29: „zgoda na rekomendacje”) |
|---|---|---|
| Q1 | Kiedy można się poddać | W każdej chwili w partii `active`, także przed pierwszym ruchem i w turze przeciwnika |
| Q2 | Potwierdzenie | Dialog „Czy na pewno chcesz się poddać? Przeciwnik wygra partię.” z przyciskami „Poddaj partię” i „Wróć do gry”; fokus na „Wróć do gry” |
| Q3 | Skutek | Wygrywa drugi gracz, `endReason = resignation`, `finishedAt = now`, obaj uczestnicy `is_active = false`, zegary zamrożone, odpytywanie zatrzymane; historia: „Poddałeś partię” / „Przeciwnik poddał partię” |
| Q4 | Kto i skąd | Każdy uczestnik partii `active` (konto lub gość); przeciwnik nie jest pytany; nie dotyczy `waiting` (anulowanie z #21) |
| Q5 | Kontrakt API | `POST /api/games/{id}/resign`, bez ciała, CSRF; idempotentne; `409 GAME_FINISHED` gdy partia skończyła się inaczej; wyścigi rozstrzyga blokada wiersza |
| Q6 | Usunięcie konta (#37) | Po poddaniu partia jest `finished`, blokada BR-21 znika; komunikat blokady dostaje link do partii |

## 📝 Problem Statement

Partii nie da się opuścić inaczej niż przez wygraną, remis albo upływ czasu, a BR-21 zakłada, że poddanie istnieje. Bez niego gracz musi czekać do 10 minut, żeby zwolnić BR-13, albo zostaje zablokowany przy usuwaniu konta.

## 📝 Proposed Solution

- **`core/src/games/`:** `resolve(state, seat)` — czysta funkcja: partia `active` → wynik `{ winnerSeat: opponent, reason: "resignation" }`, w innym stanie błąd domenowy (`NOT_ACTIVE`/`FINISHED`).
- **`GameMoveService.resign(participant, gameId)`** (obok `play`): blokada wiersza partii, `timeoutSettler.settleGame` pod blokadą (jeśli czas już minął, wygrywa zakończenie przez czas, a poddanie dostaje `GAME_FINISHED`), idempotencja (poddanie tego samego gracza po `resignation` → `200` ze stanem), warunkowy `UPDATE games SET status='finished', winner_seat, end_reason='resignation', finished_at WHERE id AND status='active'`, w tej samej transakcji `game_players.is_active = false` obu (przez `tx`, lekcja w AGENTS.md).
- **Route** `POST /api/games/[id]/resign`: `resolveParticipant` (konto lub gość, `404` dla obcych), koperta `{ ok, data }` jak `moves`; kody: `200` (stan jak w `GET`), `409 GAME_FINISHED`, `409 GAME_NOT_ACTIVE` (`waiting`/`cancelled`), `403` CSRF, `404`.
- **Dane:** rozszerzenie `CHECK` na `end_reason` o `resignation` (migracja; zob. lekcja: `five_in_row`/`draw`/`timeout` w #22/#23); bez nowych kolumn.
- **UI:** przycisk „Poddaj partię” pod planszą (tylko w `active`), `ConfirmDialog` z DS (Q2, fokus na „Wróć do gry”, wraca na przycisk po zamknięciu), stany wyniku p06.8/p06.9 („Wygrałeś, przeciwnik poddał partię” / „Przegrałeś, poddałeś partię”), błąd sieci z „Spróbuj ponownie” (ponowienie idempotentne).

## 📝 Architecture

Rozszerza `GameMoveService` (#22) i `timeoutSettler` (#23); bez nowych zależności. Zależy od #22/#23; wydanie razem lub zaraz po nich.

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Zachowanie |
|---|---|
| Poddanie w turze przeciwnika | Dozwolone (Q1) |
| Poddanie i równoległy ruch kończący piątką | Po blokadzie rozstrzyga kolejność: pierwszy zapis wygrywa, drugi dostaje `409 GAME_FINISHED` |
| Poddanie po upływie czasu (nikt nie czytał partii) | `settleGame` pod blokadą kończy przez czas; poddanie dostaje `409 GAME_FINISHED` |
| Podwójne kliknięcie / ponowienie po zerwaniu połączenia | Idempotentne: `200` ze stanem końcowym |
| Przeciwnik poddał się, gdy gracz ma kartę w tle | Pierwszy odczyt po powrocie pokazuje wynik (#24) |
| Gość w innej przeglądarce | `404` jak w #21 |
| Poddanie w `waiting` | `409 GAME_NOT_ACTIVE` (tam jest anulowanie) |
| Błąd bazy | `500` bez zapisu, brak półstanu (jeden warunkowy `UPDATE` + `is_active` w transakcji) |

## 📝 Risks & Impact Review

Migracja `CHECK` na `end_reason` jest zmianą kontraktu danych (wartość `resignation` widoczna w historii #27 i `result.reason` w `GET`), dodawana addytywnie. Zmiana #22 Q6 (poddanie poza zakresem) jest tu świadomie uchylona decyzją właściciela z 2026-10-26.

## 📋 Phasing

Jedna faza, jeden PR (`Closes` nowe zgłoszenie E02-S05) po #22 i #23.

## 📋 Implementation Plan

1. `resolve` w `core` + test (100%).
2. Migracja `CHECK end_reason` (up/down/up na jednorazowej bazie, nie dev).
3. `GameMoveService.resign` + testy na fałszywym `em` (każda gałąź) i na PostgreSQL (wyścig z ruchem, wyścig z czasem, idempotencja, rollback przez `tx`).
4. Route `POST /api/games/[id]/resign` + testy (jednostkowe, integracyjne: 200/404/409/403, gość, konto).
5. UI po zatwierdzeniu prototypu: przycisk, dialog, stany wyniku, testy komponentów i przeglądarki (obie strony, oba motywy, 360 px).
6. Dokumentacja, link do partii w komunikacie blokady usunięcia konta (#37), lekcja jeśli przegląd wykaże korektę.
