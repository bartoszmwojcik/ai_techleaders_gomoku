# `package-lock.json`: znikające pola `libc` i npm 11

**Problem.** Każde `npm install` usuwa z `package-lock.json` pola `libc` (`glibc`/`musl`) przy opcjonalnych binarkach. Każdy PR dostaje przez to szum w lockfile.

**Kontekst.** Pól nie zapisuje ani npm 10.9 (Node 22), ani npm 11 (`npx npm@11 install`, sprawdzone 2026-10-19). npm 11 dodatkowo domyślnie nie uruchamia skryptów instalacyjnych (ostrzeżenie `install-scripts`). Pomija wtedy m.in. `agent-browser` i `esbuild`. CI używa npm 10 z Node 22 (`npm ci` nie przepisuje lockfile).

**Reguła.**
- Instaluj zależności npm dołączonym do Node 22, nie `npx npm@11`. Ostrzeżenia `install-scripts` oznaczają, że pakiety mogą nie działać.
- Usunięcie pól `libc` przez npm to oczekiwany szum. Nie przywracaj ich ręcznie i nie zmieniaj przez to wersji npm bez zgody użytkownika.

Powiązane: `.ai/specs/implemented/2026-10-19-ci-and-testing.md`.
