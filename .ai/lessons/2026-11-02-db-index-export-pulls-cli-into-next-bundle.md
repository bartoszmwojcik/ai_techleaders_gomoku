# Eksport z indeksu `@gomoku/db` wciąga kod CLI do bundla Next

- **Problem:** dodanie `export { classifyError } from "./cli/status"` do `packages/db/src/index.ts` przeszło lint, typecheck i testy jednostkowe, ale `next build` padł: „Failed to collect configuration for /api/...” (`import.meta.dirname` undefined w `migrations-config.ts`).
- **Kontekst:** `cli/status.ts` importuje `migrations-config.ts`; indeks pakietu trafia do bundla aplikacji, więc cały graf importów też.
- **Reguła:** do `index.ts` pakietu `db` nie dodawaj eksportów z `cli/` ani niczego, co importuje konfigurację migracji. Po zmianie indeksu pakietu uruchom `npm run build`. Komunikaty błędów CLI w `app` opieraj na `describeError` (klasa i kod, bez treści).
- **Powiązane:** spec `.ai/specs/implemented/2026-10-31-installation-admin-account.md`.
