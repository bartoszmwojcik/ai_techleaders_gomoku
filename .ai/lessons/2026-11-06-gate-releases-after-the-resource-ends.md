# Bramka zwalnia się po zakończeniu zasobu, nie po wyniku

**Problem.** `createWorkerBotEngine` rozwiązywał obietnicę ruchu od razu po wyniku albo pułapie, a `worker.terminate()` wołał bez `await`. Bramka `ComputeGate` (jedno obliczenie naraz, R8) puszczała więc następny ruch, zanim ubity wątek zwolnił stertę i tablicę transpozycji — przez chwilę żyły dwa wątki (przegląd PR #269, minor 2). Drugi przypadek z tego samego przeglądu: flaga stopu ustawiana po `softMs` bez względu na to, czy jest już wynik, przerywała pierwszą iterację przy niskim zegarze, więc poziom 2 grał ruch awaryjny poziomu 1.

**Kontekst.** E13-S05 (#265), `packages/app/src/server/services/games/bot-engine.ts`. Testy jednostkowe z fałszywym `Worker` miały `terminate` rozwiązywane natychmiast, więc wyścigu nie widziały.

**Reguła.**
- Gdy semafor/bramka chroni zasób (wątek, proces, połączenie), zadanie kończy się dopiero po **zakończeniu zwalniania** zasobu (`await terminate()`), z krótkim limitem czasu, żeby zawieszone zwalnianie nie zablokowało bramki na zawsze.
- Test: fałszywe zwalnianie, które czeka na ręczne rozwiązanie; sprawdź, że wynik i następne zadanie czekają, i osobny test na limit czasu.
- Miękki cel czasu nie może przerwać pracy, zanim powstał pierwszy użyteczny wynik; twardy pułap zostaje twardy. Testuj „cel minął bez wyniku” i „pierwszy wynik po celu”.

Powiązane: `.ai/specs/2026-11-05-hosted-bot.md` (R6, R8, faza S05), PR #269 (komentarz przeglądu), #265.
