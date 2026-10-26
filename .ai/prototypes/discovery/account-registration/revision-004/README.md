# Prototyp discovery: rejestracja konta i wejście z zaproszenia (revision-004)

- Brief: `.ai/specs/product-brief.md` (po zmianie 2026-10-26: D-24…D-26, BR-26…BR-28). Przepływ: „account registration” (Key flow, krok 1) rozszerzony o wejście z zaproszenia.
- Data: 2026-10-26. **Poprzednia wersja:** `../revision-003/` (bez zmian); `../revision-002/` i `../revision-001/` także bez zmian (001 pokazuje model sprzed zmiany: potwierdzenie przed grą, hasło 16 znaków). Rewizja 004 to rewizja 003 z dwiema kolejnymi uwagami z przeglądu.
- Mapa ekranów: `lekcja-07/mapa-ekranow.md` (ID s01, s03, s04, s06, s07 z mapy; s01.12 wycofany).
- Specyfikacja zmiany: `.ai/specs/2026-10-26-account-onboarding-simplification.md` (osąd właściciela, nie wynik badania).
- Panel syntetyczny (`--panel-report`): nie podano; raport z 2026-10-26 dotyczył poprzedniego modelu i **nie** kształtował tego interfejsu. Hipotezy `[SYNTHETIC]` nie weszły do prototypu.
- Wszystkie dane są fikcyjne. Prototyp nie jest dowodem popytu ani gotowości produkcyjnej (A-01, A-03 w briefie pozostają nieprzetestowane).

## Co się zmieniło względem rewizji 003 (uwagi z przeglądu 2026-10-26)

| Zmiana | Powód |
|---|---|
| Przycisk **„Wyloguj”** w nagłówku zalogowanego; po wylogowaniu strona główna dla niezalogowanego, a ponowna rejestracja działa | po rejestracji gracz jest zalogowany i nie było jak się wylogować |
| **Fokus** przy pierwszym wejściu i po przejściu na rejestrację ląduje na polu E-mail, nie na nagłówku „Załóż konto”; nagłówki na pozostałych ekranach dostają fokus bez widocznego obrysu | nagłówek nie powinien wyglądać na aktywny element |

## Co się zmieniło względem rewizji 002 (rewizja 003)

| Zmiana | Powód |
|---|---|
| W pasku na górze strony **numer rewizji** („Rewizja 3”, od 004 „Rewizja 4”, także w tytule karty) | nie dało się poznać, którą rewizję się ogląda |
| Podpis pod polem E-mail na formularzu rejestracji: „Wyślemy na ten adres link do potwierdzenia. Grasz od razu, adres możesz potwierdzić później.” | formularz nie mówił, że e-mail będzie do potwierdzenia (informację dawał dopiero baner po rejestracji) |

## Co się zmieniło względem rewizji 001

| Zmiana | Źródło |
|---|---|
| Hasło co najmniej 8 znaków (podpis „Co najmniej 8 znaków.”, błąd „Hasło musi mieć co najmniej 8 znaków.”) | BR-28, D-25 |
| Konto aktywne od razu po rejestracji: „Utwórz zaproszenie” i „Szukam przeciwnika” aktywne, w nagłówku Lobby i Historia dla każdego zalogowanego | BR-26, D-24 |
| Stan „rejestracja niedostępna bez poczty” (s01.12) wycofany: rejestracja działa także przy awarii lub braku dostawcy poczty | BR-26 |
| Baner „Potwierdź adres e-mail” nieblokujący, z powodem i przyciskiem „Zamknij”; zamknięty wraca po 7 dniach (kontrolka „Minęło 7 dni”) | BR-26, decyzja Q5 specyfikacji |
| Strona potwierdzenia: „Adres potwierdzony” (bez „możesz grać”) | BR-26 |
| Niepotwierdzone konto bez partii znika po 14 dniach (kontrolka „Minęło 14 dni”); konto z partią zostaje (pole „Konto rozegrało partię”) | BR-28 |
| **Nowy ekran s07** `#/invite`: „Zaloguj się”, „Załóż konto”, „Graj jako gość”; po rejestracji powrót na zaproszenie; zalogowany widzi „Dołącz do partii” bez opcji gościa; stany s07.1–s07.9 | #21, BR-22, BR-26 |
| Gość po ostrzeżeniu dostaje aktywną partię i nie może się zarejestrować | BR-22, decyzje L14, L26 |

## Aktor, start, sukces

- Aktor: niezalogowany gość. Starty: `#/register` (rejestracja) i `#/invite` (zaproszenie).
- Sukces: konto założone, gracz zalogowany i grający; potwierdzenie e-maila jako osobna czynność; z zaproszenia wraca na stronę zaproszenia.
- Ekrany: s01 Rejestracja, s04 Strona główna, s06 Skrzynka demo (symulacja poczty), s03 Potwierdzenie e-maila, s07 Wejście z zaproszenia.
- Poza prototypem (ekran „Poza tym prototypem”): logowanie, konto i wylogowanie, lobby, historia, tworzenie i dołączanie do partii, reset hasła.

## Reguły i decyzje zachowane z briefu

| ID | Treść (skrót) | Status |
|---|---|---|
| BR-14, BR-16 | unikalny e-mail i nazwa; zajęty e-mail nie jest ujawniany | potwierdzone |
| BR-20 | działa na telefonie | potwierdzone |
| BR-22 | gość tylko z zaproszenia; nie rejestruje się w trakcie partii | potwierdzone |
| BR-26, D-24 | konto aktywne od razu, potwierdzenie nieblokujące (nadpisuje BR-23, D-17) | decyzja właściciela 2026-10-26 |
| BR-27 | reset tylko po potwierdzonym e-mailu (zasada w treści banera; ekran resetu poza prototypem) | decyzja właściciela 2026-10-26 |
| BR-28, D-25 | hasło 8–72 bajty; niepotwierdzone konta bez partii kasowane po 14 dniach (nadpisuje G3 i Q14) | decyzja właściciela 2026-10-26 |
| G3 (poprzednie 16 znaków) | zastąpione | wycofane |

Nie dotykam: non-goals N-01…N-09.

## [ASSUMPTION] Założenia i brakujące fakty

| ID | Założenie | Jak sprawdzić |
|---|---|---|
| A-01 | Konto powstaje także gdy wysyłka poczty zawiedzie (502, 503); baner proponuje „Wyślij ponownie” | spec `email-verification` Q6 |
| A-03 | Teksty błędów pól, błędu sieci i błędu serwera napisane przeze mnie | zatwierdzenie tekstów (mapa L05) |
| A-04 | Temat wiadomości „Potwierdź adres e-mail w Gomoku”, treść z Q5 i Q8 | mapa L21 |
| A-05 | Po potwierdzeniu przycisk „Przejdź dalej” zamiast automatycznego przejścia | mapa L13 |
| A-06 | Baner dla 409, 401 i 503: teksty i przycisk „Odśwież stronę” (503: „Spróbuj jutro. Gra nie zależy od potwierdzenia.”) | mapa L11 |
| A-07 | Nagłówek ma tylko „Zalogowano jako {nazwa}”, bez „Konto” i „Wyloguj” | mapa L06 (część o wylogowaniu otwarta) |
| A-09 | Limit rejestracji w prototypie: 6. próba w sesji | brak |
| A-10 | Dane demo: zajęty e-mail `marek@example.com`, nazwa `Marek_Z`, hasło demo `drewniana-plansza-2026` | brak |
| A-11 | Teksty strony zaproszenia poza specyfikacją #21: „Konto zakładasz w minutę: e-mail, nazwa gracza i hasło co najmniej 8 znaków. Potwierdzenie e-maila możesz zrobić później.”, przycisk „Wróć” przy ostrzeżeniu | zatwierdzenie tekstów |
| A-12 | Po „Rozumiem, graj jako gość” prototyp daje gościowi aktywną partię (symulacja), żeby pokazać blokadę rejestracji | decyzje L14, L26 |
| A-13 | Stany s07.4 i s07.5 (przekierowania w produkcie) pokazane jako zapowiedź z przyciskiem „Przejdź do partii” | brak |
| A-15 | Tekst podpisu pod e-mailem na formularzu („Wyślemy na ten adres link do potwierdzenia. Grasz od razu, adres możesz potwierdzić później.”) napisany przeze mnie na uwagę z przeglądu; nie wynika ze specyfikacji | zatwierdzenie tekstu (mapa L05) |
| A-16 | „Wyloguj” w nagłówku (decyzja z przeglądu; w specyfikacji #20 przycisk jest na `/account`, mapa L06 zostaje otwarta co do miejsca); po wylogowaniu konto zostaje w symulacji, ale logowanie jest poza prototypem | mapa L06 |
| A-14 | Usunięte konto traci sesję natychmiast (kaskada), baner „wraca po 7 dniach” symulowany kontrolką zamiast zegara przeglądarki | spec Q5, BR-28 |

Hipotez `[SYNTHETIC]` w interfejsie: brak.

## Mapa ekranów i stanów (w prototypie)

| Ekran | Stany | Jak wywołać |
|---|---|---|
| s01 Rejestracja `#/register` | s01.1–s01.11, s01.13 | pusty formularz; błędne dane (hasło 7 znaków); `Marek_Z`; `marek@example.com`; limit, serwer, sieć; gość z partią (po s07); zalogowany jest odsyłany na `#/home` |
| s04 Strona główna `#/home` | s04.1–s04.11, s04.13 | niezalogowany; po rejestracji; po potwierdzeniu; baner: wysyłanie, wysłano, limit, 502, 503, 409, 401; „Zamknij”, „Minęło 7 dni” |
| s06 Skrzynka `#/mail` | s06.1, s06.2 | po rejestracji; dostawca niedziałający |
| s03 Potwierdzenie `#/verify?m=…` | s03.1–s03.15 | link z wiadomości; link wygasły, użyty, bez tokenu; sesja; błąd serwera, sieci |
| s07 Wejście z zaproszenia `#/invite` | s07.1–s07.9 | niezalogowany; „Graj jako gość”; po rejestracji; stan zaproszenia z listy w panelu testowym |
| Poza prototypem | logowanie, lobby, historia, partia gościa, dołączenie, anulowanie | linki i przyciski |

Niepokryte: s01.9, s04.12 (ładowanie), cała s02 i s05.

## Weryfikacja

- Statyczny przegląd: brak zewnętrznych adresów, `fetch`, magazynów przeglądarki, skryptów zewnętrznych; formularz nie wysyła niczego.
- Przeglądarka: `agent-browser` 0.39.1 z `node_modules/.bin`, sesje `grey4` i `grey4b`, zamknięta po przebiegu. Skrypt: 87 sprawdzeń PASS, 0 FAIL (w tym numer rewizji, podpis pod e-mailem, przycisk „Wyloguj” i fokus na polu e-mail; część dotycząca fokusu i wylogowania uruchomiona w osobnej sesji przeglądarki, bo ponowne otwarcie tego samego adresu nie przeładowuje strony). Log: `evidence/walk-log.txt`, zrzuty: `evidence/*.png`.
- Sprawdzone: rejestracja i potwierdzenie, hasło 7 i 8 znaków, konflikty, limity, awarie, baner zamknięty i powrót po 7 dniach, usunięcie niepotwierdzonego konta po 14 dniach i brak usunięcia przy partii, s07 we wszystkich stanach (w tym powrót po rejestracji i blokada po wejściu jako gość), Reset, Back/Forward, klawiatura, fokus na nagłówku, brak poziomego przewijania przy 360 i 320 px.
- Nie sprawdzone: czytnik ekranu, kontrast w pomiarze (tylko CSS).

## Jak otworzyć i zresetować

Otwórz `index.html` w przeglądarce (`file://`). „Reset symulacji” przywraca start. Stan trzymany tylko w pamięci strony.
