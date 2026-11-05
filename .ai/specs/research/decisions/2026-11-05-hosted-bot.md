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
