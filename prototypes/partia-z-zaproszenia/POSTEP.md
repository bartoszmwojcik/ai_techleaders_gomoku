# Postęp: klikalny prototyp Epiku 02 (partia z zaproszenia)

Stan: **etap A gotowy (D3.1); etap B (p05–p07: plansza, zegary, wynik, poddanie, rewanż) w zadaniu D3.2.**

## Źródła

- Mapa ekranów (zatwierdzona): `lekcja-07/mapa-ekranow-partia.md` (ID p01–p07, stanów pNN.M, scenariuszy Q01–Q12, kont T1–T8, luk L01–L24 i D01–D07 są stałe; sekcje 0a i 0b to decyzje i założenia robocze).
- Szary prototyp: `.ai/prototypes/discovery/game-from-invitation/revision-002/` (teksty i założenia A-01…A-11 z etapu A).
- Specyfikacje: `.ai/specs/2026-10-24-game-invitations.md` (#21), pozostałe `2026-10-2*-game-*.md` (dla etapu B).
- Design system: `packages/ui/docs/design-system.md`, `packages/ui/docs/epics/partia.mdx`, komponenty `@gomoku/ui/game/*`.
- Silnik przeglądu: `lekcja-07/silnik-przegladu/` (`prototype.js` bez zmian).

## Miejsca

- Źródła: `prototypes/partia-z-zaproszenia/` (w repozytorium).
- Wynik budowania: `packages/ui/.storybook/public/prototypes/partia-z-zaproszenia/` (ignorowany przez git). Adres: `/prototypes/partia-z-zaproszenia/index.html`. `scripts/syncPrototypes.mjs` kopiuje tylko slugi z `.ai/prototypes/discovery` (tu: `game-from-invitation`), więc nie koliduje.

## Etap A: co jest zrobione

- Szkielet 1:1 z `prototypes/konta-i-role`: Vite, Vitest + jsdom, silnik przeglądu, mostek tokenów, pasek, panel „Scenariusze”.
- Symulator `src/sim.ts`: konta T1–T7, partie i zaproszenia (`ABCD-EFGH`), gość z tokenem, BR-13, Q18, limit 10 utworzeń na godzinę, wygasanie 24 h, anulowanie po 15 min bez otwarcia (Q21), anulowanie przez twórcę z potwierdzeniem (L04), limit nieudanych sprawdzeń kodu.
- Ekrany p01, p02, s07, p03, p04 ze wszystkimi stanami z mapy (p01.1–7, p02.1–5, s07.1–9, p03.1–10, p04.1–4); numer stanu widać w pasku, w kodzie jako `data-state`.
- Bramka p07.2 / p07.3 na p03 i p04 (bez osobnego ekranu).
- Notatki przy każdym ekranie, README z sekcją „Ograniczenia symulacji”.
- Testy nawigacji: `tests/navigation.test.tsx` (Vitest + jsdom).
- Sprawdzenie w przeglądarce: `checks/etap-a-walk.sh`, wynik `checks/etap-a-log.txt`, zrzuty `checks/etap-a-evidence/`.

## Decyzje i założenia etapu A

- s07 jest w prototypie, bo mapa wprowadza go jako krok 2 przepływu (wspólny z E01). Logowanie i rejestracja otwierają dialog (konta mają własny prototyp).
- Symulator jest prawdziwy (stan partii wynika z akcji), nie zbiór ustawień jak w szarym prototypie; kontrolki „Przeciwnik dołącza” i skróty do stanów skracają drogę.
- Poza szarym prototypem: p01.4 jako „p03.1 + p01.4” (stan złożony), wejście na s07 z paska bez linku (cudze zaproszenie albo zaproszenie Ala_7), „Partia w toku” dla T3 na p04 jako zapowiedź etapu B, p04 bez planszy z dwoma zegarami 10:00 (komponent Zegar gracza).
- D3.2 dołoży p05–p07 do tych samych `sim.ts` i `chrome.tsx`; przyciski „Przejdź do planszy” i „Partia w toku” otwierają dziś dialog.
