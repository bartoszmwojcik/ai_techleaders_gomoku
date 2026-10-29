# Prototyp discovery: partia z zaproszenia, etapy A i B (revision-002)

- Brief: `.ai/specs/product-brief.md` (po zmianie 2026-10-26: D-24…D-26, BR-26…BR-28). Przepływ: Key flow „zaproszenie znajomego do partii”, od utworzenia zaproszenia po koniec partii i rewanż. Etap A (zaproszenie i oczekiwanie) działa jak w rewizji 001; etap B (plansza, ruchy, zegary, wynik, poddanie, rewanż, powrót po rozłączeniu) jest nowy.
- Data: 2026-10-29. Rewizja druga slugu `game-from-invitation`. **Poprzednia rewizja:** `.ai/prototypes/discovery/game-from-invitation/revision-001` (etap A, zatwierdzona przez właściciela bez uwag, `previousRevision` w `prototype.json`). Rewizja 001 pozostaje bez zmian. Zakres etapu B zatwierdzony przez właściciela 2026-10-29.
- Mapa ekranów: `lekcja-07/mapa-ekranow-partia.md` (ID p01–p07 i s07 z mapy; sekcje 0a, 0b, 1, 1a, 2, 3). Specyfikacje: `.ai/specs/2026-10-24-game-invitations.md` (#21), `.ai/specs/2026-10-25-game-moves-win-detection.md` (#22: UI/UX, Q7, Q8), `.ai/specs/2026-10-26-game-clock.md` (#23: UI/UX, Q1), `.ai/specs/2026-10-29-game-reconnection.md` (#24: Q1–Q5), `.ai/specs/2026-10-29-game-resignation.md` (Q1–Q6), `.ai/specs/2026-10-29-game-rematch.md` (Q1–Q8).
- Panel syntetyczny (`--panel-report`): **nie podano.** Hipotezy `[SYNTHETIC]` nie weszły do prototypu ani do tego dokumentu; w interfejsie nie ma treści z panelu, hipotez ani oczekiwanych reakcji.
- Wszystkie dane są fikcyjne (Ala_7, Kuba_P, kod `ABCD-EFGH`, adres `https://gomoku.example/…`, czas demo stały). Prototyp nie jest dowodem popytu ani gotowości produkcyjnej i nie spełnia Definition of Ready.

## Co się zmieniło względem rewizji 001

- Numer rewizji w pasku i tytule: „Rewizja 2”.
- **Jedyna zmiana zachowania w etapie A:** stan „Partia gotowa” (p04.2) zamiast komunikatu „Plansza pojawi się w etapie B” ma przycisk „Przejdź do planszy”, który prowadzi na planszę (p05). Przycisk „Wróć do panelu głównego” został. Link „Plansza (poza tym etapem)” zniknął. Strona „Poza tym…” z `from=game` pokazuje teraz „Twoja inna partia” (dla BR-13), opisaną jako „Poza tym prototypem”.
- Nowe: ekrany p05 (plansza 15×15 z zegarami, ruchami i poddaniem), p06 (wynik i rewanż), p07.1, p07.3, p07.4 oraz kontrolki „Test state” dla etapu B. Pozostałe kontrolki i stany etapu A bez zmian.
- Zachowane assumpcje A-01…A-11 z rewizji 001 (opis niżej). A-03 („Partia gotowa kończy etap A i nie udaje planszy”) jest **zastąpiona** przez A-18 (decyzja właściciela o zakresie etapu B z 2026-10-29).

## Aktor, start, sukces

- Aktorzy: dwóch graczy gotowej partii: twórca (Ala_7) i zaproszony (Kuba_P, konto) albo gość (bez konta, token jednej partii). Oglądający wybiera rolę w „Test state”; stan partii jest wspólny.
- Start: panel główny `#/home` (jak w 001); do planszy dochodzi się z p04.2 przyciskiem „Przejdź do planszy”.
- Sukces: partia dochodzi do końca (wygrana, przegrana, remis, czas, poddanie), a rewanż tworzy nową partię z odwróconymi kolorami albo gracze wracają do panelu głównego.

## Ekrany i stany w zakresie (etap B)

Na ekranie „Test state” stan jest pokazywany jako lista ID rozdzielona ` + ` (np. `p05.2 + p05.5`): pierwszy to główny stan, kolejne to nakładki, które właśnie obowiązują (patrz A-21).

| Ekran | Trasa | Stany (ID z mapy) |
|---|---|---|
| p05 Partia w toku | `#/game` (faza „w toku”) | p05.1 Twój ruch (czarne/białe), p05.2 ruch przeciwnika, p05.3 mało czasu (<60 s: jaskrawy kolor i grubszy obrys zegara, bez tekstu, ukryty komunikat `aria-live` raz), p05.4 dotyk: zaznaczone przecięcie i „Postaw kamień”, p05.5 mysz: jedno kliknięcie, p05.6 ruch w drodze, p05.7 błąd sieci i „Spróbuj ponownie” (ten sam ruch), p05.8 nieaktualny widok albo nie Twoja kolej, p05.9 „To pole jest już zajęte”, p05.10 „Wróciłeś do partii”, p05.11 stałe ostrzeżenie gościa, p05.12 karta w tle, p05.13 dialog poddania, p05.14 poddanie w toku |
| p06 Koniec partii | `#/game` (faza „koniec”) | p06.1 wygrana (linia), p06.2 przegrana, p06.3 przegrana na czas, p06.4 remis, p06.5 powrót po końcu, p06.6 gość po końcu (1 h), p06.7 gość po 1 h (404), p06.8 przeciwnik poddał, p06.9 Ty poddałeś, p06.10 „Rewanż” i „Wróć do panelu głównego”, p06.11 rewanż zaproponowany (do 5 min, wycofanie), p06.12 propozycja od przeciwnika („Przyjmij”/„Odrzuć”), p06.13 odrzucone albo przeciwnik wyszedł, p06.14 wygasł po 5 min, p06.15 rewanż gościa z nowym tokenem |
| p07 Brak dostępu i błędy | `#/game` | p07.1 ładowanie (szkielet), p07.2 partia nie istnieje albo brak dostępu, p07.3 gość w innej przeglądarce (to samo 404, zegar biegnie), p07.4 baza niedostępna |
| Etap A (bez zmian poza p04.2) | `#/home`, `#/join`, `#/invite/…`, `#/game` | p01.x, p02.x, s07.x, p03.x, p04.x z rewizji 001 |

Przyjęcie rewanżu tworzy **nową** partię (nowy stan p05.1 albo p05.2 z odwróconymi kolorami, zegary 10:00). Gdy kontrolka „Przeciwnik ma inną partię (BR-13)” jest włączona, przyjęcie propozycji kończy się 409 z linkiem („Masz już partię”, p06.12).

## Poza zakresem

- Historia partii (#27), Lobby (E03) i Historia w nagłówku: etykieta „Poza tym etapem” z powrotem do panelu.
- Logowanie i rejestracja: dialog „Poza tym prototypem” z powrotem do zaproszenia (jak w 001).
- Inna partia gracza (BR-13): strona „Twoja inna partia”, etykieta „Poza tym prototypem”, powrót do partii. Prototyp symuluje jedną partię naraz (A-09, A-26).

## Reguły i decyzje zachowane (bez zmian)

| ID | Treść (skrót) | Status | Gdzie w prototypie |
|---|---|---|---|
| BR-01, BR-11 | w partii dokładnie dwóch graczy; zaproszenie jednorazowe | potwierdzone | po rozpoczęciu partii link dla osoby spoza partii jest nieważny |
| BR-04 | 10 minut na gracza | potwierdzona | zegary 10:00 na starcie partii i po rewanżu |
| BR-05 | maleje tylko zegar gracza na ruchu | potwierdzona | zegar biegnie tylko u gracza na ruchu (kontrolka „Odliczaj zegar”) |
| BR-06 | czas biegnie także podczas rozłączenia | potwierdzona | „Karta w tle” odejmuje nieobecność; p07.3: zegar biegnie mimo 404 |
| BR-07 | zegar 0 = przegrana | potwierdzona | p06.3 |
| BR-10 | swobodne gomoku: pięć lub więcej w linii wygrywa | potwierdzona | wykrywanie w poziomie, pionie, na 2 przekątnych; 6 w linii wygrywa |
| BR-13, D-10 | co najwyżej jedna aktywna partia | potwierdzona | p01.3, s07.6, 409 przy przyjęciu rewanżu (p06.12) |
| BR-20 | działa na telefonie | potwierdzona | 320 i 360 px bez poziomego przewijania |
| BR-21 | poddanie istnieje (dokończ albo poddaj partię) | potwierdzona | p05.13, p05.14, p06.9 |
| BR-22 | gość: ostrzeżenie przed i w trakcie, bez historii, token do końca partii + 1 h | potwierdzona | p05.11, p06.6, p06.7, p07.3, p06.15 |
| BR-24 | przeciwnik gościa nazwany „Gość” (L14) | potwierdzona / decyzja z mapy | zegar przeciwnika, p05, p06 |
| BR-26 | konto aktywne bez potwierdzenia e-maila | potwierdzona | jak w 001 |
| D-07, D-21, D-23 | zaproszenie + lobby, sposób powstania partii, logowanie z wyjątkiem gościa | potwierdzone | jak w 001; rewanż bez zaproszenia i kodu |

Decyzje z mapy i specyfikacji (źródła w nawiasach): L04, L13, L14, L20 (mapa 0a); L07 (#23 Q1), L09 (#24 Q2, Q5), L12 i L23 (poddanie Q1, Q2), L21, L22, L24 (rewanż Q3, Q4, Q5); #22 Q7 (dotyk: dwa kroki, mysz: jedno kliknięcie), #22 Q8 i #21 Q20 (zegar rusza, gdy obaj mają `seen_at`), #24 Q1 (bez wskaźnika „przeciwnik rozłączony”: zegar przeciwnika po prostu biegnie), rewanż Q1 (po każdym zakończeniu), Q2 (do 5 min), Q6 (jak zwykła partia).

## Założenia `[ASSUMPTION]`

**A-01…A-11 pochodzą z rewizji 001 i obowiązują bez zmian** (`.ai/prototypes/discovery/game-from-invitation/revision-001/README.md`), z wyjątkiem A-03 (zastąpiona przez A-18) i uzupełnienia A-09 przez A-26. Nowe założenia rewizji 002 (numeracja ciągła):

| ID | Założenie | Dlaczego potrzebne | Jak sprawdzić |
|---|---|---|---|
| A-12 | Plansza 15×15 jest klikalna. **Naprawdę działają:** stawianie kamienia tylko na wolnym polu (zajęte samo daje p05.9), naprzemienność tur (ruch nie w swojej turze samo daje p05.8), wykrywanie pięciu lub więcej kamieni w poziomie, pionie i na dwóch przekątnych (swobodne gomoku, BR-10) z podświetleniem linii wygrywającej, oznaczenie ostatniego ruchu i tego, kto ma ruch. **Symulowane kontrolkami „Test state”:** ruchy przeciwnika, remis (skrót), losowanie koloru, zdarzenia serwera, zdarzenia przeciwnika, odpytywanie i karta w tle, reguły systemowe (BR-13, token gościa, współbieżność, idempotencja). Ruchy przeciwnika biorą pola z jednego z dwóch stałych scenariuszy: „rozproszone” (nigdy nie ułoży pięciu, więc wygrać może każda strona) albo „piątka” (kolejne pola w jednym rzędzie, więc przeciwnik może dać piątkę). | brak serwera; prototyp ma pokazać prawdziwy przebieg wygranej, a nie obraz | wejść w pełną partię myszą i klawiaturą; walk-log W20–W31, L01–L02 |
| A-13 | Zegar domyślnie jest statyczny (10:00) i zmienia się kontrolkami „+30 s”, „+1 min”, „Skocz do 0:50”, „Minął czas” (dotyczą mojego albo przeciwnika zegara, wybór w „Zegar dotyczy”). Dodatkowa kontrolka „Odliczaj zegar” (domyślnie wyłączona) włącza odliczanie na żywo dla gracza na ruchu z przyspieszeniem x10 (domyślnie), x30 albo x1. Format `m:ss`, zaokrąglanie w górę. Poniżej 60 s: jaskrawy kolor cyfr i grubszy obrys, bez widocznego tekstu i bez dźwięku, ukryty `aria-live="polite"` ogłasza raz „Zostało mniej niż minuta” (osobno dla własnego zegara). Kolor ostrzegawczy (`#ff2d00`) to jedyny kolor w prototypie poza szarością; DS go zastąpi tokenem. Oznaczenie biegu zegara to słowo („Twój ruch”/„Ruch przeciwnika”) i obrys 4 px, nie tylko kolor. | #23 nie podaje progu wyglądu, a prawdziwy zegar uniemożliwiłby przegląd | użyć kontrolek; ocena czytelności na prawdziwym telefonie i z czytnikiem ekranu (nie sprawdzono, patrz „Nie sprawdzono”) |
| A-14 | „Urządzenie wejścia” w „Test state” przełącza „Mysz (jedno kliknięcie)” i „Dotyk (dwa kroki)”: pierwsze dotknięcie zaznacza przecięcie (podgląd kamienia, p05.4), drugie dotknięcie tego samego pola albo przycisk „Postaw kamień” wysyła ruch. Klawiatura: strzałki przesuwają fokus (roving tabindex), Enter działa jak kliknięcie w danym trybie. Prototyp nie wykrywa `pointer: coarse`. | prototyp na komputerze nie ma ekranu dotykowego | zbudować hook w implementacji; test na telefonie |
| A-15 | Skróty „Pokaż wygraną”, „Pokaż przegraną”, „Pokaż remis”, „Minął czas”, „Przeciwnik poddał się” **nadpisują** planszę gotowym układem (pięć kamieni zwycięzcy w rzędzie 8, kolumny F–J, i cztery kamienie drugiej strony; remis: pełna plansza 225 pól bez piątki) i kończą partię. Pełna plansza do remisu jest niepraktyczna w ręcznej grze. | pokazanie p06.x bez rozgrywania całej partii | porównanie ze skrótem: wygrana ręczna daje ten sam ekran |
| A-16 | Rewanż steruje przeciwnik kontrolkami („Przeciwnik proponuje rewanż”, „…wycofuje propozycję”, „…przyjmuje”, „…odrzuca”, „…wychodzi do panelu”, „+5 min” z fieldsetu zegara demo). Przyjęcie rewanżu przechodzi **od razu na planszę** nowej partii (pomija p04: zakładam, że obaj gracze są na stronie, `seen_at` ustawione, zegary 10:00). Kolory są odwrócone względem poprzedniej partii (rewanż Q6 mówi, że dalej obowiązuje „zegar rusza po `seen_at` obu” i 15 min na otwarcie; prototyp tego nie pokazuje, to kontynuacja etapu A). | spec rewanżu opisuje „nową partię `active`”, ale nie ekran po przyjęciu | decyzja właściciela, czy nowa partia ma przechodzić przez p04.1/p04.2 |
| A-17 | Treści bez źródła w specyfikacjach (propozycje do zatwierdzenia): p05.8 „Teraz ruch przeciwnika. Plansza została odświeżona.” (nie Twoja kolej) i „Plansza była nieaktualna i została odświeżona. Spróbuj ponownie.” (`STALE_MOVE`); p05.9 „To pole jest już zajęte” (L08; zgodnie z poleceniem właściciela); błąd sieci „Nie udało się połączyć z serwerem. Spróbuj ponownie.” (L02); „Wysyłanie ruchu…”; „Zaznaczono: Kolumna K, rząd 7. Naciśnij „Postaw kamień”.”; L15 „Wylosowano: Ty czarne/białe” tylko do pierwszego ruchu i stały status „Grasz czarnymi/białymi” pod planszą; po rewanżu „Rewanż: kolory zostały zamienione. Grasz …”; banery wyniku: „Wygrałeś”, „Przegrałeś”, „Remis”, „Wygrałeś — przeciwnikowi skończył się czas”, „Przegrałeś — skończył się Twój czas” (z #23), „Wygrałeś, przeciwnik poddał partię”, „Przegrałeś, poddałeś partię” (z poddania). L02 dla odpytywania: po błędzie ponawianie z licznikiem „próba n z 3”, po 3 nieudanych baner błędu i „Sprawdź teraz”. | brak treści w specyfikacjach | decyzja o treści po obejrzeniu |
| A-18 | p04.2 „Partia gotowa” prowadzi na planszę przyciskiem „Przejdź do planszy” (zastępuje A-03). Losowanie koloru następuje w chwili kliknięcia tego przycisku, według kontrolki „Wylosowano: Ty czarne / Ty białe” (odnosi się do oglądającego, który kliknął). Zegary startują od razu (obaj na stronie). Plansza oczekuje czarnych jako pierwszych. | spec #22 Q1 losuje kolor przy dołączeniu; prototyp robi to w widocznym kroku | porównanie z implementacją #22 |
| A-19 | Rewanż, treści i skutki (propozycje): p06.10 „Rewanż to nowa partia z odwróconymi kolorami: zagrasz {białymi/czarnymi}.” przy przycisku „Rewanż”; p06.11 „Zaproponowano rewanż. Czekamy na odpowiedź przeciwnika (do 5 min).” z „Wycofaj propozycję”; p06.12 „{Nazwa} proponuje rewanż. Kolory zostaną zamienione.” z „Przyjmij”/„Odrzuć”; p06.13 „Zaproszenie do rewanżu odrzucone” z powodem („Przeciwnik odrzucił rewanż.” albo „Przeciwnik wyszedł do panelu głównego.”) i przyciskiem „Wróć do panelu głównego”; p06.14 „Zaproszenie do rewanżu wygasło (po 5 minutach).” z „Zaproponuj ponownie”. „Wróć do panelu głównego” z trwającą propozycją zapisuje ją jako odrzuconą (L21: aktywne wyjście). Gdy sam odrzucę propozycję, wracam do p06.10 z komunikatem „Odrzuciłeś propozycję rewanżu.” i mogę zaproponować od nowa. | rewanż Q3 mówi tylko „Zaproszenie do rewanżu odrzucone”; reszta to propozycje | decyzja o treści |
| A-20 | „Karta w tle” symuluje nieobecność N sekund: odpytywanie wstrzymane (p05.12, ok. 0,8 s w prototypie), po powrocie natychmiastowy odczyt: zegar gracza na ruchu pomniejszony o N s. Przy N > 30 s pojawia się „Wróciłeś do partii. Twój zegar: m:ss.” (`role="status"`, znika po następnym ruchu albo po 8 s). Gdy czas wyczerpał się w nieobecności, od razu p06.3, bez komunikatu „Wróciłeś”. Próg 30 s z #24 Q2. | prawdziwa karta w tle jest niepraktyczna w przeglądzie | prawdziwy test na telefonie |
| A-21 | Wskaźnik „Bieżący ekran i stan” pokazuje kilka ID naraz (np. `p05.1 + p05.5`, `p06.1 + p06.10`), bo stany nakładają się (tryb wejścia, mało czasu, dialog, gość, rewanż). Reguła: pierwszy to p05.1/p05.2 albo wynik p06.x; dodatkowo p05.5 (mysz i Twoja tura), p05.4 (dotyk, zaznaczone pole), p05.3 (mój zegar <60 s), p05.11 (gość), p05.12/p05.10/p05.13/p05.14/p05.6/p05.7/p05.8/p05.9 (zdarzenia), p06.5 (po odświeżeniu), p06.6 (gość), p06.10…p06.15 (rewanż). To tylko kontrolka testowa, nie funkcja produktu. | mapa ma osobne ID dla nakładających się stanów | n/d |
| A-22 | Poddanie: przycisk „Poddaj partię” pod planszą (p05, także w turze przeciwnika i przed pierwszym ruchem); dialog z tytułem „Czy na pewno chcesz się poddać?” i treścią „Przeciwnik wygra partię.”, przyciski „Wróć do gry” (fokus, po lewej) i „Poddaj partię”; Esc zamyka i zwraca fokus na przycisk; w toku „Poddawanie…” (p05.14); błąd sieci pokazuje alert w dialogu i zmienia przycisk na „Spróbuj ponownie” (ponowienie jest idempotentne). Kolejność przycisków to założenie (spec listuje „Poddaj partię” / „Wróć do gry”). | Q2 podaje treść i fokus, nie kolejność | decyzja o układzie |
| A-23 | p07.1: szkielet pojawia się, gdy włączona jest kontrolka „Wolne ładowanie partii” i wchodzi się na `/game` z innej trasy (1,5 s). p07.3: kontrolka „Gość w innej przeglądarce” pokazuje identyczny ekran 404 jak p07.2 (bez ujawniania, że partia istnieje); informacja o biegnącym zegarze jest tylko w „Test state”. p07.4: „Nie udało się połączyć z serwerem. Spróbuj ponownie.” z przyciskiem i linkiem do panelu (L02). Gość po 1 h od końca (kontrolka „+1 h”) widzi ten sam 404 (p06.7). | brak treści | decyzja o treści |
| A-24 | Wygląd: czarne kamienie wypełnione, białe z obrysem, ostatni ruch jako mały kwadrat w kamieniu, linia wygrywająca jako obrys 3 px i ciemniejsze tło pól. Plansza zajmuje pełną szerokość (na wąskich ekranach wychodzi poza padding strony do 320 px, A-DS: min. 320 px, L18). Szarość i system font, jak w 001. | prototyp neutralny, bez tokenów | porównanie z DS w kolejnym kroku |
| A-25 | BR-13 przy przyjęciu rewanżu (409): alert „Masz już partię” z linkiem „Przejdź do partii” (strona „Twoja inna partia”, „Poza tym prototypem”), propozycja trwa (rewanż Q4). Kontrolka „Przeciwnik ma inną partię” działa przy przyjęciu przeze mnie; gdy to przeciwnik przyjmuje mój rewanż i ma inną partię, widać tylko komunikat w „Test state” (jego 409 nie jest dla mnie widoczny). | spec nie opisuje widoku 409 | decyzja o treści |
| A-26 | Prototyp symuluje jedną partię naraz (A-09): rewanż zastępuje zakończoną partię nową, a „Reset” czyści wszystko. Zakończona partia pozostaje dostępna dla konta bez limitu czasu (#24 Q4); dla gościa do 1 h (kontrolka „+1 h”). Odświeżenie strony nie zmienia stanu (stan żyje w pamięci). | uproszczenie modelu | n/d |

## Mapa ekranów i stanów (akcja, następny stan)

Etap A (z 001, bez zmian poza p04.2):

| Stan | Akcja | Następny stan | Reguły/założenia |
|---|---|---|---|
| p04.2 | „Przejdź do planszy” | p05.1 albo p05.2 (kolor z losowania) | A-18 |
| p04.2 | „Wróć do panelu głównego” | panel główny | |

Etap B:

| Stan | Akcja | Następny stan | Reguły/założenia |
|---|---|---|---|
| p05.1 (mysz) | kliknięcie pustego pola, Enter na polu | p05.6, potem p05.2 (albo p06.1 przy piątce, p06.4 przy pełnej planszy) | A-12, A-14, BR-10 |
| p05.1 (dotyk) | dotknięcie pola | p05.4 (zaznaczone); drugie dotknięcie tego pola, Enter albo „Postaw kamień” → p05.6 | A-14, #22 Q7 |
| p05.1 | kliknięcie zajętego pola | p05.9 „To pole jest już zajęte” (bez zmiany planszy, nadal Twój ruch) | A-12, A-17 |
| p05.2 | kliknięcie pola | p05.8 „Teraz ruch przeciwnika…” | A-12, A-17 |
| p05.2 | „Przeciwnik gra ruch” (Test state) | p05.1 (albo p06.2 przy jego piątce) | A-12 |
| p05.6 | „Następny ruch: błąd sieci” | p05.7 z „Spróbuj ponownie” → ten sam ruch → p05.6 → p05.2 | #22 Q4 |
| p05.6 | „Następny ruch: nieaktualny widok” | p05.8 „Plansza była nieaktualna…”, ruch niezapisany | A-17 |
| p05.1/p05.2 | „Skocz do 0:50” albo „Odliczaj zegar” | p05.3 (zegar <60 s, ukryty `aria-live` raz) | A-13, #23 Q1 |
| p05.x | „Minął czas” (mój / przeciwnika), zegar 0 przy odliczaniu | p06.3 / p06.1 („Wygrałeś — przeciwnikowi skończył się czas”) | BR-07 |
| p05.x | „Karta w tle 20 s” | p05.12, potem stan z zegarem pomniejszonym, bez komunikatu | A-20, #24 Q2 |
| p05.x | „Karta w tle 45 s” | p05.12, potem p05.10 „Wróciłeś do partii” | A-20 |
| p05.x | „Poddaj partię” | p05.13 (dialog, fokus „Wróć do gry”) | A-22 |
| p05.13 | „Wróć do gry” albo Esc | p05.x, fokus na „Poddaj partię” | A-22 |
| p05.13 | „Poddaj partię” | p05.14, potem p06.9 (błąd sieci: alert i „Spróbuj ponownie”) | BR-21 |
| p05.x | „Przeciwnik poddał się” | p06.8 | |
| p05.x | „Pokaż wygraną / przegraną / remis” | p06.1 / p06.2 / p06.4 | A-15 |
| p06.x | „Odśwież stronę partii” | p06.5 (wynik, bez ruchu) | #24 Q3 |
| p06.x (gość) | bez akcji; „+1 h” | p06.6; po 1 h p06.7 (404) | BR-22, #21 K8 |
| p05.x (gość) | „Gość w innej przeglądarce” | p07.3 (to samo 404, zegar biegnie) | BR-06 |
| p06.10 | „Rewanż” | p06.11 | rewanż Q1 |
| p06.11 | „Wycofaj propozycję” | p06.10 | A-19 |
| p06.11 | „Przeciwnik przyjmuje” | nowa partia p05.2 albo p05.1 (kolory odwrócone) | rewanż Q2, Q6, A-16 |
| p06.11 | „Przeciwnik odrzuca” / „wychodzi do panelu” | p06.13 od razu | L13, L21 |
| p06.11 | „+5 min” | p06.14 „Zaproponuj ponownie” → p06.10 | rewanż Q3 |
| p06.10 | „Przeciwnik proponuje rewanż” | p06.12 | |
| p06.12 | „Przyjmij” | nowa partia (kolory odwrócone); przy BR-13: alert 409 z linkiem, nadal p06.12 | rewanż Q4, A-25 |
| p06.12 | „Odrzuć” | p06.10 z komunikatem „Odrzuciłeś propozycję rewanżu.” | A-19 |
| p06.13 | „Wróć do panelu głównego” | panel główny | L13 |
| p06.10 | „Wróć do panelu głównego” | panel główny (trwająca propozycja zapisana jako odrzucona) | L21 |
| p06.x (gość) | rewanż przyjęty | nowa partia z nowym tokenem (p06.15), „Rozumiem” | rewanż Q5, A-16 |
| p07.1 | po 1,5 s | p05 / p06 | A-23 |
| p07.2 | „Wróć na stronę główną” | panel (albo s01) | N-05 |
| p07.4 | „Spróbuj ponownie” | ten sam błąd, dopóki baza „niedostępna”; po ustąpieniu plansza | A-23 |

## Kontrolki „Test state” (kontrolki prototypu, nie funkcje produktu)

Kontrolki etapu A (bez zmian): rola oglądającego, wynik tworzenia partii, wynik kodu na `/join`, stan zaproszenia, schowek niedostępny, „Udostępnij” niedostępne, błąd odpytywania (teraz także w partii), „+15 min bez otwarcia”, „+24 h”, „Twórca otwiera stronę partii”.

Nowe: „+5 min”, „+1 h”; **Partia w toku:** losowanie koloru (Ty czarne / Ty białe), urządzenie wejścia (mysz / dotyk), scenariusz ruchów przeciwnika (rozproszone / piątka), „Przeciwnik gra ruch”, następny ruch: błąd sieci i nieaktualny widok, następne poddanie: błąd sieci, baza niedostępna, wolne ładowanie partii, gość w innej przeglądarce; **Zegar partii:** „Zegar dotyczy”, „+30 s”, „+1 min”, „Skocz do 0:50”, „Minął czas”, „Odliczaj zegar” i przyspieszenie; **Wynik:** „Pokaż wygraną/przegraną/remis”, „Przeciwnik poddał się”, „Odśwież stronę partii”; **Karta w tle:** 20 s i 45 s; **Rewanż (przeciwnik):** proponuje, wycofuje, przyjmuje, odrzuca, wychodzi do panelu, „Przeciwnik ma inną partię (BR-13)”; „Reset symulacji”.

## Jak otworzyć i zresetować

Otwórz plik `index.html` w przeglądarce (adres `file://`; nic nie jest ładowane z sieci, nic nie jest zapisywane w pamięci przeglądarki). Szybka droga do planszy: „Utwórz zaproszenie” → rola „Kuba_P” → `#/invite/ABCD-EFGH` → „Dołącz do partii” → „Twórca otwiera stronę partii” → rola „Ala_7” → „Przejdź do planszy”. Przycisk „Reset symulacji” przywraca start (panel główny, rola Ala_7, czas 10:00, domyślne kontrolki, brak partii). Odświeżenie strony także resetuje stan.

## Weryfikacja

**Status: weryfikacja przeglądarkowa w toku.** Wynik (walk-log, zrzuty, lista sprawdzonych i niesprawdzonych elementów) zostanie dopisany w kolejnym commicie. Do tego czasu `verification` w `prototype.json` to `not-run`; poprzedni szybki test dymny potwierdził otwarcie, przejście p04.2 → p05, ruch myszą i zmianę tury.
