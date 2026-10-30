# Rewanż po zakończonej partii

> Status: **zatwierdzona do implementacji** (Q1–Q8 rozstrzygnięte) (`om-spec-writing`, tryb interaktywny, 2026-10-29). Źródło: decyzja właściciela z 2026-10-26 (L13: po końcu partii „Rewanż” z odwróconymi kolorami + wyjście do panelu głównego; zaproszenie do rewanżu wygasa po 5 min; gdy przeciwnik aktywnie wyjdzie, zapraszający od razu widzi „zaproszenie odrzucone”; gość może proponować i przyjmować rewanż), BR-13, BR-22, #21 (token gościa), #22 Q1 (losowanie koloru), mapa `lekcja-07/mapa-ekranow-partia.md` (p06.10–p06.15, L21, L22, L24). Wymaga nowego zgłoszenia w trackerze (E02-S06).

## 📝 TLDR

Po zakończonej partii dwaj gracze zwykle chcą zagrać jeszcze raz. Dziś muszą od nowa utworzyć zaproszenie, wysłać link i czekać. Po wdrożeniu (zachowanie przyszłe) jeden z graczy proponuje rewanż jednym kliknięciem, drugi go przyjmuje lub odrzuca, a przyjęcie od razu tworzy nową partię z odwróconymi kolorami (kto grał czarnymi, gra białymi), bez kodu i linku.

## Resolved decisions

| # | Pytanie | Decyzja (właściciel, 2026-10-29: „zgoda na rekomendacje”) |
|---|---|---|
| Q1 | Kto i kiedy | Każdy z dwóch uczestników zakończonej partii (dowolny powód końca), jedna propozycja naraz na partię |
| Q2 | Gdzie żyje propozycja | Na wierszu zakończonej partii (kto, `expiresAt` = +5 min, stan oczekuje/przyjęta/odrzucona), bez nowej tabeli; przyjęcie tworzy nową partię `active` z odwróconymi kolorami i przekierowuje oboje |
| Q3 | Odrzucenie i „aktywne wyjście” (L21) | Kliknięcie „Odrzuć” lub „Wróć do panelu głównego” zapisuje „odrzucona”; zapraszający od razu (przy najbliższym odczycie) widzi „Zaproszenie do rewanżu odrzucone”; samo zamknięcie karty nie jest sygnałem (wygasa po 5 min) |
| Q4 | BR-13 przy przyjęciu (L22) | W jednej transakcji sprawdzenie, że żaden z graczy nie ma innej aktywnej partii; inaczej `409` z linkiem do niej, propozycja pozostaje do wygaśnięcia lub odrzucenia; bez sprawdzania w chwili propozycji |
| Q5 | Gość (L24) | Proponuje i przyjmuje; przy przyjęciu dostaje NOWY token nowej partii w tej samej przeglądarce (ciasteczko nadpisane jak w #21); wymaga ważnego tokenu starej partii (do 1 h po końcu) |
| Q6 | Zegary i start | Jak zwykła partia: `active`, zegar rusza po `seen_at` obu (#21 Q20), 15 min na otwarcie strony (Q21) |
| Q7 | Limity | Jedna propozycja naraz; limit propozycji na gracza (10/h); po 5 min wygasa, można zaproponować ponownie |
| Q8 | Po poddaniu/czasie | Rewanż dostępny po każdym zakończeniu |

## 📝 Problem Statement

Gracze, którzy skończyli partię, tracą kilka minut na ponowne utworzenie zaproszenia i wysłanie linku, a gość nie ma jak szybko zagrać znowu. Rewanż skraca tę ścieżkę do jednego kliknięcia po każdej stronie.

## 📝 Proposed Solution

- **Dane (migracja):** w `games` kolumny `rematch_offered_by_seat` smallint NULL (1|2), `rematch_expires_at` timestamptz NULL, `rematch_state` text NULL (`pending`|`accepted`|`declined`), `rematch_game_id` uuid NULL (→ `games.id`, `on delete set null`). `CHECK`: stan niepusty tylko dla `status = 'finished'`; `pending` wymaga `offered_by_seat` i `expires_at`; `accepted` wymaga `rematch_game_id`.
- **`core/src/games/`:** czyste funkcje: `rematchBlackSeat(previousBlackSeat)` (kolory odwrócone, bez losowania), `isRematchOpen(state, now)` (pending i niewygasła).
- **`RematchService`** (scoped): `offer(participant, gameId)` — partia `finished`, brak aktywnej propozycji lub wygasła, limit 10/h na gracza (klucz SHA-256 bez PII), ustawia `pending`; `accept(participant, gameId)` — tylko drugi uczestnik (nie proponujący), w JEDNEJ transakcji (zapisy wyłącznie przez `tx`): blokada wiersza, `pending` i niewygasła, BR-13 dla obu graczy (Q4), utworzenie nowej partii `active` z odwróconymi kolorami (`blackSeat`), uczestników z `seat` jak poprzednio lub zamienionymi tak, by czarne miał wcześniej biały (kolor = `blackSeat`), `is_active = true`, `seen_at` NULL; dla gościa nowy token i hash (Q5, ciasteczko nadpisane przez route); `accepted` + `rematch_game_id`; `decline(participant, gameId)` — `declined` (Q3).
- **Route:** `POST /api/games/[id]/rematch` (propozycja), `POST …/rematch/accept`, `POST …/rematch/decline`; `GET /api/games/{id}` rozszerzony o `rematch: null | { state, offeredBySeat, expiresAt, gameId }`. Błędy: `409 GAME_NOT_FINISHED`, `409 REMATCH_ALREADY_OFFERED`, `409 REMATCH_NOT_OFFERED`/`REMATCH_EXPIRED`, `409 ACTIVE_GAME_EXISTS` (z `gameId`), `429 RATE_LIMITED`, `403` CSRF, `404` obcy.
- **UI (po prototypie):** na ekranie wyniku „Rewanż” i „Wróć do panelu głównego” (p06.10), oczekiwanie z możliwością wycofania (p06.11), propozycja od przeciwnika „Przyjmij/Odrzuć” (p06.12), „odrzucone” i wygasłe (p06.13/p06.14), rewanż gościa (p06.15); odpytywanie `GET` trwa na zakończonej partii, dopóki propozycja `pending`.

## 📝 Architecture

`core` (czysta logika) → `RematchService` w `app/server/services/games/` → route'y; zależy od #21–#23 (model partii, `resolveParticipant`, `GameParticipation`, kolory z #22 Q1); bez nowych zależności.

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Zachowanie |
|---|---|
| Obie strony proponują jednocześnie | Pierwszy zapis wygrywa; drugi dostaje `REMATCH_ALREADY_OFFERED` i w UI widzi propozycję przeciwnika do przyjęcia |
| Przyjęcie po wygaśnięciu | `409 REMATCH_EXPIRED`; propozycję można złożyć ponownie |
| Przyjęcie, gdy któryś ma inną aktywną partię | `409 ACTIVE_GAME_EXISTS` z linkiem; propozycja pozostaje |
| Dwa równoległe `accept` / `accept` i `decline` | Blokada wiersza i warunkowy `UPDATE`; dokładnie jedno wygrywa, nowa partia powstaje raz |
| Proponujący usunął konto / gość stracił token | Propozycja bez możliwości przyjęcia → wygasa; przyjęcie przez przeciwnika dla niedostępnego uczestnika → `409` |
| Gość z wygasłym tokenem (po 1 h) | `404` (brak dostępu do starej partii), rewanż niedostępny |
| Odświeżenie ekranu wyniku w trakcie `pending` | Stan z `GET` odtwarza oczekiwanie |
| Przeciwnik zamknął kartę bez klikania | Propozycja wygasa po 5 min (Q3) |
| Nowa partia: jeden gracz nie otwiera strony | 15 min jak w #21 Q21, potem anulowanie |

## 📝 Risks & Impact Review

Nowe kolumny w `games` i rozszerzenie `GET` są addytywne. Rewanż tworzy partię bez zaproszenia i kodu (`origin` = `rematch`? — do ustalenia w kroku 1 planu: `invite` zachowuje sens, albo nowa wartość `rematch` w `CHECK`; rekomendacja: nowa wartość `rematch`, bo D-21 rozróżnia pochodzenie). Gość: ciasteczko nadpisywane po przyjęciu może odciąć go od wyniku starej partii (akceptowalne, wynik zostaje u przeciwnika).

## 📋 Phasing

Jedna faza, jeden PR (`Closes` nowe zgłoszenie E02-S06) po #21–#23 (i poddaniu, jeśli wydanie razem).

## 📋 Implementation Plan

1. `core`: `rematchBlackSeat`, `isRematchOpen` + testy (100%); decyzja o `origin` i rozszerzenie `CHECK`.
2. Migracja kolumn rewanżu i `CHECK`-ów (up/down/up na jednorazowej bazie, nie dev).
3. `RematchService.offer/accept/decline` + testy na fałszywym `em` i na PostgreSQL (wyścigi, BR-13, rollback przez `tx`, gość z nowym tokenem).
4. Route'y i rozszerzenie `GET` + testy integracyjne (konto–konto, konto–gość, wygaśnięcie, odrzucenie, limit).
5. UI po zatwierdzeniu prototypu: ekran wyniku z rewanżem, oczekiwanie, przyjęcie, odrzucenie, wygaśnięcie; testy komponentów i przeglądarki (dwie sesje, oba motywy, 360 px).
6. Dokumentacja, lekcja jeśli przegląd wykaże korektę.

> **Adnotacja 2026-10-30 (BR-29 / D-27, E02-S07 i E02-S08):** gość-twórca oraz gość-dołączający zachowują nick w rewanżu (kopiowany do nowego wiersza uczestnika; nowy token jak w Q5). Gdy rewanż zamienia miejsca, jawny nick zostaje, a nazwa domyślna „Gracz {miejsce}” podąża za nowym miejscem (wyliczana przy odczycie). Przy gościu-twórcy partia ma `origin = rematch`, bez zaproszenia; BR-13 dla gościa przez token przeglądarki (jak w E02-S08).

## Adnotacja z implementacji backendu (2026-10-30, zadanie 5.5)

- **Bez migracji:** kolumny, `CHECK`-i i `origin = 'rematch'` istnieją od fazy 1; brak `CHECK` „accepted wymaga `rematch_game_id`” jest świadomy (cleanup #39).
- **`GET /api/games/{id}`:** pole `rematch` jest **pominięte**, gdy nikt nie proponował (zamiast `null` — zmiana addytywna, bez zmian w istniejących fikstach); `state` ∈ `pending | accepted | declined | expired` (`expired` = `pending` po `expiresAt`, liczone przy odczycie).
- **Miejsca bez zmian:** nowa partia zachowuje `seat` graczy, zmienia się tylko `black_seat` (`rematchBlackSeat`); nazwa domyślna gościa („Gracz {miejsce}”) i jawny nick zostają bez dodatkowej logiki.
- **Token gościa:** `deriveRematchToken(staryToken, idNowejPartii)` (SHA-256, deterministyczny) zamiast losowego — dzięki temu ponowienie `accept` po utraconej odpowiedzi oddaje ten sam token, a gość **proponujący** (który w momencie przyjęcia nie jest w żądaniu) odbiera swój token przy `GET` starej partii (`claimGuestSeat`; wiersz miejsca jest tworzony z `guest_token_hash = NULL` i uzupełniany warunkowym `UPDATE`). Ciasteczko starej partii zostaje nadpisane (Q5).
- **BR-13 gościa:** tokeny są jednorazowe dla partii (unikalny hash), więc gość nie może trzymać slotu w innej partii niż stara (zakończona); sprawdzane są konta obu graczy. Dostępność: konto usunięte, token gościa wyczyszczony lub starszy niż godzina po końcu → `409 REMATCH_UNAVAILABLE`.
- **Kontrakty:** `decline` jest idempotentne (powtórzenie = `200`), służy także do wycofania własnej propozycji; ponowna propozycja jest możliwa po `declined` i po wygaśnięciu; `accept` powtórzony przez przyjmującego zwraca tę samą partię; `ACTIVE_GAME_EXISTS` niesie `data.gameId` tylko dla partii wywołującego.

## Adnotacja po review backendu (2026-10-30)

- **Okno tokenu gościa:** przyjęcie rewanżu wymaga `finished_at > now − (GUEST_TOKEN_GRACE_MS − REMATCH_TTL_MS)` (55 min po zakończeniu), a nie samej godziny. Proponujący gość odbiera miejsce w nowej partii STARYM tokenem (`claimGuestSeat`), który wygasa godzinę po `finished_at`; margines daje mu co najmniej pełne okno oferty (5 min) na odbiór. Oferta w ostatnich 5 minutach życia tokenu daje przy przyjęciu `409 REMATCH_UNAVAILABLE`. Dotyczy tylko partii z gościem; partie kont tego marginesu nie mają.
- **Limit ofert:** próba jest rezerwowana przed zapisem i zwracana, gdy warunkowy `UPDATE` odmawia (`REMATCH_ALREADY_OFFERED`, podwójne kliknięcie) — odrzucona oferta nie zużywa 10/h. **Znane ograniczenie:** dla gościa klucz to `hash(id wiersza uczestnika)`, więc limit działa per partia, nie per osoba (gość z kolejną partią dostaje nowy licznik).
- **Stan `accepted` jest końcowy** (jeden rewanż na zakończoną partię). Po skasowaniu partii rewanżowej przez sprzątanie (#39, `rematch_game_id` → `NULL`) stan zostaje `accepted`, a kolejne `offer` zwracają `409 REMATCH_ALREADY_OFFERED`. Czy to zamierzone? **Pytanie do właściciela:** jeśli nie, `cleanup` powinien zerować stan rewanżu (`cleanup` nie zmieniony).
- **`409 ACTIVE_GAME_EXISTS` bez `gameId`** ujawnia przyjmującemu tylko, że przeciwnik ma inną partię — zaakceptowane (zgodne z Q4).
- **Wymóg wobec UI (zadanie 5.6):** token nowej partii gościa-proponującego jest odbierany wyłącznie przez `GET /api/games/{id}` STAREJ partii, gdy `rematch.state === "accepted"` (`claimGuestSeat` + `Set-Cookie`). Ścieżka SSR (`loadGameView`) nie może ustawić ciasteczka, więc klient MUSI wykonać `fetch` `GET` starej partii (claim) PRZED nawigacją na `/games/{rematch.gameId}` — także po przeładowaniu strony, gdy stan `accepted` przychodzi już z serwera (jednorazowy `GET` przy montowaniu). Inaczej proponujący gość dostaje 404 w nowej partii, a jego miejsce zostaje „duchem” zamykanym po 15 min.

## Adnotacja z implementacji UI (2026-10-30, zadanie 5.6)

- **`GET /api/games/{id}` ma `fromRematch: true`** tylko dla partii powstałej z rewanżu (`origin = 'rematch'`) — nowa partia mówi „Rewanż: kolory zostały zamienione. Grasz …” zamiast „Wylosowano” i pokazuje gościowi „Nowa partia ma nowy dostęp w tej przeglądarce” (p06.15). Zmiana addytywna.
- **Wycofanie a odrzucenie:** serwer zapisuje oba jako `declined` z `offeredBySeat` proponującego, więc nie odróżnia ich po przeładowaniu; strona pamięta własne wycofanie tylko do przeładowania. Po odrzuceniu proponujący może od razu zaproponować ponownie.
- **Odpytywanie:** zakończona partia jest odczytywana co 3 s (także gdy nikt nie proponował), dopóki rewanż nie jest `accepted`; to jedyny sposób, w jaki przeciwnik widzi propozycję bez przeładowania.
- **Claim tokenu gościa-proponującego** (wymóg z review): odczyt starej partii podczas odpytywania jest claimem; po przeładowaniu w stanie `accepted` panel robi jeden `GET` przed nawigacją. Po claimie ciasteczko wskazuje już nową partię, więc kolejny `GET` starej partii kończy się `404` — dlatego claim jest wykonywany raz, a nie przy każdym renderze.

