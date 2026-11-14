# 2026-11-14 — Ręczny workflow wydawania Gomoku (GitHub Actions)

Status: in-progress · Branch: `feat/release-workflow` · Engine: om-auto-create-pr (steps: 9, --loop: no)

## Goal

Ręcznie uruchamiany workflow `release.yml`: wybór nowej wersji (patch / minor / major albo własny numer), podbicie `version` we wszystkich śledzonych `package.json` (root + `packages/*`) i w `package-lock.json`, tag Git `vX.Y.Z` oraz GitHub Release z notatkami z wpisu `# X.Y.Z (data)` w `CHANGELOG.md`.

## Scope

- `.github/workflows/release.yml` — `workflow_dispatch` z wejściami `bump` (choice) i `custom_version`; tylko z `main`, tylko gdy CI na HEAD jest zielone.
- `scripts/release/` — logika w testowalnych modułach `.mjs` (wersja, notatki z CHANGELOG, podbicie plików), wywoływana przez workflow; testy 100% (konwencja `scripts/ci`).
- `vitest.config.ts` — `scripts/release/**/*.mjs` w `coverage.include`.
- `docs/wdrozenie-i-utrzymanie.md` — sekcja „Wydawanie wersji”.

## Design decisions

- `main` jest chroniony (PR + 8 wymaganych checków, `strict`), więc workflow **nie pcha na `main`**: tworzy gałąź `release/vX.Y.Z` z commitem podbicia, taguje ten commit (tag adnotowany), publikuje Release, uruchamia CI na gałęzi (`workflow_dispatch` działa z `GITHUB_TOKEN`) i otwiera PR do `main`. Tag wskazuje commit z gałęzi wydania; po squash-merge `main` ma inny commit, tag nadal prowadzi do tej wersji.
- Wersja równa bieżącej (pierwsze wydanie `0.1.0`, wpis w `CHANGELOG.md` już istnieje): bez commitu i gałęzi, tag na HEAD `main`.
- Wpis w `CHANGELOG.md` musi istnieć przed wydaniem (przygotowuje go `om-auto-update-changelog`); jego brak przerywa workflow przed jakąkolwiek zmianą.
- Wejścia trafiają do skryptów przez `env`, nigdy przez interpolację w `run:` (wstrzyknięcie poleceń); własna wersja walidowana w Node.
- Nie podbijam `cezar/` ani `.deepsec/` (nieśledzone w tym repozytorium).

## Non-goals

Publikacja obrazu Docker, wdrożenie na Mikrus, automatyczne generowanie wpisu CHANGELOG, uruchomienie workflow (publikuje prawdziwy Release — robi to właściciel).

## Risks

- Workflow można zweryfikować tylko na GitHubie po scaleniu na `main` (poza testami skryptów i parsowaniem YAML); pierwsze użycie = prawdziwy Release.
- Otwarcie PR przez `GITHUB_TOKEN` wymaga ustawienia „Allow GitHub Actions to create and approve pull requests”; bez niego krok drukuje link do ręcznego otwarcia.
- Zielone CI na HEAD sprawdzane przez `check-runs` API (z pominięciem własnego zadania).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Logika wydania (skrypty + testy)

- [ ] 1.1 Wersja: walidacja, porównanie, wyliczenie następnej (`scripts/release/version.mjs`)
- [ ] 1.2 Notatki z `CHANGELOG.md` dla wersji (`scripts/release/changelog.mjs`)
- [ ] 1.3 Podbicie `package.json` i `package-lock.json` (`scripts/release/bump.mjs`)
- [ ] 1.4 Wejście CLI i `coverage.include` (`main.mjs`, `cli.mjs`)

### Phase 2: Workflow i dokumentacja

- [ ] 2.1 `.github/workflows/release.yml`
- [ ] 2.2 Sekcja „Wydawanie wersji” w `docs/wdrozenie-i-utrzymanie.md`
