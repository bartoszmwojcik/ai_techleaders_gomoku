<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Zasady pracy agentów

Ten plik jest jedynym źródłem instrukcji dla agentów AI. `CLAUDE.md` tylko go importuje — nie dopisuj tam treści.

## Stack i architektura (obowiązujące założenia)

Gomoku to aplikacja webowa (gra 1:1 online, wymagania: `.ai/specs/product-brief.md`). Poniższe decyzje są wiążące — nie zmieniaj ich ani nie dodawaj alternatyw (inny ORM, inny kontener DI, inna biblioteka UI, inny menedżer pakietów) bez wyraźnej zgody użytkownika. Szczegóły i uzasadnienia: `.ai/specs/implemented/2026-10-18-monorepo-architecture.md`, opis dla ludzi: `README.md`.

| Obszar | Technologia |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict) |
| Baza danych | PostgreSQL + MikroORM 7 (`@mikro-orm/postgresql`) — migracje, pula połączeń |
| Dependency Injection | Awilix (tryb `PROXY`, `strict`) |
| Style — frontend | Tailwind CSS 4, bez shadcn/ui; komponenty graczy z `@gomoku/ui/game/*` (Radix + tokeny `game-tokens.css`) |
| Style — backend | shadcn/ui (na Tailwind CSS 4) z pakietu `@gomoku/ui` |
| Dokumentacja UI | Storybook 10 w `packages/ui/.storybook` (`npm run storybook -w @gomoku/ui`) |
| Monorepo | npm workspaces (`packages/*`), jeden `package-lock.json` w roocie |
| Testy jednostkowe | Vitest 5 + `@vitest/coverage-v8` (próg 100%) |
| Testy integracyjne | Vitest + Testcontainers (PostgreSQL) + agent-browser (przeglądarka) |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |

### Pakiety

| Pakiet | Katalog | Odpowiedzialność |
| --- | --- | --- |
| `@gomoku/app` | `packages/app` | Aplikacja Next.js: routing, strony, route handlery, server actions, kompozycja kontenera DI (`src/server/container.ts`). |
| `@gomoku/core` | `packages/core` | Części wielokrotnego użytku bez zależności od Next.js, Reacta i ORM: logika domenowa (zasady gry), typy, helpery DI (`createAppContainer`). |
| `@gomoku/db` | `packages/db` | Zarządzanie danymi: konfiguracja MikroORM, encje, migracje, CLI, fabryka ORM (`createOrm`). |
| `@gomoku/ui` | `packages/ui` | Komponenty UI wielokrotnego użytku: shadcn/ui i motyw panelu (`globals.css`), design system graczy w `src/game` (Radix + `game-tokens.css`, bez shadcn), hooki UI, Storybook. |

Dozwolony kierunek zależności (bez cykli): `app → core, db, ui`; `db → core`; `core` i `ui` nie zależą od innych pakietów workspace. `core` nie importuje `next`, `react` ani `@mikro-orm/*`; `ui` nie importuje `db` ani kodu serwerowego. Nowe pakiety dodawaj w `packages/` z nazwą `@gomoku/<nazwa>` i aktualizuj tę tabelę. `packages/app/AGENTS.md` to tylko odsyłacz do tego pliku (utrzymuje go `next dev`) — nie dopisuj tam zasad.

### Konwencje

- **Pakiety biblioteczne** eksportują źródła TS przez `exports` w `package.json` (bez kroku build); Turbopack transpiluje je sam. Każdy pakiet ma `tsconfig.json` rozszerzający `tsconfig.base.json` i skrypt `typecheck`. Wszystkie pakiety są ESM (`"type": "module"`).
- **Zależności** instaluj do konkretnego pakietu: `npm install <pkg> -w @gomoku/<pakiet>`. Zależności między pakietami workspace deklaruj jako `"@gomoku/<pakiet>": "*"`.
- **Route groups w `packages/app/src/app`:** `(frontend)` — strony dla graczy, własny root layout i `frontend.css` (czysty Tailwind, motyw gry w `@theme`); `(backend)` — panel pod `/backend`, root layout importuje `@gomoku/ui/globals.css` i używa komponentów `@gomoku/ui/components/*`. Nie importuj shadcn/ui na stronach frontendowych ani `frontend.css` w backendzie. Przejście między grupami to pełne przeładowanie strony (osobne root layouty) — to zamierzone.
- **Design system graczy (`packages/ui/src/game`):** komponenty importuj jako `@gomoku/ui/game/<nazwa>`, tokeny z `@gomoku/ui/game-tokens.css`. Wartości tylko z tokenów (żadnych kolorów w hex/rgb/hsl/oklch, klas palety Tailwinda ani wartości arbitralnych bez `var(--…)`); pilnuje tego `npm run check:tokens -w @gomoku/ui`. Komponenty nie mają wbudowanych tekstów (etykiety przez propsy). Stories i strony MDX leżą w `packages/ui/docs/`, nie w `src/`; reguły i źródła decyzji: `packages/ui/POSTEP.md` oraz `lekcja-06/referencje.md`, `lekcja-06/tokeny.md`. Testy stories: `npm run test:stories -w @gomoku/ui` (oba motywy). **Budując ekran dla gracza, czytaj najpierw `packages/ui/docs/design-system.md`** (skrót: charakter, komponenty, tokeny, przewodniki, czego unikać, komendy).
- **shadcn/ui:** komponenty dodawaj z katalogu `packages/ui` (`npx shadcn@latest add <komponent>`), trafiają do `packages/ui/src/components`. Każdy dodany komponent dopisz do `SHADCN_COMPONENTS` w `vitest.config.ts` (wyłączenie z progu pokrycia); własne komponenty `ui` nie trafiają na tę listę. Aktualny rejestr shadcn używa pakietu `cn` (utrzymywany przez shadcn) zamiast `clsx` + `tailwind-merge` — to oczekiwane, nie poprawiaj tego.
- **DI (Awilix):** kontener składa się tylko w `packages/app/src/server/container.ts` (`server-only`). Rejestruj zależności jawnie (`asClass`/`asFunction`/`asValue`), bez `loadModules`/globów — nie działają w bundlu. Serwisy przyjmują zależności przez destrukturyzację obiektu w konstruktorze (`constructor({ orm }: Deps)`). W route handlerach, server actions i server components używaj `withRequestScope(({ cradle }) => …)` — scope dostaje własny `em` (fork EntityManagera); nigdy nie używaj globalnego `orm.em` do zapytań.
- **MikroORM:** encje definiuj przez `defineEntity` (bez dekoratorów) i dopisuj jawnie do `packages/db/src/entities/index.ts`. Zmiany schematu tylko przez migracje (`npm run db:migration:create`, przegląd wygenerowanego pliku, `npm run db:migration:up`); nie używaj `schema:update` ani `ensureDatabase` w aplikacji. Migracje to pliki generowane — nie edytuj już zastosowanych. ORM łączy się leniwie (przy pierwszym zapytaniu); `orm.checkConnection()` zwraca „not established”, zanim padnie pierwsze zapytanie — do sprawdzania dostępności bazy wykonuj zapytanie. Pakiety `@mikro-orm/*` i `kysely` muszą zostać w `serverExternalPackages` w `next.config.ts`. W `em.transactional` zapisuj wyłącznie przez `tx` przekazany do callbacku (fork z `withRequestScope` ma `useContext = false`, więc wstrzyknięty `em` jest poza transakcją), a rollback sprawdzaj na prawdziwym PostgreSQL.
- **ORM/pula połączeń** jest singletonem procesu (cache obietnicy na `globalThis`, odporny na HMR). Nie inicjalizuj ORM na poziomie modułu — `next build` ewaluuje moduły tras. Strony i handlery czytające bazę muszą być dynamiczne (`await connection()` z `next/server` przed zapytaniem).
- **Konfiguracja** przez zmienne środowiskowe z plików `.env*` w roocie monorepo (ładuje je `next.config.ts` i CLI MikroORM przez `@next/env`); lista zmiennych w `.env.example`. Sekretów nie commituj.
- **Język:** kod, identyfikatory i komentarze po angielsku; teksty UI i dokumentacja projektu po polsku (wyjątek: dokumenty w `.ai/docs/` mogą być po angielsku).
- **Standardy inżynierskie** (nazewnictwo, rozmieszczenie kodu, wspólne warstwy API/UI, reguły domeny gry, checklista review): `.ai/docs/2026-09-01-engineering-standards.md`. Czytaj przed dodaniem nowej funkcji domenowej; przy sprzeczności z tym plikiem wygrywa `AGENTS.md`.

### Testy

- **Każda nowa funkcja i każda zmiana kodu ma 100% pokrycia testami jednostkowymi** — statements, branches, functions i lines, osobno dla każdego pliku (`thresholds: { 100: true, perFile: true }` w `vitest.config.ts`). Testy piszesz razem z kodem, w tym samym PR; PR bez nich nie przechodzi CI (job `unit`).
- **Wyjątki od progu są zamknięte:** komponenty shadcn z listy `SHADCN_COMPONENTS`, wygenerowane migracje, pliki testowe i `*.d.ts`. Nie dopisuj nowych wyjątków, nie obniżaj progów i nie używaj komentarzy `v8 ignore`/`istanbul ignore` (CI je odrzuca) bez wyraźnej zgody użytkownika. Kod nietestowalny przebuduj (wstrzyknij zależność, wydziel czystą funkcję do `core`).
- **Testy jednostkowe** leżą obok kodu: `src/**/<plik>.test.ts(x)` (konfiguracje w roocie pakietu: `<plik>.test.ts`). Importuj `describe`/`it`/`expect`/`vi` jawnie z `vitest`. Każdy pakiet z `packages/*` jest osobnym projektem Vitest; opcjonalny `vitest.setup.ts` w roocie pakietu ładuje się automatycznie.
- **Granice mockuj, logikę testuj naprawdę:** `next/server` (`connection`), `@/server/container` (w stronach i handlerach — podstaw `cradle` z fałszywymi serwisami), `@gomoku/db`/ORM (w serwisach — fałszywy `orm`/`em`), `@next/env` (konfiguracje). `server-only` jest zaślepiony w `packages/app/vitest.setup.ts`. Środowisko ustawiaj przez `vi.stubEnv` (przywracane automatycznie) — nie zakładaj wartości `NODE_ENV`/`DATABASE_URL` z otoczenia. Moduły ze stanem lub efektami na poziomie modułu ładuj w teście przez `vi.resetModules()` + `await import()`.
- **Komponenty React** testuj przez `renderToStaticMarkup` z `react-dom/server` (async server component: `renderToStaticMarkup(await Page())`). Komponenty klienckie z interakcją: dodaj `jsdom` + `@testing-library/react` do projektu, który ich potrzebuje.
- **Testy integracyjne** (`tests/integration/*.test.ts`, `vitest.integration.config.ts`) sprawdzają zbudowaną aplikację end-to-end: `global-setup.ts` startuje PostgreSQL w Testcontainers, wykonuje migracje i `next start` z `DATABASE_URL` kontenera; przeglądarką steruje `agent-browser` przez helper `tests/integration/browser.ts`, a kody HTTP i API sprawdzaj przez `fetch`. Nowa strona, przepływ użytkownika lub endpoint dostaje scenariusz integracyjny. Do selekcji elementów bez roli/tekstu używaj `data-testid`. Log serwera: `tests/integration/server.log`.
- **Wymagania lokalne:** Docker (Testcontainers) i jednorazowo `npx agent-browser install` (Chrome) — albo `npm run setup -- --with-browser`. Testy integracyjne używają builda — po zmianie kodu lub zależności uruchom `npm run build` przed `npm run test:integration`.
- **CI** (`.github/workflows/ci.yml`) uruchamia na każdym PR i pushu na `main` joby `lint`, `typecheck`, `unit`, `build`, `integration`, `setup` (dwukrotne `npm run setup` na świeżym checkoucie), `tokens` (wartości spoza tokenów) i `docker` (build obrazu i start stosu `compose.prod.yaml` z sondą `/api/health`). Wszystkie muszą być zielone przed merge.

### Komendy (z roota)

`npm run setup` · `npm run dev` · `npm run build` · `npm run start` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run test:watch` · `npm run test:integration` · `npm run smoke` · `npm run check` · `npm run db:migration:create|up|down|list` · `npm run db:status` · `npm run db:cleanup` (sprzątanie wygasłych rekordów; na bazie dev kasuje dane — uruchamiaj świadomie, cron na VPS)

## Struktura `.ai/`

Wszystkie nowe pliki w `specs/`, `docs/`, `runs/` i `lessons/` muszą mieć nazwę `YYYY-MM-DD-slug.md` (data utworzenia, slug kebab-case). Zachowuj oryginalną datę przy przenoszeniu plików.

| Ścieżka | Przeznaczenie |
| --- | --- |
| `.ai/specs/` | Aktywne specyfikacje SDD (cel, wymagania, kryteria akceptacji, notatki techniczne, status). |
| `.ai/specs/implemented/` | Specyfikacje wdrożone — przenieś tu po spełnieniu kryteriów akceptacji. |
| `.ai/specs/archive/` | Specyfikacje anulowane lub nieaktualne. |
| `.ai/docs/` | Dokumenty referencyjne obowiązujące przy implementacji (np. standardy inżynierskie). |
| `.ai/runs/` | Log każdego autonomicznego przebiegu (`/loop`, workflow, cron, długa praca bez nadzoru): cel, kroki z rezultatami, zmiany, błędy, status. |
| `.ai/lessons/` | Pojedyncze lekcje: problem, kontekst, wniosek/reguła, powiązane spec/run. |
| `.ai/lessons.md` | Indeks lekcji — jedna linia na wpis z linkiem do `lessons/…`. Czytany na starcie każdej sesji. |
| `.ai/agentic.config.json` | Konfiguracja pipeline'u skilli `om-*` (bramka walidacyjna, tracker, etykiety, QA gate). Zmieniaj razem z `SDLC.md`; generuje ją `om-setup-agent-pipeline`. |
| `.ai/trackers/`, `.ai/browsers/` | Deskryptory operacji trackera (GitHub) i przeglądarki (agent-browser) używane przez skille `om-*` — repozytoryjna kopia jest nadrzędna. |
| `.ai/analysis/`, `.ai/scripts/`, `.ai/qa/` | Raporty skilli, skrypty środowiska testowego, stan i artefakty QA (`artifacts_*`, `test-env.*` są ignorowane przez git). |

Proces dostarczania zmian (etapy, etykiety, bramka QA, protokół przejęcia) opisuje `SDLC.md`, zasady review — `CODE_REVIEW.md`, chronione kontrakty — `BACKWARD_COMPATIBILITY.md`. Skille `om-*` (instalowane w `.agents/skills/`, linki w `.claude/skills/`, wersje w `skills-lock.json`) czytają te pliki; nie edytuj zainstalowanych skilli — odstępstwa zapisuj w `.ai/skills/<skill>/SKILL.md`.

Nie modyfikuj istniejących plików spoza tej struktury (np. `.ai/specs/product-brief.md`, `.ai/specs/research/`, `.ai/cezar/`) bez wyraźnej prośby.

## Przepływ pracy

1. **Kontekst na start.** Przeczytaj `.ai/lessons.md` i specyfikacje w `.ai/specs/` dotyczące zadania. Specyfikacja jest źródłem prawdy dla wymagań.
2. **Planuj złożone zadania.** Zadanie wieloetapowe, dotykające kilku plików lub z kilkoma możliwymi podejściami zaczynaj od planu (plan mode / specyfikacja w `.ai/specs/`), nie od kodu. Dopracuj plan tak, by implementacja mogła przejść za jednym razem; przy większych zmianach poproś drugiego agenta o krytyczny przegląd planu.
3. **Gdy coś idzie źle — wróć do planowania.** Nie forsuj implementacji, która się rozjeżdża. Zatrzymaj się, zaktualizuj plan/specyfikację i dopiero wtedy kontynuuj.
4. **Weryfikuj każdą zmianę, zanim uznasz ją za gotową.** Minimum: `npm run check` (`lint` → `typecheck` → `test` ze 100% pokryciem → `build` → `test:integration`; wymaga Dockera). Bez Dockera: wszystko poza `test:integration`, plus `npm run smoke` na działającej bazie z `DATABASE_URL` — i napisz wprost, że integracja nie była uruchomiona. Zmiany w `packages/db` sprawdź na prawdziwym PostgreSQL (migracje w górę i w dół). Zmiany UI sprawdź w działającej aplikacji (`npm run dev`), łącznie z przypadkami brzegowymi. Odhacz kryteria akceptacji ze specyfikacji. Jeśli czegoś nie dało się zweryfikować — napisz to wprost.
5. **Po poprawce użytkownika zapisz lekcję.** Każda korekta (zła decyzja, błąd, zignorowana konwencja) kończy się wpisem w `.ai/lessons/YYYY-MM-DD-slug.md` z konkretną regułą, która zapobiegnie powtórce, oraz linią w `.ai/lessons.md`. To samo po naprawieniu nietrywialnego błędu. Jeśli reguła dotyczy wszystkich zadań, dopisz ją też do tego pliku.
6. **Naprawiaj błędy samodzielnie.** Mając raport błędu, nieprzechodzący test lub logi — znajdź przyczynę i napraw ją bez dopytywania o podejście. Pytaj tylko o decyzje, które naprawdę należą do użytkownika.
7. **Wybieraj eleganckie rozwiązanie.** Jeśli poprawka wyszła prowizoryczna, odrzuć ją i zaimplementuj czyste rozwiązanie z wykorzystaniem tego, czego się nauczyłeś — zamiast nakładać kolejne łatki.
8. **Używaj subagentów** do researchu, przeszukiwania kodu i równoległych, niezależnych analiz, żeby główny kontekst pozostał czysty. Niezależne zadania można prowadzić równolegle w osobnych git worktree.
9. **Automatyzuj powtarzalne czynności.** Coś, co robisz wielokrotnie, zaproponuj jako skill lub komendę w `.claude/` (commitowaną do repozytorium).
10. **Loguj przebiegi autonomiczne** w `.ai/runs/` — na bieżąco lub najpóźniej na końcu przebiegu, także gdy zakończył się błędem.
