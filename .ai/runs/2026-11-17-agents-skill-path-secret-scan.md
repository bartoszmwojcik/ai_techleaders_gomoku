# Plan: ścieżka skilla gomoku-player-screen i skanowanie sekretów w CI

Data: 2026-11-17 · Silnik: om-auto-create-pr (kroki: 4, --loop: no) · Gałąź: `fix/agents-skill-path-secret-scan`

## Cel

1. Instrukcje agentów wskazują aktualne położenie skilla projektowego (`.agents/skills/gomoku-player-screen`, link w `.claude/skills/`) — po #325 `AGENTS.md` i `security-notes.md` kierowały do nieistniejącego `.ai/skills/gomoku-player-screen/SKILL.md`.
2. CI skanuje całą historię gita w poszukiwaniu sekretów (gitleaks) na każdym PR i pushu na `main`.

## Zakres

- `AGENTS.md` (sekcja „Struktura `.ai/`” i opis CI), `security-notes.md` (sekcje 1 i 2).
- `.github/workflows/ci.yml`: nowy job `secrets` (bez `needs: changes` — sekret może wyciec także w Markdownie).
- `.gitleaksignore`: odciski 14 znalezionych fałszywych alarmów (testowe/demonstracyjne hasła w testach, stories i prototypach).

Poza zakresem: ustawienie joba jako wymaganego checku w ochronie gałęzi (ustawienie GitHuba, robi właściciel), aktualizacja gitleaks przez Dependabota (binarka przypięta wersją i sumą SHA-256 w workflow — Dependabot jej nie podbija).

## Decyzje

- Binarka z wydania GitHub + weryfikacja SHA-256 zamiast `gitleaks/gitleaks-action`: bez licencji/`GITHUB_TOKEN`, bez dodatkowych uprawnień, zgodne z `permissions: contents: read`.
- Skan pełnej historii (`fetch-depth: 0`, ~4 s na 539 commitach) zamiast tylko commitów PR — prostsze i wykrywa też sekret dodany i usunięty w tym samym PR.
- `.gitleaksignore` z odciskami (commit:plik:reguła:linia) tylko dla historii na `main`, zamiast allowlisty ścieżek — nie wyłącza skanowania testów. Nowe fałszywe alarmy: komentarz `gitleaks:allow` w linii, bo squash merge zmienia SHA i odcisk z PR-a nie pasowałby na `main` (zmiana planu w trakcie, wykryta przy implementacji).
- `--redact`: log CI nie pokazuje znalezionej wartości.

## Ryzyka

- Nowe fikcyjne hasło w teście (np. `password = "…"`) zablokuje CI do czasu oznaczenia linii komentarzem `gitleaks:allow` — opisane w `security-notes.md` i `AGENTS.md`.

## Progress

PR: #326

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Ścieżka skilla

- [x] 1.1 Poprawić ścieżkę skilla w AGENTS.md i security-notes.md — 525d33e

### Phase 2: Skanowanie sekretów

- [x] 2.1 Lokalny skan gitleaks i .gitleaksignore dla fałszywych alarmów — f3ad6c0
- [x] 2.2 Job secrets w ci.yml — 52cbc3f
- [x] 2.3 Dokumentacja w AGENTS.md i security-notes.md — 7d97370

### Review (om-auto-review-pr --autofix)

- [x] R.1 Zakres skanu: `--log-opts=HEAD` zamiast domyślnego `--all` (gitleaks skanował wszystkie gałęzie zdalne, 5 z 14 odcisków dotyczyło commitów spoza `main`); `.gitleaksignore` ograniczony do 9 odcisków z `main`; opis przypadku wcześniejszego commita PR-a bez `gitleaks:allow`

## Walidacja

- `npm run lint`, `npm run typecheck`, `npm test` (100% pokrycia) — zielone lokalnie.
- Kroki joba `secrets` odtworzone lokalnie (pobranie, `sha256sum -c`, skan): 541 commitów, `no leaks found`, kod 0.
- Negatywnie: podrzucony token `ghp_…` wykryty; linia z `gitleaks:allow` pominięta, ta sama wartość bez komentarza wykryta.
- `npm run build` i `npm run test:integration` nie były uruchamiane lokalnie (zmiana nie dotyka kodu aplikacji); uruchamia je CI na PR.
