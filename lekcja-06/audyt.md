# Raport: `lekcja-06/ekran-bez-ds.html`

**Zakres.** Plik sprawdzony z dysku w przeglądarce (agent-browser, szerokości 1440, 768 i 320 px). Kontrast liczony w przeglądarce ze stylów obliczonych. Nie mierzono renderu focusu ani zachowania po kliknięciu. Brak design systemu i danych produktu, więc liczby porównano tylko z briefem. Pliki nie były zmieniane.

## Krok 1. Znaki generycznego wyglądu

| Znak | Wynik |
|---|---|
| Indygo jako kolor akcji bez uzasadnienia | **występuje**: `#4f46e5` na linii 59 (`.btn`), 23 i 25. Brief nie podaje koloru marki. |
| Gradient w nagłówku, tle, przycisku | nie występuje |
| Ciemnogranatowe tło z poświatą | nie występuje |
| Duże zaokrąglenia i pigułki | **występuje częściowo**: pigułka `999px` na `.badge` (79), `12px` na kartach (45) |
| Karty z cieniem jako jedyny separator | **występuje**: `.card` ma `box-shadow: 0 1px 3px` (47) na jasnym tle, bez obramowania |
| Karta w karcie | nie występuje |
| Rozmyte, półprzezroczyste panele | nie występuje |
| Pigułka z nowością nad nagłówkiem | **odpowiednik**: zielona pigułka „3 graczy online” (138) |
| Wyróżnione kolorem słowo w nagłówku | nie występuje |
| Para „Zacznij za darmo” / „Zobacz demo” | **odpowiednik**: główny przycisk obok drugorzędnego w jasnym indygo (62, 123–124) |
| Rząd wielkich liczb | nie występuje |
| Trzy identyczne karty z ikoną | nie występuje (są dwie karty akcji bez ikon i dwie tabele) |
| Karty unoszące się nad pierwszym ekranem | nie występuje |
| Logo jako kolorowy kwadrat z literą | **odpowiednik**: „● Gomoku”, kółko z fontu w kolorze akcji (100). To nie jest kamień z gry. |
| Awatary z inicjałami | nie występuje |
| Emoji zamiast ikon | nie występuje (występuje tekstowy znak „●”) |
| Iskierki AI, ikony na kolorowym tle | nie występuje |
| Puste obietnice | nie występuje. Teksty pochodzą z briefu. |
| Wymyślone liczby i nazwy | **występuje**: Alicja_99, czarny_kamień, PiątkaWLinii, KamykMistrz, czasy 4:02 / 2:10 / 0:48, „3 graczy online”, daty historii. |

Wymyślone dane są spójne: 3 wiersze lobby = „3 graczy online”, a daty historii są malejące. Brakujące kolumny w tabelach (np. wynik „Porażka” bez informacji, kto grał czarnymi) nie wynikają z danych produktu.

## Krok 2. Błędy UX i dostępności

| Kontrola | Wynik |
|---|---|
| Kontrast tekstu | **Stopka 2,95:1 (próg 4,5)** — `#8a90a2` na `#f5f6fa`, 12 px (90). Pozostałe pary w zakresie 4,53–15,5:1. Najsłabsza zdająca: odznaka „3 graczy online” 4,53:1. Brak gradientów i obrazów w tle. |
| Cele dotykowe < 24×24 | Linki „Zmień hasło”, „Wyloguj”, „Zobacz wszystkie” mają 16 px wysokości. Spełniają wyjątek odstępu WCAG 2.5.8: koło 24 px nie dotyka sąsiednich celów, odstęp w nagłówku to 14 px. Przyciski mają 27–37 px. |
| Pola bez etykiety | **Występuje**: pole kodu zaproszenia ma tylko placeholder (123), bez `<label>` i bez `aria-label`. |
| Kolor jako jedyny nośnik | Nie występuje. Wygrana/Porażka/Remis mają słowa. |
| Brak stanów | **Występuje**: brak ładowania, pustego lobby, błędu zaproszenia, wygasłego kodu i stanu „status wygasł”. Brak pustej historii dla nowego gracza. |
| Focus | Nie ma `outline: none` w CSS, więc zostaje domyślny pierścień przeglądarki. Nie sprawdzano go wizualnie. |
| Długość linii | Podtytuł (`.sub`, 114): ok. 110–120 znaków przy 1440 px i ok. 90 przy 768 px, szacunek z szerokości elementu. Przy 320 px ok. 36. Akapity w kartach: ok. 62 i 45 znaków, w normie. |
| Komunikaty błędów | Nie da się sprawdzić, bo ich nie ma. |
| Bez JavaScriptu | Treść jest czytelna. Nic jednak nie działa: przyciski nie mają akcji, a odliczanie „Wygasa za” jest statyczne. |
| **Przepełnienie przy 320 px** | **`scrollWidth` = 373 > 320**, czyli pozioma przewijanka. Przyciski „Zagraj” w lobby wychodzą na x=284–347. Tabela nie ma kontenera z przewijaniem. Przy 768 i 1440 px bez przepełnienia. |
| Hierarchia akcji | Dwie karty startowe mają równorzędne, identyczne główne przyciski. Brak informacji, co robić, gdy e-mail jest niepotwierdzony (BR-23): wszystkie przyciski wyglądają na aktywne. |

## 1. Najważniejsze znaleziska

| Znak lub błąd | Gdzie | Co widać | Dlaczego problem | Czym zastąpić | Pewność |
|---|---|---|---|---|---|
| Indygo bez uzasadnienia | linie 23, 25, 59, 62, 155 | Cała akcja w `#4f46e5` | generyczny wygląd | kolor z motywu gry (np. kamienie czarny/biały albo drewno planszy) jako token | sprawdzone |
| Pigułka + para przycisków + cień | 74–81, 62, 47 | Zielona pigułka, główny i drugorzędny przycisk, karty bez obramowania | generyczny wygląd | jedna zasada separacji (linia lub tło), stan „online” jako tekst z kropką, hierarchia akcji | sprawdzone |
| Logo z fontu | 100 | „●” w kolorze akcji | generyczny wygląd | znak z kamieniem gomoku (czarny/biały) | sprawdzone |
| Wymyślone dane | 145–147, 162–164, 138, 103 | Nicki, czasy, liczba graczy, daty | generyczny wygląd, treść | oznaczone dane przykładowe lub prawdziwe z seedu | sprawdzone |
| Kontrast stopki | 90 | 2,95:1 | dostępność | ciemniejszy token tekstu pomocniczego (≥ 4,5:1) | sprawdzone |
| Pole bez etykiety | 123 | Sam placeholder, bez `<label>` | dostępność | widoczna etykieta „Kod zaproszenia” | sprawdzone |
| Przepełnienie 320 px | 135–150 | Pozioma przewijanka (373 px) | UX | tabela jako lista kart lub kontener `overflow-x:auto` | sprawdzone |
| Brak stanów | cały ekran | Tylko stan „pełny” | UX | pusty lobby, błąd kodu, ładowanie, wygasły status | sprawdzone |
| Brak sygnału „niepotwierdzony e-mail” | 109–113 | Przyciski gry wyglądają na aktywne | UX | wyłączone przyciski z wyjaśnieniem albo blokada przed kliknięciem | sprawdzone |
| Długi podtytuł | 114 | ok. 110 znaków w linii przy 1440 px | UX | `max-width` na ok. 60–70 znaków | przypuszczenie (szacunek z szerokości) |
| Brak tokenów | cały plik | Kolory, odstępy i promienie na sztywno | generyczny wygląd | zmienne CSS | sprawdzone |

## 2. Pozostałe znaleziska

- Klasa `.muted` (89) nie działa na `<p>`: `.card p` (50) ma wyższą specyficzność i wymusza `#5b6275`. Dotyczy linii 132.
- Inline style na liniach 155 (`color:#4f46e5;font-size:14px`) i 132 omijają arkusz.
- Tabele nie mają `<caption>`, a kolumna z przyciskami ma pusty `<th>` (143).
- Tabela historii ukrywa kolumnę „Zakończenie” na wąskich ekranach (`.hide-sm`), czyli traci informację o przyczynie przegranej (np. koniec czasu).
- Przyciski „Zagraj” w lobby nie mówią, z kim (czytnik ekranu czyta trzy identyczne „Zagraj”).
- Lobby pokazuje „Wygasa za”, ale bez odświeżania i bez koloru ostrzegawczego dla 0:48, więc nie widać, że ktoś zaraz zniknie.
- Brak stanu aktywnej partii (BR-13: jedna naraz). Nic nie mówi „masz partię w toku, wróć do niej”.

## 3. Liczby

| Miara | Wartość |
|---|---|
| Kolory tekstu przy 1440 px | **8** (biały na przyciskach liczony jako kolor tekstu) |
| Rozmiary fontu przy 1440 px | **8** (12, 13, 14, 15, 16, 18, 20, 28) |
| Promienie zaokrąglenia w kodzie | **3** (8 px, 12 px, 999 px) |
| Wartości odstępów (padding, margin, gap) | **13** (3, 4, 6, 8, 9, 10, 12, 14, 16, 18, 20, 24, 48) |
| …w tym spoza siatki 4 px | **6** (3, 6, 9, 10, 14, 18) |
| Kolory wpisane na sztywno poza tokenami | **17** (16 unikalnych hexów + 1 `rgba`); pliku tokenów nie ma, więc wszystkie |

## 4. Pięć decyzji

1. **Kolor marki z gry, nie z biblioteki.** Wybrać kolor akcji i neutralne z motywu planszy i kamieni. To **token**: kolor akcji, powierzchni i tekstu.
2. **Jedna reguła separacji.** Linia albo tło zamiast cienia i obramowania naraz, jeden promień zamiast trzech. To **token** (promień, obramowanie) i **zasada** (kiedy cień).
3. **Hierarchia akcji na ekranie startowym.** Jedna dominująca akcja na widok, a akcje zablokowane przy niepotwierdzonym e-mailu wyglądają na zablokowane. To **zasada** plus **komponent** `Button` ze stanem `disabled` i powodem.
4. **Skala odstępów i typografii.** Siatka 4 px i zamknięty zestaw rozmiarów (np. 12, 14, 16, 20, 28) zamiast 13 odstępów i 8 rozmiarów. To **token**.
5. **Komplet stanów dla list i formularzy.** Pole z etykietą, pusty lobby, błąd kodu, ładowanie, wygasły status; tabela, która na 320 px zamienia się w listę. To **komponent** (`Field`, `DataList`/`EmptyState`) i **zasada** (każdy ekran ma stany: pusty, ładowanie, błąd).
