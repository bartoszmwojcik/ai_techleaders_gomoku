# Naprawa i scalenie otwartych PR-ów (5 listopada 2026)

**Cel:** polecenie właściciela „Napraw wszystkie PR, daję z góry approve i scal je”.

**Status:** sześć PR-ów scalonych (#239–#242, #244, #250); #245 i #246 zamknięte decyzją właściciela.

## Kroki

- #244: zielone CI i przegląd bez blockerów na bieżącym SHA, scalony. Uwagi z przeglądu w #247.
- #239: czerwony test `agent-chat-pages` nie powtórzył się po zmergowaniu `main`, scalony. Flake w #248.
- #240, #241: zmergowane z `main`, zielone CI, scalone. Na ESLint 10 reguły potwierdzone próbnymi błędami.
- #242: TS 7 niewspierany przez `typescript-eslint` (peer `<6.1.0`), więc PR zmieniony na `^6.0.3`, a Dependabot ignoruje `>=7`.
- `main`: dwa czerwone przebiegi (`a8b9688`, `b1fefe7`) z tym samym błędem `game-paper-ui`, opisane w #249.
- #245 (Postgres 18): CI czerwone, wymaga `pg_upgrade`; właściciel zdecydował o zamknięciu i ignorowaniu majorów Postgresa w Dependabocie.
- #246 (Node 26): właściciel zdecydował o zamknięciu; zmiana razem z CI i `engines` opisana w #251.
- #250 (`cn` 0.5.2): scalony po zielonym CI razem z regułą Dependabota i tym logiem.

## Błędy i uwagi

- Dependabot sam przebudował gałąź #242 w trakcie pracy i push został odrzucony; rozwiązane merge'em `-s ours`, bez force-pusha.
- Lokalnie 2 testy jednostkowe padły przy pierwszym przebiegu na #239 i przeszły przy powtórce; ich nazw nie zapisano.
- Testy integracyjne sprawdzało tylko CI, lokalnie ich nie uruchomiono.
