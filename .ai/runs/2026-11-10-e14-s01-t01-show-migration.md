# E14-S01-T01 — migracja `origin = 'show'`, typy, konfiguracja (#281)

- **Cel:** kroki 1–2 planu E14-S01 ze specyfikacji `.ai/specs/2026-11-09-show-mode.md` — migracja, typy i konfiguracja pokazu; nic jeszcze nie tworzy pokazu.
- **Tryb:** zadanie cezar wysłane przez epik E14 (run `3ee29010`), worktree `cez/d90dfe11` z `origin/main` (`ec53ea2`).

## Kroki

1. `GAME_ORIGINS` + `'show'`, alias `OpponentOfAgentKind`, `SHOW_WAITING_TTL_MS` (30 min) w `core` — test stałych.
2. CHECK-i encji: `games_origin_check` z `'show'`, usunięty `game_players_bot_seat_check` (komentarz: pilnuje serwis tworzący pokaz).
3. `npm run db:migration:create -- --name show_origin` na tymczasowym kontenerze PostgreSQL 17 (port 55491). Wygenerowany plik i snapshot czyste (tylko dwie zmiany); czysty snapshot zachowany w `/tmp` i przywracany po każdym `migration:up` i teście integracyjnym (lekcja 2026-10-31). Dopisany `down()` z odmową.
4. Ręczne sprawdzenie na PostgreSQL: `up` → pokaz z botami na miejscach 1 i 2 → `down` odmawia („Cannot revert … show games exist”) → usunięcie graczy (nadal odmawia: sama partia `show`) → usunięcie partii → `down` przywraca `kind <> 'bot' or seat = 2` i stary `origin` → `up` ponownie.
5. Testy integracyjne: nowy `game-show-migration.test.ts`; `game-bot-migration.test.ts` migruje do `bot_participant` (`up({ to })`), bo najnowsza migracja usuwa sprawdzany CHECK; `game-schema.test.ts` — bot na miejscu 1 w pokazie przyjęty, negatywne bez poziomu i z kontem.
6. `serverConfig.show` + `readShowConfig`, `parseFlag` (z niego `parseBotEnabled`), testy domyślnych, odczytu i błędów.
7. `.env.example` — **nieuzupełniony**: odczyt i zapis pliku odmówione w tej sesji (reguła uprawnień `.env*`), jak w E13. Zmienne w opisie PR.

## Bramka

- `npm run lint` — 0 błędów (2 wcześniejsze ostrzeżenia w `game-service.test.ts`, bez związku).
- `npm run typecheck` — zielony.
- `npm test` — 354 pliki, 3789 testów, próg 100% na plik spełniony.
- `npm run build` — zielony.
- `npm run test:integration` — 88 plików, 993 testy, zielone (lokalnie, Docker).

## Uwagi

- Docker Desktop był zatrzymany; uruchomiony (`systemctl --user start docker-desktop`) na potrzeby PostgreSQL i Testcontainers.

## Status

Zakończone — PR gotowy do przeglądu (bez merge'a; scala rodzic).
