# Specyfikacja produktu: Gomoku 1:1 online

- Data: 2026-10-31 (odświeżenie; poprzednie wersje 2026-10-24 i 2026-10-13)
- Tryb: own; Właściciel: Bartosz Wójcik; Przebieg: pełny (`om-discover --refresh`, 3 rundy; 2026-10-31: 3 rundy z recenzją skeptyka)
- Podstawa dowodowa: wyłącznie decyzje i przypuszczenia jednego właściciela produktu (sesje 2026-10-13, 2026-10-20, 2026-10-24, 2026-10-31) oraz benchmark trzech serwisów z 2026-10-20. Brak wywiadów z graczami, danych użycia i testów prototypu. Funkcje „gra z własnym agentem” i „czat w partii” (2026-10-31) opierają się wyłącznie na wypowiedziach właściciela; nie opisał on własnego doświadczenia z agentem w grze ani żadnego zdarzenia, w którym brakowało czatu (jego przesłanka to osąd, nie obserwacja graczy). Benchmark czatu (`research/2026-10-31-benchmark-chat.md`) pokazuje cudze rozwiązania, nie popyt. Rola administratora (2026-10-31) opiera się wyłącznie na osądzie i potrzebie właściciela instancji (A-10); nie ma danych o potrzebie poza jego wypowiedzią, a zakres panelu zaproponował w części agent i zatwierdził właściciel ogólnym „ok” oraz po recenzji skeptyka zawęził do najmniejszego v1. Najbardziej konsekwentne nieprzetestowane przekonanie: że ktokolwiek poza właścicielem i jego znajomymi zechce grać i zostawić feedback (A-01).
- Coverage: 97 claims — 83 sourced (interview 0, data 0, document 78, product 1, benchmark 4), 0 synthetic, 14 assumed; 5 entries on the collection plan
- Hipotezy syntetyczne poza Coverage: 0
- Definition of Ready podpisane przez: nie dotyczy — `SDLC.md` nie ma Definition of Ready (`om-setup-discovery-pipeline`); gotowe do: planowania implementacji uzgodnionego zakresu jako projektu edukacyjnego (D-11), nie do wniosków o popycie
- Źródła: `research/decisions/2026-10-13-reconciliation.md`, `research/decisions/2026-10-24-accounts-and-data.md`, `research/2026-10-20-stakeholders.md`, `research/2026-10-20-journey-current-state.md`, `research/2026-10-20-benchmark-{playok,papergames,donkeycat-gomoku}.md`, `2026-10-24-account-registration.md`, `research/decisions/2026-10-31-agent-opponent.md`, `research/decisions/2026-10-31-mcp-agent-identity.md`, `research/decisions/2026-10-31-chat.md`, `research/2026-10-31-benchmark-chat.md`, `research/decisions/2026-10-31-admin.md`

> Wersja z 2026-10-13 powstała z pogodzenia dwóch sesji discovery (`research/decisions/2026-10-13-reconciliation.md`).
> Odświeżenie z 2026-10-24 dodaje decyzje o kontach i danych (D-12…D-23, BR-14…BR-25), interesariuszy,
> benchmark, mapę ścieżki i ryzykowne założenia. Stare ID zachowane; zmienione decyzje mają wiersze
> nadpisujące.
> Zmiana 2026-10-26 (osąd właściciela, nie wynik badania): D-24…D-26 i BR-26…BR-28 nadpisują D-17, BR-23, BR-25 i G3 (konto aktywne od razu, potwierdzenie e-maila asynchroniczne i nieblokujące, hasło ≥ 8 znaków, reset tylko po potwierdzeniu, sprzątanie niepotwierdzonych kont bez partii po 14 dniach). Źródło: `research/decisions/2026-10-26-onboarding-simplification.md`, specyfikacja `2026-10-26-account-onboarding-simplification.md`.
> Zmiana 2026-10-30 (osąd właściciela, nie wynik badania): D-27 i BR-29 nadpisują BR-22, część BR-24 i wyjątek w D-23: gość (bez konta) może także **tworzyć** zaproszenie i podaje nick; nadal wyłącznie przez kod/link, bez lobby i historii. Specyfikacje: `2026-10-30-participant-nickname.md` (E02-S07) i `2026-10-30-guest-creates-game.md` (E02-S08).
> Zmiana 2026-10-31 (osąd właściciela, nie wynik badania): N-10 nadpisuje N-06 (poza zakresem zostaje przeciwnik AI hostowany przez nas), D-28 i BR-30 wprowadzają grę człowieka z własnym agentem przez MCP (agent jako osobny typ uczestnika, partie prywatne, ten sam zegar), A-04…A-06 i Q-09 opisują ryzyka i bloker. Źródło: `research/decisions/2026-10-31-agent-opponent.md`.
> Zmiana 2026-10-31 (później tego dnia; osąd właściciela, nie wynik badania): D-29 zamyka Q-09 (tożsamość klienta MCP, token, transport, limity początkowe, deklarowana nazwa modelu agenta), BR-31 nadpisuje BR-30 (opcjonalna deklarowana nazwa modelu; rezerwacja nazwy konta „Agent”). Źródło: `research/decisions/2026-10-31-mcp-agent-identity.md`, specyfikacje `implemented/2026-10-31-mcp-agent-identity.md` i `implemented/2026-10-31-agent-joins-private-game.md`.
> Zmiana 2026-10-31 (jeszcze później tego dnia; osąd właściciela, nie wynik badania): D-30 i BR-32…BR-34 wprowadzają czat tekstowy w partii (konto, gość, agent; wyłączenie per partia; limity jako wartości początkowe; kasowanie po zakończeniu partii), N-11 nadpisuje N-04, D-31 nadpisuje w części D-29/BR-31 (uprawnienia agenta: dochodzi `send_message`, czat w `get_state`), A-07…A-09 i Q-10…Q-12 opisują ryzyka i pytania. Źródło: `research/decisions/2026-10-31-chat.md`.
> Zmiana 2026-10-31 (na końcu dnia; osąd i potrzeba właściciela, nie wynik badania): D-32 i BR-35…BR-38 wprowadzają rolę administratora (v1: administrator instalacyjny z `ADMIN_EMAIL` i panel `/backend` tylko do odczytu; nadawanie roli, dziennik audytowy, edycja nazwy i usuwanie cudzych kont jako kolejne historyjki E08), N-12 wyklucza resztę, BR-14 dostaje wyjątek (e-mail widoczny administratorowi), D-22 obejmuje dostęp administratora do danych, A-10…A-12 i Q-13…Q-15 opisują ryzyka i pytania. Źródło: `research/decisions/2026-10-31-admin.md`.

## Decision summary

Aplikacja webowa, w której zalogowani użytkownicy grają ze sobą w swobodne gomoku (bez ograniczeń
renju) na planszy 15×15, w czasie rzeczywistym, z zegarem szachowym 10 minut na gracza. Projekt
powstał jako ćwiczenie do nauki tworzenia aplikacji, ale właściciel chce go zaprojektować i
zbudować z rygorem realnego, rozwijalnego produktu, nie jednorazowego prototypu. W v1 przeciwnika
można znaleźć na dwa równoległe sposoby: zaproszeniem konkretnej osoby (link/kod) albo przez
otwarte lobby graczy, którzy aktywnie oznaczyli się jako szukający gry. Partie i ich wynik trafiają
do historii konta.

Od 2026-10-24 MVP obejmuje też pełne zarządzanie kontem: rejestrację e-mailem i publiczną nazwą
gracza, potwierdzenie e-maila jako osobną czynność asynchroniczną (D-24), reset i zmianę hasła oraz usunięcie konta z
anonimizacją partii (D-13…D-18). To podnosi zakres MVP o wysyłkę poczty — koszt ograniczony do darmowego
planu (D-20), dostawca do wyboru w #38 (Q-02). Od 2026-10-26 konto jest aktywne bez potwierdzenia e-maila (D-24, BR-26), więc poczta nie blokuje gry; zaproszony znajomy może zagrać jako gość, bez konta (BR-22).
Wysyłka ma się zmieścić w darmowym planie dostawcy (D-20), a gra ma działać także w przeglądarce
telefonu (BR-20).

Od 2026-10-31 w zakresie jest też gra człowieka (konto albo gość) z agentem LLM, którego człowiek sam
uruchamia i który łączy się przez serwer MCP (D-28, BR-30): partia prywatna, agent dołącza kodem lub linkiem
jako osobny typ uczestnika z etykietą „Agent”, pod tym samym zegarem 10 minut. Powód właściciela: „chcę
zobaczyć, jak agent gra”. Wariant nie adresuje nauki gry przez początkujących ani zwiększenia puli partii
(napięcie, A-05); właściciel wybrał go mimo to. Przeciwnik hostowany przez nas pozostaje poza zakresem
(N-10). Tożsamość klienta, token, transport i limity nadużyć rozstrzyga D-29 (Q-09 zamknięte); agent może się przedstawić deklarowaną, niezweryfikowaną nazwą swojego modelu (BR-31). Pomiar: licznik
zakończonych partii wg pary typów uczestników (konto, gość, agent), odczytywany w panelu administratora (D-32); próg „ma sens” nieustalony (Q-06).

Od 2026-10-31 (później) w zakresie jest też czat tekstowy między uczestnikami partii (D-30, BR-32…BR-34): wolny tekst z każdym przeciwnikiem (konto, gość, agent; także z lobby), wyłączenie czatu per partia tylko dla wyłączającego, limity (wartości początkowe), brak zgłaszania nadużyć w v1, kasowanie wiadomości po zakończeniu partii. Powód właściciela: „gdy gra się ze znajomym i chce się pogadać, to żeby nie zmieniać aplikacji; inne aplikacje tego typu to mają” — to osąd, nie obserwacja (A-07). Właściciel przyjął ryzyko nękania przez obcych z lobby wbrew rekomendacji rozeznania (A-08). Obietnica „czat znika” jest warunkowa: `db:cleanup` nie jest dziś zaplanowany na Mikrusie (Q-12).

Od 2026-10-31 (na końcu dnia) w zakresie jest też rola administratora instancji (D-32, BR-35…BR-38). Powód właściciela: „dodałem liczniki, ale z poziomu aplikacji ich nie widać; dodatkowo jako właściciel instancji aplikacji muszę mieć kontrolę” — osąd i potrzeba właściciela, nie obserwacja graczy (A-10). v1 (Now) jest najmniejszy: administrator instalacyjny, wskazany zmienną `ADMIN_EMAIL`, tworzony wyłącznie poleceniem `npm run admin:create`, oraz panel `/backend` tylko do odczytu (liczniki partii i lista kont ze stanami, e-mail widoczny tylko administratorowi). Nadawanie roli, dziennik audytowy, edycja nazwy i usuwanie cudzych kont to kolejne historyjki (Later), każda za osobną decyzją. Dziś panel `/backend` jest osiągalny bez logowania (#152, `priority-high`) — to ryzyko istniejące, które ta decyzja ma zamknąć bramką sesji i roli.

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

- S1 Bartosz Wójcik — właściciel, użytkownik, płaci za hosting; od 2026-10-31 także administrator instalacyjny instancji (D-32); decyduje o zakresie, cenie i kanale; nikt nie może zablokować (deklaracja). `[DOCUMENT]` `research/2026-10-20-stakeholders.md`
- S2 znajomi właściciela — użytkownicy (grają). `[DOCUMENT]` tamże
- S3 gracze zewnętrzni — planowana grupa docelowa i źródło feedbacku; dziś ich nie ma, kanał pozyskania nieznany. `[DOCUMENT]` tamże
- Płacący: tylko S1, za hosting; gracze nie płacą (D-19). Wysyłka poczty tylko w darmowym planie dostawcy (D-20). `[DOCUMENT]` tamże
- Decydent dla zakresu, ceny i kanału: S1 (RACI w `research/2026-10-20-stakeholders.md`).

### Scenariusze

- Gość zakłada konto (e-mail, nazwa gracza, hasło) i jest od razu zalogowany; do gry nie musi potwierdzać e-maila (BR-26, D-24); potwierdzenie jest osobną czynnością (baner). `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md`
- Zalogowany użytkownik zaprasza konkretną, znaną sobie osobę linkiem lub kodem do partii (BR-09, BR-11); zaproszony może dołączyć jako gość, bez konta (BR-22). `[DOCUMENT]` `research/decisions/2026-10-13-reconciliation.md`
- Zalogowany użytkownik oznacza się jako „szukający gry” i pojawia się w otwartym lobby; status wygasa po 5 minutach bez wyboru (BR-12). `[DOCUMENT]` tamże
- Zalogowany użytkownik przegląda lobby i wybiera przeciwnika spośród szukających (BR-09). `[DOCUMENT]` tamże
- Dwóch użytkowników wykonuje naprzemienne ruchy, każdy pod własnym zegarem, i widzi stan partii oraz oba zegary (BR-04, BR-05). `[DOCUMENT]` tamże
- Użytkownik wraca do historii zakończonych partii (BR-08). `[DOCUMENT]` tamże
- Użytkownik, który zapomniał hasła, ustawia nowe przez link wysłany na e-mail; zalogowany może zmienić hasło (D-15, D-18). `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md`
- Użytkownik usuwa konto; jego partie zostają w historii przeciwników jako „Usunięty gracz” (BR-17, D-16). `[DOCUMENT]` tamże
- Zalogowany użytkownik albo gość tworzy partię prywatną, przekazuje kod lub link własnemu agentowi LLM, który dołącza przez MCP jako „Agent” i gra do końca pod tym samym zegarem (D-28, BR-30). `[DOCUMENT]` `research/decisions/2026-10-31-agent-opponent.md`
- Właściciel instancji (administrator instalacyjny) loguje się na konto z `ADMIN_EMAIL`, otwiera `/backend` i widzi liczniki partii oraz listę kont ze stanami (D-32, BR-35, BR-37). `[DOCUMENT]` `research/decisions/2026-10-31-admin.md`
- Uczestnik partii (konto, gość lub agent) pisze do przeciwnika krótkie wiadomości tekstowe i może wyłączyć czat w tej partii; po zakończeniu partii czat znika (D-30, BR-32…BR-34). `[DOCUMENT]` `research/decisions/2026-10-31-chat.md`

## Produkt i wyróżnik

- Czym jest: patrz Decision summary i Zakres MVP.
- Wyróżnik względem istniejących serwisów: nieustalony. Benchmark z 2026-10-20 opisuje trzy serwisy; nie wynika z niego, czym Gomoku 1:1 online miałoby się różnić ani czy ktoś tego potrzebuje (A-01, Collection plan 4).

| Rozwiązanie | Co robi dobrze (wg strony) | Gdzie zawodzi dla naszych użytkowników | Sprawdzone | Link |
|---|---|---|---|---|
| PlayOK | tylko gracze na żywo, rankingi, statystyki, tryb gościa `[BENCHMARK]` | zaproszenie linkiem, zegar, historia: brak danych | 2026-10-20 | `research/2026-10-20-benchmark-playok.md` |
| papergames.io | gra ze znajomym przez link, losowy przeciwnik, bot, gra jako gość `[BENCHMARK]` | zegar, historia: brak danych; recenzja o utracie czasu przy zerwaniu połączenia | 2026-10-20 | `research/2026-10-20-benchmark-papergames.md` |
| Gomoku – Online Boardgame (DonkeyCat) | gra online bez logowania, trzech przeciwników komputerowych `[BENCHMARK]` | zaproszenie, zegar, historia: brak danych | 2026-10-20 | `research/2026-10-20-benchmark-donkeycat-gomoku.md` |

Czat w innych serwisach: Lichess i Chess.com mają czat wolnym tekstem z możliwością wyłączenia, Chess.com z poziomami dostępności; dla PlayOK, papergames.io i DonkeyCat brak potwierdzonych danych o czacie w partii (Hearthstone i Clash Royale to osobna kategoria, tylko emotki); część źródeł słaba, wartości limitów, domyślne ustawienia i retencja nie potwierdzone. `[BENCHMARK]` `research/2026-10-31-benchmark-chat.md`

Wpływ botów na odbiór gry: brak danych w żadnym z serwisów. Przeciwnik AI hostowany przez nas pozostaje non-goal (N-10, wcześniej N-06); agent, którego uruchamia sam gracz, jest w zakresie (D-28).

## Zakres MVP

### W zakresie

- rejestracja (e-mail, nazwa gracza, hasło), logowanie i wylogowanie;
- potwierdzenie e-maila linkiem, osobna czynność asynchroniczna bez blokad gry (D-24, BR-26);
- reset hasła przez e-mail (D-15) i zmiana hasła po zalogowaniu (D-18);
- usunięcie konta z anonimizacją partii (D-16), niedostępne w trakcie aktywnej partii (BR-21);
- gra w przeglądarce na komputerze i na telefonie (BR-20);
- tworzenie partii dla dwóch osób;
- gra gościa (bez konta) wyłącznie przez zaproszenie kodem/linkiem — gość tworzy je lub przyjmuje i ma nick (BR-29);
- zaproszenie konkretnego przeciwnika przez link lub kod (ad-hoc, nie trwała lista znajomych);
- otwarte lobby graczy aktualnie oznaczonych jako „szukający gry”, z ręcznym wyborem przeciwnika;
- automatyczne wygaśnięcie statusu „szukającego” po 5 minutach (BR-12);
- gra online w czasie rzeczywistym, zasady swobodnego gomoku (bez ograniczeń renju);
- walidacja ruchów i rozstrzygnięcie partii (wygrana/remis);
- zegar 10 minut dla każdego gracza, działający jak zegar szachowy;
- zapisywanie historii partii;
- obsługa ponownego połączenia bez zatrzymywania zegara;
- zakończenie partii po wygranej, remisie albo wyczerpaniu czasu;
- gra człowieka z własnym agentem LLM przez serwer MCP (D-28, BR-30): człowiek tworzy partię prywatną, agent dołącza kodem lub linkiem, narzędzia co najmniej `join(kod)` (z opcjonalną deklarowaną nazwą modelu, BR-31), `get_state()` (stan planszy, oba zegary, wynik) i `play_move(x,y)`; od 2026-10-31 dochodzi `send_message` i pole `chat` w `get_state` (D-31); licznik zakończonych partii wg pary typów uczestników (konto, gość, agent);
- czat tekstowy w partii dla konta, gościa i agenta (D-30, BR-32…BR-34): wolny tekst, także z lobby; wyłączenie czatu per partia tylko dla wyłączającego; limity (wartości początkowe: 200 znaków, 1 wiadomość na 2 s, bez linków); czat działa też na ekranie wyniku i jest kasowany ok. godzinę po zakończeniu partii;
- rola administratora, v1 (D-32, BR-35, BR-37; historyjka E08-S01): administrator instalacyjny z `ADMIN_EMAIL`, tworzony wyłącznie przez `npm run admin:create` (zakłada konto albo przejmuje istniejące); bramka sesji i roli dla panelu `/backend` (layout, każdy route handler i server action); panel tylko do odczytu: liczniki partii (w tym licznik wg pary typów uczestników z E06-S03, #129) i lista kont ze stanami (e-mail potwierdzony, data założenia, liczba partii, rola); e-mail widoczny tylko administratorowi.

### Później

- rola administratora, kolejne historyjki E08 (każda za osobną decyzją, poza v1): nadawanie i odbieranie roli innemu kontu z dziennikiem audytowym (BR-36, BR-38; retencja i dostęp do dziennika: Q-13, blokujące przed tą historyjką), edycja nazwy gracza przez administratora (nowa funkcja względem D-18: `displayNameKey`, kolizje, rezerwacja „Agent”), usuwanie cudzego konta (nowa operacja bez hasła: kolejność blokad users→games, odmowa przy aktywnej partii BR-21, zamknięcie rewanżów, wpis audytu w tej samej transakcji; czy administrator może usunąć nadanego administratora — do decyzji); ponowne uwierzytelnienie przy działaniach niszczących i 2FA (Later);
- zmiana adresu e-mail i nazwy gracza (D-18);
- strona z informacją o przetwarzaniu danych — przed udostępnieniem gry osobom z zewnątrz (S3), nie dla znajomych (D-22);
- zgłaszanie nadużyć i moderacja czatu (Q-10), historia czatu, gotowe frazy i emotki, zapamiętane ustawienie czatu na koncie;
- interfejs CLI dla agenta, agent w lobby, przeciwnik hostowany przez nas (N-10; osobna decyzja po zobaczeniu licznika z D-28).

### Poza zakresem MVP

- N-01 automatyczny/algorytmiczny matchmaking (dobór przez system, bez ręcznego wyboru) — możliwy przyszły etap, nie w v1;
- N-02 rankingi i system ratingowy (ELO lub podobny);
- N-03 trwała lista znajomych jako osobna funkcja (zaproszenie jest jednorazowe/ad-hoc);
- N-04 ~~czat~~ — **nadpisane przez N-11**;
- N-05 obserwowanie partii przez osoby trzecie;
- N-06 ~~przeciwnik AI~~ — **nadpisane przez N-10**;
- N-07 turnieje;
- N-08 warianty gry inne niż swobodne gomoku 15×15 (w tym Renju);
- N-09 natywne aplikacje mobilne;
- N-10 przeciwnik AI hostowany przez nas (bot lub silnik po naszej stronie, koszt modelu po naszej stronie); agent LLM uruchamiany przez samego gracza i dołączający przez MCP nie podlega temu non-goalowi (D-28). Nadpisuje N-06; 2026-10-31, właściciel: Bartosz Wójcik, `research/decisions/2026-10-31-agent-opponent.md`.
- N-11 w czacie partii (D-30) nie budujemy: trwałej historii czatu, czatu poza partią (lobby, kanał globalny), wiadomości prywatnych między partiami, załączników, linków i obrazków w wiadomościach, zgłaszania nadużyć i ręcznej moderacji w v1. Nadpisuje N-04; 2026-10-31, właściciel: Bartosz Wójcik, `research/decisions/2026-10-31-chat.md`.

- N-12 w roli administratora (D-32) nie budujemy w v1 (nie znaczy: nigdy): edycji potwierdzenia e-maila (obchodzi BR-26/BR-27; wróci tylko, jeśli właściciel wskaże sytuację), wejścia w sesję gracza (impersonacji), zmiany e-maila i hasła w imieniu gracza, wielu ról, edycji lub podglądu treści czatu i partii, moderacji (Q-10), eksportu danych, 2FA i ponownego uwierzytelnienia (Later). Nadawanie roli, dziennik audytowy, edycja nazwy i usuwanie cudzych kont są poza v1, ale nie poza zakresem produktu (patrz „Później”). 2026-10-31, właściciel: Bartosz Wójcik, `research/decisions/2026-10-31-admin.md`.

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
| BR-14 | Konto ma unikalny e-mail (login, niewidoczny dla innych graczy) i unikalną nazwę gracza (widoczną dla przeciwników). | Dane konta: decyzja właściciela 2026-10-24 (Q4 b) `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md`; unikalność bez rozróżniania wielkości liter i widoczność e-maila: specyfikacja `[PRODUCT]` `.ai/specs/2026-10-24-account-registration.md`. Wyjątek od 2026-10-31: e-mail jest widoczny administratorowi w panelu `/backend` (BR-37, D-32); innym graczom nadal nie `[DOCUMENT]` `research/decisions/2026-10-31-admin.md` |
| BR-15 | ~~Gracz bez potwierdzonego e-maila jest zalogowany, ale nie może tworzyć partii, przyjmować zaproszeń ani wchodzić do lobby; widzi komunikat „Potwierdź e-mail, aby grać”.~~ **Nadpisane przez BR-23.** | Superseded 2026-10-24 |
| BR-16 | Rejestracja nie ujawnia, że e-mail jest już zarejestrowany (jednolity komunikat); zajęta nazwa gracza jest wskazywana. | Decyzja właściciela 2026-10-24 (Q7 b) `[DOCUMENT]` tamże; reguła standardów §1 `[PRODUCT]` `.ai/docs/2026-09-01-engineering-standards.md` |
| BR-17 | Usunięcie konta kasuje e-mail, hash hasła i sesje; zakończone partie zostają w historii przeciwników z nazwą „Usunięty gracz”. | Decyzja właściciela 2026-10-24 („3a”, „4a”) `[DOCUMENT]` tamże |
| BR-18 | Historia partii jest przechowywana bez limitu czasu, dopóki konto istnieje; wygasłe sesje i liczniki limitu prób są usuwane bez udziału człowieka; nie wpływają na poprawność (filtrowane przy odczycie), a mechanizm sprzątania — zgodny ze standardami („no background worker” dla poprawności) — ustali specyfikacja. | Decyzja właściciela 2026-10-24 („6a”) `[DOCUMENT]` tamże |
| BR-20 | Gra (plansza, zegary, lobby, formularze kont) działa w przeglądarce na komputerze i na ekranie telefonu; natywne aplikacje pozostają poza zakresem (N-09). | Decyzja właściciela 2026-10-24 („C a”) `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md` |
| BR-22 | ~~Gość (bez konta) może wyłącznie dołączyć do partii z linku/kodu zaproszenia (jeden link = jedna partia, BR-11). Nie tworzy zaproszeń, nie wchodzi do lobby, nie ma nazwy ani historii. Rozpoznaje go token jednej partii w ciasteczku tej przeglądarki, ważny do końca partii + 1 h; zmiana przeglądarki w trakcie partii oznacza utratę dostępu (zegar biegnie, BR-06/BR-07) — gość widzi to ostrzeżenie przed dołączeniem. Założenie konta po partii nie przejmuje tej partii.~~ **Nadpisane przez BR-29.** | Superseded 2026-10-30 |
| BR-23 | ~~Zalogowany użytkownik bez potwierdzonego e-maila nie może tworzyć partii, wchodzić do lobby ani dołączać do zaproszenia jako on sam; widzi „Potwierdź e-mail, aby grać”, a przy linku zaproszenia może zagrać jako gość (BR-22). Nadpisuje BR-15.~~ **Nadpisane przez BR-26.** | Superseded 2026-10-26 |
| BR-24 | Partie są zapisywane w historii kont uczestników. Gość nie ma historii; u zapraszającego przeciwnikiem gościa jest „{nick} (gość)” (BR-29; wcześniej „Zaproszony przez link”). Nadpisuje BR-08. | Decyzja właściciela 2026-10-24 `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md` |
| BR-21 | Usunięcie konta jest odrzucane, dopóki użytkownik ma aktywną partię; komunikat: „Najpierw dokończ albo poddaj partię”. | Decyzja właściciela 2026-10-24 („B a”) `[DOCUMENT]` tamże |
| BR-19 | ~~Reset hasła odbywa się przez jednorazowy link wysłany na potwierdzony e-mail konta.~~ **Nadpisane przez BR-25.** | Superseded 2026-10-24 |
| BR-25 | ~~Reset hasła odbywa się przez jednorazowy link (ważny 1 h) wysłany na e-mail konta — także niepotwierdzony; ustawienie nowego hasła z linku potwierdza e-mail i unieważnia wszystkie sesje konta. Dzięki temu właściciel adresu odzyska konto założone na jego e-mail przez kogoś innego. Nadpisuje BR-19.~~ **Nadpisane przez BR-27.** | Superseded 2026-10-26 |
| BR-26 | Konto jest aktywne od razu po rejestracji: zalogowany użytkownik może tworzyć partie, przyjmować zaproszenia jako on sam i wchodzić do lobby bez względu na stan potwierdzenia e-maila. Potwierdzenie to osobna czynność asynchroniczna; baner (zamykalny, wraca po 7 dniach) tłumaczy powód. Zalogowany nie gra jako gość. Nadpisuje BR-23. | Decyzja właściciela 2026-10-26, osąd właściciela `[DOCUMENT]` `research/decisions/2026-10-26-onboarding-simplification.md` |
| BR-27 | Reset hasła odbywa się przez jednorazowy link (ważny 1 h) wysłany wyłącznie na **potwierdzony** e-mail konta; dla niepotwierdzonego nic nie jest wysyłane, a odpowiedź dla klienta jest ta sama. Ustawienie nowego hasła unieważnia wszystkie sesje konta. Wraca BR-19; nadpisuje BR-25. | Decyzja właściciela 2026-10-26 `[DOCUMENT]` tamże |
| BR-28 | Hasło ma co najmniej 8 znaków i najwyżej 72 bajty UTF-8 (nadmiar odrzucany, nie skracany); bez listy popularnych haseł i kontroli wycieków. Nadpisuje G3 ze specyfikacji rejestracji. Konta niepotwierdzone i bez żadnej partii są kasowane po 14 dniach od założenia (zastępuje Q14); konta z partią zostają. | Decyzja właściciela 2026-10-26 `[DOCUMENT]` tamże |
| BR-29 | Gość (bez konta) może **tworzyć** zaproszenie (kod/link) i **przyjmować** je; przed wejściem do partii podaje nick (1–24 znaki) albo zatwierdza domyślne „Gracz 1” / „Gracz 2” (numer miejsca; kolory losowane osobno). Przeciwnik widzi go jako „{nick} (gość)”. Nadal tylko przez zaproszenie (jeden link = jedna partia, BR-11): bez lobby, historii i konta; dwie osoby bez kont mogą grać ze sobą. Rozpoznaje go token jednej przeglądarki w ciasteczku: ważny przy oczekującej partii do wygaśnięcia zaproszenia (24 h), potem do końca partii + 1 h; jedna partia oczekująca/aktywna na przeglądarkę (BR-13); zmiana przeglądarki oznacza utratę dostępu (ostrzeżenie przed utworzeniem i przed dołączeniem). Założenie konta po partii nie przejmuje tej partii. Nadpisuje BR-22. | Decyzja właściciela 2026-10-30 (Q1–Q8 specyfikacji nicku i gościa-twórcy) `[DOCUMENT]` `2026-10-30-guest-creates-game.md` |
| BR-30 | ~~Agent (klient MCP uruchamiany przez gracza) jest osobnym typem uczestnika z własnym tokenem: dołącza wyłącznie do partii prywatnej utworzonej przez człowieka (konto albo gość, BR-29) kodem lub linkiem, nie tworzy zaproszeń, nie wchodzi do lobby, nie ma historii ani konta. Przeciwnik widzi go z etykietą „Agent” (wyjątek od zasady nazwy z BR-29). Gra pod tym samym zegarem 10 minut bez wyjątku (BR-04, D-05, BR-07); `get_state()` zwraca oba zegary i wynik. „Agent” w statystyce oznacza „dołączył przez interfejs MCP”, a nie dowód, że to LLM. Tożsamość i token klienta oraz limity nadużyć: Q-09.~~ **Nadpisane przez BR-31.** | Superseded 2026-10-31 |
| BR-31 | Agent (klient MCP uruchamiany przez gracza) jest osobnym typem uczestnika z własnym tokenem: dołącza wyłącznie do partii prywatnej utworzonej przez człowieka (konto albo gość, BR-29) kodem lub linkiem, nie tworzy zaproszeń, nie wchodzi do lobby, nie ma historii ani konta. Przeciwnik widzi go z etykietą „Agent” (wyjątek od zasady nazwy z BR-29); agent **może** w `join` podać opcjonalną, deklarowaną i niezweryfikowaną nazwę swojego modelu (1–40 znaków, ścisła walidacja), a przeciwnik widzi wtedy „Agent · {nazwa} (deklarowane)”, zawsze jako zwykły tekst; nazwa nie wraca do żadnego agenta. Nazwa konta „Agent” jest zarezerwowana przy rejestracji (bez rozróżniania wielkości liter). Gra pod tym samym zegarem 10 minut bez wyjątku (BR-04, D-05, BR-07); `get_state()` zwraca oba zegary i wynik; błąd `play_move` nie zmienia stanu partii ani zegarów. „Agent” w statystyce oznacza „dołączył przez interfejs MCP”, a nie dowód, że to LLM; zestawienie wg deklarowanej nazwy modelu jest tylko informacją pomocniczą. Tożsamość, token i limity: D-29. Nadpisuje BR-30. | Decyzja właściciela 2026-10-31 `[DOCUMENT]` `research/decisions/2026-10-31-mcp-agent-identity.md`. W części: uprawnienia agenta — nadpisane przez D-31 |
| BR-32 | Wiadomość czatu: zwykły tekst 1–200 znaków po normalizacji NFKC, bez znaków sterujących, niewidocznych i adresów URL (linków), renderowany wyłącznie jako zwykły tekst; ≤ 1 wiadomość na 2 s na uczestnika (wartości początkowe, konfigurowalne, zaproponowane przez agenta, bez danych — jak limity D-29). Piszą uczestnicy partii `active` albo `finished` (do 1 h po zakończeniu); w partii `waiting` czat nie działa. `send_message` agenta ma osobne limity, nie wspólną pulę z D-29. Podpis nadawcy: konto = nazwa gracza (BR-14), gość = „{nick} (gość)” (BR-29), agent = „Agent · {nazwa} (deklarowane)” albo „Agent” (BR-31); e-mail nigdy. Rewanż startuje z pustym czatem i włączonym ustawieniem. | Decyzja właściciela 2026-10-31 (limity: zgoda na rekomendację agenta, wartości bez danych) `[DOCUMENT]` `research/decisions/2026-10-31-chat.md` |
| BR-33 | Wyłączenie czatu: per partia, tylko dla wyłączającego (nie widzi i nie wysyła); rozmówca widzi „Rozmówca wyłączył czat”; domyślnie włączony, bez zapamiętywania ustawienia; dotyczy konta i gościa. Agent nie ma narzędzia do wyłączania czatu; gdy człowiek wyłączy czat, `send_message` zwraca `CHAT_DISABLED`, a `get_state` ma pole `chatStatus: "disabled_by_opponent"` kontrolowane przez system (nie niezaufany tekst). Brak zgłaszania nadużyć w v1. | Decyzja właściciela 2026-10-31 `[DOCUMENT]` `research/decisions/2026-10-31-chat.md` |
| BR-34 | Retencja czatu — świadomy wyjątek od BR-18 i BR-24: wiadomości nie wchodzą do historii partii (#27); `db:cleanup` usuwa je ok. 1 h po zakończeniu partii, faktycznie w ciągu ok. 2 h (najbliższy przebieg crona co godzinę); usunięcie konta oraz wygaśnięcie tokenu gościa lub agenta także kasują czat. Obietnica dotyczy bazy produkcyjnej: aplikacja nie zapisuje treści wiadomości w logach; logi infrastruktury i kopie hostingu są poza obietnicą; kopie `pg_dump` z wdrożeń wykluczają dane tabeli czatu (`--exclude-table-data`) i są trzymane w liczbie 5 ostatnich. Cron `db:cleanup` zainstalowano na Mikrusie 2026-10-31 (Q-12 zamknięte); spełnienie obietnicy wymaga działającego crona. | Decyzja właściciela 2026-10-31 (retencja: zgoda na rekomendację agenta) `[DOCUMENT]` `research/decisions/2026-10-31-chat.md` |
| BR-35 | Administrator instalacyjny: konto, którego znormalizowany e-mail (jak `normalizeEmail`) równa się `ADMIN_EMAIL`, ma rolę administratora wynikającą z konfiguracji, sprawdzaną przy każdym żądaniu (nie z pola w bazie); nie można jej odebrać ani zmienić przez panel, ani zmienić e-maila tego konta; `AccountService.delete` odmawia usunięcia tego konta (także samousunięcia); reguła `unverifiedUsers` (BR-28) go nie kasuje. Konto powstaje **wyłącznie** przez `npm run admin:create`: zakłada konto (e-mail z `ADMIN_EMAIL`, nazwa, hasło z CLI, e-mail potwierdzony) albo **przejmuje istniejące** (nowe hasło z CLI, e-mail oznaczony jako potwierdzony, wszystkie sesje unieważnione) — w jednej transakcji, z blokadą wiersza użytkownika. Rejestracja przez stronę na `ADMIN_EMAIL` jest odrzucana jednolitym komunikatem BR-16 (zamyka wektor przejęcia: obca osoba rejestruje się na ten adres i klika link potwierdzający). `ADMIN_EMAIL` jest wymagany w produkcji (fail closed jak `APP_ORIGIN`: konfiguracja rzuca błąd, wartość trafia do `compose.prod.yaml` i `.env*.example`); gdyby mimo to w runtime nie było administratora, panel odmawia wszystkim (brak panelu, nie panel otwarty). Po zmianie `ADMIN_EMAIL` nowy administrator instalacyjny powstaje przez `admin:create`, a poprzedni traci status instalacyjny (rolę zachowuje tylko, jeśli została mu nadana w bazie) — propozycja agenta, niepotwierdzona (Q-15). Administrator zachowuje funkcje gracza. | Decyzja właściciela 2026-10-31 (administrator instalacyjny z konfiguracji, bootstrap tylko przez `admin:create`, ochrona przed usunięciem i zmianą e-maila: po recenzji skeptyka); zachowanie po zmianie `ADMIN_EMAIL`: propozycja agenta `[DOCUMENT]` `research/decisions/2026-10-31-admin.md`. Test: A-11 |
| BR-36 | Nadawanie roli (kolejna historyjka E08, poza v1): administrator nadaje i odbiera rolę administratora innemu kontu; nie sobie i nigdy administratorowi instalacyjnemu; cel musi mieć potwierdzony e-mail; wpis w dzienniku audytowym (BR-38) w tej samej transakcji; zmiana roli i odebranie ostatniego nadanego administratora nie mogą zablokować dostępu, bo administrator instalacyjny istnieje zawsze (BR-35). Wyścig: nadanie i usunięcie konta celu rozstrzyga blokada wiersza użytkownika (kolejność users→games), więc rola nie zostaje na usuniętym koncie. | Decyzja właściciela 2026-10-31 co do kierunku i fazowania (Later); szczegóły zaproponował agent `[DOCUMENT]` `research/decisions/2026-10-31-admin.md` |
| BR-37 | Zakres administratora w v1: wyłącznie odczyt. Panel `/backend` pokazuje liczniki partii (w tym licznik wg pary typów uczestników z E06-S03, #129) i listę kont ze stanami (e-mail potwierdzony, data założenia, liczba partii, rola). Dostęp tylko po sesji i roli administratora — sprawdzane w layoucie oraz w każdym route handlerze i server action (nie tylko w layoucie); brak sesji lub roli daje odpowiedź nieodróżnialną od nieistniejącej strony. E-mail graczy widoczny wyłącznie administratorowi (wyjątek w BR-14, rozszerzenie D-22). Bez zmiany czegokolwiek w cudzych kontach, bez wejścia w sesję gracza. Kolejne uprawnienia (nadawanie roli, edycja nazwy, usuwanie konta) wymagają osobnych decyzji i historyjek. | Decyzja właściciela 2026-10-31 (zakres wstępny zaproponowany przez agenta, zatwierdzony ogólnym „ok”; po recenzji skeptyka zawężony do odczytu w v1) `[DOCUMENT]` `research/decisions/2026-10-31-admin.md` |
| BR-38 | Dziennik audytowy (kolejna historyjka E08, razem z pierwszą operacją zapisu): wpis na każdą zmianę wykonaną przez administratora — aktor, cel (id konta), akcja, czas; bez haseł i tokenów; wpis o usuniętym koncie nie zawiera e-maila ani nazwy (anonimizacja, BR-18). Wpis powstaje w tej samej transakcji co zmiana. Retencja dziennika i dostęp do niego: Q-13 (blokujące przed tą historyjką). W v1 (odczyt) dziennik nie jest potrzebny. | Propozycja agenta, zatwierdzona przez właściciela ogólnym „ok” co do kierunku `[DOCUMENT]` `research/decisions/2026-10-31-admin.md` |

Właściciel wszystkich reguł: Bartosz Wójcik. Zmiana reguły: nowy wiersz nadpisujący, zatwierdzony przez właściciela. Termin przeglądu: nieustalony (unknown).

## Kluczowy przepływ

**Stan obecny (bez aplikacji):** mapa założeń z 2026-10-20 — gracz bierze telefon albo wchodzi na stronę, szuka partnera w serwisie z grami, gra albo szuka dalej; oczekuje płynności i szybkości. Wszystkie wpisy to przypuszczenia właściciela, żaden nie pochodzi z rozmowy z graczem; fazy zaproponował agent, a odpowiedź „serwis z grami” mogła zostać przez niego podsunięta. `[ASSUMPTION]` `research/2026-10-20-journey-current-state.md` — A-02

**Stan docelowy:**

1. Zapraszający lub gracz lobby rejestruje się (jest zalogowany) i może potwierdzić e-mail linkiem, kiedy chce (BR-14, BR-26).
2. Wybiera ścieżkę: (a) tworzy partię i wysyła link/kod zaproszenia konkretnej osobie, albo
   (b) oznacza się jako „szukający gry” i pojawia się w otwartym lobby.
3. W ścieżce (a) zaproszony otwiera link i dołącza: jako gość bez konta (BR-22) albo — zalogowany
   — jako on sam. W ścieżce (b) inny zalogowany użytkownik
   przegląda lobby i wybiera gracza z listy szukających.
4. System inicjalizuje planszę, kolejność graczy i zegary (10 minut na gracza).
5. Gracze wykonują naprzemienne ruchy; system odrzuca ruchy niezgodne ze stanem partii lub
   zasadami swobodnego gomoku.
6. System wykrywa zwycięstwo (5 w linii), remis, wyczerpanie czasu albo niekorzystne zakończenie
   po wygaśnięciu zegara podczas rozłączenia.
7. Wynik i przebieg partii trafiają do historii obu użytkowników.

`[DOCUMENT]` `research/decisions/2026-10-13-reconciliation.md`, krok 1 — `research/decisions/2026-10-24-accounts-and-data.md`

## Dane i stan produktu

- Model domenowy: użytkownik, sesja, partia, uczestnik partii, zaproszenie, status „szukającego” (z czasem wygaśnięcia), ruch, zegar, wynik; dochodzą tokeny potwierdzenia e-maila i resetu hasła oraz wiadomość czatu (tymczasowa, BR-34) z ustawieniem wyłączenia per uczestnik partii; od D-32 rola administratora (administrator instalacyjny wynika z konfiguracji `ADMIN_EMAIL`; pole `role` w bazie dopiero przy nadawaniu roli, BR-36) i, w kolejnej historyjce, dziennik audytowy (BR-38). `[PRODUCT]` `.ai/specs/2026-10-24-account-registration.md`, `.ai/docs/2026-09-01-engineering-standards.md`
- Partia rozróżnia sposób powstania (`invite` albo `lobby`), żeby zachować miejsce na przyszły matchmaking (D-21). `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md`
- Historia przechowuje co najmniej przeciwnika, wynik, datę, status zakończenia i ruchy albo dane pozwalające odtworzyć partię. `[DOCUMENT]` `research/decisions/2026-10-13-reconciliation.md`
- Dane osobowe konta: e-mail (niewidoczny dla innych graczy, widoczny administratorowi — BR-37), nazwa gracza (publiczna), hash hasła; retencja i usuwanie — BR-17, BR-18. `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md`
- Informacja dla użytkowników o przetwarzaniu danych powstaje przed udostępnieniem gry osobom z zewnątrz (D-22); jej treść nie jest ustalona; od 2026-10-31 ma też objąć dostęp administratora do danych kont (D-32, Q-14).

## Niefunkcjonalne ryzyka

- stan partii i zegar muszą być rozstrzygane po stronie zaufanej (serwer), aby klient nie mógł samodzielnie zmienić wyniku ani czasu;
- synchronizacja musi tolerować chwilową utratę połączenia bez psucia zegara ani stanu planszy;
- należy zdefiniować zachowanie przy jednoczesnych ruchach, odświeżeniu strony i ponownym wejściu do zakończonej partii;
- lobby „szukających” wymaga mechanizmu czasu rzeczywistego do aktualizacji listy i wygaszania statusu — nie zweryfikowano wybranej technologii (Q-01);
- weryfikacja e-maila i reset hasła wymagają niezawodnej wysyłki poczty; jej awaria blokuje potwierdzenie i reset hasła, nie grę (BR-26); darmowy plan (D-20) ma limit wiadomości, którego przekroczenie zatrzyma rejestracje — dostawca nieustalony (Q-02);
- panel `/backend` jest dziś osiągalny bez logowania (zgłoszenie #152, `priority-high`; doraźnie `notFound()` w produkcji) — do czasu bramki z BR-37 pozostaje ryzykiem istniejącym; przejęcie konta administratora (rejestracja na `ADMIN_EMAIL`, wyciek hasła, brak 2FA) daje wgląd w e-maile wszystkich graczy (BR-35, A-11);
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
| D-17 | ~~Potwierdzenie e-maila jest wymagane przed pierwszą grą; rejestracja od razu loguje (BR-23). Agent rekomendował weryfikację dopiero przed resetem; właściciel wybrał przed grą. | Bartosz Wójcik~~ **Nadpisane przez D-24.** | Bartosz Wójcik | Superseded 2026-10-26 |
| D-18 | Zmiana hasła po zalogowaniu jest w MVP; zmiana e-maila i nazwy gracza — później. | Bartosz Wójcik | Potwierdzona 2026-10-24 `[DOCUMENT]` |
| D-19 | Gra jest „na razie” darmowa dla graczy; właściciel płaci za hosting. | Bartosz Wójcik | Potwierdzona 2026-10-20 `[DOCUMENT]` `research/2026-10-20-stakeholders.md` |
| D-20 | Wysyłka poczty (potwierdzenie e-maila, reset) korzysta wyłącznie z darmowego planu dostawcy, z jego limitem wiadomości; wybór dostawcy w #38. | Bartosz Wójcik | Potwierdzona 2026-10-24 („A a”) `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md` |
| D-21 | Partia zapisuje sposób powstania (`invite` / `lobby`), żeby przyszły matchmaking był nową wartością, nie przebudową. | Bartosz Wójcik | Potwierdzona 2026-10-24 („D a”) `[DOCUMENT]` tamże |
| D-23 | Użytkownicy muszą się logować — z wyjątkiem gościa tworzącego lub przyjmującego zaproszenie (BR-22, od 2026-10-30 BR-29, D-27). Zaproszenia i lobby wymagają konta (od 2026-10-26 bez wymogu potwierdzenia: D-24, BR-26). Nadpisuje D-02. Inicjatywa właściciela; granice zaproponował agent. | Bartosz Wójcik | Potwierdzona 2026-10-24 `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md` |
| D-22 | Strona z informacją o przetwarzaniu danych powstaje przed udostępnieniem gry osobom z zewnątrz (S3); dla grona znajomych nie jest wymagana. Od 2026-10-31 ma objąć treść czatu, jej retencję (BR-34) i brak moderacji (Q-11) oraz dostęp administratora do danych kont, w tym do e-maili (D-32, BR-37, Q-14). | Bartosz Wójcik | Potwierdzona 2026-10-24 („E b”) `[DOCUMENT]` tamże |
| D-24 | Konto jest aktywne od razu po rejestracji; potwierdzenie e-maila jest osobną czynnością asynchroniczną, bez blokad gry, z banerem z powodem (BR-26). Nadpisuje D-17. Osąd właściciela, nie wynik badania; kolejny panel syntetyczny go nie potwierdza. | Bartosz Wójcik | Potwierdzona 2026-10-26 `[DOCUMENT]` |
| D-25 | Hasło minimum 8 znaków (BR-28). Słabsze hasła to ryzyko przyjęte przez właściciela (limity prób H1 zostają). Nadpisuje G3. | Bartosz Wójcik | Potwierdzona 2026-10-26 `[DOCUMENT]` |
| D-26 | Reset tylko po potwierdzeniu e-maila (BR-27); niepotwierdzone konta bez partii kasowane po 14 dniach (BR-28). Przyjęte ryzyko: osoba, która zajmie cudzy adres i zagra jedną partię, utrzymuje go bezterminowo; ścieżka „To nie ja” może być późniejszą historią. Nadpisuje BR-25 i Q14. | Bartosz Wójcik | Potwierdzona 2026-10-26 `[DOCUMENT]` |
| D-27 | Gra bez konta: gość może tworzyć i przyjmować zaproszenia kodem/linkiem i podaje nick (BR-29); zaproszenia nadal są jedyną drogą dla gościa (bez lobby). Nadpisuje wyjątek w D-23 i BR-22. Nick osobną specyfikacją (E02-S07), gość-twórca osobną (E02-S08). | Bartosz Wójcik | Potwierdzona 2026-10-30 `[DOCUMENT]` `2026-10-30-guest-creates-game.md` |
| D-28 | Gra z własnym agentem LLM: człowiek (konto albo gość) tworzy partię prywatną, agent dołącza przez serwer MCP jako osobny typ uczestnika „Agent” (BR-30), pod tym samym zegarem; MCP jedynym interfejsem na start. Powód właściciela: „chcę zobaczyć, jak agent gra”; wariant nie adresuje nauki gry przez początkujących (A-05), a prywatna partia nie zwiększa puli partii; właściciel wybrał go mimo to. Rozważone: przeciwnik hostowany przez nas (odłożony, N-10), CLI (odłożone), agent w lobby (odrzucone). Licznik zakończonych partii wg pary typów uczestników (konto, gość, agent) mierzy użycie; próg „ma sens” nieustalony (Q-06). Osąd właściciela, nie wynik badania. Nadpisuje N-06. | Bartosz Wójcik | Potwierdzona 2026-10-31 `[DOCUMENT]` `research/decisions/2026-10-31-agent-opponent.md` |
| D-29 | Tożsamość i dostęp klienta MCP (zamyka Q-09): agent to osobny rodzaj uczestnika `agent` z własną kolumną skrótu tokenu i kanałem `mcp`; token jednej partii (32 B CSPRNG, w bazie SHA-256) wydawany raz w odpowiedzi na `join(kod)`, ważny do końca partii + 1 h, bez rotacji, ponownego wydania i OAuth; transport zdalny Streamable HTTP `POST /api/mcp` w aplikacji Next.js; limity jako wartości początkowe i konfigurowalne (token 60/min, adres 300/min, dołączenia 10/h na adres, ciało ≤ 8 KB, `waitSeconds` 0–25) oraz osobna pula błędnych kodów zaproszeń dla agenta; uprawnienia tylko `join`, `get_state`, `play_move`; brak rewanżu z agentem i brak `resign` w v1; `get_state` bez nazw graczy; agent może zadeklarować nazwę swojego modelu (BR-31, niezweryfikowana, wyświetlana z oznaczeniem „(deklarowane)”); błąd `play_move` o jednolitym kształcie i bez zmiany stanu; nazwa konta „Agent” zarezerwowana; biblioteka MCP warunkowo po spike’u, wyjście awaryjne: ręczna obsługa JSON-RPC. Osąd właściciela, nie wynik badania; wartości limitów bez danych (A-04, A-06). Zamyka Q-09. | Bartosz Wójcik | Potwierdzona 2026-10-31 `[DOCUMENT]` `research/decisions/2026-10-31-mcp-agent-identity.md`. W części: uprawnienia agenta — nadpisane przez D-31 |
| D-30 | Czat tekstowy między uczestnikami partii (konto, gość, agent): wolny tekst z każdym przeciwnikiem, także z lobby (BR-32); wyłączenie per partia tylko dla wyłączającego, domyślnie włączony, bez zapamiętywania (BR-33); czat działa też na ekranie wyniku; limity jako wartości początkowe; kasowanie ok. godzinę po zakończeniu partii (BR-34). Powód właściciela: „gdy gra się ze znajomym i chce się pogadać, to żeby nie zmieniać aplikacji; inne aplikacje tego typu to mają” — osąd, nie obserwacja (A-07). Rozważone: (A) hybryda — wolny tekst w partiach prywatnych, gotowe frazy w lobby (rekomendacja rozeznania, odrzucona), (B) tylko frazy i emotki, (C) wolny tekst wszędzie z wyłączeniem (wybrane); zgłaszanie nadużyć odłożone. Przyjęte ryzyko właściciela: wolny tekst od obcych z lobby wbrew rekomendacji rozeznania (wariant A odrzucony); wyłączenie czatu jest jedyną ochroną i działa dopiero po pierwszej wiadomości (A-08). Nadpisuje N-04 (N-11). | Bartosz Wójcik | Potwierdzona 2026-10-31 `[DOCUMENT]` `research/decisions/2026-10-31-chat.md` |
| D-31 | Agent uczestniczy w czacie. Nadpisuje w części D-29 / BR-31 fragment „uprawnienia tylko `join`, `get_state`, `play_move`” (oraz „brak rewanżu z agentem i brak `resign` w v1” zostaje bez zmian): dochodzi `send_message` i pole `chat` w `get_state` z wiadomościami człowieka, oznaczone jako dane niezaufane, nigdy jako polecenia; pole `chatStatus` jest kontrolowane przez system. Bez zmian zostaje „`get_state` bez nazw graczy” (wiadomości w `chat` są podpisane rolą, nie nazwą) oraz reguła, że deklarowana nazwa modelu nie wraca do żadnego agenta. Agent nie ma narzędzia do wyłączania czatu; `send_message` zwraca `CHAT_DISABLED`, gdy człowiek wyłączył czat (BR-33). Ryzyko prompt injection: A-09. | Bartosz Wójcik | Potwierdzona 2026-10-31 `[DOCUMENT]` `research/decisions/2026-10-31-chat.md` |
| D-32 | Rola administratora instancji, v1 w najmniejszym zakresie: administrator instalacyjny z `ADMIN_EMAIL`, tworzony wyłącznie przez `npm run admin:create` (BR-35), oraz panel `/backend` tylko do odczytu za bramką sesji i roli (BR-37). Powód właściciela: „dodałem liczniki, ale z poziomu aplikacji ich nie widać; dodatkowo jako właściciel instancji aplikacji muszę mieć kontrolę” — osąd i potrzeba właściciela, nie obserwacja graczy (A-10). Rozważone: samo CLI bez panelu (odrzucone: nie daje podglądu z aplikacji), pierwsze zarejestrowane konto jako administrator (odrzucone: ryzykowne na publicznym serwerze), rola z `ADMIN_EMAIL` po potwierdzeniu e-maila (odrzucone: nie zamyka przejęcia — obca rejestracja na adres plus kliknięcie linku daje rolę), zakres wstępny z edycją i usuwaniem w v1 (zaproponowany przez agenta, zatwierdzony ogólnym „ok”, po recenzji skeptyka rozbity na fazy: edycja nazwy, nadawanie roli z dziennikiem i usuwanie kont to osobne decyzje, BR-36, BR-38, „Później”). E-mail graczy widoczny administratorowi: wyjątek w BR-14, rozszerza D-22 (Q-14). Przyjęte ryzyka: brak 2FA i ponownego uwierzytelnienia; jedno konto z dostępem do e-maili graczy. | Bartosz Wójcik | Potwierdzona 2026-10-31 `[DOCUMENT]` `research/decisions/2026-10-31-admin.md` |

Termin przeglądu decyzji: nieustalony (unknown). Zmiana decyzji: nowy wiersz nadpisujący, zatwierdzony przez właściciela.

## Ryzykowne założenia

| ID | Założenie | Ważność | Dowody dziś | Jeśli fałszywe | Najmniejszy test | Właściciel | Do kiedy | Wynik |
|---|---|---|---|---|---|---|---|---|
| A-01 | Gracze spoza grona właściciela zechcą grać w Gomoku 1:1 online i zostawić feedback. `[ASSUMPTION]` właściciel, brak materiału | wysoka | brak; benchmark pokazuje istniejące serwisy, nie popyt na nasz | zakres „realnego produktu” (D-11) i koszty poczty (D-15, D-19) nie mają uzasadnienia poza nauką | rozmowy z graczami (pytania 1–7 z mapy ścieżki); po udostępnieniu (wymaga Q-05, Q-07) obserwacja, czy gracz spoza grona właściciela, niezaproszony przez niego, rozgrywa partię — propozycja agenta, bez progu liczbowego | Bartosz Wójcik | unknown | untested |
| A-02 | Gracz rezygnuje, jeśli szukanie partnera nie jest szybkie; 5 minut w lobby mu odpowiada. `[ASSUMPTION]` właściciel, `research/2026-10-20-journey-current-state.md` | średnia | brak; przypuszczenie właściciela | inny czas wygaśnięcia BR-12 lub inny sposób informowania o oczekiwaniu | pytanie 5 z mapy ścieżki w rozmowach z graczami | Bartosz Wójcik | unknown | accepted untested (D-09) |
| A-03 | Wymóg potwierdzenia e-maila przed pierwszą grą (dla kont; zaproszeni mogą grać jako goście, BR-22) nie zniechęci nowych graczy. `[ASSUMPTION]` agent, wynikało z D-17 (nadpisane przez D-24 w 2026-10-26: potwierdzenie przestało blokować grę; założenie dotyczy już tylko niewymuszonego kroku; osąd właściciela, nie badanie) | średnia | brak danych o naszych graczach; wszystkie trzy sprawdzone serwisy pozwalają grać bez logowania lub jako gość (wiersze benchmarku w „Produkt i wyróżnik”) — to zachowanie konkurencji, nie dowód preferencji graczy | odejście nowych graczy z kontem przed pierwszą partią w lobby lub przed pierwszym zaproszeniem; rozważyć weryfikację dopiero przed resetem | po udostępnieniu: ile kont potwierdza e-mail i rozgrywa pierwszą partię (wymaga pomiaru) | Bartosz Wójcik | unknown | accepted untested (D-17) |
| A-04 | Osoby techniczne, które mają własnego agenta LLM, zechcą zagrać z nim partię na tej platformie. `[ASSUMPTION]` właściciel, brak materiału (właściciel nie opisał własnego doświadczenia z agentem w grze) | wysoka | brak | funkcja nie jest używana; zostaje demo dla właściciela, a decyzja o przeciwniku hostowanym (N-10) lub zamknięciu funkcji wraca do właściciela | po udostępnieniu osobom z zewnątrz (S3): czy ktoś spoza grona właściciela, niezaproszony przez niego, rozegrał partię przez MCP (licznik); bez progu liczbowego | Bartosz Wójcik | unknown | untested |
| A-05 | Gra z agentem pomaga osobie, która nie zna gomoku, szybko poznać grę. `[ASSUMPTION]` właściciel (uzasadnienie podane w rozmowie, ale wariant D-28 go nie adresuje); agent zauważył, że osoba bez znajomości gry zwykle nie ma własnego agenta z MCP | niska | brak | uzasadnienie „nauka gry” odpada; pomoc początkującym wymagałaby przeciwnika hostowanego (N-10) | po S3: krótka rozmowa z kilkoma osobami spoza grona właściciela, które zagrały z agentem, o tym, czy to pomogło; licznik tego nie rozstrzygnie | Bartosz Wójcik | unknown | untested |
| A-06 | Czas odpowiedzi modelu mieści się w zegarze 10 minut na gracza (BR-04, D-05), a agent odpytujący `get_state()` bez powiadomień nie traci partii na czasie. `[ASSUMPTION]` agent, koszt tokenów po stronie gracza również założenie agenta (zależy od sposobu uruchamiania agenta) | średnia | brak; Q-01 (mechanizm czasu rzeczywistego) rozstrzygnięty tylko dla przeglądarki; dla agenta D-29 przyjmuje odpytywanie z długim oczekiwaniem (`waitSeconds` ≤ 25) zamiast powiadomień — wartość początkowa, bez danych | agent regularnie przegrywa na czasie i funkcja nie nadaje się do gry; potrzebna inna reguła czasu (wymaga decyzji właściciela zmieniającej BR-04/D-05) | pierwsze partie właściciela z agentem: ile ruchów wykonał w limicie, kto przegrał na czasie | Bartosz Wójcik | unknown | untested |
| A-07 | Gracze będą pisać do przeciwnika w partii zamiast zmieniać aplikację (przesłanka: „gdy gra się ze znajomym i chce się pogadać, to żeby nie zmieniać aplikacji”). `[ASSUMPTION]` właściciel, osąd bez obserwacji graczy | średnia | brak; benchmark pokazuje, że inne serwisy mają czat, nie że gracze go potrzebują | czat jest nieużywany, a koszt ochrony (limity, retencja, prawo, nękanie) nie ma uzasadnienia; decyzja wraca do właściciela | po S3: licznik partii z ≥ 1 wiadomością (bez treści) — niezatwierdzona propozycja agenta, słaba miara przesłanki „żeby nie zmieniać aplikacji”; bez progu liczbowego; rozmowy z graczami | Bartosz Wójcik | unknown | untested |
| A-08 | Bez zgłaszania nadużyć i moderatora wyłączenie czatu oraz limity ograniczają nękanie przez obcych z lobby na tyle, że nie odstrasza to graczy. Niesprawdzone założenie, bez dowodów. `[ASSUMPTION]` agent; właściciel wybrał wariant mimo rekomendacji rozeznania | wysoka | brak; wyłączenie działa dopiero po pierwszej wiadomości; rozeznanie wskazuje, że Lichess ograniczał czat anonimów po falach spamu (forum, słabe źródło) | nękanie lub spam od obcych w lobby; gracze odchodzą albo trzeba dodać zgłaszanie, moderację lub frazy w lobby (wariant A) | pierwsi obcy gracze po S3: czy ktokolwiek zgłasza nękanie właścicielowi albo wyłącza czat zaraz po pierwszej wiadomości; wyzwalacz Q-10 | Bartosz Wójcik | przed S3 | untested |
| A-09 | Agent czytający czat człowieka nie stanie się narzędziem ataku (prompt injection) przy osobnym polu `chat` z oznaczeniem i minimalnych uprawnieniach. `[ASSUMPTION]` agent; OWASP LLM01 stwierdza, że żadna metoda nie eliminuje ryzyka w pełni | średnia | brak testów; źródło ogólne (genai.owasp.org/llmrisk/llm01-prompt-injection/) | agent wykonuje polecenia z czatu (np. ujawnia token, gra wbrew właścicielowi); wymaga zmiany kontraktu lub wyłączenia czytania czatu przez agenta | testy adwersarialne w specyfikacji (wiadomości z poleceniami, próby wyciągnięcia tokenu) | Bartosz Wójcik | przed implementacją | untested |
| A-10 | Właściciel będzie używał panelu administratora do kontroli instancji (liczniki, konta) i uzna go za wystarczający zamiennik dotychczasowej kontroli. `[ASSUMPTION]` właściciel, potrzeba własna bez opisu zdarzeń ani danych o potrzebie poza jego wypowiedzią | niska | brak; wypowiedź właściciela 2026-10-31 | panel jest nieużywany; wystarczy CLI lub odczyt bazy, a koszt bramki i roli nie miał uzasadnienia | po pierwszym tygodniu na produkcji: czy właściciel otwiera panel i czego w nim brakuje | Bartosz Wójcik | unknown | untested |
| A-11 | Bootstrap administratora wyłącznie przez `admin:create` plus odrzucanie rejestracji na `ADMIN_EMAIL` (jednolity komunikat BR-16) zamyka przejęcie roli przez obcą rejestrację, w tym na publicznym serwerze. `[ASSUMPTION]` agent (korekta szkicu: wariant „rola po potwierdzeniu e-maila” nie zamykał wektora) | wysoka | analiza kodu: `UserService.register` przyjmuje dowolny e-mail, a link potwierdzający trafia na skrzynkę adresu; brak testu | obca osoba przejmuje panel i widzi e-maile wszystkich graczy | test integracyjny: rejestracja na `ADMIN_EMAIL` jest odrzucona jednolitym komunikatem, a `admin:create` przejmuje zajęte konto (nowe hasło, potwierdzony e-mail, unieważnione sesje); test jednostkowy normalizacji (wielkość liter, białe znaki) | Bartosz Wójcik | przed implementacją E08-S01 | untested |
| A-12 | Administrator nie zostanie bez dostępu po zapomnieniu hasła: odzyska je resetem BR-27 (e-mail jest potwierdzony przez `admin:create`) albo ponownym `admin:create`. `[ASSUMPTION]` agent; ryzyko: awaria poczty (Q-02, D-20) lub zmiana `ADMIN_EMAIL` na nieistniejący adres blokuje panel do czasu `admin:create` | niska | brak testu; `admin:create` wymaga dostępu operatora do serwera | właściciel traci dostęp do panelu; wychodzi wyłącznie przez CLI na serwerze | test integracyjny resetu hasła administratora; ręczne sprawdzenie `admin:create` na kopii produkcyjnej konfiguracji | Bartosz Wójcik | przed implementacją E08-S01 | untested |

## Kill criteria

Właściciel 2026-10-24: „przed realnym produktem będę próbował innych gier i technologii”. `[DOCUMENT]` `research/decisions/2026-10-24-accounts-and-data.md`
To zapowiedź kolejności nauki, a nie próg wyniku: nie ustalono, jaki wynik po udostępnieniu gry osobom z zewnątrz skłoni do zmiany ambicji. Zapowiedź może stać w napięciu z D-11 („rygor realnego produktu”); D-11 pozostaje aktywne, dopóki właściciel go nie nadpisze. Kill criteria bez zmian po dodaniu czatu (D-30); progu dla czatu też nie ustalono (A-07). Kill criteria bez zmian po dodaniu roli administratora (D-32); progu dla panelu nie ustalono (A-10).

## Hipotezy do sprawdzenia

Brak hipotez syntetycznych (nie było paneli `om-synthetic-users`).

## Pytania otwarte

| ID | Pytanie | Blokuje | Kto odpowie | Status |
|---|---|---|---|---|
| Q-01 | Mechanizm czasu rzeczywistego (WebSocket lub inny) dla partii i lobby; synchronizacja zegara, odświeżenie, ponowne połączenie. | tak — rozgrywka i lobby (#22–#26) | zespół techniczny, spike #30 | open |
| Q-02 | Dostawca wysyłki poczty w darmowym planie (D-20) i czy jego limit wystarczy. | tak — potwierdzenie e-maila i reset hasła (D-15); nie blokuje rejestracji ani gry (D-24) | zespół techniczny (#38) | open — koszt rozstrzygnięty 2026-10-24 (D-20) |
| Q-03 | Czy wznowienie partii po rozłączeniu działa w wybranym mechanizmie. | nie — wynika z Q-01 | zespół techniczny | open |
| Q-04 | Potwierdzenie, że partia zapisuje sposób powstania (`invite`/`lobby`). | — | właściciel | closed 2026-10-24 → D-21 |
| Q-05 | Kiedy i w jakiej formie informacja o przetwarzaniu danych. | — | właściciel | closed 2026-10-24 → D-22 (treść do przygotowania przed udostępnieniem S3) |
| Q-06 | Jaki wynik po udostępnieniu grze skłoni do zmiany ambicji (kill criteria), w tym jaki wynik licznika partii wg pary typów uczestników (konto, gość, agent, D-28) uzna właściciel za „ma sens”. | nie | właściciel | odpowiedź częściowa 2026-10-24 (patrz Kill criteria); próg wyniku nieustalony; licznik dodany 2026-10-31; zestawienie wg deklarowanej nazwy modelu agenta (BR-31) tylko pomocnicze; miejsce odczytu licznika: panel administratora (D-32, BR-37) — nie rozstrzyga progu |
| Q-07 | Kanał promocji i jego regulamin. | nie — dopiero przy udostępnieniu S3 | właściciel | open („nie wiem”, 2026-10-24) |
| Q-08 | Czy gra w przeglądarce telefonu jest w MVP. | — | właściciel | closed 2026-10-24 → BR-20 |
| Q-09 | Tożsamość klienta MCP, wydawanie i ważność jego tokenu oraz limity nadużyć dla klienta automatycznego (BR-29 identyfikuje gościa ciasteczkiem przeglądarki, klient MCP go nie ma). | tak — specyfikacja interfejsu MCP (D-28) | właściciel (decyzja), zespół techniczny (wariant) | closed 2026-10-31 → D-29 (limity liczbowe początkowe, do korekty po danych) |
| Q-10 | Kiedy i w jakiej formie zgłaszanie nadużyć i moderacja czatu (wyzwalacz: pierwszy incydent nękania). | nie | właściciel | open |
| Q-11 | Wymagania prawne dla czatu (DSA, RODO, wiek użytkowników) przed udostępnieniem osobom z zewnątrz; strona o przetwarzaniu danych (D-22) ma objąć treść czatu, retencję i brak moderacji. Rozeznanie nie rozstrzyga; to nie jest porada prawna. | nie dla znajomych (jak D-22); tak przed S3 | właściciel | open |
| Q-12 | Harmonogram `db:cleanup` na Mikrusie. Od 2026-10-31 działa cron `/etc/cron.d/gomoku-cleanup` co godzinę, pierwszy przebieg zakończył się `exit=0`. Obietnica kasowania z BR-34 wymaga działającego crona. | tak — udostępnienie czatu z obietnicą kasowania | Bartosz Wójcik | closed |
| Q-13 | Retencja dziennika audytowego (BR-38) i dostęp do niego (kto czyta, czy administrator widzi własne wpisy, czy wpisy o usuniętych kontach wygasają). | tak — historyjka z dziennikiem audytowym i nadawaniem roli (poza v1); nie blokuje v1 (odczyt) | właściciel | open |
| Q-14 | Wymagania prawne dostępu administratora do danych użytkowników, w tym do e-maili (RODO); strona o przetwarzaniu danych (D-22) ma objąć dostęp administratora. Rozeznanie nie rozstrzyga; to nie jest porada prawna. | nie dla znajomych (jak D-22); tak przed S3 | właściciel | open |
| Q-15 | Co dzieje się z poprzednim administratorem instalacyjnym po zmianie `ADMIN_EMAIL`: propozycja agenta w BR-35 (traci status instalacyjny, rolę zachowuje tylko, jeśli nadana w bazie), niepotwierdzona przez właściciela. | nie — v1 ma jedną rolę instalacyjną; tak przed nadawaniem roli (BR-36) | właściciel | open |

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
6. Właściciel produktu: po S3 odczyt (w panelu administratora, D-32) licznika zakończonych partii wg pary typów uczestników (konto, gość, agent) i krótka rozmowa z osobami, które zagrały z agentem — sprawdza A-04 i A-05 (Q-06); wymaga kanału (Q-07).
7. Właściciel produktu: sprawdzić wymagania prawne dla czatu (DSA, RODO, wiek) przed S3 (Q-11) oraz dostępu administratora do danych kont (Q-14); cron `db:cleanup` na Mikrusie działa od 2026-10-31 (Q-12 zamknięte); po S3 odczytać licznik partii z wiadomością (A-07, niezatwierdzony).

## Następna niepewność

Najbliższą decyzją blokującą implementację silnika gry jest mechanizm czasu rzeczywistego (Q-01,
spike #30). Przed implementacją potwierdzenia e-maila i resetu hasła trzeba wybrać dostawcę poczty
(Q-02). Rejestracji (#19) i logowania (#20) nic nie blokuje; zakres #19 wymaga aktualizacji o
stan „niepotwierdzony e-mail” (BR-23), a backlog — nowych historyjek dla potwierdzenia e-maila,
resetu i zmiany hasła oraz usunięcia konta.

Dla gry z własnym agentem (D-28) tożsamość klienta, token i limity nadużyć rozstrzyga D-29 (Q-09 zamknięte);
wartości limitów są początkowe i wymagają korekty po pierwszych partiach, a wiedzę o popycie da dopiero licznik
partii po S3 (A-04, A-05, Q-06).

Dla czatu w partii (D-30) cron `db:cleanup` na Mikrusie działa od 2026-10-31 (Q-12 zamknięte), więc obietnica kasowania z BR-34 jest wykonalna, o ile cron działa. Przed S3 trzeba sprawdzić wymagania prawne (Q-11); wiedzę o tym, czy gracze w ogóle piszą i czy wyłączenie czatu wystarcza wobec obcych z lobby, da dopiero udostępnienie (A-07, A-08).

Dla roli administratora (D-32) v1 jest mały i nie ma blokera decyzyjnego; przed implementacją E08-S01 trzeba sprawdzić testem A-11 (rejestracja na `ADMIN_EMAIL` odrzucona, `admin:create` przejmuje zajęte konto) i zamknąć dziurę #152 bramką z BR-37. Przed kolejnymi historyjkami (nadawanie roli, dziennik, edycja i usuwanie kont) właściciel rozstrzyga Q-13 i Q-15, a przed S3 Q-14. Czy właściciel faktycznie korzysta z panelu, pokaże dopiero użycie (A-10).
