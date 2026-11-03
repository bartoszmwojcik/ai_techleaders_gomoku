# Miejsce prowadzonego przez automat nie rusza ręcznie

**Problem:** w wariancie „papier” po przejęciu przez automat prowadzący gracz S mógł po ruchu przeciwnika sam postawić kamień (`POST /moves` → 200), bo `PaperMoveService.play` odrzucał tylko ruch, gdy `onTurn !== seat`; gdy na ruchu był S, a żądanie szło od S, warunek przechodził.

**Kontekst:** ujawnił to dopiero test integracyjny `game-paper-api.test.ts` (fałszywy `em` w teście jednostkowym budował tylko przypadek „przeciwnik próbuje ruszyć przed automatem”).

**Reguła:** w teście reguł tury sprawdzaj oba miejsca (S i O) w każdej z dwóch pozycji (na ruchu S, na ruchu O); warunek „kto może ruszyć” zapisuj przez pozycję i fazę, nie tylko przez porównanie `onTurn` z `seat`.

Powiązane: `.ai/specs/2026-11-02-paper-pencil-gomoku.md` (BR-50, tabela osi czasu).
