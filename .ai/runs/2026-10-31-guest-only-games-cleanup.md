# Plan wykonania: sprzątanie partii złożonych wyłącznie z gości

Source doc: .ai/specs/2026-10-30-guest-only-games-cleanup.md

## Goal

`npm run db:cleanup` usuwa martwe partie `active` i zakończone partie `finished` złożone wyłącznie z gości (po 1 h marginesu). Refs #108, Closes #102.

## Scope

`packages/db/src/cleanup` (2 reguły, typy, wynik), testy jednostkowe, integracyjne (PostgreSQL), README, adnotacja w specyfikacji #39. Bez UI, bez migracji.

## Non-goals

Limit `accept`, rozstrzyganie zegara w sprzątaniu, sprzątanie partii `active` z kontem, indeksy (chyba że EXPLAIN wymusi).

## Risks

Reguły kasują dane: błędny warunek `kind` mógłby usunąć partię z kontem — testy progów na PostgreSQL w obie strony. Lekcje: `em.execute` wiąże `?`, daty liczyć w SQL.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Reguły

- [x] 1.1 Reguły guestOnlyActiveGames i guestOnlyFinishedGames, typy, wynik, komentarz budżetu, testy jednostkowe

### Phase 2: Testy na PostgreSQL

- [ ] 2.1 Progi, konta, zegar, kaskada, rematch w tests/integration/cleanup.test.ts
- [ ] 2.2 Zgodność zegara SQL z deadlineMs (test tabelaryczny)
- [ ] 2.3 Testy wyścigu (dwa połączenia)
- [ ] 2.4 EXPLAIN warunków na jednorazowej bazie

### Phase 3: Dokumentacja i weryfikacja

- [ ] 3.1 README, adnotacja w specyfikacji #39, odstępstwa wdrożenia
- [ ] 3.2 Pełna bramka walidacyjna
