# Testy integracyjne: za długa ścieżka gniazda Chrome

**Problem:** `npm run test:integration` w worktree cezara padł w `global-setup` ("Socket path too long", Chrome nie startuje).
**Kontekst:** `TMPDIR` wskazuje głęboko w `.ai/cezar/tmp/...`, a Chrome tworzy tam gniazdo (limit ~108 znaków).
**Reguła:** uruchamiaj `TMPDIR=/tmp npm run test:integration` poza głównym katalogiem projektu. Do tego `innerText` łamie "nick (gość)" na linie: w testach przeglądarkowych czytaj `textContent`.
