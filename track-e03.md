# Śledzenie implementacji Epiku 03 (otwarte lobby)

- Start: 2026-10-31. Źródła: zgłoszenia #17 (epik), #25 (E03-S01), #31 (E03-S01-T01), #26 (E03-S02); specyfikacje: `.ai/specs/implemented/2026-10-31-lobby-seeking-status.md`. Transport: odpytywanie co 3 s (decyzja CP-3).
- Zasady pracy: jedna funkcja = jeden PR (kod + testy 100% + scenariusz integracyjny + dokumentacja). Legenda: `[ ]` do zrobienia, `[x]` wykonane.

## Faza 1 — Status „szukam gry” i widok lobby (#25, razem z migracją #31)

- [x] 1.1 Encja `LobbySeeker` i migracja `lobby_seekers` (#31), up/down/up na PostgreSQL
- [x] 1.2 Stałe i widok w `core` (`SEEKING_TTL_MS`, `LobbyView`)
- [x] 1.3 `LobbyService` (`markSeeking`, `withdraw`, `view`) i rejestracja w kontenerze
- [x] 1.4 Kasowanie statusu przy utworzeniu partii, przyjęciu zaproszenia, przyjęciu rewanżu i wylogowaniu
- [x] 1.5 Reguła sprzątania `lobbySeekers` (`db:cleanup`, budżet czasu 11 × 15 s)
- [x] 1.6 `GET /api/lobby`, `PUT`/`DELETE /api/lobby/seeking`
- [x] 1.7 `LobbyRow` w trybie do odczytu (DS), `LobbyPanel`, strona `/lobby`, link „Lobby” na stronie głównej
- [x] 1.8 Testy integracyjne (API i przeglądarka), README, specyfikacja przeniesiona do `implemented/`

## Faza 2 — Wybór przeciwnika i start partii (#26)

- [ ] 2.1 Specyfikacja E03-S02 (zatwierdzenie przez właściciela); kontrakty z sekcji „Interfejs dla #26” specyfikacji #25
- [ ] 2.2 Implementacja (osobny PR)
