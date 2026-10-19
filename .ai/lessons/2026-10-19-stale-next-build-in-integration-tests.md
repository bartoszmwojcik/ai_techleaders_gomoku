# Testy integracyjne na nieaktualnym buildzie dają 500

**Problem.** `npm run test:integration` zwracał 500 na każdej trasie, choć testy jednostkowe i build wcześniej przechodziły.

**Kontekst.** Testy integracyjne uruchamiają `next start` na istniejącym `packages/app/.next`. Build pochodził z innej gałęzi, gdzie był Next 16.4.2, a w `node_modules` był już 16.3.4. Sprawdzenie `.next/BUILD_ID` nie wykrywa niezgodności wersji.

**Reguła.**
- Po zmianie gałęzi, zależności lub kodu uruchom `npm run build` przed `npm run test:integration` (`npm run check` robi to sam).
- Przy 500 w testach integracyjnych najpierw czytaj `tests/integration/server.log` (w CI: artefakt `integration-server-log`).

Powiązane: `.ai/specs/implemented/2026-10-19-ci-and-testing.md`.
