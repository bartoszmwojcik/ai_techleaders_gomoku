# Tempo odpytywania zależy od odpowiedzi: planuj kolejny odczyt po zakończeniu poprzedniego

- **Problem:** `setTimeout(() => { void poll(); schedule(); })` wylicza opóźnienie kolejnego odczytu, zanim poprzedni się skończy. Zwalnianie do 5 s po minucie ciszy (lekcja 2026-10-30) reagowało na ruch o cały cykl za późno: odpowiedź z nowym ruchem trafiała do `movedAt` już po wyliczeniu 5 s.
- **Reguła:** gdy tempo zależy od treści odpowiedzi (cisza, ruch, koniec), planuj następny odczyt po `await poll()`; `schedule()` zawsze zaczyna od `clearTimeout`, a efekt ma flagę `stopped`, żeby odczyt kończący się po odmontowaniu niczego nie planował.
- **Test:** ruch widziany po cichej minucie ma przywrócić 2 s od razu (`spectator-room.test.tsx`); odpowiedzi w testach niosą tylko ruchy po `after`, tak jak serwer, inaczej `mergeState` dubluje kamienie.
- **Powiązane:** `.ai/specs/implemented/2026-11-02-spectate-live-game.md`, lekcja 2026-10-30 (czas serwera i ograniczone odpytywanie).
