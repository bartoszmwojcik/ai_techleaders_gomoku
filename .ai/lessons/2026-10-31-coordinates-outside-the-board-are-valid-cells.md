# Współrzędne spoza planszy mogą być poprawną komórką

- **Problem:** `cellOf(x, y) = y * 15 + x` nie sprawdza zakresu: `cellOf(15, 0)` to komórka (0, 1), a `cellOf(-1, 1)` to (14, 0). Plan zakładał, że ruch poza planszą odrzuci `applyMove`; zagrałby cudzy ruch.
- **Reguła:** każde wejście z `x`/`y` spoza REST (gdzie `moveCreateSchema` pilnuje 0–14) sprawdzaj zakresem **przed** `cellOf`; w MCP robi to `AgentGameService.playMove` i kod `ILLEGAL_MOVE` / `out_of_board`. Test: narożniki 0 i 14 przechodzą, -1 i 15 nie, także przy wartościach daleko poza planszą.
- **Powiązane:** E06-S02 (#128), `.ai/specs/implemented/2026-10-31-agent-plays-game-mcp.md`.
