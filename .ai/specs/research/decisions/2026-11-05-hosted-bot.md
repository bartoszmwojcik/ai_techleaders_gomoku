# Decyzje: bot algorytmiczny hostowany przez nas (2026-11-05)

- **Właściciel:** Bartosz Wójcik. **Charakter:** osąd i upodobanie właściciela, **nie wynik badania**. Podstawą są wyłącznie jego wypowiedzi w sesji `om-discover --refresh` (tryb own); nie opisał sytuacji gracza, nie ma wywiadów, danych użycia ani sygnału sukcesu.
- **Źródła:** rozmowa z 2026-11-05; recenzja skeptyka (niezależny odczyt w świeżym kontekście); `product-brief.md` (N-10, D-28, BR-04, BR-13, BR-24, BR-31, BR-44, BR-50, D-32, D-34, A-14), `research/decisions/2026-10-31-agent-opponent.md`, benchmark `research/2026-10-20-benchmark-{donkeycat-gomoku,papergames}.md` (trzej przeciwnicy komputerowi w DonkeyCat, bot w papergames; wpływ botów na odbiór gry: brak danych).

## Prośba i wypowiedzi właściciela

- Prośba: „bot grający w gomoku. Dodajemy możliwość wyboru gry z botem, wyboru jego poziomu, ale dopiero po wykonaniu przynajmniej 2 dostępnych poziomów. Samo sporządzenie bota musi być przemyślane, żeby grał możliwie algorytmicznie, kontrolował zużycie pamięci i CPU. Należy dobrać odpowiedni algorytm lub algorytmy.”
- Powód: „Bo jest dla mnie cool. I nie zjada tokenów jak gra.” (porównanie z agentem LLM, D-28)
- Zasoby: „wyobrażam sobie algorytm który sprawdzi dostępny RAM i dobierze głębokość drzewa przeszukiwań. Twardy budżet na ruch - tego nie wiem czy chcę, ale miękki tak. Lokalnie mam 16 GB RAM więc można testować.” Później, na pytanie, czy siła ma zależeć od RAM, czy bot ma nigdy nie przekroczyć bezpiecznego limitu: „oba stwierdzenia jednocześnie. dodatkowo miara siły wg RAM niech będzie pokazywana w nazwie bota.”
- Wydanie: „zróbmy od razu z dwoma” (poziomami).
- Warunek z N-10: „świadomie pomijam wcześniejsze czekanie na dane z licznika. chcę mieć to już na obecnym etapie”.
- Dobór algorytmów (propozycja agenta) i zakres (klasyk, partia prywatna, gość może grać, historia konta): odpowiedź „ok”.

## Pytania i odpowiedzi

| Pytanie | Odpowiedź właściciela |
|---|---|
| Co znaczy „dopiero po wykonaniu przynajmniej 2 poziomów” (bramka wydania czy postęp gracza)? | Wybór bota od razu, wybór poziomu dopiero gdy jest z czego wybierać; następnie: wydanie od razu z dwoma poziomami. |
| Po co bot i po czym poznasz, że działa? | „Bo jest dla mnie cool.” i brak kosztu tokenów. Sygnał sukcesu: brak odpowiedzi (Q-25). |
| Gdzie liczy bot i jaki budżet zasobów? | Siła zależna od RAM i bezpieczny limit jednocześnie; miara siły w nazwie bota; budżet miękki tak, twardy „nie wiem”. Wartości liczbowe: nieustalone (Q-23). |
| Zakres: wariant, gość, historia, czat, widzowie, lobby (propozycja agenta) | „ok” — klasyk w v1, partia prywatna bez lobby, widzów i czatu, gość może grać, historia konta, osobna para w liczniku. |
| Czy pomijasz warunek z N-10 („najpierw licznik z D-28”)? | Tak, świadomie. |

## Decyzje

| ID | Decyzja | Nadpisuje |
|---|---|---|
| D-36 | Bot algorytmiczny hostowany przez nas, bez LLM i bez kosztu tokenów; dobór algorytmów (poziom 1 heurystyka wzorców, poziom 2 negamax z alfa-beta, pogłębianiem iteracyjnym i ograniczoną tablicą transpozycji; silnik jako czysta funkcja w `packages/core`) to propozycja agenta przyjęta „ok”. | częściowo N-10 |
| N-15 | Poza zakresem: przeciwnik hostowany oparty na LLM, rankingi i rating botów, odblokowywanie poziomów postępem, uczenie się na partiach graczy, bot w lobby, w partiach publicznych i w „papier i ołówek” (Q-24), czat bota. | częściowo N-10 |
| BR-54…BR-58 | Typ uczestnika „Bot”, partia prywatna, wydanie z dwoma poziomami, v1 tylko klasyk, zasoby (RAM + bezpieczny limit, siła w nazwie), zegar i historia. | — |
| A-20…A-22, Q-23…Q-25 | Ryzykowne założenia (popyt nieprzebadany; RAM słabo przybliża koszt przeszukiwania; blokowanie pętli zdarzeń na hoście 2 GB) i pytania otwarte (specyfikacja bota, bot w papierze, sygnał sukcesu). | — |

## Odrzucone lub odłożone alternatywy (rozważone przez agenta)

- **MCTS:** mniej przewidywalne zużycie CPU i pamięci.
- **Obliczenia w przeglądarce:** serwer musiałby ufać ruchom „bota” od klienta (zegar, historia, widzowie).
- **Osobny kontener:** hosting 2 GB RAM bez swapu; build już raz zabił aplikację przez pamięć.
- **Przeciwnik oparty na LLM:** koszt tokenów; N-10 zostaje dla niego w mocy.
- **Bot jako wewnętrzny klient istniejącego miejsca agenta zamiast nowego typu uczestnika:** nie sprawdzono w kodzie; do rozstrzygnięcia w specyfikacji (Q-23).
- **Bot w wariancie „papier i ołówek”:** odłożony (Q-24); ocena pozycji musi uwzględnić punkty, odstęp 3 pól i automat.

## Uwagi sceptyka, które zmieniły zapis

- Propozycje agenta nie są zapisane jako rozstrzygnięcia właściciela; dobór algorytmów, serwer i „jedno obliczenie naraz” są oznaczone jako propozycja przyjęta „ok”.
- Pomysł „głębokość z RAM” jest sprzeczny z A-21 (RAM słabo przybliża koszt; siła będzie zależna od hosta). Właściciel go podtrzymał razem z bezpiecznym limitem; ryzyko zostaje jawne, do sprawdzenia testem bot–bot.
- Bot wymaga zmiany modelu uczestnika (`PARTICIPANT_KINDS`, `game_players`, `KNOWN_PAIRS`, migracja) i rozstrzygnięcia, kto wywołuje ruch bota przy leniwym rozliczaniu zegara (brak timerów w serwerze) oraz po restarcie procesu.
- Partie gość–bot kolidują z regułami `db:cleanup` (partie samych gości, osierocone) i BR-24; zakres rozstrzyga specyfikacja.
- Sygnał sukcesu rozdzielony na techniczny (bot–bot, czas ruchu) i użycie przez graczy (otwarte).

## Zatwierdzenie specyfikacji (2026-11-05)

Właściciel o specyfikacji `.ai/specs/2026-11-05-hosted-bot.md` (E13-S01, #256, PR #258): „Zatwierdzam wszystko z rekomendacjami”. Znaczy to przyjęcie wszystkich pozycji R1…R22 z podanymi rekomendacjami. Rozstrzygnięcia:

- **R2:** nowy typ uczestnika `kind = 'bot'` w `game_players` (wewnętrzny klient miejsca agenta odrzucony).
- **R1:** ruch bota wywołuje `after()` po zatwierdzeniu ruchu gracza, a odzyskiwanie po restarcie jest leniwe (każdy odczyt partii, w której bot jest na ruchu).
- **R5:** `worker_thread` na jeden ruch; warunek wstępny to spike S04 (`worker_threads` pod Turbopack). Jeśli spike się nie powiedzie, decyzja wraca do właściciela.
- **Budżety (R6–R8, R18):** zatwierdzone jako wartości **startowe**; funkcja zostaje wyłączona (`BOT_ENABLED` domyślnie wyłączona, R19) do zaakceptowanego pomiaru na hoście o parametrach Mikrusa (A-21, A-22).
- **R9, R11, R12, R13:** nazwa pokazująca siłę, sprzątanie partii gość–bot (znikają 1 h po końcu, konto–bot zostaje w historii), dwie pary w liczniku (`account-bot`, `bot-guest`), brak rewanżu z botem (nowa partia „Zagraj ponownie z botem”).
- **R3, R10, R15, R17, R18, R19:** zatwierdzone z rekomendacjami.
- **Pułap twardy w BR-57:** właściciel potwierdził, że jest zabezpieczeniem (`terminate()`), a nie ogranicznikiem siły bota; siłę poziomu 2 wyznaczają rozmiar tablicy transpozycji i limit głębokości, miękki cel czasu ogranicza każdy ruch.

Skutek w briefie: Q-23 zamknięte; następny bloker to spike S04 i pomiar na Mikrusie.

## Pomiar na Mikrusie i włączenie bota (2026-11-06)

- Pomiar `bot:bench` na hoście docelowym (#264): jeden próg R18 niezaliczony (p99 opóźnienia pętli zdarzeń 59,7 ms przy progu 50), pozostałe zaliczone; sonda RAM czyta pamięć hosta (32767 MB), głębokość p50 3 (`.ai/runs/2026-11-06-e13-s04-bot-bench.md`).
- Decyzja właściciela po przedstawieniu wyniku i trzech opcji (A: zostawić wyłączony, B: włączyć z `BOT_FIXED_MEMORY_MB=1024`, C: obniżyć budżet): „B, włącz z BOT_FIXED_MEMORY_MB=1024”. Charakter: osąd właściciela, wyjątek od R18; nie dowód, że bot spełnia progi.
- Skutek: `BOT_ENABLED=true` i `BOT_FIXED_MEMORY_MB=1024` na produkcji od 2026-11-06; siła na tym hoście stała (tablica 16 MB, głębokość ≤ 8). A-21 i A-22 zaktualizowane w briefie.

