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

PR: #8

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Instalator i sonda bazy

- [x] 1.1 Szkielet, skrypt setup, projekt Vitest scripts i pokrycie — c83482b
- [x] 1.2 Krok 1 (wymagania) i podsumowanie — e8d5b05
- [x] 1.3 Krok 2 (zależności) — 1fb849a
- [x] 1.4 Krok 3 (.env.local) — 044f7f4
- [x] 1.5 Sonda db:status w @gomoku/db — d29d147
- [x] 1.6 Krok 4 (cel bazy) — 87c4513
- [x] 1.7 Kroki 5–7 (baza, migracje, przeglądarka) — 414a6cd

### Phase 2: CI, dokumentacja, weryfikacja

- [x] 2.1 Job CI setup — 3e26a16
- [x] 2.2 Dokumentacja — 05a21f7
- [x] 2.3 Weryfikacja ręczna i pełna bramka — weryfikacja bez zmian w kodzie

## Wyniki weryfikacji (2026-10-19)

- `npm run check` w worktree: lint, typecheck, 136 testów jednostkowych (100% statements/branches/functions/lines, 29 plików), build, 4 testy integracyjne — exit 0.
- Świeży klon gałęzi w katalogu o innej nazwie: 1. `npm run setup` — `npm ci` + `.env.local`, baza współdzielona z kontenerem głównego klonu (przypięta nazwa projektu compose); 2. uruchomienie — wyłącznie „pominięto”, kod 0; edytowany `.env.local` nietknięty; `npm run dev` → `/backend` pokazuje „Połączono”.
- Zatrzymany kontener → instalator uruchomił go (`docker compose up -d`) i doczekał na sondę (3,7 s).
- `DATABASE_URL` obcej bazy w otoczeniu → blokada przed jakimkolwiek połączeniem (hasło zamaskowane); równy plikom → akceptowany.
- `db:status` na prawdziwej bazie: `ok/pending`, `auth`, `database-missing`, `unreachable`; bez tworzenia baz.
- Znalezione i naprawione w trakcie: `import()` CommonJS `@next/env` w natywnym ESM (d021db7), tryb `NODE_ENV=test` w `@next/env` pomijający `.env.local` (87c4513), `ensureDatabase: true` w MikroORM 7 (sonda wyłącza; lekcje w `.ai/lessons/`).

## Review (om-auto-review-pr --autofix)

- Pierwsze review (niezależny agent): REQUEST CHANGES — 2 major, 5 minor, 5 nit (komentarz w PR #8).
- Poprawki: c3303a5 (timeout bez czekania na drzewo procesów, root przez import.meta.url), f890e3f (60 s jako czas ścienny, docker info, podpowiedź o starym projekcie), e685da9 (maskowanie haseł, dokładne przywracanie env, AggregateError, maskowanie wyjść), poprawki nitów z re-review.
- Re-review: APPROVE — wszystkie 12 uwag rozwiązane; 3 nity z re-review: 2 poprawione, 1 (hasło z nieescapowanym „/”) udokumentowany jako ograniczenie.
- Bramka po poprawkach: lint, typecheck, 150 testów (100%), build, 4 testy integracyjne — PASS; `npm run setup` na prawdziwej bazie (także z zatrzymanym kontenerem) — OK.
