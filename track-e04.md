# Śledzenie implementacji Epiku 04 (historia partii)

- Start: 2026-10-31. Źródła: zgłoszenia #18 (epik), #27 (E04-S01); specyfikacja: `.ai/specs/implemented/2026-10-31-game-history.md`. Bez migracji: model odczytu nad `games` i `game_players`.
- Zasady pracy: jedna funkcja = jeden PR (kod + testy 100% + scenariusz integracyjny + dokumentacja). Legenda: `[ ]` do zrobienia, `[x]` wykonane.

## Faza 1 — Lista zakończonych partii (#27)

- [x] 1.1 Specyfikacja E04-S01 (zatwierdzona przez właściciela, #131)
- [x] 1.2 `core`: `games/history.ts` (wynik z miejsca gracza, kursor, `HistoryEntry`, `historyQuerySchema`)
- [x] 1.3 `GameHistoryService.list` (rozliczenie przegranych na czas, jedno zapytanie, paginacja kluczem) i rejestracja w kontenerze
- [x] 1.4 `GET /api/history`
- [x] 1.5 Wspólny helper daty `lib/format-date-time.ts` (wydzielony z `game-room.tsx`)
- [x] 1.6 Strona `/history` (`loading.tsx`, „Pokaż starsze”), przycisk „Historia” na stronie głównej
- [x] 1.7 DS: stories i dokumentacja („{nick} (gość)”, długi nick, luki w „Czego brakuje”)
- [x] 1.8 Testy integracyjne (API: widoczność, paginacja, `EXPLAIN` na ~10 000 partii; przeglądarka: 320/360/1280 px, oba motywy), README, specyfikacja przeniesiona do `implemented/`
