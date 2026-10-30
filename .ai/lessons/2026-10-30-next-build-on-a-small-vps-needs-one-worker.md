# `next build` na VPS z 2 GB RAM: jeden worker i osobny `tsc`

- **Problem:** `docker compose up --build` na mikr.us (2 GB RAM, 1 rdzeń) padał w `next build` z „Failed to type check.” bez żadnej treści błędu, a po wyłączeniu sprawdzania typów z `Next.js build worker exited with code: null and signal: SIGTERM`. Kod był poprawny: CI buduje ten sam `Dockerfile` na zielono, a `tsc --noEmit` w tym samym kontenerze nie zgłaszał błędów.
- **Przyczyna:** Next liczy workery po procesorach hosta (11 na maszynie z 1 rdzeniem po stronie kontenera), a sprawdzanie typów w procesie buildu dokłada pamięci; kernel LXC zabija proces bez śladu w `dmesg`. Puste „Failed to type check.” oznacza zabity proces, nie błąd typów.
- **Reguła:** na małej maszynie buduj z `LOW_MEMORY=1` (`.env.production`): `NEXT_BUILD_CPUS=1`, a typy sprawdza osobny `npm run typecheck -w @gomoku/app` przed `next build` (`NEXT_SKIP_TYPECHECK=1` tylko dla samego Next). Nie pomijaj typów bez zastępczego sprawdzenia. Diagnozuj uruchamiając `tsc` w kontenerze (obraz do `COPY . .`), nie zgadując po komunikacie Next.
- **Powiązane:** `README.md` „Wdrożenie na mikr.us”, `Dockerfile` (`ARG LOW_MEMORY`), `packages/app/next.config.ts`.
