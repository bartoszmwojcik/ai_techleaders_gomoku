# Build obrazu E15 na Mikrusie wymaga więcej niż 2 GB RAM

- **Problem:** `docker compose build app` na mikr.us (2 GB, `LOW_MEMORY=1`, aplikacja zatrzymana) padł po ok. 105 s: `Next.js build worker exited … SIGTERM`. Po wydaniu E14 build jeszcze się mieścił.
- **Przyczyna:** E15 powiększył aplikację (katalogi tłumaczeń, ok. 240 plików zmian); `next build` przekroczył pamięć kontenera.
- **Reguła:** przed wdrożeniem dużego epiku sprawdź `free -m` na serwerze; kolejna próba po zwiększeniu RAM do 2,5 GB przeszła (`next build` 77 s). Przy porażce buildu natychmiast `docker start gomoku_prod-app-1` (obraz `latest` jest nietknięty) i dopiero potem diagnozuj. Zatrzymanie aplikacji na czas builda zostaje obowiązkowe.
- **Powiązane:** `docs/wdrozenie-i-utrzymanie.md` („Mały RAM”), `.ai/runs/2026-11-14-e15-deploy.md`.
