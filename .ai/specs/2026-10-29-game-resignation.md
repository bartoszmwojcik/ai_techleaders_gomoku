# Poddanie partii

> Status: **szkielet — czeka na odpowiedzi właściciela** (`om-spec-writing`, tryb interaktywny, 2026-10-29). Źródło: decyzja właściciela z 2026-10-26 (L12: poddanie wchodzi do MVP), `.ai/specs/product-brief.md` (BR-13, BR-21: „Najpierw dokończ albo poddaj partię”), #22 Q6 (poddanie było poza zakresem — ta specyfikacja je zmienia), #21 (`resolveParticipant`, `is_active`), #23 (zegar, `settleGame`), mapa `lekcja-07/mapa-ekranow-partia.md` (p05.13, p05.14, p06.8, p06.9, L23). Wymaga nowego zgłoszenia w trackerze (E02-S05) — do utworzenia po zatwierdzeniu.

## 📝 TLDR

Dziś partię kończy tylko piątka, remis albo czas. Gracz, który chce wyjść z przegranej partii, albo użytkownik, który chce usunąć konto (BR-21 każe „najpierw dokończyć albo poddać”), nie ma jak jej zakończyć. Po wdrożeniu (zachowanie przyszłe) gracz poddaje partię jednym potwierdzonym działaniem; przeciwnik wygrywa z powodem `resignation`, obaj gracze są zwolnieni z BR-13, a usunięcie konta przestaje być zablokowane.

## Open Questions

- **Q1 — Kiedy można się poddać.** (a) w każdej chwili w partii `active` (także przed pierwszym ruchem i w turze przeciwnika), (b) dopiero po N ruchach. Rekomendacja: (a), prosta reguła; nadużycie (poddanie przed ruchem 1) nie daje nic poza oddaniem wygranej przeciwnikowi.
- **Q2 — Potwierdzenie.** Dialog z tekstem (propozycja: „Czy na pewno chcesz się poddać? Przeciwnik wygra partię.”) i przyciskami „Poddaj partię” / „Wróć do gry” (fokus na bezpiecznej opcji „Wróć do gry”). Rekomendacja: tak, jak w prototypie (stan p05.13/p05.14), bez dodatkowych kroków.
- **Q3 — Skutek.** Wygrywa drugi gracz, `endReason = resignation`, `finishedAt = now`, obaj uczestnicy `is_active = false` (BR-13 zwolnione), zegary zamrożone, odpytywanie zatrzymane. Tak samo dla konta i gościa. Czy w historii (#27) wynik pokazuje „Poddanie” po obu stronach (przegrany: „Poddałeś partię”, zwycięzca: „Przeciwnik poddał partię”)? Rekomendacja: tak.
- **Q4 — Kto i skąd.** Każdy uczestnik partii `active` (konto lub gość, `resolveParticipant`); przeciwnik nie jest pytany o zgodę; nie dotyczy `waiting` (tam jest anulowanie z #21). Rekomendacja: tak.
- **Q5 — Kontrakt API.** `POST /api/games/{id}/resign`, bez ciała, CSRF jak reszta; idempotentne (drugie wywołanie po `resignation` tego samego gracza to `200` z aktualnym stanem); `409 GAME_FINISHED` gdy partia zakończyła się inaczej; wyścig z czasem lub ruchem kończącym rozstrzyga ta sama blokada wiersza i warunkowy `UPDATE` co w #22/#23 (kto pierwszy po blokadzie). Rekomendacja: tak.
- **Q6 — Usunięcie konta (#37).** Po poddaniu partia jest `finished`, więc blokada BR-21 znika; komunikat z blokady („Najpierw dokończ albo poddaj partię”) dostaje link do partii. Rekomendacja: tak, link do partii w komunikacie #37 (osobna drobna zmiana w #37).

## 📝 Problem Statement

Partii nie da się opuścić inaczej niż przez wygraną, remis albo upływ czasu, a BR-21 zakłada, że poddanie istnieje. Bez niego gracz musi czekać do 10 minut, żeby zwolnić BR-13, albo zostaje zablokowany przy usuwaniu konta.

## 📝 Proposed Solution (do uzupełnienia po odpowiedziach)

Kierunek: `GameMoveService.resign(participant, gameId)` obok `play` (ta sama blokada wiersza i `timeoutSettler.settleGame` przed oceną), `endReason = resignation` rozszerzeniem `CHECK` z #22/#23, route `POST /api/games/[id]/resign`, przycisk „Poddaj partię” pod planszą z dialogiem potwierdzenia (`ConfirmDialog` z DS), stany wyniku w UI (p06.8, p06.9).
