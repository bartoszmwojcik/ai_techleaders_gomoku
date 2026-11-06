# 2026-11-06 — E13-S02 + T01: gra z botem (cezar, zadanie e69c595d)

**Cel:** historia E13-S02 (#259) z zadaniem T01 (#261) w jednym PR do `main`, wg `.ai/specs/2026-11-05-hosted-bot.md` (faza S02, kroki 1–5).

## Kroki

1. **T01 — typy i migracja.** `PARTICIPANT_KINDS`/`GAME_ORIGINS` + `bot`, `CreatorKind` bez bota, `bot/profile.ts` (`BOT_LEVELS`, `botTierOf`, `botDisplayName`), schematy `opponent`/`botLevel`; encje i migracja `Migration20261106071117_bot_participant` (wygenerowana przez `db:migration:create` w kopii pod `/tmp`, szum nieaktualnego snapshotu — tabele papieru — usunięty, snapshot odświeżony). Na PostgreSQL: `up`, odmowa `down` przy partii z botem, `down`, ponowne `up` — OK.
2. **Tworzenie partii.** `GameService.create` z `opponent` (partia `active`, `origin = 'bot'`, bot na miejscu 2, losowanie koloru, bez zaproszenia), `BOT_ENABLED` (domyślnie wyłączone → `503 BOT_UNAVAILABLE` + `Retry-After`, nowy `ServiceUnavailableError`).
3. **Ruch bota.** `BotEngine` (silnik S03 w głównym wątku, budżet 250/500 ms, awaryjnie poziom 1 i pierwsze wolne pole), `BotTurnService` (peek bez blokady, mapa „w locie” na `globalThis`, zapis przez `GameMoveService.play`, ziarno R16, ignorowanie przegranych wyścigów), `scheduleBotTurn` z `after()` w trasach stanu i ruchu.
4. **Zasady partii.** Rewanż → `409 REMATCH_UNAVAILABLE` (osobny tekst), czat → `unavailable`, publiczność niemożliwa (schemat + serwis).
5. **UI.** `OpponentPicker` (Przeciwnik / Poziom bota), „Zagraj z botem”, „Bot myśli…”, odpytywanie 750 ms, „Zagraj ponownie z botem” (`BotReplay`), bez czatu.
6. **Testy.** Jednostkowe 100% per plik; integracyjne: `game-bot-api`, `game-bot-pages` (także 320 px), `game-bot-migration`, CHECK-i w `game-schema`.

## Problemy

- CLI MikroORM w worktree cezara sięga `@mikro-orm/migrations` 7.2.5 z głównego checkoutu → migracje i integracja w kopii `/tmp/e69c` z własnym `npm ci` (lekcja `2026-11-03-worktree-needs-own-node-modules`).
- Stary test schematu używał `origin = 'bot'` jako wartości niepoprawnej — zmieniony na `cpu`.
- Odczyt `.env.example` jest zablokowany w sesji headless (odmowa uprawnień) — plik niezmieniony; `BOT_ENABLED` opisany w `docs/architektura.md`, do dopisania w `.env.example` przy S04 (razem z resztą `BOT_*`).

## Status

Zob. opis PR i raport zadania.
