# Integracja w worktree: krótki TMPDIR

**Problem:** `npm run test:integration` w worktree cezara padał w `global-setup` („agent-browser set media light: … Socket path too long”).
**Kontekst:** `TMPDIR` wskazuje głęboko w `.ai/cezar/tmp/…`; Chrome tworzy tam gniazdo `SingletonSocket`, a ścieżka przekracza limit gniazd Unix.
**Reguła:** uruchamiaj `TMPDIR=/tmp npm run test:integration`. Test przeglądarkowy, który pada w pełnym biegu, a przechodzi osobno (np. `game-play-pages`), to obciążenie — powtórz go osobno.
