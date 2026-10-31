# Surowy SQL w `em.transactional` musi iść przez `em.execute`

- **Problem:** `em.getConnection().execute(sql)` wewnątrz `em.transactional(...)` nie dołącza do transakcji — bierze osobne połączenie z puli. Przy współbieżności (więcej żądań niż `DATABASE_POOL_MAX`) pula się zakleszcza, a testy na fałszywym `em` tego nie widzą.
- **Reguła:** surowy SQL w transakcji wykonuj przez `em.execute(sql, params, "all")` na `em` przekazanym do callbacku `transactional`. Logikę w SQL (upsert limitera, filtry) sprawdzaj dodatkowo na prawdziwym PostgreSQL, także współbieżnie (12 równoległych wywołań przy puli 10).
- **Powiązane:** `.ai/specs/implemented/2026-10-24-account-registration.md` krok 5, `RateLimiter`.
