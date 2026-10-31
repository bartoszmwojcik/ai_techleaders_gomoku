# Postęp: klikalny prototyp Epiku 02 (partia z zaproszenia)

Stan: **etap A gotowy (D3.1); etap B (p05–p07: plansza, zegary, wynik, poddanie, rewanż, powrót) zbudowany w zadaniu D3.2, do przeglądu przez właściciela.**

## Źródła

- Mapa ekranów (zatwierdzona): `lekcja-07/mapa-ekranow-partia.md` (ID p01–p07, stanów pNN.M, scenariuszy Q01–Q12, kont T1–T8, luk L01–L24 i D01–D07 są stałe; sekcje 0a i 0b to decyzje i założenia robocze).
- Szary prototyp: `.ai/prototypes/discovery/game-from-invitation/revision-002/` (teksty i założenia A-01…A-11 z etapu A).
- Specyfikacje: `.ai/specs/implemented/2026-10-24-game-invitations.md` (#21), pozostałe `2026-10-2*-game-*.md` (dla etapu B).
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
- Przyciski „Przejdź do planszy” i „Partia w toku” otwierały w etapie A dialog; etap B zamienił je na prawdziwe przejścia na planszę.

## Etap B: co jest zrobione (D3.2)

- Symulator `src/sim.ts` dostał prawdziwe reguły: plansza 15×15, stawianie na wolnym polu, naprzemienność, pięć i więcej na 4 osiach z linią wygrywającą, remis, zegar serwerowy (10:00, tylko gracz na ruchu, start przy otwarciu planszy, leniwa przegrana na czas), poddanie, rewanż (odwrócone kolory, 5 min, BR-13 przy przyjęciu, nowy token gościa), token gościa do 1 h po końcu, karta w tle (próg 30 s).
- Ekrany: p05 (p05.1–p05.14), p06 (p06.1–p06.15), p07 (p07.1–p07.4 oraz p06.7), bramki wspólne dla p03–p06. Składają się z Planszy, Zegara gracza, Statusu tury, Baneru wyniku, Dialogu potwierdzenia, Alertu, Szkieletu i Stanu błędu; wszystkie wartości z tokenów.
- Panel „Scenariusze” rozszerzony o kontrolki z szarego prototypu (ruchy przeciwnika, wyniki ruchu, dotyk/mysz, zegar partii z „Odliczaj zegar” x10, skoki i „Minął czas”, karta w tle, skróty do wyniku, rewanż przeciwnika, błędy p07).
- Testy: `tests/stage-b.test.tsx` (wygrane na 4 osiach i sześć w linii, remis, zegar, poddanie, rewanż, karta w tle, p07) obok testów etapu A.
- Przeglądarka: `checks/etap-b-walk.sh`, wynik `checks/etap-b-log.txt`, zrzuty `checks/etap-b-evidence/`; regresja etapu A: `checks/etap-a-walk.sh` (trzy sprawdzenia dostosowane do zastąpienia dialogu planszą: E.8, E.9a, E.21).

## Decyzje i założenia etapu B

- Założenia A-12…A-26 szarego prototypu (`revision-002`) przeniesione bez zmiany treści; lista i odstępstwa w README („Ograniczenia symulacji”).
- Odstępstwa: brak wskaźnika „przeciwnik rozłączony” (mapa L11 i #24 Q1: wskaźnika nie ma), „mało czasu” jako token `status-danger` i obrys zamiast `#ff2d00`, „pole zajęte” i „nie Twoja kolej” wywoływane kontrolką (Plansza nie pozwala na takie kliknięcie), rzeczywista zmiana widoczności karty też liczy się jako nieobecność.
- Luki w design systemie zapisane w kodzie jako `LUKA`: D01, D04, D06 oraz brak miejsca na błąd w Dialogu potwierdzenia.
- Bez zmian: reguły z mapy (sekcje 0a, 0b), ID ekranów i stanów, silnik przeglądu.

## Etap C: gra bez konta (zadanie 6.2, rewizja 2026-10-30)

Stan: **zbudowany, czeka na przegląd właściciela** (nie zatwierdzony). Źródło: mapa `lekcja-07/mapa-ekranow-partia.md` po aktualizacji 2026-10-30 (sekcje 0c, 0d, 1a, 1b, 2 Q13–Q22, 3 T9 i T10, luki L25–L35, D08–D12), specyfikacje `.ai/specs/implemented/2026-10-30-participant-nickname.md` (E02-S07, #94) i `.ai/specs/implemented/2026-10-30-guest-creates-game.md` (E02-S08, #95).

- Symulator: gość tworzy partię (tokeny gościa na tożsamość T5/T9/T10), nick z normalizacją i regułami ze specyfikacji, limit adresu 10/godz., `500`, `409` (aktywna: odmowa; oczekująca: „Anuluj i utwórz nową” z potwierdzeniem), anulowanie przez gościa-twórcę, wygaśnięcie (L29: „Zaproszenie wygasło” przez 1 h, potem 404), gość–gość i gość–konto w obu kierunkach do końca partii, rewanż z zachowanym nickiem i nazwą domyślną idącą za miejscem. Brak blokady logowania gościa (decyzja 3).
- Ekrany: nowy p08 (p08.1–p08.8), p01.8–p01.9, p03.11–p03.13, s07.2 z nickiem, s07.10, s07.11, etykiety „{nick} (gość)” / „Gracz 1/2 (gość)” w p03.5, p04, p05, p06, p07.3. Założenia oznaczone `data-assumption`; luki DS D08, D09, D10, D12 jako `LUKA` w kodzie.
- Zmiany po zatwierdzeniu luk (wprowadzone w tej samej rewizji): L25 (linia „Zaproszenie jest ważne 24 godziny.”), L29 („Zaproszenie wygasło” zamiast 404 na godzinę), L34 (drugorzędny przycisk).
- Testy: `tests/stage-c.test.tsx` (nick, p08, 409, limit, wygaśnięcie, gość–gość do wygranej, etykiety, długi nick, s07.2/s07.10/s07.11, rewanż); `checks/etap-c-walk.sh` z logiem i zrzutami; regresja etapów A i B (zmienione tylko asercje etykiet: „Gracz 2 (gość)”, sesja gościa w pasku).
- Pozostałe założenia robocze i odstępstwa: README, „Założenia i decyzje etapu C”.
