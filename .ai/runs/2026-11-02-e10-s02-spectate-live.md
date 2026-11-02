# Przebieg: E10-S02 (#207) + E10-S02-T02 (#208) — oglądanie partii publicznej na żywo

- **Cel:** migracja widza (tymczasowy, konto albo nick, bez miejsca i historii) oraz oglądanie rozpoczętej partii publicznej po kodzie: limit 20, odczyt tylko do odczytu co 2 s, sprzątanie w `db:cleanup`. Autonomicznie, na mocy delegacji właściciela (Q-17 = polling).
- **Kroki:** specyfikacja `.ai/specs/2026-11-02-spectate-live-game.md` (z T01) uzgodniona z kodem → `GameSpectator` + migracja przez `npm run db:migration:create` (szum starego snapshotu usunięty z migracji) → reguła cleanup → `watchableState` wydzielone z `GameService.stateOf` → `SpectatorService` i trasy → `watchable` w podglądzie zaproszenia → `WatchActions`, `SpectatorRoom` → testy jednostkowe i integracyjne → spec przeniesiona do `implemented/`.
- **Zmiany:** `packages/db` (encja, migracja, reguła), `packages/core` (stałe, schemat), `packages/app` (serwis, http, trasy, strony), `docs/wdrozenie-i-utrzymanie.md`, testy integracyjne `game-spectators-migration`, `game-spectate-api`, `game-spectate-pages`.
- **Błędy po drodze:** tempo odpytywania planowane przed odpowiedzią (lekcja `2026-11-02-poll-pace-reads-the-answer-before-scheduling`); stary snapshot MikroORM dopisał obce zmiany do migracji (znana lekcja 2026-10-31).
- **Nie zrobiono:** pułap globalny widzów (propozycja, nie decyzja); pomiar na Mikrusie; czat, licznik, kill-switch, agent (S03–S06).
- **Status:** patrz raport zadania; weryfikacja `npm run check` w raporcie.
