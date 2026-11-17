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
- `.gitleaksignore` z odciskami (commit:plik:reguła:linia) zamiast allowlisty ścieżek — nie wyłącza skanowania testów; nowe fałszywe hasło w teście wymaga dopisania odcisku.
- `--redact`: log CI nie pokazuje znalezionej wartości.

## Ryzyka

- Nowe fikcyjne hasło w teście (np. `password = "…"`) zablokuje CI do czasu dopisania odcisku — opisane w `security-notes.md`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Ścieżka skilla

- [ ] 1.1 Poprawić ścieżkę skilla w AGENTS.md i security-notes.md

### Phase 2: Skanowanie sekretów

- [ ] 2.1 Lokalny skan gitleaks i .gitleaksignore dla fałszywych alarmów
- [ ] 2.2 Job secrets w ci.yml
- [ ] 2.3 Dokumentacja w AGENTS.md i security-notes.md
