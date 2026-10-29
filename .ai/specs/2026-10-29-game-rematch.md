# Rewanż po zakończonej partii

> Status: **szkielet — czeka na odpowiedzi właściciela** (`om-spec-writing`, tryb interaktywny, 2026-10-29). Źródło: decyzja właściciela z 2026-10-26 (L13: po końcu partii „Rewanż” z odwróconymi kolorami + wyjście do panelu głównego; zaproszenie do rewanżu wygasa po 5 min; gdy przeciwnik aktywnie wyjdzie, zapraszający od razu widzi „zaproszenie odrzucone”; gość może proponować i przyjmować rewanż), BR-13, BR-22, #21 (token gościa), #22 Q1 (losowanie koloru), mapa `lekcja-07/mapa-ekranow-partia.md` (p06.10–p06.15, L21, L22, L24). Wymaga nowego zgłoszenia w trackerze (E02-S06).

## 📝 TLDR

Po zakończonej partii dwaj gracze zwykle chcą zagrać jeszcze raz. Dziś muszą od nowa utworzyć zaproszenie, wysłać link i czekać. Po wdrożeniu (zachowanie przyszłe) jeden z graczy proponuje rewanż jednym kliknięciem, drugi go przyjmuje lub odrzuca, a przyjęcie od razu tworzy nową partię z odwróconymi kolorami (kto grał czarnymi, gra białymi), bez kodu i linku.

## Open Questions

- **Q1 — Kto i kiedy może zaproponować.** Każdy z dwóch uczestników zakończonej partii (powód końca dowolny: piątka, remis, czas, poddanie), dopóki nie ma aktywnej propozycji. Rekomendacja: tak; jedna propozycja naraz na partię.
- **Q2 — Gdzie żyje propozycja.** Na wierszu zakończonej partii (pola: kto zaproponował, `expiresAt` = +5 min, stan: oczekuje / przyjęta / odrzucona), bez nowej tabeli; przyjęcie tworzy nową partię `active` z odwróconymi kolorami i przekierowuje oboje na jej adres. Rekomendacja: tak.
- **Q3 — Odrzucenie i „aktywne wyjście” (L21).** „Aktywne wyjście” = kliknięcie „Wróć do panelu głównego” albo „Odrzuć” na ekranie wyniku; zapisuje stan „odrzucona” i zapraszający od razu (przy najbliższym odczycie) widzi „Zaproszenie do rewanżu odrzucone” z przyciskiem do panelu głównego. Samo zamknięcie karty nie jest sygnałem — wtedy propozycja wygasa po 5 min. Rekomendacja: tak.
- **Q4 — BR-13 przy przyjęciu (L22).** Przy przyjęciu serwer w jednej transakcji sprawdza, że żaden z dwóch graczy nie ma innej aktywnej partii; jeśli któryś ma, przyjęcie kończy się błędem `409` („Masz już partię”) z linkiem do niej, a propozycja pozostaje do wygaśnięcia lub odrzucenia. Rekomendacja: tak (bez sprawdzania w chwili propozycji).
- **Q5 — Gość (L24).** Gość proponuje i przyjmuje rewanż. Przy przyjęciu dostaje NOWY token dla nowej partii w tej samej przeglądarce (poprzedni token zakończonej partii wygasa po 1 h jak dotąd; ciasteczko jest nadpisywane, jak przy zwykłym dołączeniu drugiej partii, #21). Rewanż wymaga, by gość miał jeszcze ważny token starej partii (do 1 h po końcu). Rekomendacja: tak.
- **Q6 — Zegary i start.** Nowa partia startuje jak zwykła: `active`, zegar rusza dopiero, gdy obaj mają `seen_at` (#21 Q20), 15 minut na otwarcie strony (Q21). Obaj są już na stronie, więc praktycznie od razu. Rekomendacja: tak, bez specjalnych reguł.
- **Q7 — Limity.** Jedna propozycja naraz na partię; limit propozycji na gracza (np. 10 na godzinę) przeciw zasypywaniu; propozycja po 5 min wygasa i można zaproponować ponownie. Rekomendacja: tak.
- **Q8 — Poddanie/czas a rewanż.** Rewanż dostępny po każdym zakończeniu, także po poddaniu i przegranej na czas. Rekomendacja: tak.

## 📝 Problem Statement

Gracze, którzy skończyli partię, tracą kilka minut na ponowne utworzenie zaproszenia i wysłanie linku, a gość nie ma jak szybko zagrać znowu. Rewanż skraca tę ścieżkę do jednego kliknięcia po każdej stronie.

## 📝 Proposed Solution (do uzupełnienia po odpowiedziach)

Kierunek: kolumny propozycji rewanżu w `games` (`rematchOfferedBySeat`, `rematchExpiresAt`, `rematchState`, `rematchGameId`), `RematchService.offer/accept/decline`, route `POST /api/games/[id]/rematch` (propozycja), `…/rematch/accept`, `…/rematch/decline`; `GET /api/games/{id}` zwraca stan propozycji; stany ekranu p06.10–p06.15 w prototypie; kolory nowej partii: `blackSeat` przeciwny do poprzedniej (bez losowania).
