# Błąd rzucony w transakcji cofa też zapis „przegrana na czas"

- **Problem:** `GameMoveService.play` wywoływał `settleGame` (zapis końca partii) i od razu rzucał `409 GAME_FINISHED` wewnątrz `em.transactional`; wyjątek cofał transakcję, więc partia nie kończyła się na stałe. Testy jednostkowe z fałszywym `em` przechodziły.
- **Kontekst:** Faza 4 Epiku 02 (#23 krok 4); wykrył to dopiero test integracyjny na PostgreSQL (ruch po terminie → partia ma być `finished`).
- **Reguła:** gdy ścieżka ma jednocześnie coś zapisać i zwrócić błąd, nie rzucaj wewnątrz `transactional` — zwróć znacznik z callbacku i rzuć po zatwierdzeniu. Dla każdego „zapisz i odrzuć" dopisz test integracyjny sprawdzający stan bazy po odpowiedzi błędem. Dodatkowo: start zegara/blokady w `getState` rób przed `MARK_SEEN`, żeby zachować kolejność `games` → `game_players`.
- **Powiązane:** `2026-10-28-transactional-callback-uses-tx.md`, `.ai/specs/2026-10-26-game-clock.md`.
