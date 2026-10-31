# Kursor: sprawdzenie kształtu tekstu nie wystarcza, gdy trafia do SQL jako timestamptz

- Problem: kursor `GET /api/history` przechodził regex kształtu daty, więc `2026-99-99T99:99:99.000000Z` dochodził do `?::timestamptz` i PostgreSQL zwracał błąd (500 zamiast 400).
- Reguła: wartość z kursora/zapytania, która jest rzutowana w SQL, walidujemy semantycznie (prawdziwy moment, brak roku 0000), a nie tylko regexem; test integracyjny 400 ma zawierać wartość o poprawnym kształcie, ale nieistniejącą.
- Powiązane: PR #134, `.ai/specs/implemented/2026-10-31-game-history.md`.
