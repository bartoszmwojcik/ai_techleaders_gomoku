# Specyfikacja produktu: Gomoku 1:1 online

- Data: 2026-10-24 (odświeżenie; poprzednia wersja 2026-10-13)
- Tryb: own; Właściciel: Bartosz Wójcik; Przebieg: pełny (`om-discover --refresh`, 3 rundy)
- Podstawa dowodowa: wyłącznie decyzje i przypuszczenia jednego właściciela produktu (sesje 2026-10-13, 2026-10-20, 2026-10-24) oraz benchmark trzech serwisów z 2026-10-20. Brak wywiadów z graczami, danych użycia i testów prototypu. Najbardziej konsekwentne nieprzetestowane przekonanie: że ktokolwiek poza właścicielem i jego znajomymi zechce grać i zostawić feedback (A-01).
- Coverage: 70 claims — 65 sourced (interview 0, data 0, document 61, product 1, benchmark 3), 0 synthetic, 5 assumed; 3 entries on the collection plan
- Hipotezy syntetyczne poza Coverage: 0
- Definition of Ready podpisane przez: nie dotyczy — `SDLC.md` nie ma Definition of Ready (`om-setup-discovery-pipeline`); gotowe do: planowania implementacji uzgodnionego zakresu jako projektu edukacyjnego (D-11), nie do wniosków o popycie
- Źródła: `research/decisions/2026-10-13-reconciliation.md`, `research/decisions/2026-10-24-accounts-and-data.md`, `research/2026-10-20-stakeholders.md`, `research/2026-10-20-journey-current-state.md`, `research/2026-10-20-benchmark-{playok,papergames,donkeycat-gomoku}.md`, `2026-10-24-account-registration.md`

> Wersja z 2026-10-13 powstała z pogodzenia dwóch sesji discovery (`research/decisions/2026-10-13-reconciliation.md`).
> Odświeżenie z 2026-10-24 dodaje decyzje o kontach i danych (D-12…D-23, BR-14…BR-24), interesariuszy,
> benchmark, mapę ścieżki i ryzykowne założenia. Stare ID zachowane; zmienione decyzje mają wiersze
> nadpisujące.

## Decision summary

Aplikacja webowa, w której zalogowani użytkownicy grają ze sobą w swobodne gomoku (bez ograniczeń
renju) na planszy 15×15, w czasie rzeczywistym, z zegarem szachowym 10 minut na gracza. Projekt
powstał jako ćwiczenie do nauki tworzenia aplikacji, ale właściciel chce go zaprojektować i
zbudować z rygorem realnego, rozwijalnego produktu, nie jednorazowego prototypu. W v1 przeciwnika
można znaleźć na dwa równoległe sposoby: zaproszeniem konkretnej osoby (link/kod) albo przez
otwarte lobby graczy, którzy aktywnie oznaczyli się jako szukający gry. Partie i ich wynik trafiają
do historii konta.

Od 2026-10-24 MVP obejmuje też pełne zarządzanie kontem: rejestrację e-mailem i publiczną nazwą
gracza, potwierdzenie e-maila przed pierwszą grą, reset i zmianę hasła oraz usunięcie konta z
anonimizacją partii (D-13…D-18). To podnosi zakres MVP o wysyłkę poczty — koszt ograniczony do darmowego
planu (D-20), dostawca do wyboru w #38 (Q-02). Bez poczty nowy gracz z kontem nie zagra (BR-23); zaproszony znajomy może jednak zagrać jako gość, bez konta (BR-22).
Wysyłka ma się zmieścić w darmowym planie dostawcy (D-20), a gra ma działać także w przeglądarce
telefonu (BR-20).

Wszystkie decyzje pochodzą od właściciela; popytu nikt nie sprawdził (A-01). Najbliższe blokery:
mechanizm czasu rzeczywistego dla partii i lobby (Q-01, spike #30) oraz wybór dostawcy poczty
przed implementacją weryfikacji i resetu (Q-02). Następny krok w implementacji: rejestracja i logowanie
(#19, #20), których nic nie blokuje. Następny krok wiedzy (właściciel): rozmowy z graczami według
7 pytań z mapy ścieżki (Collection plan 5) — sprawdzają A-01 i A-02; A-03 (bariera potwierdzenia
e-maila) da się sprawdzić dopiero pomiarem po udostępnieniu gry.

## Problem i wartość

### Problem

- Właściciel chce zbudować i nauczyć się budować pełny, działający produkt webowy — wieloosobową grę czasu rzeczywistego z kontami, historią i dwoma ścieżkami dobierania przeciwnika. `[DOCUMENT]` `research/decisions/2026-10-13-reconciliation.md`
- Nie zgłoszono zewnętrznego bólu rynkowego ani konkretnej grupy graczy czekającej na to rozwiązanie; punktem wyjścia jest decyzja właściciela o zakresie ćwiczenia, nie zweryfikowany popyt. `[DOCUMENT]` tamże
- Właściciel nie pamiętał konkretnej sytuacji szukania partnera do gry; częstotliwość i koszt problemu „szukam partnera” są nieznane. `[DOCUMENT]` `research/2026-10-20-journey-current-state.md`
- Właściciel chce wypromować grę w jakimś medium, żeby ludzie z zewnątrz zagrali i zostawili feedback; kanał jest nieznany. `[DOCUMENT]` `research/2026-10-20-stakeholders.md`

### Wartość dla użytkownika

- Użytkownik może założyć konto, rozegrać partię ze znaną sobie osobą (zaproszenie) albo z kimkolwiek dostępnym (lobby), grać pod presją zegara i wracać do historii. To hipoteza wartości, nietestowana z realnymi graczami. `[ASSUMPTION]` właściciel, brak materiału — A-01

## Użytkownicy i scenariusze

### Interesariusze

- S1 Bartosz Wójcik — właściciel, użytkownik, płaci za hosting; decyduje o zakresie, cenie i kanale; nikt nie może zablokować (deklaracja). `[DOCUMENT]` `research/2026-10-20-stakeholders.md`
- S2 znajomi właściciela — użytkownicy (grają). `[DOCUMENT]` tamże
- S3 gracze zewnętrzni — planowana grupa docelowa i źródło feedbacku; dziś ich nie ma, kanał pozyskania nieznany. `[DOCUMENT]` tamże
- Płacący: tylko S1, za hosting; gracze nie płacą (D-19). Wysyłka poczty tylko w darmowym planie dostawcy (D-20). `[DOCUMENT]` tamże
- Decydent dla zakresu, ceny i kanału: S1 (RACI w `research/2026-10-20-stakeholders.md`).

### Scenariusze

- Gość zakłada konto (e-mail, nazwa gracza, hasło) i jest od razu zalogowany; do gry potrzebuje potwierdzić e-mail (BR-23, D-17). `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md`
- Zalogowany użytkownik z potwierdzonym e-mailem zaprasza konkretną, znaną sobie osobę linkiem lub kodem do partii (BR-09, BR-11); zaproszony może dołączyć jako gość, bez konta (BR-22). `[DOCUMENT]` `research/decisions/2026-10-13-reconciliation.md`
- Zalogowany użytkownik oznacza się jako „szukający gry” i pojawia się w otwartym lobby; status wygasa po 5 minutach bez wyboru (BR-12). `[DOCUMENT]` tamże
- Zalogowany użytkownik przegląda lobby i wybiera przeciwnika spośród szukających (BR-09). `[DOCUMENT]` tamże
- Dwóch użytkowników wykonuje naprzemienne ruchy, każdy pod własnym zegarem, i widzi stan partii oraz oba zegary (BR-04, BR-05). `[DOCUMENT]` tamże
- Użytkownik wraca do historii zakończonych partii (BR-08). `[DOCUMENT]` tamże
- Użytkownik, który zapomniał hasła, ustawia nowe przez link wysłany na e-mail; zalogowany może zmienić hasło (D-15, D-18). `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md`
- Użytkownik usuwa konto; jego partie zostają w historii przeciwników jako „Usunięty gracz” (BR-17, D-16). `[DOCUMENT]` tamże

## Produkt i wyróżnik

- Czym jest: patrz Decision summary i Zakres MVP.
- Wyróżnik względem istniejących serwisów: nieustalony. Benchmark z 2026-10-20 opisuje trzy serwisy; nie wynika z niego, czym Gomoku 1:1 online miałoby się różnić ani czy ktoś tego potrzebuje (A-01, Collection plan 4).

| Rozwiązanie | Co robi dobrze (wg strony) | Gdzie zawodzi dla naszych użytkowników | Sprawdzone | Link |
|---|---|---|---|---|
| PlayOK | tylko gracze na żywo, rankingi, statystyki, tryb gościa `[BENCHMARK]` | zaproszenie linkiem, zegar, historia: brak danych | 2026-10-20 | `research/2026-10-20-benchmark-playok.md` |
| papergames.io | gra ze znajomym przez link, losowy przeciwnik, bot, gra jako gość `[BENCHMARK]` | zegar, historia: brak danych; recenzja o utracie czasu przy zerwaniu połączenia | 2026-10-20 | `research/2026-10-20-benchmark-papergames.md` |
| Gomoku – Online Boardgame (DonkeyCat) | gra online bez logowania, trzech przeciwników komputerowych `[BENCHMARK]` | zaproszenie, zegar, historia: brak danych | 2026-10-20 | `research/2026-10-20-benchmark-donkeycat-gomoku.md` |

Wpływ botów na odbiór gry: brak danych w żadnym z serwisów. „Przeciwnik AI” pozostaje non-goal (N-06).

## Zakres MVP

### W zakresie

- rejestracja (e-mail, nazwa gracza, hasło), logowanie i wylogowanie;
- potwierdzenie e-maila linkiem, wymagane przed pierwszą grą (D-17);
- reset hasła przez e-mail (D-15) i zmiana hasła po zalogowaniu (D-18);
- usunięcie konta z anonimizacją partii (D-16), niedostępne w trakcie aktywnej partii (BR-21);
- gra w przeglądarce na komputerze i na telefonie (BR-20);
- tworzenie partii dla dwóch osób;
- gra gościa (bez konta) wyłącznie z linku/kodu zaproszenia (BR-22);
- zaproszenie konkretnego przeciwnika przez link lub kod (ad-hoc, nie trwała lista znajomych);
- otwarte lobby graczy aktualnie oznaczonych jako „szukający gry”, z ręcznym wyborem przeciwnika;
- automatyczne wygaśnięcie statusu „szukającego” po 5 minutach (BR-12);
- gra online w czasie rzeczywistym, zasady swobodnego gomoku (bez ograniczeń renju);
- walidacja ruchów i rozstrzygnięcie partii (wygrana/remis);
- zegar 10 minut dla każdego gracza, działający jak zegar szachowy;
- zapisywanie historii partii;
- obsługa ponownego połączenia bez zatrzymywania zegara;
- zakończenie partii po wygranej, remisie albo wyczerpaniu czasu.

### Później

- zmiana adresu e-mail i nazwy gracza (D-18);
- strona z informacją o przetwarzaniu danych — przed udostępnieniem gry osobom z zewnątrz (S3), nie dla znajomych (D-22).

### Poza zakresem MVP

- N-01 automatyczny/algorytmiczny matchmaking (dobór przez system, bez ręcznego wyboru) — możliwy przyszły etap, nie w v1;
- N-02 rankingi i system ratingowy (ELO lub podobny);
- N-03 trwała lista znajomych jako osobna funkcja (zaproszenie jest jednorazowe/ad-hoc);
- N-04 czat;
- N-05 obserwowanie partii przez osoby trzecie;
- N-06 przeciwnik AI;
- N-07 turnieje;
- N-08 warianty gry inne niż swobodne gomoku 15×15 (w tym Renju);
- N-09 natywne aplikacje mobilne.

Właściciel wszystkich: Bartosz Wójcik; zmiana wymaga nowego wpisu zatwierdzonego przez właściciela. `[DOCUMENT]` `research/decisions/2026-10-13-reconciliation.md` (id N-xx nadane 2026-10-24 bez zmiany treści)

## Reguły i zasady biznesowe

| ID | Zasada | Status i źródło |
| --- | --- | --- |
| BR-01 | W partii uczestniczy dokładnie dwóch graczy. | Potwierdzona decyzja właściciela, obie sesje discovery `[DOCUMENT]` |
| BR-02 | ~~Do MVP użytkownik trafia do przeciwnika przez zaproszenie; matchmaking jest późniejszym etapem.~~ **Nadpisane przez BR-09.** | Superseded 2026-10-13 |
| BR-03 | ~~Gra korzysta z rulesetu Renju na planszy 15×15, w tym z ograniczeniami dotyczącymi ruchów czarnych.~~ **Nadpisane przez BR-10.** | Superseded 2026-10-13 |
| BR-04 | Każdy gracz rozpoczyna partię z limitem 10 minut. | Potwierdzona decyzja właściciela, potwierdzona ponownie przy pogodzeniu sesji `[DOCUMENT]` |
| BR-05 | Zegar odlicza czas gracza podczas jego tury. | Potwierdzona decyzja właściciela (interpretacja „zegara szachowego” zaakceptowana wprost) `[DOCUMENT]` |
| BR-06 | Rozłączenie nie zatrzymuje zegara; po ponownym połączeniu gracz może kontynuować, o ile partia się nie zakończyła. | Potwierdzona decyzja właściciela co do biegu czasu `[DOCUMENT]`; możliwość wznowienia to założenie implementacyjne, nieprzetestowane (Q-03). Jedyny głos z zewnątrz w materiale — jedna recenzja papergames.io — narzeka, że czas ucieka podczas ponownego łączenia; to pojedyncza opinia, nie częstotliwość `[BENCHMARK]` `research/2026-10-20-benchmark-papergames.md` |
| BR-07 | Wyczerpanie czasu kończy partię przegraną gracza, którego zegar się skończył. | Konsekwencja zaakceptowanej mechaniki zegara szachowego; wprost niewypowiedziana, wynika z BR-04/BR-05 `[DOCUMENT]` |
| BR-08 | ~~Partie są zapisywane w historii użytkowników.~~ **Nadpisane przez BR-24.** | Superseded 2026-10-24 |
| BR-09 | Dobór przeciwnika w v1 odbywa się dwiema równoległymi ścieżkami: zaproszeniem konkretnej osoby (link/kod) **oraz** otwartym lobby graczy oznaczonych jako „szukający gry”, z ręcznym wyborem. Automatyczny/algorytmiczny matchmaking pozostaje poza v1. | Potwierdzona decyzja właściciela przy pogodzeniu sesji (nadpisuje BR-02) `[DOCUMENT]` |
| BR-10 | Gra używa zasad swobodnego gomoku: wygrana przy 5 kamieniach w linii (poziomo/pionowo/po skosie), bez ograniczeń renju dla żadnego gracza. Plansza 15×15. | Wariant zasad potwierdzony przy pogodzeniu sesji (nadpisuje BR-03); rozmiar planszy niesporny `[DOCUMENT]` |
| BR-11 | Zaproszenie jest mechanizmem jednorazowym/ad-hoc do konkretnej partii; nie jest to trwała lista znajomych. | Potwierdzona decyzja właściciela `[DOCUMENT]` |
| BR-12 | Gracz musi aktywnie oznaczyć się jako „szukający gry”, aby pojawić się w lobby; status wygasa automatycznie po 5 minutach, jeśli nikt go nie wybierze. | Mechanizm potwierdzony 2026-10-13; wartość 5 minut potwierdzona wprost jako świadoma decyzja właściciela 2026-10-24 („1a”) `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md`. Czy 5 minut pasuje graczom — A-02 |
| BR-13 | W v1 użytkownik ma co najwyżej jedną aktywną partię jednocześnie. | Zgoda zbiorcza 2026-10-13; potwierdzona wprost jako świadoma decyzja właściciela 2026-10-24 („2a”) `[DOCUMENT]` tamże |
| BR-14 | Konto ma unikalny e-mail (login, niewidoczny dla innych graczy) i unikalną nazwę gracza (widoczną dla przeciwników). | Dane konta: decyzja właściciela 2026-10-24 (Q4 b) `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md`; unikalność bez rozróżniania wielkości liter i widoczność e-maila: specyfikacja `[PRODUCT]` `.ai/specs/2026-10-24-account-registration.md` |
| BR-15 | ~~Gracz bez potwierdzonego e-maila jest zalogowany, ale nie może tworzyć partii, przyjmować zaproszeń ani wchodzić do lobby; widzi komunikat „Potwierdź e-mail, aby grać”.~~ **Nadpisane przez BR-23.** | Superseded 2026-10-24 |
| BR-16 | Rejestracja nie ujawnia, że e-mail jest już zarejestrowany (jednolity komunikat); zajęta nazwa gracza jest wskazywana. | Decyzja właściciela 2026-10-24 (Q7 b) `[DOCUMENT]` tamże; reguła standardów §1 `[PRODUCT]` `.ai/docs/2026-09-01-engineering-standards.md` |
| BR-17 | Usunięcie konta kasuje e-mail, hash hasła i sesje; zakończone partie zostają w historii przeciwników z nazwą „Usunięty gracz”. | Decyzja właściciela 2026-10-24 („3a”, „4a”) `[DOCUMENT]` tamże |
| BR-18 | Historia partii jest przechowywana bez limitu czasu, dopóki konto istnieje; wygasłe sesje i liczniki limitu prób są usuwane bez udziału człowieka; nie wpływają na poprawność (filtrowane przy odczycie), a mechanizm sprzątania — zgodny ze standardami („no background worker” dla poprawności) — ustali specyfikacja. | Decyzja właściciela 2026-10-24 („6a”) `[DOCUMENT]` tamże |
| BR-20 | Gra (plansza, zegary, lobby, formularze kont) działa w przeglądarce na komputerze i na ekranie telefonu; natywne aplikacje pozostają poza zakresem (N-09). | Decyzja właściciela 2026-10-24 („C a”) `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md` |
| BR-22 | Gość (bez konta) może wyłącznie dołączyć do partii z linku/kodu zaproszenia (jeden link = jedna partia, BR-11). Nie tworzy zaproszeń, nie wchodzi do lobby, nie ma nazwy ani historii. Rozpoznaje go token jednej partii w ciasteczku tej przeglądarki, ważny do końca partii + 1 h; zmiana przeglądarki w trakcie partii oznacza utratę dostępu (zegar biegnie, BR-06/BR-07) — gość widzi to ostrzeżenie przed dołączeniem. Założenie konta po partii nie przejmuje tej partii. | Decyzja właściciela 2026-10-24 (przesłuchanie specyfikacji #19) `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md` |
| BR-23 | Zalogowany użytkownik bez potwierdzonego e-maila nie może tworzyć partii, wchodzić do lobby ani dołączać do zaproszenia jako on sam; widzi „Potwierdź e-mail, aby grać”, a przy linku zaproszenia może zagrać jako gość (BR-22). Nadpisuje BR-15. | Decyzja właściciela 2026-10-24 („5b”, „7a”, gra gościa) `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md` |
| BR-24 | Partie są zapisywane w historii kont uczestników. Gość nie ma historii; u zapraszającego przeciwnikiem jest „Zaproszony przez link”. Nadpisuje BR-08. | Decyzja właściciela 2026-10-24 `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md` |
| BR-21 | Usunięcie konta jest odrzucane, dopóki użytkownik ma aktywną partię; komunikat: „Najpierw dokończ albo poddaj partię”. | Decyzja właściciela 2026-10-24 („B a”) `[DOCUMENT]` tamże |
| BR-19 | Reset hasła odbywa się przez jednorazowy link wysłany na potwierdzony e-mail konta. | Decyzja właściciela 2026-10-24 („3a”); jednorazowość linku i wymóg potwierdzonego adresu to propozycja agenta wynikająca z D-17 — `proposal` do potwierdzenia w specyfikacji resetu |

Właściciel wszystkich reguł: Bartosz Wójcik. Zmiana reguły: nowy wiersz nadpisujący, zatwierdzony przez właściciela. Termin przeglądu: nieustalony (unknown).

## Kluczowy przepływ

**Stan obecny (bez aplikacji):** mapa założeń z 2026-10-20 — gracz bierze telefon albo wchodzi na stronę, szuka partnera w serwisie z grami, gra albo szuka dalej; oczekuje płynności i szybkości. Wszystkie wpisy to przypuszczenia właściciela, żaden nie pochodzi z rozmowy z graczem; fazy zaproponował agent, a odpowiedź „serwis z grami” mogła zostać przez niego podsunięta. `[ASSUMPTION]` `research/2026-10-20-journey-current-state.md` — A-02

**Stan docelowy:**

1. Zapraszający lub gracz lobby rejestruje się (jest zalogowany) i potwierdza e-mail linkiem (BR-14, BR-23).
2. Wybiera ścieżkę: (a) tworzy partię i wysyła link/kod zaproszenia konkretnej osobie, albo
   (b) oznacza się jako „szukający gry” i pojawia się w otwartym lobby.
3. W ścieżce (a) zaproszony otwiera link i dołącza: jako gość bez konta (BR-22) albo — zalogowany
   z potwierdzonym e-mailem — jako on sam. W ścieżce (b) inny zalogowany użytkownik z potwierdzonym e-mailem
   przegląda lobby i wybiera gracza z listy szukających.
4. System inicjalizuje planszę, kolejność graczy i zegary (10 minut na gracza).
5. Gracze wykonują naprzemienne ruchy; system odrzuca ruchy niezgodne ze stanem partii lub
   zasadami swobodnego gomoku.
6. System wykrywa zwycięstwo (5 w linii), remis, wyczerpanie czasu albo niekorzystne zakończenie
   po wygaśnięciu zegara podczas rozłączenia.
7. Wynik i przebieg partii trafiają do historii obu użytkowników.

`[DOCUMENT]` `research/decisions/2026-10-13-reconciliation.md`, krok 1 — `research/decisions/2026-10-24-accounts-and-data.md`

## Dane i stan produktu

- Model domenowy: użytkownik, sesja, partia, uczestnik partii, zaproszenie, status „szukającego” (z czasem wygaśnięcia), ruch, zegar, wynik; dochodzą tokeny potwierdzenia e-maila i resetu hasła. `[PRODUCT]` `.ai/specs/2026-10-24-account-registration.md`, `.ai/docs/2026-09-01-engineering-standards.md`
- Partia rozróżnia sposób powstania (`invite` albo `lobby`), żeby zachować miejsce na przyszły matchmaking (D-21). `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md`
- Historia przechowuje co najmniej przeciwnika, wynik, datę, status zakończenia i ruchy albo dane pozwalające odtworzyć partię. `[DOCUMENT]` `research/decisions/2026-10-13-reconciliation.md`
- Dane osobowe konta: e-mail (niewidoczny dla innych), nazwa gracza (publiczna), hash hasła; retencja i usuwanie — BR-17, BR-18. `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md`
- Informacja dla użytkowników o przetwarzaniu danych powstaje przed udostępnieniem gry osobom z zewnątrz (D-22); jej treść nie jest ustalona.

## Niefunkcjonalne ryzyka

- stan partii i zegar muszą być rozstrzygane po stronie zaufanej (serwer), aby klient nie mógł samodzielnie zmienić wyniku ani czasu;
- synchronizacja musi tolerować chwilową utratę połączenia bez psucia zegara ani stanu planszy;
- należy zdefiniować zachowanie przy jednoczesnych ruchach, odświeżeniu strony i ponownym wejściu do zakończonej partii;
- lobby „szukających” wymaga mechanizmu czasu rzeczywistego do aktualizacji listy i wygaszania statusu — nie zweryfikowano wybranej technologii (Q-01);
- weryfikacja e-maila i reset hasła wymagają niezawodnej wysyłki poczty; jej awaria blokuje nowym graczom grę (BR-23); darmowy plan (D-20) ma limit wiadomości, którego przekroczenie zatrzyma rejestracje — dostawca nieustalony (Q-02);
- podniesiona ambicja („realny produkt”) nie jest poparta walidacją popytu — zakres może wymagać korekty, gdy pojawią się dane (A-01).

## Decyzje i ich właściciel

| ID | Decyzja | Właściciel | Status |
| --- | --- | --- | --- |
| D-01 | ~~MVP obejmuje zaproszenia, a nie matchmaking.~~ **Nadpisane przez D-07.** | Właściciel produktu | Superseded 2026-10-13 |
| D-02 | ~~Użytkownicy muszą się logować.~~ **Nadpisane przez D-23.** | Właściciel produktu | Superseded 2026-10-24 |
| D-03 | Limit wynosi 10 minut na gracza. | Właściciel produktu | Potwierdzona (ponownie przy pogodzeniu sesji) `[DOCUMENT]` |
| D-04 | Zapisujemy historię partii. | Właściciel produktu | Potwierdzona `[DOCUMENT]` |
| D-05 | Zegar biegnie podczas rozłączenia. | Właściciel produktu | Potwierdzona `[DOCUMENT]` |
| D-06 | ~~MVP używa rulesetu Renju na planszy 15×15.~~ **Nadpisane przez D-08.** | Właściciel produktu | Superseded 2026-10-13 |
| D-07 | MVP obsługuje zarówno zaproszenie bezpośrednie, jak i otwarte lobby graczy szukających gry (wybór ręczny, bez algorytmicznego matchmakingu). | Właściciel produktu | Potwierdzona (nadpisuje D-01) `[DOCUMENT]` |
| D-08 | MVP używa swobodnych zasad gomoku (bez ograniczeń renju), plansza 15×15. | Właściciel produktu | Potwierdzona (nadpisuje D-06) `[DOCUMENT]` |
| D-09 | Status „szukam gry” wygasa automatycznie po 5 minutach, jeśli gracz nie zostanie wybrany. | Właściciel produktu | Potwierdzona; wartość 5 minut potwierdzona wprost 2026-10-24 `[DOCUMENT]` |
| D-10 | W v1 użytkownik ma co najwyżej jedną aktywną partię jednocześnie. | Właściciel produktu | Potwierdzona wprost 2026-10-24 (wcześniej zgoda zbiorcza) `[DOCUMENT]` |
| D-11 | Projekt ma genezę edukacyjną (nauka tworzenia aplikacji), ale ma być projektowany i budowany z rygorem realnego, rozwijalnego produktu. | Właściciel produktu | Potwierdzona `[DOCUMENT]` |
| D-12 | Uwierzytelnianie własne: e-mail + hasło (bcrypt, koszt 12), sesja w PostgreSQL z losowym tokenem w ciasteczku `httpOnly`; bez bibliotek auth i logowania zewnętrznego. Alternatywa rozważona: biblioteka auth (odrzucona w Q1). Rekomendacja agenta przyjęta. | Bartosz Wójcik | Potwierdzona 2026-10-24 `[DOCUMENT]` `.ai/specs/2026-10-24-account-registration.md` |
| D-13 | Dane konta: e-mail (login) + nazwa gracza (publiczna) + hasło (BR-14). Alternatywa rozważona: sama nazwa gracza bez e-maila (rekomendacja agenta, odrzucona przez właściciela). | Bartosz Wójcik | Potwierdzona 2026-10-24 `[DOCUMENT]` |
| D-14 | Rejestracja nie ujawnia zajętego e-maila (BR-16). Rekomendacja agenta przyjęta. | Bartosz Wójcik | Potwierdzona 2026-10-24 `[DOCUMENT]` |
| D-15 | Reset hasła przez e-mail jest w MVP (BR-19). Agent rekomendował odłożenie resetu; właściciel wybrał MVP. Wymaga dostawcy poczty (Q-02). | Bartosz Wójcik | Potwierdzona 2026-10-24 `[DOCUMENT]` |
| D-16 | Usunięcie konta jest w MVP, z anonimizacją partii u przeciwników (BR-17). | Bartosz Wójcik | Potwierdzona 2026-10-24 `[DOCUMENT]` |
| D-17 | Potwierdzenie e-maila jest wymagane przed pierwszą grą; rejestracja od razu loguje (BR-23). Agent rekomendował weryfikację dopiero przed resetem; właściciel wybrał przed grą. | Bartosz Wójcik | Potwierdzona 2026-10-24 `[DOCUMENT]` |
| D-18 | Zmiana hasła po zalogowaniu jest w MVP; zmiana e-maila i nazwy gracza — później. | Bartosz Wójcik | Potwierdzona 2026-10-24 `[DOCUMENT]` |
| D-19 | Gra jest „na razie” darmowa dla graczy; właściciel płaci za hosting. | Bartosz Wójcik | Potwierdzona 2026-10-20 `[DOCUMENT]` `research/2026-10-20-stakeholders.md` |
| D-20 | Wysyłka poczty (potwierdzenie e-maila, reset) korzysta wyłącznie z darmowego planu dostawcy, z jego limitem wiadomości; wybór dostawcy w #38. | Bartosz Wójcik | Potwierdzona 2026-10-24 („A a”) `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md` |
| D-21 | Partia zapisuje sposób powstania (`invite` / `lobby`), żeby przyszły matchmaking był nową wartością, nie przebudową. | Bartosz Wójcik | Potwierdzona 2026-10-24 („D a”) `[DOCUMENT]` tamże |
| D-23 | Użytkownicy muszą się logować — z wyjątkiem gościa dołączającego do partii z zaproszenia (BR-22). Zaproszenia i lobby wymagają konta z potwierdzonym e-mailem (BR-23). Nadpisuje D-02. Inicjatywa właściciela; granice zaproponował agent. | Bartosz Wójcik | Potwierdzona 2026-10-24 `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md` |
| D-22 | Strona z informacją o przetwarzaniu danych powstaje przed udostępnieniem gry osobom z zewnątrz (S3); dla grona znajomych nie jest wymagana. | Bartosz Wójcik | Potwierdzona 2026-10-24 („E b”) `[DOCUMENT]` tamże |

Termin przeglądu decyzji: nieustalony (unknown). Zmiana decyzji: nowy wiersz nadpisujący, zatwierdzony przez właściciela.

## Ryzykowne założenia

| ID | Założenie | Ważność | Dowody dziś | Jeśli fałszywe | Najmniejszy test | Właściciel | Do kiedy | Wynik |
|---|---|---|---|---|---|---|---|---|
| A-01 | Gracze spoza grona właściciela zechcą grać w Gomoku 1:1 online i zostawić feedback. `[ASSUMPTION]` właściciel, brak materiału | wysoka | brak; benchmark pokazuje istniejące serwisy, nie popyt na nasz | zakres „realnego produktu” (D-11) i koszty poczty (D-15, D-19) nie mają uzasadnienia poza nauką | rozmowy z graczami (pytania 1–7 z mapy ścieżki); po udostępnieniu (wymaga Q-05, Q-07) obserwacja, czy gracz spoza grona właściciela, niezaproszony przez niego, rozgrywa partię — propozycja agenta, bez progu liczbowego | Bartosz Wójcik | unknown | untested |
| A-02 | Gracz rezygnuje, jeśli szukanie partnera nie jest szybkie; 5 minut w lobby mu odpowiada. `[ASSUMPTION]` właściciel, `research/2026-10-20-journey-current-state.md` | średnia | brak; przypuszczenie właściciela | inny czas wygaśnięcia BR-12 lub inny sposób informowania o oczekiwaniu | pytanie 5 z mapy ścieżki w rozmowach z graczami | Bartosz Wójcik | unknown | accepted untested (D-09) |
| A-03 | Wymóg potwierdzenia e-maila przed pierwszą grą (dla kont; zaproszeni mogą grać jako goście, BR-22) nie zniechęci nowych graczy. `[ASSUMPTION]` agent, wynika z D-17 | średnia | brak danych o naszych graczach; wszystkie trzy sprawdzone serwisy pozwalają grać bez logowania lub jako gość (wiersze benchmarku w „Produkt i wyróżnik”) — to zachowanie konkurencji, nie dowód preferencji graczy | odejście nowych graczy z kontem przed pierwszą partią w lobby lub przed pierwszym zaproszeniem; rozważyć weryfikację dopiero przed resetem | po udostępnieniu: ile kont potwierdza e-mail i rozgrywa pierwszą partię (wymaga pomiaru) | Bartosz Wójcik | unknown | accepted untested (D-17) |

## Kill criteria

Właściciel 2026-10-24: „przed realnym produktem będę próbował innych gier i technologii”. `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md`
To zapowiedź kolejności nauki, a nie próg wyniku: nie ustalono, jaki wynik po udostępnieniu gry osobom z zewnątrz skłoni do zmiany ambicji. Zapowiedź może stać w napięciu z D-11 („rygor realnego produktu”); D-11 pozostaje aktywne, dopóki właściciel go nie nadpisze.

## Hipotezy do sprawdzenia

Brak hipotez syntetycznych (nie było paneli `om-synthetic-users`).

## Pytania otwarte

| ID | Pytanie | Blokuje | Kto odpowie | Status |
|---|---|---|---|---|
| Q-01 | Mechanizm czasu rzeczywistego (WebSocket lub inny) dla partii i lobby; synchronizacja zegara, odświeżenie, ponowne połączenie. | tak — rozgrywka i lobby (#22–#26) | zespół techniczny, spike #30 | open |
| Q-02 | Dostawca wysyłki poczty w darmowym planie (D-20) i czy jego limit wystarczy. | tak — potwierdzenie e-maila i reset hasła (D-15, D-17); nie blokuje samej rejestracji (#19) | zespół techniczny (#38) | open — koszt rozstrzygnięty 2026-10-24 (D-20) |
| Q-03 | Czy wznowienie partii po rozłączeniu działa w wybranym mechanizmie. | nie — wynika z Q-01 | zespół techniczny | open |
| Q-04 | Potwierdzenie, że partia zapisuje sposób powstania (`invite`/`lobby`). | — | właściciel | closed 2026-10-24 → D-21 |
| Q-05 | Kiedy i w jakiej formie informacja o przetwarzaniu danych. | — | właściciel | closed 2026-10-24 → D-22 (treść do przygotowania przed udostępnieniem S3) |
| Q-06 | Jaki wynik po udostępnieniu grze skłoni do zmiany ambicji (kill criteria). | nie | właściciel | odpowiedź częściowa 2026-10-24 (patrz Kill criteria); próg wyniku nieustalony |
| Q-07 | Kanał promocji i jego regulamin. | nie — dopiero przy udostępnieniu S3 | właściciel | open („nie wiem”, 2026-10-24) |
| Q-08 | Czy gra w przeglądarce telefonu jest w MVP. | — | właściciel | closed 2026-10-24 → BR-20 |

Zamknięte w tym odświeżeniu: czas wygaśnięcia lobby (CP-1 → D-09), minimalne dane konta i retencja (CP-2 → D-13, BR-17, BR-18).

## Evidence and unknowns

Źródłem wszystkich decyzji są rozmowy discovery z właścicielem produktu (2026-10-13, 2026-10-20,
2026-10-24) i bramka pytań specyfikacji rejestracji (2026-10-24). Benchmark (2026-10-20) opisuje trzy
serwisy na podstawie ich stron, bez testu w przeglądarce. Nie przeprowadzono wywiadów z graczami,
analizy danych użycia ani testów prototypu. Mapa ścieżki zawiera wyłącznie przypuszczenia właściciela.
Wartość produktu i jej atrakcyjność względem istniejących serwisów są niezweryfikowane (A-01).

## Collection plan

1. ~~Właściciel produktu: potwierdzić lub skorygować domyślny czas wygaśnięcia statusu „szukam gry”.~~ Zamknięte 2026-10-24 (D-09).
2. ~~Właściciel produktu: ustalić retencję historii, usuwanie danych i minimalny zakres danych konta.~~ Zamknięte 2026-10-24 (D-13, BR-17, BR-18).
3. Zespół techniczny: sprawdzić w prototypie synchronizację zegara, lobby w czasie rzeczywistym, odświeżenie strony i ponowne połączenie (Q-01, spike #30).
4. Właściciel produktu: analiza różnicowania względem istniejących serwisów — benchmark z 2026-10-20 opisuje trzy serwisy, różnicowanie nieustalone.
5. Właściciel produktu: rozmowy z graczami (znajomi S2 i, gdy będą, gracze zewnętrzni S3) według 7 pytań z `research/2026-10-20-journey-current-state.md` — sprawdza A-01 i A-02.

## Następna niepewność

Najbliższą decyzją blokującą implementację silnika gry jest mechanizm czasu rzeczywistego (Q-01,
spike #30). Przed implementacją potwierdzenia e-maila i resetu hasła trzeba wybrać dostawcę poczty
(Q-02). Rejestracji (#19) i logowania (#20) nic nie blokuje; zakres #19 wymaga aktualizacji o
stan „niepotwierdzony e-mail” (BR-23), a backlog — nowych historyjek dla potwierdzenia e-maila,
resetu i zmiany hasła oraz usunięcia konta.
