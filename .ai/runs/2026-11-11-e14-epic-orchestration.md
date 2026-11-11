# Przebieg: epik E14 (pokaz) z E15-S01 i narzędziami E15-S02 — orkiestracja

- **Cel:** wykonać epik E14 (#275) i dołączyć E15-S01 (#291) oraz, jeśli warto, E15-S02 (#292).
- **Tryb:** zadanie nadrzędne cezar (2026-11-10 → 2026-11-11), historie jako zadania potomne w osobnych worktree, jedno naraz (wyjątek właściciela: #281 równolegle z E15-S01). Logi historii: pliki `2026-11-1x-e14-*` i `2026-11-10-e15-s01-*` w tym katalogu.

## Kroki i rezultaty

| Krok | PR | Zgłoszenie | Wynik |
|---|---|---|---|
| Migracja `origin = 'show'`, konfiguracja `SHOW_*` | #301 | #281 | scalone; `down` odmawia przy pokazie, sprawdzone na PostgreSQL |
| `.env.example` (właściciel) | #303 | — | scalone |
| Fundament i18n (`?lang=`, ciasteczko, nagłówek PL/EN/FR) | #302 | #291 | scalone; QA najpierw FAIL (przełącznik zasłaniał nagłówek partii < 640 px), po poprawce PASS |
| Pokaz bot vs bot + widok tylko do odczytu | #304 | #280 | scalone; poprawki QA: zegary po zakończeniu, przewijanie 720p, nazwa układu |
| Napęd botów pollingiem widoku | #305 | #282 | scalone; restart w trakcie partii sprawdzony integracyjnie |
| Bot vs agent | #306 | #283 | scalone; poprawka QA: agent czyta `cancelled` po zakończeniu przez administratora (`finished_at`) |
| Pokrętła tempa, `bot:bench --show`, test przedlotowy, runbook + eksport CSV i18n | #307 | #285 (zamknięte), #284, #292 (Refs) | scalone; dodany scenariusz przeglądarkowy konsoli |

Każdy PR: przegląd w świeżym kontekście bez blokerów, QA w przeglądarce dla zmian UI, CI 11/11; `qa-approved` i scalenie na podstawie zgody właściciela z góry. CI na `main` po ostatnim scaleniu (`f509894`): zielone.

## Błędy i wnioski

- Polskie słowo zamykające („Zamyka #N”) nie zamyka zgłoszeń w GitHubie — #281 i #291 zamknięte ręcznie; kolejne PR-y używały `Closes #N`. `closeKeywords` w `.ai/agentic.config.json` wymienia tylko polskie słowa (do poprawy razem z `SDLC.md`).
- Agenci w sesji bez interakcji nie mają dostępu do plików `.env*` — fragmenty `.env.example` trafiały do opisu PR dla właściciela.
- Opis zadania potomnego ma limit 4000 znaków — pełne polecenia w plikach `brief-*.md` katalogu drzewa zadań.
- Narzędzia Mikrusa (`mcp__mikrus__*`) odrzucone w trybie bez pytań — wdrożenie i #286 wymagają sesji interaktywnej.

## Stan

- Zamknięte: #280, #281, #282, #283, #285, #291.
- Otwarte: **#286** (wdrożenie na Mikrusa z wyłączonymi flagami, strojenie T1→T3 przez `bot:bench --show --tuning`, próba generalna z obcego komputera — właściciel), następnie #284 i epik #275; #292 (recenzja FR przez osobę znającą język, decyzja na dzień pokazu − 5).
- Lokalny pomiar (nie Mikrus, 8 rdzeni, 60 s, poziom 2): p99 pętli 11,5 ms, RSS +18,5 MB, 0 błędów — nie zastępuje #286.

## Domknięcie (2026-11-11)

- Właściciel wdrożył `main` na Mikrusa (z poprawką #309: zmienne pokazu w `compose.prod.yaml`) i włączył flagi `SHOW_*`. Sonda z zewnątrz: `/api/health` ok, `/show` i `/api/show` → 404 bez sesji administratora, `/?lang=fr` → 307 z ciasteczkiem `gomoku_lang`.
- Próba generalna z obcego komputera (właściciel): bot vs bot i bot vs agent działają, języki poprawne → A-23 sprawdzone.
- Poziom 2 w bot vs bot: decyzja właściciela „wyjątek bez pomiaru” (A-24); `bot:bench --show` na hoście nie był uruchomiony (narzędzia Mikrusa niedostępne w sesji bez interakcji). Zalecenie: pokaz poza godzinami ruchu; przy spowolnieniu innych partii kroki T2/T3 albo poziom 1.
- Specyfikacja przeniesiona do `implemented/`; zamknięte #286, #284, #275. #292 (recenzja FR, decyzja na dzień pokazu − 5) zostaje otwarte w epiku E15.
