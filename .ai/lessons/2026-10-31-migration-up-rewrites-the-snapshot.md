# `migration:up` i testy integracyjne przepisują śledzony snapshot hałasem

- **Problem:** po `npm run db:migration:create` snapshot (`.snapshot-gomoku.json`) jest czysty (tylko zmiany encji), ale każde późniejsze `migration:up` — także `global-setup` testów integracyjnych — nadpisuje go zawartością odczytaną z bazy (inne typy, `enumItems`, wyrażenia CHECK z PostgreSQL, ~300 zmienionych linii).
- **Reguła:** zaraz po `migration:create` skopiuj czysty snapshot poza repozytorium; po każdym `migration:up` i po `npm run test:integration` przywróć go przed commitem (`git diff --stat` ma pokazać tylko zmiany tej migracji). Gdy zgubisz czysty plik: cofnij migrację (`down`), `git checkout` snapshotu, `migration:create` z tymczasową nazwą, zachowaj snapshot i usuń zbędny plik migracji.
- **Powiązane:** `2026-10-31-stale-migration-snapshot-adds-noise.md`, E06-S01 (#126).
