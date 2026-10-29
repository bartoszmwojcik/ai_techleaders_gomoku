# Prototyp discovery: partia z zaproszenia, etap A (revision-001)

- Brief: `.ai/specs/product-brief.md` (po zmianie 2026-10-26: D-24…D-26, BR-26…BR-28). Przepływ: Key flow „zaproszenie znajomego do partii”, etap A z podziału mapy: **utworzenie zaproszenia i oczekiwanie** (etap B: plansza, ruchy, zegary, wynik, poddanie, rewanż, powrót po rozłączeniu, nie jest w tej rewizji).
- Data: 2026-10-29. Rewizja pierwsza nowego slugu `game-from-invitation`; poprzednia rewizja: brak (`previousRevision: null`). Granica symulacji zatwierdzona przez właściciela 2026-10-29.
- Mapa ekranów: `lekcja-07/mapa-ekranow-partia.md` (ID p01–p04 i s07 z mapy; sekcje 0a, 0b, 1, 1a, 2, 3). Specyfikacje: `.ai/specs/2026-10-24-game-invitations.md` (#21: UI/UX, Edge Cases, Q3, Q5, Q6, Q11–Q13, Q18–Q22), `.ai/specs/2026-10-26-game-clock.md` (#23) i `.ai/specs/2026-10-29-game-reconnection.md` (#24), tylko pod kątem stanów p03/p04.
- Panel syntetyczny (`--panel-report`): nie podano. Hipotezy `[SYNTHETIC]` nie weszły do prototypu ani do tego dokumentu.
- Wszystkie dane są fikcyjne (Ala_7, Kuba_P, kod `ABCD-EFGH`, adres `https://gomoku.example/…`, czas stały). Prototyp nie jest dowodem popytu ani gotowości produkcyjnej i nie spełnia Definition of Ready.

## Aktor, start, sukces

- Aktorzy: zalogowany twórca zaproszenia (Ala_7) oraz znajomy: zalogowany (Kuba_P), gość (bez konta) albo niezalogowany.
- Start: panel główny `#/home`, rola „Ala_7”, czas „teraz” = poniedziałek 2026-10-26 10:00.
- Sukces: twórca tworzy zaproszenie (link i kod `ABCD-EFGH`), znajomy dołącza linkiem albo kodem, obaj widzą „Partia gotowa” albo „Czekamy, aż {nazwa} otworzy partię…”. „Partia gotowa” kończy etap A komunikatem „Plansza pojawi się w etapie B” i przyciskiem „Wróć do panelu głównego”.

## Ekrany i stany w zakresie

| Ekran | Trasa | Stany (ID z mapy) |
|---|---|---|
| Panel główny (minimalny cel powrotów) + p01 Utworzenie partii | `#/home` | s04, p01.1 przycisk, p01.2 tworzenie, p01.3 masz już partię, p01.4 masz oczekującą partię, p01.5 limit, p01.6 błąd serwera, p01.7 brak sieci |
| p02 Kod zaproszenia | `#/join` | p02.1 pole, p02.2 za krótki, p02.3 limit prób, p02.4 kod nieważny (przejście na s07.9), p02.5 sprawdzanie |
| s07 Zaproszenie | `#/invite/ABCD-EFGH` | s07.1 niezalogowany (Zaloguj się / Załóż konto / Graj jako gość), s07.2 ostrzeżenie gościa + „Rozumiem, graj jako gość”, s07.3 zalogowany „Dołącz do partii” (bez opcji gościa), s07.4 już uczestnik i s07.5 własne zaproszenie (przekierowanie do partii), s07.6 „Masz już partię”, s07.7 „Anuluj moją partię i dołącz”, s07.8 limit prób, s07.9 nieważne. Numeracja s07.x w tym dokumencie porządkuje stany z mapy E01; w interfejsie widać tylko stan p/s w „Test state” |
| p03 Oczekiwanie twórcy | `#/game` (faza „czeka”) | p03.1 domyślny, p03.2 skopiowano, p03.3 brak schowka (zaznaczenie), p03.4 „Udostępnij” ukryty, p03.5 przeciwnik dołączył, p03.6 dialog anulowania, p03.7 anulowanie w toku, p03.8 po anulowaniu: strona główna + link nieważny, p03.9 wygasło po 24 h, p03.10 błąd odpytywania |
| p04 Partia gotowa | `#/game` (faza „gotowa”) | p04.1 czekamy, aż {nazwa} otworzy partię, p04.2 „Partia gotowa” (koniec etapu A), p04.3 anulowana po 15 min, p04.4 stałe ostrzeżenie gościa |
| Brzegi poza etapem A | `#/outside?to=…`, dialog | „Poza tym etapem” (Lobby, Historia, plansza) z drogą powrotu; logowanie i rejestracja jako dialog „Poza tym prototypem” z przyciskiem „Wróć do zaproszenia”; p07.2 brak dostępu do partii z linkiem na stronę główną |

## Poza zakresem tego etapu

Plansza, ruchy, zegary graczy, koniec partii, poddanie, rewanż, powrót po rozłączeniu (p05–p07.1, p07.3–p07.4), Lobby i Historia (E03), faktyczne logowanie i rejestracja (prototyp `account-registration`). Pokazane jako „Poza tym etapem” albo „Poza tym prototypem” z powrotem; żaden z nich nie udaje działającej funkcji.

## Reguły i decyzje zachowane (bez zmian)

| ID | Treść (skrót) | Status | Gdzie w prototypie |
|---|---|---|---|
| BR-01 | w partii dokładnie dwóch graczy | potwierdzona | trzecia osoba po dołączeniu widzi „nieważne” |
| BR-09 | zaproszenie link/kod obok lobby | potwierdzona | ścieżka zaproszenia; lobby poza zakresem |
| BR-11 | zaproszenie jednorazowe do konkretnej partii | potwierdzona | link przyjęty/anulowany/wygasły: „To zaproszenie jest już nieważne” |
| BR-13, D-10 | co najwyżej jedna aktywna partia | potwierdzona | p01.3, p01.4, s07.6, s07.7 |
| BR-20 | działa na telefonie | potwierdzona | układ sprawdzony przy 320 i 360 px |
| BR-22 | gość: tylko dołączenie, bez tworzenia, ostrzeżenie przed i w trakcie | potwierdzona | s07.2, p04.4; gość nie ma „Utwórz zaproszenie” |
| BR-24 | gość bez historii; przeciwnik gościa nazwany „Gość” (L14) | potwierdzona / decyzja z mapy | p03.5, p04 |
| BR-26 | konto aktywne bez potwierdzenia e-maila; zalogowany nie gra jako gość | potwierdzona | zalogowany: „Dołącz do partii” bez opcji gościa |
| D-07, D-21, D-23 | zaproszenie + lobby, sposób powstania partii, logowanie z wyjątkiem gościa | potwierdzone | tylko ścieżka zaproszenia; gość tylko z linku |

Decyzje z mapy (sekcja 0a): L04 (anulowanie z potwierdzeniem, po nim strona główna i link nieważny), L14, L20 (zegar rusza po otwarciu strony przez obu), L21–L24 (poza etapem A). Specyfikacja #21: Q3 (24 h), Q5, Q6 (odpytywanie co 3 s, w prototypie co 1 s), Q11, Q12, Q13, Q18, Q20, Q21 (15 min), Q22.

## Założenia `[ASSUMPTION]`

| ID | Założenie | Dlaczego potrzebne | Jak sprawdzić |
|---|---|---|---|
| A-01 | Rola oglądającego to przełącznik w „Test state” (Ala_7, Kuba_P, gość, niezalogowany); stan partii jest wspólny. Obaj gracze z kontem są symetryczni: konto, które tworzy partię, jest twórcą. Rola „gość” przed dołączeniem zachowuje się jak niezalogowany; token gościa powstaje po „Rozumiem, graj jako gość”. | jedna osoba ogląda obie strony bez dwóch przeglądarek | przejście przez obie role; walk-log W/S |
| A-02 | Założenia robocze z mapy 0b, dotyczące etapu A: **L01** własna oczekująca partia + „Utwórz zaproszenie” prowadzi do tej partii z komunikatem „Masz już oczekującą partię” (p01.4); **L02** „Nie udało się połączyć z serwerem. Spróbuj ponownie.” z przyciskiem, odpytywanie po błędzie ponawia się samo, po 3 nieudanych baner błędu (p01.6, p01.7, p03.10); **L03** przycisk „Sprawdzanie kodu…” (p02.5); **L05** twórca „Zaproszenie wygasło. Utwórz nowe.”, osoba z linkiem „nieważne” (p03.9, s07.9); **L06** po 15 min „Przeciwnik nie otworzył partii w ciągu 15 minut. Partię anulowano.” z przyciskiem do panelu (p04.3); **L10** brak roli operatora; **L19** logowanie i rejestracja z zaproszenia wracają na `/invite/{kod}`. Nie dotyczą etapu A: L08, L15, L18. | brak treści w specyfikacjach | rozstrzygnięcie właściciela po obejrzeniu |
| A-03 | „Partia gotowa” (p04.2) kończy etap A i nie udaje planszy; przejście do planszy to „Poza tym etapem” | granica etapu | wejście w etap B |
| A-04 | `seen_at` twórcy powstaje, gdy jego strona pokazuje partię po dołączeniu przeciwnika (p03.5, potem p04). Dołączający ma `seen_at` od razu (Q20). Dlatego p04.1 widzi przeciwnik, a twórca przechodzi p03.5 → p04.2 po 2,5 s lub po „Przejdź do partii” | spec nie opisuje, co widzi twórca, który jeszcze nie otworzył partii | czy twórca w ogóle może zobaczyć p04.1 |
| A-05 | Czas stały: poniedziałek 2026-10-26 10:00; kontrolki „+15 min bez otwarcia” i „+24 h” przesuwają zegar demo; wygaśnięcie i anulowanie wynikają z tego zegara | brak prawdziwego czasu | użycie kontrolek |
| A-06 | Stałe fikcyjne: kod `ABCD-EFGH`, link `https://gomoku.example/invite/ABCD-EFGH`; każda nowa partia dostaje ten sam kod; „Ważne do” = utworzenie + 24 h w formacie „wtorek 2026-10-27 10:00” | brak generatora | n/d |
| A-07 | Osoba, która nie otworzyła partii (twórca) i po 15 min widzi: „Partię anulowano: nie została otwarta w ciągu 15 minut.” (osobny tekst, bo „Przeciwnik nie otworzył…” byłby nieprawdziwy) | mapa opisuje tylko widok gracza, który otworzył | decyzja o treści |
| A-08 | „Udostępnij” to przycisk, który po kliknięciu pokazuje „Udostępnianie dostępne tylko na telefonie” (zastępuje systemowe okno `navigator.share`); kontrolka „Udostępnij niedostępne” go ukrywa (p03.4). Podobnie „Kopiuj” nie używa prawdziwego schowka; „Schowek niedostępny” pokazuje p03.3 | brak API w symulacji | test na prawdziwym urządzeniu w implementacji |
| A-09 | Prototyp symuluje jedną partię naraz: gdy trwa partia innego gracza, „Utwórz zaproszenie” pokazuje „Ograniczenie prototypu”. Przesłonięcia „Już uczestnik” i „Własne zaproszenie” w „Test state” dopasowują rolę i partię, a następnie przekierowują do partii; „Ma własną oczekującą partię” działa tylko dla roli z kontem Kuba_P | uproszczenie modelu | n/d |
| A-10 | Tekst dialogu anulowania: „Anulować zaproszenie?” / „Link i kod przestaną działać, a partia zostanie anulowana. Tej operacji nie można cofnąć.” z przyciskami „Wróć” (fokus) i „Tak, anuluj zaproszenie”; gdy przeciwnik zdążył dołączyć, komunikat „Przeciwnik zdążył dołączyć, zanim anulowałeś…” | L04 rozstrzyga potwierdzenie, nie treść | decyzja o treści |
| A-11 | Limit utworzeń pokazuje „za 23 min” jako stałą wartość demo | spec: „komunikat z czasem” | n/d |

## Mapa ekranów i stanów (akcja, następny stan)

| Stan | Akcja | Następny stan | Reguły/założenia |
|---|---|---|---|
| p01.1 | „Utwórz zaproszenie” | p01.2, potem p03.1 albo p01.3 / p01.4 / p01.5 / p01.6 / p01.7 według „Test state” | BR-13, A-02 |
| p01.6, p01.7 | „Spróbuj ponownie” | p01.2 | A-02 |
| p01.1 | „Masz kod?” | p02.1 | |
| p02.1 | kod z błędem (≠ 8 znaków) | p02.2 | |
| p02.1 | kod 8 znaków | p02.5, potem s07 (kod `ABCD-EFGH` i partia czeka) albo s07.9 | BR-11 |
| p02.1 | wynik „Limit” | p02.3 | Q13 |
| s07.1 | „Zaloguj się” / „Załóż konto” | dialog „Poza tym prototypem”, „Wróć do zaproszenia” wraca na s07 | A-02 (L19) |
| s07.1 | „Graj jako gość” | s07.2; „Rozumiem, graj jako gość” → p04.1 (rola gość) | BR-22, Q11 |
| s07.3 | „Dołącz do partii” | p04.1 | BR-01, BR-26 |
| s07.7 | „Anuluj moją partię i dołącz” | p04.1 | Q18 |
| s07.6 | „Przejdź do swojej partii” | Poza tym etapem (plansza) | BR-13 |
| p03.1 | „Kopiuj” | p03.2 albo p03.3 | |
| p03.1 | „Udostępnij” | komunikat o telefonie | A-08 |
| p03.1 | „Anuluj zaproszenie” | p03.6 | L04 |
| p03.6 | „Wróć” / Esc | p03.1 | |
| p03.6 | „Tak, anuluj zaproszenie” | p03.7, potem p03.8 (panel główny) | L04 |
| p03.1 | przeciwnik dołączył | p03.5 → p04.2 | A-04 |
| p03.1 | +24 h | p03.9; „Utwórz zaproszenie” → p03.1 | Q3, L05 |
| p04.1 | twórca otwiera stronę (przycisk testowy) | p04.2 | Q20 |
| p04.1 | +15 min bez otwarcia | p04.3; „Wróć do panelu głównego” | Q21, L06 |
| p04.2 | „Wróć do panelu głównego” albo „Plansza (poza tym etapem)” | panel / Poza tym etapem | A-03 |

## Kontrolki „Test state” (kontrolki prototypu, nie funkcje produktu)

Rola oglądającego; wynik tworzenia partii (powodzenie, ma aktywną partię, ma oczekującą partię, limit, błąd serwera, brak sieci); wynik kodu na /join (poprawny, nieważny, limit); stan zaproszenia dla znajomego (według roli, już uczestnik, własne, inna partia, oczekująca partia, limit, nieważne); schowek niedostępny; „Udostępnij” niedostępne; błąd odpytywania; „+15 min bez otwarcia”, „+24 h”, „Twórca otwiera stronę partii” (dodana kontrolka, żeby zobaczyć odpytywanie p04.1 → p04.2 na jednej karcie); Reset.

## Jak otworzyć i zresetować

Otwórz plik `index.html` w przeglądarce (adres `file://`; nic nie jest ładowane z sieci, nic nie jest zapisywane w pamięci przeglądarki). Przycisk „Reset symulacji” w „Test state” przywraca start: panel główny, rola Ala_7, czas 10:00, domyślne kontrolki, brak partii. Odświeżenie strony także resetuje stan.

## Weryfikacja

**Przegląd statyczny (przeszedł):** w pliku brak `fetch`, `XMLHttpRequest`, `localStorage`, `sessionStorage`, ciasteczek, CDN, fontów i obrazów; jedyny adres `https://…` to fikcyjny tekst `gomoku.example` wyświetlany jako link do skopiowania (nie jest ładowany). Formularz `/join` nie wysyła niczego (`preventDefault`). Teksty wstawiane przez węzły tekstowe. Nagłówki, etykiety, przyciski i linki semantyczne, `lang="pl"`, widoczny fokus, brak obrysu na `tabindex="-1"` (lekcja `2026-10-26-prototype-heading-focus-and-header-submit`). W interfejsie nie ma treści z panelu, hipotez ani oczekiwanych reakcji. Reguły i decyzje niezmienione.

**Przejście w przeglądarce (agent-browser, sesja izolowana, `file://`):** skrypt `evidence/walk.sh`, wynik `evidence/walk-log.txt`: **124 PASS, 0 FAIL**. Zrzuty w `evidence/`. Zakres, z identyfikatorami w logu:

| Grupa | Co sprawdzono | ID |
|---|---|---|
| Start, p01 | stan p01.1, rewizja w pasku i tytule, czas, fokus na nagłówku bez obrysu, Tab na przycisk, widoczny fokus, p01.2, p01.3, p01.4, p01.5, p01.6, p01.7, ponowienie po błędzie | W01–W10, Q01–Q09 |
| p03 | link, kod (duża czcionka), „Ważne do”, przyciski, `role=status`, p03.2, p03.3 (zaznaczenie tekstu), p03.4, „Udostępnij”, p03.10 (ponawianie, baner `role=alert`, powrót), dialog (fokus na „Wróć”, Esc zwraca fokus, Tab, pułapka, „Wróć”), p03.7, p03.8, link po anulowaniu nieważny, brak dostępu po anulowaniu | P01–P12, D01–D10 |
| p02 | fokus na polu kodu, etykieta, za krótki kod → poprawka → sukces, limit, nieważny kod, sprawdzanie, wymuszony „nieważny” | J01–J08 |
| s07 | niezalogowany (3 wybory, bez „Dołącz”), dialog „Poza tym prototypem” (Esc, „Wróć do zaproszenia”, nagłówek), ostrzeżenie gościa, dołączenie gościa, zalogowany bez opcji gościa, stan „zajęty” przy dołączaniu, przesłonięcia (uczestnik, własne, inna partia, oczekująca partia + dołączenie, limit, nieważne), trzecia osoba | S01–S28, O01–O06 |
| p04 | p04.1 (konto i gość), p03.5 → p04.2, p04.2 z komunikatem o etapie B i przyciskiem powrotu, obaj widzą „Partia gotowa”, p04.4, p04.3 po +15 min (oba widoki), +15 min po otwarciu przez obu nie anuluje, odpytywanie p04.1 → p04.2, „Gość” u twórcy | S08–S27b, S24, S25 |
| Zegar | +24 h: p03.9, link nieważny, ponowne utworzenie, komunikat bez partii | E01–E04 |
| Nawigacja | nieznany fragment, wstecz/dalej, Poza tym etapem (plansza, Lobby) | N01–N06, S21–S22 |
| Reset | stan startowy, kontrolki, brak partii, stary link nieważny | R01–R03 |
| Klawiatura | Tab + Enter tworzy partię; Enter otwiera dialog; Tab + Enter potwierdza | K01–K03, D01–D05 |
| Szerokości | 320 i 360 px: brak poziomego przewijania na panelu, p03, dialogu, s07.1, /join, p04.2 | V320-*, V360-* |
| Offline | brak żądań poza `file:`, brak storage i ciasteczek | X01, X02 |

**Zrzuty obejrzane osobiście (przez autora rewizji):** `01-p01-panel.png`, `16-p02-za-krotki.png`, `20-s07-ostrzezenie-goscia.png`, `02-p03-oczekiwanie.png`, `07-p03-dialog-anulowania.png`, `26-p04-partia-gotowa.png`, `21-p04-czekamy-gosc.png`, `36-s07-320px.png`, `35-dialog-320px.png`. Pozostałe zrzuty są zapisane jako dowód, nie były oglądane indywidualnie (ich stany potwierdzają asercje).

**Nie sprawdzono:** odczyt komunikatów przez czytnik ekranu (sprawdzono role i atrybuty, nie faktyczne odczyty), pomiar kontrastu (paleta czarno-biało-szara), prawdziwy schowek i `navigator.share` (symulowane, A-08), wyścig „twórca anuluje w chwili dołączenia” (kod istnieje, A-10, bez asercji), motyw ciemny, szerokość 1440 px poza domyślnym oknem 1280 px, przeglądarki inne niż Chromium.
