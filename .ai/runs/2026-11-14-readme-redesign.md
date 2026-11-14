# Run: nowe README (strona wejściowa projektu)

- Data: 2026-11-14
- Skill: `om-auto-create-pr` (silnik: om-auto-create-pr, kroki: 4, --loop: nie)
- Gałąź: `feat/readme-redesign`

## Cel

Uprościć `README.md` do atrakcyjnej strony wejściowej: wyśrodkowany tytuł, emoji, krótki przegląd funkcji, galeria zrzutów ekranu prawdziwej aplikacji (z artefaktów QA / poprzednich przebiegów AI) i krótki Getting Started. Szczegóły techniczne obecnego README przenieść na osobną stronę dokumentacji.

## Zakres

- `README.md` — przepisany.
- `docs/funkcje.md` — nowa strona: pełny opis funkcji z dotychczasowego README (zasady wariantu, flagi `BOT_ENABLED`/`SHOW_*`, administrator, mechanizm wyboru języka, plany, struktura repozytorium).
- `docs/img/*.png` — zrzuty ekranu skopiowane z artefaktów QA (bez danych osobowych).

## Non-goals

- Bez zmian kodu, `AGENTS.md`, specyfikacji ani pozostałych stron `docs/`.
- Bez nowych zrzutów generowanych na produkcji.

## Plan

### Phase 1: Treść

- 1.1 Przenieść szczegóły do `docs/funkcje.md`
- 1.2 Dobrać i skopiować zrzuty ekranu do `docs/img/`
- 1.3 Przepisać `README.md`

### Phase 2: Weryfikacja

- 2.1 Sprawdzić linki względne i obrazy, przejrzeć diff

## Ryzyka

- Zrzuty z artefaktów QA mogą zawierać nicki testowe — dobieramy tylko neutralne (QA_*, boty).
- PR tylko z dokumentacją: CI pomija ciężkie joby (`changes`), bramka = przegląd diffu i sprawdzenie linków.

## Progress

PR: #318

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Treść

- [x] 1.1 Przenieść szczegóły do `docs/funkcje.md` — 5bf64ba
- [x] 1.2 Dobrać i skopiować zrzuty ekranu do `docs/img/` — 6c8fb7a
- [x] 1.3 Przepisać `README.md` — c08d65e

### Phase 2: Weryfikacja

- [x] 2.1 Sprawdzić linki względne i obrazy, przejrzeć diff — c08d65e

## Wynik

- Zrzuty: `strona-glowna` (artefakt QA PR #302), `partia-ciemny-motyw`, `papier-i-olowek`, `zaproszenie`, `gra-z-botem` (przebiegi AI w `.ai/cezar/runs`, przycięte; baner z testowym e-mailem wycięty), `lobby` (artefakt QA PR #123), `partia-telefon` (bez zmian).
- Weryfikacja: wszystkie linki względne i obrazy w `README.md` i `docs/funkcje.md` istnieją; kotwice do `architektura.md` i `wdrozenie-i-utrzymanie.md` przeniesione bez zmian z poprzedniego README. Bramka kodu (`lint`/`typecheck`/`test`/`build`/`test:integration`) nie dotyczy — PR tylko z dokumentacją, CI pomija ciężkie joby.
- Status: complete.
