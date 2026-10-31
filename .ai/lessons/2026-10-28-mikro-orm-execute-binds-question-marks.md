# `em.execute` w MikroORM wiąże `?`, nie `$n`

- **Problem:** `cleanupExpired` przeszło testy jednostkowe ze 100% pokrycia, a na PostgreSQL padało z `there is no parameter $1` — zapytania miały placeholdery `$1`/`$2`, a `em.execute` rozpoznaje tylko `?`.
- **Kontekst:** Faza 9 (#39), test integracyjny progów sprzątania; fałszywy `em` w testach jednostkowych przyjmował dowolny tekst SQL.
- **Reguła:** w surowym SQL przez `em.execute` używaj `?` (po jednym na każde użycie wartości, parametry powtarzaj); każde nowe surowe zapytanie uruchom na prawdziwym PostgreSQL (test w `tests/integration/`), bo mock nie sprawdza składni ani wiązania.
- **Powiązane:** `.ai/specs/implemented/2026-10-24-expired-records-cleanup.md`, lekcja `2026-10-27-mikro-orm-transaction-raw-sql.md`.
