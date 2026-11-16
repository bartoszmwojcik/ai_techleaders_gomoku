# Hook agenta ma ten sam zakres co krok CI, którego zasadę egzekwuje

**Problem.** Pierwsza wersja hooka `PreToolUse` (`scripts/hooks/guard-edits.mjs`) blokowała każdy zapis, którego treść zawierała frazę komentarza wyłączającego pokrycie — także w `AGENTS.md`, w skillach i we własnym pliku testowym hooka. Wyszło od razu po scaleniu: hook zablokował edycję samego hooka, bo komunikat błędu zawierał zakazaną frazę.

**Kontekst.** Krok CI „No coverage ignore comments” sprawdza tylko `packages/` (`git grep -nE "(v8|c8|istanbul) ignore" -- packages`) i obejmuje też `c8`. Hook napisano z opisu zasady w `AGENTS.md`, nie z kroku CI.

**Reguła.** Hook, który egzekwuje zasadę z CI, kopiuje z CI dokładnie wzorzec i zakres ścieżek (i ma test, że dokumentacja poza zakresem przechodzi). Po zmianie hooka sprawdź go na żywo: edycja pliku `.md` z frazą → kod 0, kod w `packages/` → kod 2.

Powiązane: `.ai/runs/2026-11-16-agent-readiness-gaps.md`, `security-notes.md`.
