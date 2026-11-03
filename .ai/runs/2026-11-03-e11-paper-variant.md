# Przebieg: E11 — wariant „papier i ołówek” (#215–#223)

- Cel: wykonać epik E11 jednym PR-em (R11). Spec przeniesiona z gałęzi szkicu, wdrożona.
- Kroki: core (reguły, schematy) — root; dane (migracja) — zadanie bfb939e6; PaperBoard — fb0865b3; MCP i sprzątanie — ca24d3e3; testy serwerowe — 5f33fdf1; warstwa kliencka — 584318d8; integracja i domknięcie — root.
- Weryfikacja: lint, typecheck, `npm test` (3368 testów, 100% pokrycia), build, testy integracyjne (pełny przebieg + poprawki oczekiwań), nowe: game-paper-api, game-paper-ui, agent-play-api, cleanup.
- Odstępstwa: przycisk „Wyśrodkuj” w pasku planszy (nie w wierszu z „Postaw kamień”); przegląd (E09) partii „papier” pokazuje informację zamiast planszy; test 320×568 toleruje 40 px przy długich imionach.
- Status: gotowe do przeglądu.
