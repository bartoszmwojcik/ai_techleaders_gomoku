# Dwa zielone PR-y mogą razem zepsuć `main`

- **Problem:** PR zegara (#83) dodał wymagane pole `clock` do `GameState`, a PR planszy (#84) dodał fixtury testów `GameView` bez niego. Każdy był zielony osobno (CI sprawdza PR z `main` sprzed scalenia drugiego), a po scaleniu obu `npm run typecheck` na `main` miał 5 błędów w testach.
- **Przyczyna:** w ochronie `main` wyłączono „branch must be up to date”, żeby równoległe PR-y nie wymagały ciągłych rebase'ów. Cena: dwa PR-y dotykające tego samego typu nie widzą się nawzajem w CI.
- **Reguła:** po scaleniu PR-a, który zmienia typ lub kontrakt współdzielony z innymi otwartymi PR-ami (`GameState`, `GameView`, schemat), zrób rebase każdego z tych PR-ów i poczekaj na zielone CI przed ich scaleniem; po scaleniu sprawdź `main` (`npm run typecheck`). Przy częstych kolizjach włącz „up to date” w ochronie `main`.
- **Powiązane:** PR #83, #84, poprawka fixtur w tej samej serii.
