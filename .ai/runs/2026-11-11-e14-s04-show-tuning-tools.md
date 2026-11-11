# 2026-11-11 — E14-S04: pokrętła tempa, `bot:bench --show`, test przedlotowy, runbook + narzędzia E15-S02

- **Cel:** jeden PR z kodem fazy (d) pokazu (#285 w całości, kod i dokumentacja #284) i częścią narzędziową E15-S02 (#292) wg `.ai/specs/implemented/2026-11-09-show-mode.md` („E14-S04”, kroki 0–4) i `.ai/specs/2026-11-10-i18n.md` („E15-S02”). Bez Mikrusa i produkcji; flagi `SHOW_*` zostają wyłączone.
- **Tryb:** autonomiczny (zadanie cezara 27c6ed62, zlecone przez 3ee29010), worktree `cez/27c6ed62` od `origin/main` `200f5a0`.

## Kroki i wyniki

1. **Krok 0 — pokrętła tempa.** `clipShowPause` i `showBotLimits` w `packages/core/src/bot/show-pause.ts`; `SHOW_BOT_L2_SOFT_MS` → `serverConfig.show.botL2SoftMs` (domyślnie 1500, 1–60000); `BotTurnService` przekazuje limity pokazu tylko dla `origin = 'show'` (nowe opcjonalne pole `BotTurn.limits`), pauza przycinana do `min(pauza, zegar na początku tury / 4)` (`clock_ms` w `PEEK_SQL`). Testy: core, config, `bot-turn-service`, `bot-engine`, `tests/integration/show-drive.test.ts` (przycięcie na PostgreSQL).
2. **Krok 2 — test przedlotowy z próbnym ruchem.** `services/games/bot-engine-status.ts` (`trial()` przez wątek roboczy za `ComputeGate`, `pending()`), kontrola `engine` w `POST /api/show/preflight` z `detail: { ms, limitMs, waitedMs }`; `GET /api/show` bez próby. Uwaga z przeglądu #305: `STALLED_SQL` dolicza kolejkę bramki. Integracja: `show-api.test.ts` sprawdza prawdziwy wątek zbudowanej aplikacji (`ok: true`, `ms ≤ 250`).
3. **Krok 3 — przełącznik poziomu 2.** Egzekwowanie było od S01; doszły testy wszystkich kombinacji poziomów × flagi (bot vs bot i bot vs agent) i opcja „Poziom 2 (wyłączony)” widoczna, ale zablokowana (`Select` z `disabled` w opcji, story `OpcjaZablokowana`). `409 SHOW_RUNNING` z `data.layout` (uwaga z #306).
4. **Krok 1 — `bot:bench --show`.** `cli/bot-bench-show.ts` (`runShowStep`, `runTuning`, `TUNING_STEPS`, werdykt P17), wejście w `bot-bench-cli.ts` (`--show`, `--pause-min/--pause-max/--l2-soft` walidowane przez `readShowConfig`, `--duration` w s, `--tuning`, `--probe-url`, `--memory-mb`). Testy na fałszywych timerach i wstrzykniętych źródłach (bez wątków), 100%.
5. **E15-S02 — eksport CSV.** `npm run i18n:export -w @gomoku/app` (`cli/i18n-export.ts`, `i18n-export-cli.ts`); eksport `show`+`header`: `.ai/qa/2026-11-11-i18n-show-header.csv` (135 tekstów, wszystkie FR `draft` — nic nie oznaczono jako `reviewed`). Typografia FR w `show`/`header`: 20 + 4 teksty dostały spację nierozdzielającą (` ` przed `:`, ` ` przed `;` `!` `?`); zaktualizowane testy jednostkowe i integracyjne z tymi tekstami.
6. **Krok 4 — runbook.** `docs/wdrozenie-i-utrzymanie.md`, sekcja „Pokaz (E14, tylko administrator)”: zmienne, strojenie (tabela T1–T3, progi, maks. pauza 8 s, zasada „żaden krok nie przechodzi → pytaj właściciela”), checklista przed pokazem, próba generalna z obcego komputera (z widokiem pod projektor i językiem z linku), karta na wierzchu i zasilanie, wylogowanie, sprzątanie, wycofanie, skrajnie długa partia, nota S03 (runda `get_state` przy poziomie 2) i nota E15 (język z `?lang=`, reguła 5 dni, lista kontrolna recenzji ekranu I17, ekran w 4 językach). `docs/architektura.md` — akapit „Strojenie i test przedlotowy”.

## Pomiar lokalny `bot:bench --show` (lokalnie, NIE Mikrus)

Maszyna deweloperska (8 wątków CPU, Node v22.23.4), `npm run bot:bench -w @gomoku/app -- --show --duration 60 --memory-mb 1024`, krok domyślny (T1: pauza 1000–2000 ms, soft 1500 / pułap 3000 ms), **bez sondy** (brak działającej aplikacji przy tym przebiegu):

```json
{"node":"v22.23.4","cpus":8,"mode":"show","step":{"name":"custom","pauseMinMs":1000,"pauseMaxMs":2000,"l2SoftMs":1500},
 "limits":{"softMs":1500,"ceilingMs":3000},"strength":{"memoryMb":1024,"depthCap":8},"durationMs":60455,"games":2,
 "ends":{"five":1,"full":0,"timeout":0,"unfinished":1},"moves":24,"level1Moves":0,"moveMs":{"p50":846,"p95":1506,"max":1512},
 "depth":{"p50":7,"max":8},"stoppedBy":{"completed":16,"stop":8},"failures":0,"ceilings":0,
 "eventLoopDelayMs":{"p50":10.1,"p99":11,"max":13},"otherGameRead":null,"rssGrowthMb":21.2,"rssSteadyGrowth":false,
 "p17":{"durationAtLeast300s":false,"eventLoopP99Within50Ms":true,"p95WithinSoftTarget":true,"maxWithinCeiling":true,
        "otherGameReadWithin2xAnd300Ms":null,"rssGrowthWithin100MbAndNotSteady":true,"noFailedOrInterruptedMoves":true},
 "accepted":false}
```

Werdykt `accepted: false` wyłącznie przez `durationAtLeast300s` (przebieg 60 s celowo krótki); kod wyjścia 1 zgodnie z werdyktem. Liczby z 8 rdzeni nie przenoszą się na Mikrus (1 rdzeń) — to sprawdzenie narzędzia, nie pomiar A-24.

Drugi przebieg (60 s, ta sama maszyna) **z sondą** `--probe-url http://127.0.0.1:3100/api/health` na działającą aplikację środowiska QA: p95 ruchu 1506 ms, max 1507 ms, p99 pętli 11,5 ms, sonda p95 7,7 ms w czasie obliczeń (bazowo 62 ms, p50 7,6), RSS +18,5 MB, 0 awarii i przerwań; `p17` wszystko `true` poza `durationAtLeast300s`.

## Bramka, przegląd, QA

- Lokalnie: `lint` (0 błędów), `typecheck`, `npm test` (385 plików, 4164 testy, 100% per plik), `npm run build`, `TMPDIR=/tmp npm run test:integration` (93 pliki, 1040 testów), `check:tokens` — zielone. `test:stories`: 3 przekroczenia czasu w niezmienionych stories przy obciążeniu; ponownie (select, board, partia; oba motywy) 55/55.
- CI na PR #307: pierwsze uruchomienie — job „Wartości spoza tokenów” czerwony: `#306`/`#284` w komentarzach `.tsx` złapane przez grep kolorów hex (lekcja 2026-10-31 już to opisuje); poprawione w `e4cced0`, potem wszystkie joby zielone.
- Przegląd w świeżym kontekście (`om-auto-review-pr 307 --autofix`): zatwierdzony, bez blockerów i majorów; minor (komentarz progu `stalled` — `pending` liczy też własne obliczenie) poprawiony w `4c6f3b0`; nity (próbny ruch także przy innych niespełnionych kontrolach — zamierzone; CSV w `.ai/qa/` jest migawką) bez zmian.
- QA (`om-auto-qa-pr 307`): PASS — konsola z zablokowanym poziomem 2, test przedlotowy z silnikiem (144 ms), pokaz poziomu 1, macierz 4 języki × 320 px / 1280×720 projektor × oba motywy (brak przewijania poziomego), przełącznik poziomu 2 włączony → pokaz poziom 1 vs 2, zakończenie i wylogowanie. Dowody w komentarzu PR.
- Na prośbę roota dopisano stan E14/E15 w `.ai/specs/backlog.md`.

## Czego nie zrobiono (poza zakresem / decyzje właściciela)

- Strojenie i pomiar na Mikrusie (#286, krok 5), próba generalna, włączenie `SHOW_BOT_LEVEL2_ENABLED` na produkcji, aktualizacja A-24 — decyzje i praca właściciela.
- Recenzja FR, `status.ts` → `reviewed`, decyzja dnia pokazu − 5 (#292) — kroki ludzkie.
- `.env.example`: nowa zmienna `SHOW_BOT_L2_SOFT_MS` — fragment w opisie PR (agent nie ma dostępu do `.env*`).

## Status

PR #307 gotowy (przegląd zatwierdzony, QA PASS, CI zielone); nie scalony — scala rodzic/właściciel.
