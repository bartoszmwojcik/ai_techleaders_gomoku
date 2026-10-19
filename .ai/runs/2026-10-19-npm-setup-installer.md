# Plan wykonania: idempotentny instalator `npm run setup`

Source doc: .ai/specs/2026-10-19-npm-setup-installer.md
Issue: #6 · Spec PR: #7 · Branch: `feat/npm-setup-installer`
Engine: om-auto-create-pr (steps: 10, --loop: no)

## Cel

`npm run setup` wykonuje kroki z sekcji „Uruchomienie” README w kolejności, jest idempotentny (drugie uruchomienie: wszystko „pominięto”, kod 0) i nigdy nie dotyka bazy innej niż ta, której użyje `npm run dev`.

## Zakres

- `scripts/setup/*.mjs` (instalator, tylko moduły wbudowane Node w krokach 1–3) z testami w `scripts/setup/*.test.ts`.
- `packages/db`: sonda `db:status` (`src/cli/status.ts`), wydzielone `migrations-config.ts`.
- Konfiguracja: `package.json` (root i `packages/db`), `vitest.config.ts` (projekt `scripts`, pokrycie), root `tsconfig.json`, `compose.yaml` (`name:`), `.github/workflows/ci.yml` (job `setup`).
- Dokumentacja: `README.md`, `AGENTS.md`, `BACKWARD_COMPATIBILITY.md` §7.

## Non-goals

- Instalacja Node.js/Dockera, wdrożenie, dane testowe.
- Dopisywanie brakujących kluczy do istniejącego `.env.local`.
- Naprawa rozjazdu trybów `@next/env` (dev vs production) w CLI MikroORM — zgłoszenie uzupełniające.
- Ignorowanie `.ai/tmp/` (worktree skilli) w `.gitignore`/ESLint — poza zakresem specyfikacji; zgłoszenie uzupełniające.

## Implementation Plan

### Phase 1: Instalator i sonda bazy

1. Szkielet (`cli`/`main`/`system`), skrypt `setup`, projekt Vitest `scripts`, pokrycie, `tsconfig` — z testami adapterów.
2. Krok 1 (wymagania) i podsumowanie.
3. Krok 2 (zależności: `npm ci` + znacznik).
4. Krok 3 (`.env.local`).
5. Sonda `db:status` w `@gomoku/db` + `migrations-config.ts`.
6. Krok 4 (cel bazy, blokada obcej bazy z otoczenia).
7. Kroki 5–7 (baza, migracje, przeglądarka) + `name:` w `compose.yaml`.

### Phase 2: CI, dokumentacja, weryfikacja

1. Job CI `setup` (dwa przebiegi na świeżym checkoucie).
2. Dokumentacja (README, `AGENTS.md`, `BACKWARD_COMPATIBILITY.md` §7).
3. Weryfikacja ręczna i pełna bramka (`npm run check`).

## Ryzyka

- Prawdziwe zachowanie `npm ci`/Docker Compose/MikroORM jest weryfikowane tylko przez job CI `setup` i test ręczny — testy jednostkowe używają atrap.
- `npm ci` w drugim uruchomieniu na Windows przy działającym `npm run dev` (EPERM) — tylko podpowiedź.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Instalator i sonda bazy

- [x] 1.1 Szkielet, skrypt setup, projekt Vitest scripts i pokrycie — c83482b
- [x] 1.2 Krok 1 (wymagania) i podsumowanie — e8d5b05
- [x] 1.3 Krok 2 (zależności) — 1fb849a
- [x] 1.4 Krok 3 (.env.local) — 044f7f4
- [x] 1.5 Sonda db:status w @gomoku/db — d29d147
- [x] 1.6 Krok 4 (cel bazy) — 87c4513
- [ ] 1.7 Kroki 5–7 (baza, migracje, przeglądarka)

### Phase 2: CI, dokumentacja, weryfikacja

- [ ] 2.1 Job CI setup
- [ ] 2.2 Dokumentacja
- [ ] 2.3 Weryfikacja ręczna i pełna bramka
