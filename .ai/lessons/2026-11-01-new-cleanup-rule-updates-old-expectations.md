# Nowa reguła `db:cleanup` zmienia oczekiwania starych testów (#137)

**Problem:** reguła `orphanedFinishedGames` usuwa zakończone partie „usunięte konto + gość/agent” po 1 h, co obalało stary test integracyjny zakładający, że takie partie zostają na zawsze.
**Reguła:** dodając regułę sprzątania, przeszukaj `tests/integration/*cleanup*` pod kątem partii „deleted-account” i zaktualizuj budżet (`cleanup-expired.ts`, README: N × 15 s). Komentarz w kodzie bywa stary względem zgłoszenia — policz `CLEANUP_RULES.length`. Agent w `insertDuel` musi siedzieć na miejscu 2 (CHECK). Worktree bez `node_modules` rozwiązuje `@gomoku/*` ze starego głównego repo — zrób `npm ci`; `TMPDIR=/tmp/x` przy agent-browser (zbyt długa ścieżka gniazda).
