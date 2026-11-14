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

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Treść

- [ ] 1.1 Przenieść szczegóły do `docs/funkcje.md`
- [ ] 1.2 Dobrać i skopiować zrzuty ekranu do `docs/img/`
- [ ] 1.3 Przepisać `README.md`

### Phase 2: Weryfikacja

- [ ] 2.1 Sprawdzić linki względne i obrazy, przejrzeć diff
