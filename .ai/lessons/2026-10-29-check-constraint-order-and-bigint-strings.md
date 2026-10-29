# CHECK-i planszy: kolejność błędów i bigint jako napis

- **Problem:** po dodaniu `CHECK`-ów do `games` stare testy i wstawki SQL (`status = 'active'` bez `black_seat`, `finished` bez `end_reason`) padały na innym `CHECK`-u niż oczekiwany; `bit_count(...)` zwracał napis, nie liczbę.
- **Kontekst:** PostgreSQL zgłasza pierwszy naruszony `CHECK` w kolejności alfabetycznej nazw; sterownik zwraca `bigint` jako napis (por. `2026-10-29-em-execute-timestamps-are-strings`).
- **Reguła:** testując konkretny `CHECK`, ustaw wszystkie pozostałe pola tak, by były poprawne (fikstura `FINISHED`), i pamiętaj o alfabetycznej kolejności nazw; w `em.execute` rzutuj `bigint`/`bit_count` przez `::int`. Po dodaniu `CHECK`-a powiązanego ze statusem przejrzyj surowe `update games set status = ...` w testach integracyjnych.
- **Powiązane:** #22, migracja `Migration20261029163949`.
