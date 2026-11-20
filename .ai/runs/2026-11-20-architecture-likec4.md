# Plan wykonania: architektura w LikeC4 (implementacja)

Source doc: .ai/specs/2026-11-20-architecture-likec4.md
Refs: #329 (PR specyfikacji, scalony)

- Data: 2026-11-20
- Silnik: om-auto-create-pr (kroki: 15, --loop: nie)
- Gałąź: feat/architecture-likec4

## Cel

Jeden model LikeC4 w `docs/architektura/` (L1–L3, cztery przepływy, model danych) z testem zgodności w CI (pakiety, rejestracje DI, encje) i publikacją na GitHub Pages z `main`.

## Zakres

- `docs/architektura/` — pakiet narzędziowy poza workspaces (przypięty `likec4`) i pliki `.c4`.
- `scripts/architecture/*.mjs` + testy (100% pokrycia), `scripts/ci/scope.mjs` (wyjście `arch`).
- `.github/workflows/ci.yml` (joby `architecture`, `pages-deploy`), `.github/dependabot.yml`.
- Root: skrypty `docs:arch*`, `.gitignore`, `eslint.config.mjs`, `vitest.config.ts` (`coverage.include`).
- `docs/architektura.md` (wstęp), `AGENTS.md` (reguła + komendy), `.ai/specs/capabilities/` (archiwum delty).

## Non-goals

- Poziom kodu (C4 L4), test kroków przepływów, zmiany w kodzie aplikacji, włączenie Pages w ustawieniach repozytorium (krok właściciela).

## Plan implementacji

Zgodnie z sekcją „Implementation Plan” specyfikacji (kroki 1–15). Krok 5 to characterization `scope.test.ts` przed dodaniem `arch` (delta MODIFIED). Krok 15 archiwizuje deltę do `.ai/specs/capabilities/architecture-docs.md` i przenosi specyfikację do `implemented/`.

## Ryzyka

- `likec4 build` może wymagać przeglądarki lub przekroczyć 10 min w CI → kryterium porzucenia (krok 4).
- `likec4` wymaga Node ≥ 22.23.3; CI używa najnowszego 22.
- Pages niewłączone → `pages-deploy` czerwony tylko na `main` (niewymagany).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: L1–L2 i narzędzie

- [ ] 1.1 Pakiet narzędziowy docs/architektura (likec4 przypięty), .gitignore, ESLint
- [ ] 1.2 specification.c4, model L1–L2, views.c4 i adapter likec4-model.mjs z testami
- [ ] 1.3 Skrypty docs:arch i docs:arch:build
- [ ] 1.4 Szkielet joba architecture i bramka porzucenia

### Phase 2: L3, przepływy, dane, zgodność

- [ ] 2.1 Characterization scope.test.ts i wyjście arch
- [ ] 2.2 code-facts.mjs z testami
- [ ] 2.3 compliance.mjs, main.mjs, cli.mjs z testami i coverage.include
- [ ] 2.4 Model L3 z metadanymi di i package
- [ ] 2.5 data.c4: encje i relacje
- [ ] 2.6 Cztery widoki dynamiczne
- [ ] 2.7 Job architecture, wstęp w docs/architektura.md, reguła w AGENTS.md

### Phase 3: publikacja

- [ ] 3.1 upload-pages-artifact i job pages-deploy ze ścieżką bazową
- [ ] 3.2 Dependabot dla docs/architektura i instrukcja kroku właściciela
- [ ] 3.3 Pełna weryfikacja (npm run check, docs:arch:check, docs:arch:build)
- [ ] 3.4 Archiwizacja delty i specyfikacji
