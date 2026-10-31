# Poddanie partii

> Status: **wdrożona (2026-10-31; zgłoszenie #87 domknięte, dowody w sekcji „Odstępstwa wdrożenia i dowody”)**; wcześniej: **zatwierdzona do implementacji** (Q1–Q6 rozstrzygnięte) (`om-spec-writing`, tryb interaktywny, 2026-10-29). Źródło: decyzja właściciela z 2026-10-26 (L12: poddanie wchodzi do MVP), `.ai/specs/product-brief.md` (BR-13, BR-21: „Najpierw dokończ albo poddaj partię”), #22 Q6 (poddanie było poza zakresem — ta specyfikacja je zmienia), #21 (`resolveParticipant`, `is_active`), #23 (zegar, `settleGame`), mapa `lekcja-07/mapa-ekranow-partia.md` (p05.13, p05.14, p06.8, p06.9, L23). Wymaga nowego zgłoszenia w trackerze (E02-S05) — do utworzenia po zatwierdzeniu.

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

> **Adnotacja 2026-10-30 (BR-29 / D-27, E02-S08):** gość (twórca lub dołączający) może się poddać tak samo jak konto, przez `resolveParticipant` (token przeglądarki); gość-twórca oczekującej partii (`waiting`) jej nie „poddaje”, tylko anuluje (`POST /api/games/{id}/cancel`, E02-S08). Etykieta przeciwnika w komunikacie wyniku to „{nick} (gość)”.

## Adnotacja z implementacji (zadanie 5.3, backend)

- Migracji nie było: `resignation` jest w `games_end_reason_check` od fazy 3 (krok 2 planu pominięty).
- Funkcja czysta nazywa się `resolveResignation(status, seat)` (plik `core/src/games/resign.ts`), nie `resolve`.
- Ponowne poddanie po `resignation`: `200` dla gracza, który się poddał (zwycięzca ≠ jego miejsce); dla zwycięzcy `409 GAME_FINISHED`. Odpowiedź ma `after = 0` (pełna lista ruchów jak `GET` bez parametru).

## Adnotacja z implementacji (zadanie 5.4, UI)

- Etykiety wyniku z prototypu: u poddającego „Przegrałeś, poddałeś partię”, u przeciwnika „Wygrałeś, przeciwnik poddał partię” (`outcomeOf`, `reason: "resignation"`); w mapie ekranów p06.8 to wygrana, p06.9 przegrana.
- Dialog zostaje otwarty przy błędzie sieci/serwera (komunikat w opisie, przycisk „Spróbuj ponownie”); `409 GAME_FINISHED`/`GAME_NOT_ACTIVE` zamyka go, odświeża stan i pokazuje wynik; `404` oddaje partię pokojowi (`onGone`). Esc i „Wróć do gry” nie działają w trakcie wysyłania.
- Link do partii w komunikacie blokady usunięcia konta (krok 6) idzie z #37.

## 📝 Odstępstwa wdrożenia i dowody (2026-10-31)

Odstępstwa od pierwotnej treści opisują adnotacje na końcu specyfikacji (2026-10-30: gość i partia `waiting` przy E02-S08; zadanie 5.3: brak migracji, nazwa `resolveResignation`, ponowne poddanie zwraca `200` poddającemu i `409 GAME_FINISHED` zwycięzcy; zadanie 5.4: etykiety wyniku, zachowanie dialogu przy błędach) oraz status „zatwierdzona do implementacji” zastąpiony wdrożeniem. Link do partii w komunikacie blokady usunięcia konta idzie z #37 (w toku; poza zakresem #87). Dowody kryteriów zgłoszenia #87:

| Kryterium #87 | Dowód |
| --- | --- |
| Given partia `active`, uczestnik potwierdza w dialogu → wygrana przeciwnika, `end_reason = resignation`, obaj zwolnieni z BR-13 | `tests/integration/game-resign-api.test.ts` — „ends the game for the opponent, shows the result to both, frees both slots (BR-13)”, „works before the first move, with the clock not yet started, and for the creator”, „lets a guest resign with the token, and the account win”, „lets an account resign against a guest”; strona: `game-resignation-pages.test.ts` — „asks first (focus on the way out, Esc), resigns out of turn, shows the result with its reason to both and frees the player”, „lets a guest resign, and shows the account the result”, „keeps the dialog on a network error and sends again…”; jednostkowo: `packages/core/src/games/resign.test.ts`, `packages/app/src/app/api/games/[id]/resign/route.test.ts` |
| Given partia zakończona (piątka, remis, czas, poddanie), próba poddania → idempotentnie/odrzucone, stan bez zmian | `game-resign-api.test.ts` — „is idempotent for the player who resigned and a conflict for the winner”, „answers 403, 404 and 409 with the documented codes and changes nothing”, „refuses a waiting and a cancelled game”, „cannot resign it: 409 GAME_NOT_ACTIVE, and the game stays waiting (it is cancelled instead)”; strona: „shows the result when the game ended in the meantime (409 GAME_FINISHED)” |
| Given równoległy ruch lub upływ czasu, poddanie → dokładnie jedno zdarzenie kończy partię (bez 500) | `game-resign-api.test.ts` — „lets exactly one of a resignation and a five-completing move end the game”, „lets the loss on time win over a late resignation”, „never answers 500 when both players resign at once; the first writer decides”, „undoes the finish and the freed slots when the transaction fails afterwards” |

Sprawdzenie wykonane 2026-10-31 na `origin/main` przez czytanie testów i kodu; testy nie były uruchamiane w ramach tego domknięcia (zmiana dokumentacyjna).
