# Lessons

Indeks lekcji. Jedna linia na wpis: `- [Tytuł](lessons/YYYY-MM-DD-slug.md) — reguła w jednym zdaniu`.

- [MikroORM v7: checkConnection nie łączy](lessons/2026-10-18-mikro-orm-v7-lazy-connection.md) — dostępność bazy sprawdzaj zapytaniem `select 1`, a pakiety `@mikro-orm/*` + `kysely` trzymaj w `serverExternalPackages`.
- [Środowisko sandboxa nadpisuje .env](lessons/2026-10-18-sandbox-env-overrides.md) — przed operacjami na bazie sprawdź `DATABASE_URL` w env; `build`/`start` muszą mieć `NODE_ENV=production`.
- [Nieaktualny build w testach integracyjnych](lessons/2026-10-19-stale-next-build-in-integration-tests.md) — po zmianie gałęzi/zależności/kodu `npm run build` przed `test:integration`; przy 500 czytaj `tests/integration/server.log`.
- [Lockfile: pola `libc` i npm 11](lessons/2026-10-19-npm-lockfile-libc.md) — instaluj npm z Node 22 (jak CI); npm 11 pomija skrypty instalacyjne, a znikające `libc` to akceptowany szum.
- [MikroORM 7: `ensureDatabase` defaults to true](lessons/2026-10-19-mikro-orm-ensure-database-default.md) — `createOrmConfig` sets `ensureDatabase: false` (#9), and probes do too; the Migrator (migration CLI) still creates a missing DB; after URL experiments check `pg_database`.
- [Mocks hid the ESM/CJS interop](lessons/2026-10-19-mocked-tests-hide-esm-cjs-interop.md) — load CJS packages in `.mjs` through `createRequire`; run a new script end to end, not just to 100% coverage.
- [Docker przyjmuje połączenia przed PostgreSQL](lessons/2026-10-19-docker-proxy-accepts-before-postgres.md) — przejściowe błędy startu bazy (`Connection terminated…`, `57P0x`, `ECONN*`) to „czekaj”; stany startu testuj w pętli na świeżym kontenerze.
- [Commit po merge'u PR nie trafia do `main`](lessons/2026-10-24-push-to-already-merged-pr.md) — przed dopisaniem commita sprawdź `gh pr view --json state`; przed usunięciem brancha porównaj `headRefOid` z `HEAD`.
- [Spójność specyfikacji auth](lessons/2026-10-24-grill-me-auth-specs-consistency.md) — sprawdzaj sprzeczności API/edge cases, osobne pule limitów dla resetu, blokowanie ofiary limitem, reguły cleanup, kolejność spike’ów.
- [Design system: układ i scalanie klas](lessons/2026-10-25-design-system-layout-and-class-merging.md) — ukrywaj elementy siatki wymiarami, nie `display: none`; układ responsywny przez zapytania o kontener; klasy tokenów scalaj przez `src/game/cn.ts`; zrzut przy 320 px to część weryfikacji.
- [Prototyp: fokus nagłówka i przycisk w nagłówku](lessons/2026-10-26-prototype-heading-focus-and-header-submit.md) — w prototypach z silnikiem przeglądu chowaj obrys na `[tabindex="-1"]`, a przycisk w nagłówku powielający akcję formularza rób jako `submit` z `form`.
- [Zmiana polityki zaczyna się od decyzji](lessons/2026-10-26-policy-change-starts-with-decision.md) — wpis decyzji w briefie z odrzuconymi alternatywami i ryzykami, potem specyfikacje, mapa, prototypy; zgłoszenia osobno.
- [Surowy SQL w transakcji MikroORM](lessons/2026-10-27-mikro-orm-transaction-raw-sql.md) — w `em.transactional` używaj `em.execute`, nie `em.getConnection().execute` (osobne połączenie, zakleszczenie puli); SQL sprawdzaj współbieżnie na PostgreSQL.
- [Strony i route'y mają osobne kopie modułów](lessons/2026-10-27-next-layers-duplicate-modules.md) — singleton ORM na `globalThis` kluczuj obiektem encji (`WeakMap`), nie współdziel serwisów między warstwami; po dodaniu strony z odczytem bazy uruchom build i testy integracyjne.
- [Tailwind pomija komponenty `@gomoku/ui`](lessons/2026-10-27-tailwind-source-for-workspace-ui.md) — `frontend.css` ma `@source` na `ui/src/game`; nowy komponent DS na stronie obejrzyj w przeglądarce.
