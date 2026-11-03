# Worktree potrzebuje własnych node_modules

**Problem:** symlink `node_modules` z głównego checkoutu do worktree wyglądał na oszczędność, ale `@gomoku/*` wskazywały wtedy na pakiety głównego checkoutu (brak nowych eksportów), a zależności były nieaktualne (brak `@modelcontextprotocol/server`).
**Reguła:** w każdym worktree `npm ci --no-audit --no-fund` (~20 s). Pokrycie v8 nie widzi plików pod ścieżką z `.ai/` — pełne `npm test` z progiem uruchamiaj w kopii worktree pod `/tmp`; testy przeglądarkowe wymagają krótkiego `TMPDIR` (np. `/tmp`).
**Powiązane:** E11 (`.ai/specs/implemented/2026-11-02-paper-pencil-gomoku.md`).
