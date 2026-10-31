# `findOneOrFail` w serwisie: nieobsłużony NotFoundError ORM daje 500

- **Problem:** odczyt partii w trakcie jej usuwania przez sprzątanie (#102) kończył się `500`, nie `404`. `tx.findOneOrFail(Game, id)` rzuca `NotFoundError` MikroORM, który nie jest `AppError`, więc `apiHandler` loguje „Unhandled API error”.
- **Kontekst:** wiersz znika po migawce uczestnika (blokada `for update` czeka na commit sprzątania), a późniejszy odczyt go nie znajduje. Wykrył to dopiero test wyścigu na PostgreSQL z dwiema transakcjami.
- **Reguła:** w serwisach, gdzie wiersz może zniknąć między sprawdzeniem a odczytem, przekazuj `failHandler: () => new NotFoundError(...)` do `findOneOrFail` (albo `findOne` + własny wyjątek). Nowa reguła usuwająca wiersze wymaga testu wyścigu odczyt/ruch kontra usuwanie.
- **Powiązane:** `.ai/specs/implemented/2026-10-30-guest-only-games-cleanup.md`, PR #109.
