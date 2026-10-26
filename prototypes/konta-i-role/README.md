# Klikalny prototyp: Epik 01, konta (rejestracja, logowanie, potwierdzenie e-maila)

Prototyp pokazuje, jak będą wyglądać i działać ekrany z zatwierdzonej mapy (`lekcja-07/mapa-ekranow.md`), zanim powstanie kod produkcyjny. Korzysta z niego gracz, który klika i komentuje, oraz developer, który buduje z niego prawdziwe ekrany. Nic tu nie jest prawdziwą usługą: konta, sesja, poczta i limity istnieją tylko w pamięci strony, a dane są fikcyjne.

Postęp prac i decyzje: `POSTEP.md`. Mapa ekranów, stany i luki: `lekcja-07/mapa-ekranow.md`. Szary prototyp, z którego wzięto przepływ i założenia: `.ai/prototypes/discovery/account-registration/revision-001/`.

## Jak uruchomić

Źródła są w tym katalogu. Wynik budowania trafia do folderu, z którego Storybook serwuje pliki, i nie jest commitowany (ścieżka jest w `.gitignore`).

```bash
npx vite build --config prototypes/konta-i-role/vite.config.ts
```

Podgląd musi iść przez HTTP (moduły nie ładują się z `file://`):

- Storybook: `npm run storybook -w @gomoku/ui`, potem `/prototypes/konta-i-role/index.html` (port 6006, w sandboxie 3000),
- albo prosty serwer: `cd packages/ui/.storybook/public && python3 -m http.server 8765`, adres `http://localhost:8765/prototypes/konta-i-role/index.html`.

Dopisek `?fast` w adresie wyłącza symulowane opóźnienia serwera (testy).

Testy nawigacji: `npx vitest run --config prototypes/konta-i-role/vitest.config.ts`. Sprawdzenia w przeglądarce (agent-browser, serwer na porcie 8765): `prototypes/konta-i-role/checks/etap2-walk.sh` i `etap3-walk.sh`, wyniki w `checks/*-log.txt`.

## Co zawiera

| ID | Ekran | Stany z mapy |
|---|---|---|
| s01 | Rejestracja | s01.1–s01.13 |
| s02 | Logowanie | s02.1–s02.13 |
| s03 | Potwierdzenie e-maila | s03.1–s03.15 |
| s04 | Strona główna | s04.1–s04.12 |
| s05 | Konto | s05.1–s05.9 |
| s06 | Skrzynka demo (symulacja poczty) | s06.1–s06.2 |

Identyfikatory ekranów są stałe, bo przypięte są do nich komentarze. Ekrany składają się z komponentów `@gomoku/ui/game/*` i tokenów `game-tokens.css`; w kodzie nie ma kolorów ani odstępów spoza tokenów. Miejsca, w których brakuje komponentu, są oznaczone w kodzie słowem `LUKA`.

## Pasek przeglądu

Na górze: oznaczenie „Prototyp”, stały „teraz” (poniedziałek 2026-10-26 10:00), bieżąca sesja, wybór ekranu s01–s06, przełącznik motywu (ciemny, jasny) i przyciski silnika przeglądu: Clickable i Comment (komentarz przypina się do elementu), Show hotspots, Presentation (jeden ekran naraz, domyślnie), Threads, Hide pins, ← Back. Komentarze eksportujesz przyciskami „Export for repository” (nowy `src/review/comments.js` do commita) albo „Export Markdown”.

Pod nimi rozwijany panel „Scenariusze”. To kontrolki prototypu, nie funkcje produktu.

## Konta demo

Hasło wszystkich kont: `drewniana-plansza-2026`. Konto wybierasz w panelu „Scenariusze” albo logujesz się w formularzu.

| Kod | Rola | E-mail | Nazwa | Stan |
|---|---|---|---|---|
| A0 | niezalogowany | | | brak sesji |
| A1 | zalogowany, e-mail potwierdzony | ala@example.com | Ala_7 | bez partii |
| A2 | zalogowany, e-mail niepotwierdzony | kuba@example.com | Kuba_P | konto z minionych minut, link w skrzynce |
| A3 | zalogowany, potwierdzony, aktywna partia | marek@example.com | Marek_Z | „Wyloguj” pyta o potwierdzenie |
| A4 | niepotwierdzony i gość partii | kuba@example.com | Kuba_P | rejestracja i logowanie zablokowane przez partię gościa |
| A5 | niepotwierdzone konto Ewy | ewa@example.com | Ewa_B | po „+7 dni” znika (Q14) |
| A6 | gość partii bez konta | | | nie może się zalogować ani zarejestrować |

Zajęte w rejestracji: marek@example.com, ala@example.com, ewa@example.com, nazwy Marek_Z, Ala_7, Ewa_B (także w odmianach, np. `marek-z`); zastrzeżona nazwa: `Admin`. Operator (A7 z mapy) nie istnieje, bo żadna specyfikacja go nie opisuje.

## Scenariusze do przełączania

Numery P01–P14 pochodzą z mapy.

| Kontrolka | Co wywołuje |
|---|---|
| Konto demo (A0–A6) | P07, P09, rola i sesja |
| Dostawca poczty: działa, 502, 503, brak | P02, P12; s01.12, s03.11–s03.12, s04.7–s04.8, s06.2 |
| Limit prób (429), błąd serwera, brak sieci | P03, P04, P05; s01.6–s01.8, s02.6–s02.8, s03.13–s03.14 |
| Już zalogowany w innej karcie (409) | P11; s01.9, s02.12 |
| Baza niedostępna | P04; s04.11, s05.8 |
| Strony się ładują (Szkielet) | s04.12, s05.9 |
| Link bez tokenu w adresie | s03.7 |
| E-mail potwierdzony w innej karcie (409), sesja wygasła przy „Wyślij ponownie” (401) | P10; s04.9–s04.10 |
| Wygaś sesję, Wyloguj w innej karcie | P07; s02.11 |
| Zegar: +1 h, +24 h, +7 dni, +31 dni, powrót do 10:00 | P08; link wygasa po 24 h, sesja po 30 dniach, niepotwierdzone konto po 7 dniach |
| Szerokość ekranu: pełna, 1440, 360, 320 px | P13 |
| Reset symulacji | P14, wraca na s01 |

Rejestracja ma też prawdziwy limit w symulacji: 6. próba w jednej sesji daje „Zbyt wiele prób”.

## Ograniczenia symulacji

- Nic nie jest wysyłane. E-mail, sesja i limity to stan w pamięci strony; odświeżenie strony go kasuje (poza komentarzami, które silnik trzyma w przeglądarce).
- Skrzynka demo pokazuje to, co dostałby właściciel adresu; nie jest ekranem produktu. Szablon wiadomości to Panel z tekstem (luka D01).
- Hasła nie są zbierane ani zapisywane poza pamięcią strony; wpisuj tylko hasło demo.
- Poza prototypem są: logowanie przez zewnętrzny serwis (D-12 go wyłącza), reset hasła, zmiana hasła, usunięcie konta, lobby, historia, tworzenie zaproszeń i gra gościa. Przyciski do nich otwierają dialog „Poza tym prototypem”.
- Teksty, których nie ma w specyfikacji, to założenia (np. błędy pól, błąd serwera i sieci, komunikat „Rejestracja jest chwilowo niedostępna”, przycisk „Przejdź dalej”, wygląd banera dla 409, 401 i 503). Są zebrane w README szarego prototypu (A-01…A-10) i w uwagach przy ekranach.
- Prototyp nie rozstrzyga otwartych luk z mapy (m.in. L01, L02, L04, L05, L10–L13, L18, L19, L20, L21, L24); ich lista jest w `lekcja-07/mapa-ekranow.md`.
- Konto A5 jest zasiane jako utworzone 6 dni temu, żeby znikało po „+7 dni” (data z mapy, 2026-10-17, dawałaby konto starsze niż 7 dni już na starcie).
- Przycisk „Zaloguj się” w nagłówku ekranu logowania wysyła formularz (uwaga z przeglądu); na pozostałych ekranach jest linkiem.
- Nagłówek niepotwierdzonego nie ma Lobby ani Historii (L06). „Wyloguj” jest na koncie, nie w nagłówku (do rozstrzygnięcia).
- Prototyp nie dowodzi popytu ani gotowości produkcyjnej.

## Dla developera

- `src/sim.ts`: symulowany serwer (konta, sesja 30 dni, tokeny 24 h, limity, scenariusze). Reguły z `.ai/specs/2026-10-24-account-registration.md`, `login-logout.md` i `email-verification.md`.
- `src/screens/s0N-*.tsx`: jeden plik na ekran, nazwy zgodne z mapą. `src/chrome.tsx`: nagłówek, dialog „Poza prototypem”, przejścia (`go`).
- `src/review/`: silnik przeglądu (`prototype.js` bez zmian), most do tokenów (`mostek.css`) i style hosta (`host.css`).
- Przy budowie prawdziwych ekranów: te same komponenty `@gomoku/ui/game/*`; zmieniają się źródła danych (route handlery zamiast `sim.ts`).
