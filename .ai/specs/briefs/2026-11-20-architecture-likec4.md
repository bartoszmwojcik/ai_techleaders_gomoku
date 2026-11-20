# Interaktywna dokumentacja architektury w LikeC4 (L1–L3, przepływy, model danych) z testem zgodności z kodem i publikacją na GitHub Pages

- Date: 2026-11-20
- Category: documentation
- Priority signal: medium — właściciel chce zrozumieć zbudowany system od ogółu do szczegółu; dziś nie ma do tego jednego punktu wejścia
- Risk signal: low — bez zmian w kodzie aplikacji; ryzyko w nowym narzędziu dev (LikeC4), nowym jobie CI (Pages) i regule zakresu CI dla plików `.c4`
- Routing: `Next: om-auto-write-spec "Interaktywna dokumentacja architektury w LikeC4 (L1–L3, przepływy, model danych) z testem zgodności z kodem i publikacją na GitHub Pages — brief: .ai/specs/briefs/2026-11-20-architecture-likec4.md"`

## Problem

Właściciel chce „dokładnie zrozumieć architekturę rozwiązania, które zostało wykonane, od ogółu do szczegółu”, z diagramami, w które można się zagłębiać: warstwa najogólniejsza pokazuje całość z najważniejszymi elementami, niższe — komponenty, technologie, interfejsy, bazę danych. Dziś `docs/architektura.md` (382 linie) to tabela stacku, drzewo katalogów, jeden diagram Mermaid zależności pakietów i długa proza per funkcja; nie ma widoku kontekstu (aktorzy i systemy zewnętrzne), widoku kontenerów, przekroju warstw żądania, modelu danych ani mapy interfejsów. `docs/security/threat-model.md` ma diagram, ale to widok bezpieczeństwa. **Miara sukcesu (właściciel):** sam rozumie system — przechodzi od L1 do modelu danych i potrafi bez czytania kodu wyjaśnić ruch w partii, dołączenie agenta przez MCP, turę bota i rejestrację z potwierdzeniem e-maila.

## Agreed direction

**Model architektury jako kod w LikeC4** (zgoda właściciela na nowe narzędzie, wymagana przez `AGENTS.md`): jeden model w `docs/architektura/*.c4`, z którego LikeC4 generuje statyczną stronę z klikalnym zagłębianiem się (element → widok poziomu niżej). Cel: trwała dokumentacja w repozytorium, aktualizowana z kodem, nadająca się też do pokazania (warsztat).

- **Poziomy i widoki:**
  - **L1 Kontekst:** gracz (konto lub gość), administrator instancji, agent AI (MCP), system Gomoku, Brevo (wysyłka e-maili), hosting (VPS, Docker / `compose.prod.yaml`).
  - **L2 Kontenery:** aplikacja Next.js (strony `(frontend)`, panel `(backend)` `/backend`, route handlery `/api/*`, endpoint MCP `/api/mcp`), PostgreSQL, cron `db:cleanup` (osobne uruchomienie CLI `@gomoku/db` na VPS). **Bot nie jest osobnym kontenerem:** silnik liczy w wątku roboczym (`worker_threads`, `bot-worker-spawn.ts`) w procesie Next.js, uruchamianym przez `after()`, za bramką `ComputeGate` — w modelu to komponent aplikacji.
  - **L3 Komponenty:** domeny serwisów z `packages/app/src/server/services/*` (auth, games — w tym lobby, zaproszenia, bot, pokaz, widz — chat, email, rate-limit, admin), kontener DI Awilix (`container.ts`) i `withRequestScope` (fork `em` per żądanie), warstwa MCP (`server/mcp`), pakiety `@gomoku/core` (zasady gry, silnik bota), `@gomoku/db` (MikroORM, encje, migracje), `@gomoku/ui` (DS graczy, shadcn dla panelu).
  - **Widoki dynamiczne (przepływy):** ruch w partii; agent dołącza przez MCP; tura bota; rejestracja z potwierdzeniem e-maila.
  - **Model danych:** encje i relacje z `packages/db/src/entities`.
- **Aktualność wymuszona testem w CI** (wybór właściciela): test porównuje elementy modelu z kodem — pakietami `packages/*`, rejestracjami w `packages/app/src/server/container.ts` i encjami z `packages/db/src/entities/index.ts`; nowy serwis/encja/pakiet bez elementu w modelu (lub element bez odpowiednika) = czerwony CI. Do tego `likec4 validate`. Sam przepis w `AGENTS.md` uznano za niewystarczający (proza się starzeje — dowodem obecny `architektura.md`).
- **Publikacja:** GitHub Pages budowane z `main` (job w CI, akcje przypięte do SHA jak reszta `ci.yml`, uprawnienia `pages: write` tylko w tym jobie) oraz lokalnie `npm run docs:arch` (podgląd).
- **Integracja z CI:** pliki `.c4` pod `docs/architektura/`; własny filtr w `scripts/ci/scope.mjs` (z testem), tak by PR zmieniający model nie pominął walidacji i testu zgodności, a jednocześnie nie uruchamiał bez potrzeby ciężkich jobów.
- **`docs/architektura.md`** dostaje krótki wstęp z linkiem do strony i opisem poziomów; proza funkcji zostaje.
- **Fazowanie (jeden PR specyfikacji, potem jeden PR implementacji z fazami):** faza 1 — model L1–L2, `docs:arch`, `likec4 validate`; faza 2 — L3, przepływy, model danych, test zgodności; faza 3 — job Pages w CI.
- **Kryterium porzucenia:** jeśli `likec4 build` nie działa w CI (np. wymaga przeglądarki lub nie mieści się w czasie), wracamy do Mermaid w Markdownie z nawigacją linkami.
- **Odrzucone:**
  - Mermaid per poziom z linkami pod diagramami — zero nowych narzędzi i render na GitHubie, ale brak klikalnego zagłębiania i ryzyko rozjazdu poziomów pisanych osobno.
  - Jednorazowa strona HTML w cockpicie — nie żyje w repozytorium.
  - Serwowanie strony przez aplikację na VPS — miesza dokumentację z produkcją.
  - Sama konwencja lub mały model bez testu — bez egzekwowania.
  - **„Nic nie budować” (przejście przez architekturę w czacie)** przegrało, bo wiedza zostałaby w rozmowie, a repozytorium dalej nie miałoby widoku całości; cel to trwała dokumentacja.

## Resolved unknowns

| Question | Answer (from the conversation) |
|----------|--------------------------------|
| Dla kogo i po co? | Wszystko naraz: trwała dokumentacja w repozytorium, dla nowych osób i agentów, nadająca się do prezentacji |
| Miara sukcesu | Właściciel sam rozumie system: przechodzi L1 → dane i wyjaśnia 4 przepływy bez czytania kodu |
| Jak działa zagłębianie się? | Klikalne, z jednego modelu — LikeC4 (zgoda na nowe narzędzie dev) |
| Gdzie publikować? | GitHub Pages z `main` + lokalnie `npm run docs:arch` (repozytorium jest publiczne) |
| Głębokość | L1–L3 + widoki dynamiczne (4 przepływy) + model danych; bez poziomu kodu |
| Jak pilnować aktualności? | Test w CI porównujący model z pakietami, `container.ts` i `entities/index.ts`, plus `likec4 validate` |
| Bot jako kontener? | Nie — wątek roboczy w procesie Next.js; komponent aplikacji (sprawdzone w kodzie) |
| Gdzie leży model? | `docs/architektura/*.c4`, z własnym filtrem w `scripts/ci/scope.mjs` (domyślne ustalenie, niekwestionowane) |
| Instalacja LikeC4 | Przypięta devDependency w roocie monorepo (domyślne ustalenie) |

## Non-goals

- Poziom kodu (pojedyncze funkcje, klasy, każda trasa API jako osobny element).
- Eksport PNG/SVG diagramów do repozytorium.
- Serwowanie dokumentacji przez aplikację Gomoku lub na VPS.
- Przepisanie prozy w `docs/architektura.md` (tylko wstęp z linkiem).
- Zmiany w kodzie aplikacji, poza testem zgodności modelu.

## Affected areas (if known)

- `docs/architektura/` (nowy model `.c4`), `docs/architektura.md` (wstęp)
- `package.json` w roocie (devDependency LikeC4, skrypt `docs:arch`), `package-lock.json`
- `.github/workflows/ci.yml` (walidacja, test zgodności, job Pages), `scripts/ci/scope.mjs` + test
- Test zgodności czytający `packages/*`, `packages/app/src/server/container.ts`, `packages/db/src/entities/index.ts`
- `AGENTS.md` (krótka reguła: zmiana serwisu/encji/pakietu → aktualizacja modelu; test to egzekwuje)
- Krok właściciela: jednorazowo Settings → Pages → Source: GitHub Actions
