# Run 2026-11-02: E08-S01 + E08-S01-T01 (konto administratora, `ADMIN_EMAIL`, `admin:create`)

- **Cel:** zaimplementować #156 i #157 wg `.ai/specs/implemented/2026-10-31-installation-admin-account.md`; potem #158 (osobny PR, po scaleniu tego).
- **Kroki:** konfiguracja `ADMIN_EMAIL` → `isInstallationAdmin` (core) → odrzucenie rejestracji i usunięcia konta → `AdminAccountService` + CLI → ochrona w `db:cleanup` → test strażnik zapisów `users.email` → deploy/dokumentacja → testy.
- **Błąd po drodze:** eksport `classifyError` z indeksu db łamał `next build` (lekcja 2026-11-02).
- **Weryfikacja:** lint, typecheck, `npm test` (100%), build, integracyjne (`admin-account`, wybrane + pełny przebieg).
- **Nie sprawdzono:** monit bez echa na prawdziwym terminalu, `docker compose exec` na serwerze.
