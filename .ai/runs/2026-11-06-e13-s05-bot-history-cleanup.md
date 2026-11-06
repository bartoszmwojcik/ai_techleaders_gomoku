# 2026-11-06 — E13-S05: partie z botem w historii, licznik par, sprzątanie gość–bot (#265)

**Cel:** faza S05 specyfikacji `2026-11-05-hosted-bot.md` (kroki 1–4) i minory z przeglądu PR #269 w `bot-engine.ts`; jeden PR do `main`, bez scalania i bez `qa-approved`. Przebieg autonomiczny (zadanie cezara 7ca81dbf, zlecone przez e306c618).

## Kroki i wyniki
1. `bot-engine.ts`: ruch i bramka czekają na zakończenie `terminate()` (limit `BOT_TERMINATE_WAIT_MS` = 500 ms); flaga stopu najwcześniej po pierwszej ukończonej iteracji; brak wątku przy pułapie 0. Testy jednostkowe dla każdej gałęzi.
2. Historia i przegląd: fallback „Bot” w `opponentNameOf`/`playerNameOf`, testy usług i widoków; scenariusz w `game-bot-pages.test.ts` (historia → przegląd ruchów).
3. Licznik: `KNOWN_PAIRS` + `account-bot`, `bot-guest`; `/backend`: etykiety par i źródło „z botem”; test zgodności z `min`/`max` (jednostkowy i na PG).
4. Sprzątanie: `GUEST_ONLY_SQL` z `'bot'`; 5 scenariuszy na PostgreSQL w `cleanup.test.ts`.
5. Dokumentacja: README, architektura, checklista `BOT_ENABLED`, status S05 w specyfikacji; lekcja o bramce.
6. Walidacja lokalna: lint, typecheck, `npm test` (354 pliki, 3772 testy, 100%), build (`LOW_MEMORY=1`), `TMPDIR=/tmp npm run test:integration` w kopii `/tmp` (86 plików, 985 testów — zielone).
7. PR #270; przegląd (`om-auto-review-pr --autofix`): approve jako komentarz (autor = recenzent), 2 nity poprawione w `d2c55cd`; etykiety `merge-queue`, `needs-qa`.
8. QA (`om-auto-qa-pr`): PASS na zbudowanej aplikacji z tymczasowym PG — historia 1280/320, przegląd, `/backend`, `db:cleanup` na bazie QA; zrzuty w komentarzu PR.
9. CI na `d2c55cd`: wszystkie checki zielone.

## Błędy i obejścia
- Rejestracja na `ADMIN_EMAIL` jest celowo odrzucana (409) — w QA konto administratora powstało przez zmianę adresu w bazie QA.
- Pierwszy zrzut historii złapał szkielet ładowania — powtórzony z oczekiwaniem na wiersze.
- `.env.example` niedostępny dla sesji — `BOT_*` zostaje w checkliście jako zadanie właściciela.

## Status
Gotowe do decyzji właściciela (`qa-approved` + scalenie). Bez wdrożenia; flaga `BOT_ENABLED` wyłączona. Nie uruchamiano `compose.prod` ani `bot:bench`.
