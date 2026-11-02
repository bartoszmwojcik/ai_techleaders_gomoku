# E10-S02-T01 (#206): wybór mechanizmu odświeżania widza i pomiar obciążenia

- **Cel:** decyzja Q-17 (polling vs push) i pomiar A-14 (2 graczy + 20 widzów), specyfikacja E10-S02.
- **Kroki:** `npm ci`; build produkcyjny; `.ai/scripts/load-spectators.sh` (PostgreSQL 17 w Dockerze + `next start`, 6 scenariuszy po 40 ruchów + `--sse-reference`); odczyt hosta Mikrus przez MCP.
- **Wynik:** polling co 2 s; 20 widzów @ 2 s: POST ruchu p95 38,5 ms (bez widzów 59 ms), RSS 190 vs 174 MB, CPU 16 % rdzenia; wyniki w `.ai/specs/2026-11-02-spectate-live-game.md`.
- **Błędy/ograniczenia:** `mcp__mikrus__servers` odrzucone przez tryb uprawnień — brak pomiaru na Mikrusie (jawnie w specyfikacji). `.ai/scripts/test-env-up.sh` zwrócił 500 przy rejestracji (brak `ADMIN_EMAIL` w produkcji) — skrypt pomiarowy ustawia go sam; nie poprawiano test-env-up (poza zakresem).
- **Zmiany:** `.ai/scripts/load-spectators.{sh,mjs}`, specyfikacja, adnotacje Q-17/A-14 w briefie. Brak kodu aplikacji.
- **Status:** zakończone (częściowo: host niezmierzony).
