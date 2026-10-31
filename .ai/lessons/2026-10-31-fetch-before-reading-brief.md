# Przed oceną briefu i specyfikacji zrób `git fetch` i czytaj z `origin/main`

- **Problem:** podczas `om-discover --refresh` uznano brief za nieaktualny (brak BR-29 i D-27), a recenzent skeptyk wyciągnął z tego błędne wnioski. W rzeczywistości `origin/main` miał te wiersze od PR #93; główny katalog roboczy był 21 commitów za `main`.
- **Kontekst:** równoległe PR-y agentów scalają się do `main`, a główny katalog zostaje stary; skille czytają brief i specyfikacje z dysku.
- **Reguła:** przed czytaniem lub oceną briefu, specyfikacji i `track*.md` wykonaj `git fetch` i czytaj pliki z `origin/main` (`git show origin/main:<ścieżka>`) albo z worktree z `origin/main`; gdy `git status -sb` pokazuje `behind N`, nie opieraj się na lokalnej kopii. Skeptykowi i innym recenzentom podawaj ścieżki z worktree z `origin/main`, nie z głównego katalogu. Brief edytuj tylko w takim worktree.
- **Powiązane:** `.ai/specs/research/decisions/2026-10-31-agent-opponent.md`.
