# Specyfikacja produktu: Gomoku 1:1 online

> Wersja po pogodzeniu dwóch sesji discovery (wcześniejsza sesja właściciela — dokładna data nie
> potwierdzona wprost, metadane pliku wskazują na 2026-10-13; ta rozmowa: 2026-10-13). Rozbieżności
> i ich rozstrzygnięcia udokumentowane w
> `research/decisions/2026-10-13-reconciliation.md`. Stare ID zachowane; zmienione decyzje mają
> wiersze nadpisujące (superseded by), zgodnie z zasadami odświeżania briefu.

## Decision summary

Aplikacja webowa, w której zalogowani użytkownicy grają ze sobą w swobodne gomoku (bez ograniczeń
renju) na planszy 15×15, w czasie rzeczywistym, z zegarem szachowym 10 minut na gracza. Projekt
powstał jako ćwiczenie do nauki tworzenia aplikacji, ale właściciel chce go zaprojektować i
zbudować z rygorem realnego, rozwijalnego produktu, nie jednorazowego prototypu. W v1 przeciwnika
można znaleźć na dwa równoległe sposoby: zaproszeniem konkretnej osoby (link/kod) albo przez
otwarte lobby graczy, którzy aktywnie oznaczyli się jako szukający gry. Partie i ich wynik trafiają
do historii konta.

## Problem i wartość

### Problem

Właściciel chce zbudować i nauczyć się budować pełny, działający produkt webowy — wieloosobową grę
czasu rzeczywistego z kontami, historią i dwoma ścieżkami dobierania przeciwnika. Nie zgłoszono
zewnętrznego bólu rynkowego ani konkretnej grupy graczy czekającej na to rozwiązanie; punktem
wyjścia jest decyzja właściciela produktu o zakresie ćwiczenia, nie zweryfikowany popyt.

To jest opis celu projektu pochodzący bezpośrednio od właściciela; nie mamy danych
potwierdzających, że istnieje popyt na tę konkretną kombinację funkcji poza samym właścicielem.

### Wartość dla użytkownika

Użytkownik może założyć konto, rozegrać partię gomoku ze znaną sobie osobą (zaproszenie) albo z
kimkolwiek aktualnie dostępnym (otwarte lobby), grać pod presją zegara i wracać do historii swoich
rozgrywek.

To jest hipoteza wartości do sprawdzenia po uruchomieniu pierwszego przepływu — nie testowana z
realnymi graczami.

## Użytkownicy i scenariusze

- Zalogowany użytkownik zaprasza konkretną, znaną sobie osobę linkiem lub kodem do partii.
- Zalogowany użytkownik oznacza się jako "szukający gry" i pojawia się w otwartym lobby.
- Zalogowany użytkownik przegląda otwarte lobby i wybiera przeciwnika spośród szukających.
- Status "szukającego" wygasa automatycznie, jeśli w zdefiniowanym czasie nikt go nie wybierze.
- Dwóch użytkowników wykonuje naprzemienne ruchy na wspólnej planszy, każdy pod własnym zegarem.
- Użytkownik widzi stan partii, własny zegar i zegar przeciwnika.
- Użytkownik wraca do historii zakończonych partii.

## Zakres MVP

### W zakresie

- rejestracja i logowanie użytkowników;
- tworzenie partii dla dwóch osób;
- zaproszenie konkretnego przeciwnika przez link lub kod (ad-hoc, nie trwała lista znajomych);
- otwarte lobby graczy aktualnie oznaczonych jako "szukający gry", z ręcznym wyborem przeciwnika;
- automatyczne wygaśnięcie statusu "szukającego" po zdefiniowanym czasie bezczynności;
- gra online w czasie rzeczywistym, zasady swobodnego gomoku (bez ograniczeń renju);
- walidacja ruchów i rozstrzygnięcie partii (wygrana/remis);
- zegar 10 minut dla każdego gracza, działający jak zegar szachowy;
- zapisywanie historii partii;
- obsługa ponownego połączenia bez zatrzymywania zegara;
- zakończenie partii po wygranej, remisie albo wyczerpaniu czasu.

### Poza zakresem MVP

- automatyczny/algorytmiczny matchmaking (dobór przez system, bez ręcznego wyboru) — możliwy
  przyszły etap, nie w v1;
- rankingi i system ratingowy (ELO lub podobny);
- trwała lista znajomych jako osobna funkcja (zaproszenie jest jednorazowe/ad-hoc);
- czat;
- obserwowanie partii przez osoby trzecie;
- przeciwnik AI;
- turnieje;
- warianty gry inne niż swobodne gomoku 15×15 (w tym Renju);
- natywne aplikacje mobilne.

## Reguły i zasady biznesowe

| ID | Zasada | Status i źródło |
| --- | --- | --- |
| BR-01 | W partii uczestniczy dokładnie dwóch graczy. | Potwierdzona decyzja właściciela, obie sesje discovery |
| BR-02 | ~~Do MVP użytkownik trafia do przeciwnika przez zaproszenie; matchmaking jest późniejszym etapem.~~ **Nadpisane przez BR-09.** | Superseded 2026-10-13 |
| BR-03 | ~~Gra korzysta z rulesetu Renju na planszy 15×15, w tym z ograniczeniami dotyczącymi ruchów czarnych.~~ **Nadpisane przez BR-10.** | Superseded 2026-10-13 |
| BR-04 | Każdy gracz rozpoczyna partię z limitem 10 minut. | Potwierdzona decyzja właściciela, potwierdzona ponownie przy pogodzeniu sesji |
| BR-05 | Zegar odlicza czas gracza podczas jego tury. | Potwierdzona decyzja właściciela (interpretacja "zegara szachowego" zaakceptowana wprost) |
| BR-06 | Rozłączenie nie zatrzymuje zegara; po ponownym połączeniu gracz może kontynuować, o ile partia się nie zakończyła. | Potwierdzona decyzja właściciela co do biegu czasu; możliwość wznowienia to założenie implementacyjne, nieprzetestowane |
| BR-07 | Wyczerpanie czasu kończy partię przegraną gracza, którego zegar się skończył. | Konsekwencja zaakceptowanej mechaniki zegara szachowego; wprost niewypowiedziana, wynika z BR-04/BR-05 |
| BR-08 | Partie są zapisywane w historii użytkowników. | Potwierdzona decyzja właściciela, obie sesje discovery |
| BR-09 | Dobór przeciwnika w v1 odbywa się dwiema równoległymi ścieżkami: zaproszeniem konkretnej osoby (link/kod) **oraz** otwartym lobby graczy oznaczonych jako "szukający gry", z ręcznym wyborem. Automatyczny/algorytmiczny matchmaking pozostaje poza v1. | Potwierdzona decyzja właściciela przy pogodzeniu sesji (nadpisuje BR-02) |
| BR-10 | Gra używa zasad swobodnego gomoku: wygrana przy 5 kamieniach w linii (poziomo/pionowo/po skosie), bez ograniczeń renju dla żadnego gracza. Plansza 15×15. | Wariant zasad (swobodne vs. renju) potwierdzony przy pogodzeniu sesji (nadpisuje BR-03). Rozmiar planszy 15×15 nie był sporny — to niezmieniony, wcześniej zaakceptowany parametr domyślny z obu wersji |
| BR-11 | Zaproszenie jest mechanizmem jednorazowym/ad-hoc do konkretnej partii; nie jest to trwała lista znajomych. | Potwierdzona decyzja właściciela, ta sesja |
| BR-12 | Gracz musi aktywnie oznaczyć się jako "szukający gry", aby pojawić się w lobby; status wygasa automatycznie po zdefiniowanym czasie jeśli nikt go nie wybierze. Domyślna wartość tego czasu: 5 minut. | Mechanizm (aktywne oznaczenie + wygasanie) potwierdzony wprost przez właściciela, ta sesja. Wartość 5 minut to propozycja domyślna zaakceptowana zbiorczo ("zgoda"), nie pogłębiona osobną rozmową — tej samej pewności co BR-13 |
| BR-13 | W v1 użytkownik ma co najwyżej jedną aktywną partię jednocześnie. | Propozycja domyślna zaakceptowana zbiorczo przez właściciela ("zgoda"), nie pogłębiona osobną rozmową — tej samej pewności co wartość czasu w BR-12 |

## Kluczowy przepływ

1. Użytkownik loguje się.
2. Wybiera ścieżkę: (a) tworzy partię i wysyła link/kod zaproszenia konkretnej osobie, albo
   (b) oznacza się jako "szukający gry" i pojawia się w otwartym lobby.
3. W ścieżce (a) zaproszony użytkownik otwiera link i dołącza. W ścieżce (b) inny zalogowany
   użytkownik przegląda lobby i wybiera gracza z listy szukających.
4. System inicjalizuje planszę, kolejność graczy i zegary (10 minut na gracza).
5. Gracze wykonują naprzemienne ruchy; system odrzuca ruchy niezgodne ze stanem partii lub
   zasadami swobodnego gomoku.
6. System wykrywa zwycięstwo (5 w linii), remis, wyczerpanie czasu albo niekorzystne zakończenie
   po wygaśnięciu zegara podczas rozłączenia.
7. Wynik i przebieg partii trafiają do historii obu użytkowników.

## Dane i stan produktu

Minimalny model domenowy: użytkownik, partia, uczestnik partii, zaproszenie, status "szukającego"
(z czasem wygaśnięcia), ruch, zegar, wynik. Model partii powinien odróżniać sposób powstania
(`invite` albo `lobby`), żeby zachować miejsce na przyszły automatyczny matchmaking jako kolejny,
osobny tryb — to decyzja architektoniczna do potwierdzenia podczas projektowania, zgodna z
podniesioną ambicją traktowania projektu jako realnego, rozwijalnego produktu.

Historia powinna przechowywać co najmniej przeciwnika, wynik, datę, status zakończenia i ruchy albo
dane pozwalające odtworzyć partię. Retencja danych, możliwość usunięcia historii i zasady
prywatności pozostają nierozstrzygnięte.

## Niefunkcjonalne ryzyka

- stan partii i zegar muszą być rozstrzygane po stronie zaufanej (serwer), aby klient nie mógł
  samodzielnie zmienić wyniku ani czasu;
- synchronizacja musi tolerować chwilową utratę połączenia bez psucia zegara ani stanu planszy;
- należy zdefiniować zachowanie przy jednoczesnych ruchach, odświeżeniu strony i ponownym wejściu
  do zakończonej partii;
- logowanie i historia wymagają ustalenia zakresu danych osobowych oraz polityki usuwania danych;
- lobby "szukających" wymaga mechanizmu czasu rzeczywistego (np. WebSocket) do aktualizacji listy
  i wygaszania statusu — nie zweryfikowano wybranej technologii;
- podniesiona ambicja ("realny produkt") nie jest poparta analizą konkurencji ani walidacją popytu
  — zakres może wymagać korekty, gdy takie dane się pojawią.

## Decyzje i ich właściciel

| ID | Decyzja | Właściciel | Status |
| --- | --- | --- | --- |
| D-01 | ~~MVP obejmuje zaproszenia, a nie matchmaking.~~ **Nadpisane przez D-07.** | Właściciel produktu | Superseded 2026-10-13 |
| D-02 | Użytkownicy muszą się logować. | Właściciel produktu | Potwierdzona |
| D-03 | Limit wynosi 10 minut na gracza. | Właściciel produktu | Potwierdzona (ponownie przy pogodzeniu sesji) |
| D-04 | Zapisujemy historię partii. | Właściciel produktu | Potwierdzona |
| D-05 | Zegar biegnie podczas rozłączenia. | Właściciel produktu | Potwierdzona |
| D-06 | ~~MVP używa rulesetu Renju na planszy 15×15.~~ **Nadpisane przez D-08.** | Właściciel produktu | Superseded 2026-10-13 |
| D-07 | MVP obsługuje zarówno zaproszenie bezpośrednie, jak i otwarte lobby graczy szukających gry (wybór ręczny, bez algorytmicznego matchmakingu). | Właściciel produktu | Potwierdzona (nadpisuje D-01) |
| D-08 | MVP używa swobodnych zasad gomoku (bez ograniczeń renju), plansza 15×15. | Właściciel produktu | Wariant zasad potwierdzony przy pogodzeniu sesji (nadpisuje D-06); rozmiar planszy był niesporny w obu wersjach |
| D-09 | Status "szukam gry" wygasa automatycznie po zdefiniowanym czasie jeśli gracz nie zostanie wybrany. | Właściciel produktu | Mechanizm potwierdzony wprost; wartość domyślna (5 minut) zaakceptowana zbiorczo ("zgoda"), tej samej pewności co D-10 |
| D-10 | W v1 użytkownik ma co najwyżej jedną aktywną partię jednocześnie. | Właściciel produktu | Propozycja zaakceptowana zbiorczo ("zgoda"), tej samej pewności co wartość czasu w D-09 |
| D-11 | Projekt ma genezę edukacyjną (nauka tworzenia aplikacji), ale ma być projektowany i budowany z rygorem realnego, rozwijalnego produktu. | Właściciel produktu | Potwierdzona |

## Evidence and unknowns

Źródłem wszystkich decyzji są dwie rozmowy discovery z właścicielem produktu (wcześniejsza sesja o
nieustalonej wprost dacie oraz ta rozmowa, 2026-10-13), udokumentowane i pogodzone w
`research/decisions/2026-10-13-reconciliation.md`. Nie przeprowadzono wywiadów z potencjalnymi
graczami, analizy danych użycia, analizy konkurencji ani testów prototypu. Dokładny czas wygaśnięcia
statusu "szukającego" (BR-12/D-09) oraz limit jednej aktywnej partii (BR-13/D-10) to propozycje
domyślne zaakceptowane zbiorczo ("zgoda"), nie wartości wprost wypowiedziane i pogłębione rozmową z
właścicielem. Wartość produktu i jej atrakcyjność względem istniejących serwisów do gomoku/renju są
niezweryfikowane — istotne, biorąc pod uwagę podniesioną ambicję traktowania projektu jako realnego
produktu (D-11).

## Collection plan

1. Właściciel produktu: potwierdzić lub skorygować domyślny czas wygaśnięcia statusu "szukam gry"
   (obecnie proponowane 5 minut, BR-12).
2. Właściciel produktu: ustalić retencję historii, usuwanie danych i minimalny zakres danych konta.
3. Zespół techniczny: sprawdzić w prototypie synchronizację zegara, lobby w czasie rzeczywistym,
   odświeżenie strony i ponowne połączenie.
4. Właściciel produktu: przegląd istniejących aplikacji do gomoku/renju i analiza różnicowania —
   konsekwentne dopiero teraz, gdy projekt ma być traktowany jak realny produkt (D-11), przed
   inwestycją w przyszły automatyczny matchmaking lub rankingi.

## Następna niepewność

Najbliższą decyzją blokującą implementację silnika gry jest doprecyzowanie techniczne zegara
szachowego i lobby w czasie rzeczywistym (WebSocket czy inny mechanizm) — zasady gry są już
jednoznaczne (swobodne gomoku). Drugą w kolejności jest potwierdzenie czasu wygaśnięcia statusu
"szukającego" oraz decyzja, czy przed dalszym rozwojem (D-11) warto zrobić krótki przegląd
konkurencji.
