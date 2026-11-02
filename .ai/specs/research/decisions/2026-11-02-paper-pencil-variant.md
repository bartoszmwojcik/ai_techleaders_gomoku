# Decyzje: wariant „papier i ołówek” (2026-11-02)

- **Właściciel:** Bartosz Wójcik. **Charakter:** osąd właściciela, **nie wynik badania**. Podstawą są wyłącznie jego odpowiedzi z 2026-11-02 (prośba o funkcję, cztery pytania wstępne, bramka pytań szkicu specyfikacji `2026-11-02-paper-pencil-gomoku.md`, sesja `om-discover --refresh`, tryb own, 3 rundy i dodatkowa czwarta po recenzji skeptyka). Właściciel nie opisał zdarzenia, w którym grał w ten wariant albo go brakowało (pytanie zadane, bez odpowiedzi), ani nie podał obserwacji, po której uzna wariant za udany lub nieudany (pytanie zadane, bez odpowiedzi). Brak wywiadów z graczami, danych użycia i benchmarku tego wariantu.
- **Źródła:** rozmowa z 2026-11-02; `product-brief.md` (N-08, BR-04, BR-05, BR-07, BR-10, D-03, D-08, D-28, BR-31, A-01); szkic `.ai/specs/2026-11-02-paper-pencil-gomoku.md`; mapa kodu (plansza 15×15, `bit(225)`, zegar 10 min są zaszyte w implementacji — `[PRODUCT]`).
- **Decyzje w briefie:** D-34, BR-46…BR-51, N-14 (nowe); N-08 (nadpisane przez N-14); BR-04, BR-07, BR-10, D-03, D-08 (zawężone do wariantu klasycznego); A-16…A-18; Q-19, Q-20 (zamknięte), Q-21 (otwarte).

## Pomysł właściciela

Prośba (słowa właściciela): „wersja gry papier w kratkę i ołówek. polega to na tym, że plansza jest potencjalnie nieskończona, choć kamień położyć można tylko tak żeby był przynajmniej 3 pola do innego kamienia, oraz że gra nie kończy się po ułożeniu 5 w linii. wówczas gra się dalej a każda 5 w linii liczy się za punkt. Gra się na czas. domyślnie 3 minuty, opcja na 1,2,5 minut. Kamień może być liczony do 5 maksymalnie 2 razy. nie może być liczony do dwóch 5 w tej samej linii, jedna za drugą.”

## Pytania i odpowiedzi

| # | Pytanie | Odpowiedź właściciela | Pochodzenie |
|---|---|---|---|
| 1 | „Przynajmniej 3 pola do innego kamienia” | Najwyżej 3 pola (także po skosie) od dowolnego kamienia. | wybór spośród opcji agenta |
| 2 | Wspólny czas partii czy zegar na gracza | Zegar na gracza (jak szachowy). | wybór spośród opcji agenta |
| 3 | Równy wynik po czasie | Remis. | rekomendacja agenta przyjęta |
| 4 | „Nieskończona” plansza | Duża plansza skończona, start pośrodku; rozmiar 101×101 (rekomendacja agenta w Q6 szkicu, przyjęta zbiorczo „wszystko tak”). | rekomendacja agenta przyjęta |
| 5 | Zakres zmian w briefie | Klasyk bez zmian (15×15, wygrana przy pięciu, 10 min); N-08 uchylone tylko dla tego wariantu (Renju i inne warianty dalej poza zakresem); czasy 1/2/3/5 tylko w nowym wariancie. | propozycja agenta przyjęta („Wszystko tak”) |
| 6 | Pytania szkicu Q1–Q10 | „Wszystko tak” = rekomendacje: brief aktualizowany w PR-ze ze specyfikacją (Q1); pierwszy kamień w środku (Q5); twórca zaproszenia wybiera wariant i czas, w lobby deklaruje szukający, rewanż kopiuje, agent MCP dołącza bez zmiany kontraktu (Q7); 1/2/3/5 tylko w nowym wariancie (Q8); jedna funkcja w fazach (Q9); w historii wynik punktowy i etykieta wariantu, liczniki par wspólne (Q10). Q2 („koniec od razu”) zastąpione odpowiedzią 8 poniżej. | rekomendacje agenta przyjęte zbiorczo |
| 7 | Liczenie piątek | „W linii musi być 10 kamieni, żeby liczyć 2 piątki.” „Piątki mogą się krzyżować. Wówczas na skrzyżowaniu kamień należy do obu piątek i w sumie 9 kamieni tworzy 2 piątki.” Potwierdzone sformułowanie agenta: nieprzerwany rząd własnych kamieni w jednym kierunku daje tyle punktów, ile pełnych piątek się w nim mieści (5–9 → 1, 10–14 → 2); kamień najwyżej w 2 policzonych piątkach; trzeci kierunek przez taki kamień liczy się tylko, gdy piątkę da się ułożyć bez niego; punkty nie przepadają. | słowa właściciela + sformułowanie agenta potwierdzone „Tak” |
| 8 | Koniec czasu (agent wskazał furtkę: prowadzący przy regule „koniec od razu” może przeczekać własny czas) | „Gdy pierwszy straci czas wygrywający, to wówczas nie może sam dalej stawiać swoich kamieni. Będą one stawiane automatycznie na polu najbliższym tego, gdzie jego przeciwnik ostatnio postawił. Jeśli takich pól jest kilka, to losowo na jednym z nich. Jeśli zaś przegrywający lub remisujący stracił czas pierwszy, wówczas jest koniec.” | słowa właściciela (własny wariant, odrzucił oba warianty agenta) |
| 9 | Szczegóły fazy z automatem | Faza trwa do końca czasu drugiego gracza. Kamienie automatu działają jak normalnie położone (także punktują). Ruch automatu pada 2 s po ruchu przeciwnika. Najbliższe pole to sąsiednie (8 sąsiadów); gdy zajęte — sąsiedzi sąsiadów itd. | słowa właściciela; „wynik decyduje na końcu” i „bez zużycia czasu” to sformułowania agenta przyjęte w tej odpowiedzi |
| 10 | Recenzja skeptyka wskazała luki: (a) liczenie od nowa z planszy czy stałe przypisanie piątki do kamieni; (b) kiedy pada pierwszy ruch automatu i czy zegar przeciwnika stoi przez 2 s; (c) poddanie (Q-19); (d) wariant domyślny (Q-20) | „Zgoda na rekomendacje”: (a) liczenie od nowa z bieżącego układu, przy więcej niż 2 kierunkach przez kamień pierwszeństwo mają kierunki z wcześniejszą piątką; (b) pierwszy ruch automatu od razu po wyczerpaniu czasu prowadzącego w jego turze, zegar przeciwnika stoi przez 2 s; (c) poddanie = przegrana bez względu na punkty; (d) domyślny klasyk. | rekomendacje agenta przyjęte zbiorczo |

## Rozważone alternatywy

- **„Co najmniej 3 pola” dosłownie:** odrzucone — uniemożliwia piątki.
- **Wspólny czas partii (np. 3 minuty na całą partię):** odrzucone; zegar na gracza.
- **Dogrywka przy remisie:** odrzucone; remis.
- **Naprawdę nieograniczona plansza (dowolne współrzędne):** odrzucone; duża skończona.
- **Koniec od razu, gdy czyjkolwiek czas się skończy (wygrywa wyższy wynik):** odrzucone po wskazaniu furtki przeczekania przez prowadzącego.
- **Gracz bez czasu przestaje grać, drugi stawia kamienie sam:** odrzucone; zamiast tego automat stawia kamienie prowadzącego.
- **Faza automatu kończy się, gdy przegrywający dogoni prowadzącego:** odrzucone; trwa do końca czasu drugiego gracza.
- **Wybór czasu także w klasyku:** odrzucone; klasyk zostaje 10 minut.
- **Liczenie przez stałe „skreślenie” konkretnych pięciu kamieni:** odrzucone; przy rzędzie 6+ wybór kamieni mógłby sprawić, że 10 kamieni da 1 punkt.

Powody odrzuceń inne niż podane nie zostały zapisane; agent nie dopisuje uzasadnień, których właściciel nie podał.

## Przyjęte ryzyka i luki (do briefu)

- Popyt na wariant niesprawdzony (A-01, A-16); brak kryterium sukcesu (Q-21).
- Reguła automatu ma zniechęcać do przeczekiwania, ale automat blokuje przy ostatnim kamieniu przeciwnika — czy prowadzącemu nadal opłaca się przeczekać, nie sprawdzono (A-17, `[ASSUMPTION]` agenta).
- Plansza 101×101 nie jest praktycznie nieskończona: krawędź (50 pól od środka) da się osiągnąć celowo w kilkunastu ruchach przy odstępie 3 pól (A-18, `[ASSUMPTION]` agenta).
- Poddanie (Q-19) i domyślny wariant (Q-20) rozstrzygnięte w czwartej rundzie (rekomendacje agenta przyjęte).
