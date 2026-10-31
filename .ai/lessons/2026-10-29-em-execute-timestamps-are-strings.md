# Surowy `em.execute` zwraca `timestamptz` jako teksty, nie `Date`

- **Problem:** `InvitationService` porównywał `row.expires_at > now` na wierszach z `em.execute`; testy jednostkowe (fałszywy `em` z `Date`) przechodziły ze 100% pokrycia, a na PostgreSQL kolumna wracała jako tekst `'2026-10-29 15:11:46.823+00'` — porównanie z `Date` było fałszywe i twórca własnego zaproszenia dostawał zły stan.
- **Kontekst:** Faza 2 Epiku 02 (#21 krok 4); test integracyjny serwisu na Testcontainers wykrył błąd od razu.
- **Reguła:** w wynikach surowego SQL (`em.execute`) nie porównuj ani nie parsuj dat w JS — licz warunki czasowe w SQL na związanym parametrze (`expires_at <= ? as expired`) i zwracaj `boolean`; kolumny `timestamptz` w typach wierszy traktuj jak `string`. Test jednostkowy z fałszywym `em` nie wykryje tego błędu: każde nowe zapytanie sprawdź na prawdziwym PostgreSQL.
- **Powiązane:** `2026-10-28-mikro-orm-execute-binds-question-marks.md`, `.ai/specs/implemented/2026-10-24-game-invitations.md`.
