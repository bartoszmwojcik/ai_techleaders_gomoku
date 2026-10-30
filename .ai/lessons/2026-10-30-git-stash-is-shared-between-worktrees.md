# `git stash` jest wspólny dla worktree

- **Problem:** `git stash -q` w czystym worktree nic nie zapisał, a następne `git stash pop` zdjęło cudzy wpis `stash@{0}` (z innej gałęzi) i wprowadziło konflikty.
- **Reguła:** stash jest współdzielony przez wszystkie worktree repozytorium. Nie używaj `stash`/`pop` do porównań „przed zmianą"; do sprawdzenia bazy użyj `git worktree`/`git checkout <commit>` albo po prostu uruchom test na bazowym commicie. Przed `pop` sprawdź `git stash list`. Pomyłkę cofa `git reset --hard HEAD` (wpis zostaje w stashu).
- **Przy okazji:** testy pakietu uruchamiaj z roota (`npx vitest run --project <pakiet>`), nie z katalogu pakietu — bez konfiguracji roota brak `unstubEnvs` i test `config.test.ts` zawodzi.
