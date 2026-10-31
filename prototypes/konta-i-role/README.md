# Klikalny prototyp: Epik 01, konta (rejestracja, logowanie, potwierdzenie e-maila, wejście z zaproszenia)

Prototyp pokazuje, jak będą wyglądać i działać ekrany z zatwierdzonej mapy (`lekcja-07/mapa-ekranow.md`), zanim powstanie kod produkcyjny. Korzysta z niego gracz, który klika i komentuje, oraz developer, który buduje z niego prawdziwe ekrany. Nic tu nie jest prawdziwą usługą: konta, sesja, poczta i limity istnieją tylko w pamięci strony, a dane są fikcyjne.

**Zmiana 2026-10-26 (D-24…D-26, BR-26…BR-28):** hasło co najmniej 8 znaków, konto aktywne od razu, potwierdzenie e-maila asynchroniczne i nieblokujące (zamykalny baner z powodem), nowy ekran s07 (wejście z zaproszenia), niepotwierdzone konta bez partii znikają po 14 dniach. Osąd właściciela, nie wynik badania.

**Rewizja 2026-10-30: usunięcie konta (E01-S06, zgłoszenie #37).** Panel „Usuń konto” na s05 (stany s05.10–s05.20), komunikat po usunięciu na s04 (s04.14) i nowy pomocniczy ekran s08 (partia zakończona widziana przez przeciwnika usuniętego gracza). Zobacz sekcję „Usunięcie konta” niżej. Stany są dopisane do mapy jako osobna sekcja 7 w `lekcja-07/mapa-ekranow.md` i **mają zatwierdzone przez właściciela założenia i pytania (decyzja 2026-10-30, „zgoda na rekomendacje”, szczegóły niżej)**; samo włączenie do tabel mapy (sekcje 1 i 6) zostaje do potwierdzenia (istniejące wpisy mapy bez zmian). Prototyp rozszerza ten katalog, a nie tworzy nowego, bo specyfikacja (O3) tak rekomenduje, ekran jest częścią s05, a konta demo, symulator sesji, zegar i silnik przeglądu są wspólne.

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

Testy nawigacji i reguł: `npx vitest run --config prototypes/konta-i-role/vitest.config.ts` (`tests/navigation.test.tsx`, `tests/usuniecie-konta.test.tsx`). Sprawdzenia w przeglądarce (agent-browser, serwer na porcie 8765): `prototypes/konta-i-role/checks/etap2-walk.sh` i `etap3-walk.sh`, wyniki w `checks/*-log.txt`. Usunięcie konta: `PORT=8771 prototypes/konta-i-role/checks/usuniecie-konta-walk.sh` (serwer HTTP na porcie z `PORT` w `packages/ui/.storybook/public`), wynik `checks/usuniecie-konta-log.txt`, zrzuty `checks/usuniecie-konta-evidence/`.

## Co zawiera

| ID | Ekran | Stany z mapy |
|---|---|---|
| s01 | Rejestracja | s01.1–s01.13 (s01.12 wycofany) |
| s02 | Logowanie | s02.1–s02.13 |
| s03 | Potwierdzenie e-maila | s03.1–s03.15 |
| s04 | Strona główna | s04.1–s04.13 |
| s05 | Konto | s05.1–s05.9 |
| s06 | Skrzynka demo (symulacja poczty) | s06.1–s06.2 |
| s07 | Wejście z zaproszenia `/invite/[code]` | s07.1–s07.9 |
| s08 | Partia zakończona, widok przeciwnika usuniętego gracza (pomocniczy, zastępuje p06 prototypu partii) | s08.1, s08.2, s08.4 (dopisek 2026-10-30; s08.3 wycofany decyzją właściciela) |

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
| A2 | zalogowany, e-mail niepotwierdzony | kuba@example.com | Kuba_P | konto z minionych minut, link w skrzynce; gra bez ograniczeń (BR-26), po „+14 dni” bez partii znika |
| A3 | zalogowany, potwierdzony, aktywna partia | marek@example.com | Marek_Z | „Wyloguj” pyta o potwierdzenie |
| A4 | niepotwierdzony i gość partii | kuba@example.com | Kuba_P | rejestracja i logowanie zablokowane przez partię gościa |
| A5 | niepotwierdzone konto Ewy | ewa@example.com | Ewa_B | bez partii; po „+14 dni” znika (BR-28) |
| A6 | gość partii bez konta | | | nie może się zalogować ani zarejestrować |
| A8 | zalogowana, e-mail potwierdzony, **oczekująca partia** (nowe 2026-10-30; A7 w mapie to nieistniejący operator) | ola@example.com | Ola_W | ostrzeżenie o usunięciu oczekującej partii (s05.11); po usunięciu jej e-mail i nazwa są wolne (Q4) |

Zajęte w rejestracji: marek@example.com, ala@example.com, ewa@example.com, nazwy Marek_Z, Ala_7, Ewa_B (także w odmianach, np. `marek-z`); zastrzeżona nazwa: `Admin`. Operator (A7 z mapy) nie istnieje, bo żadna specyfikacja go nie opisuje.

## Scenariusze do przełączania

Numery P01–P14 pochodzą z mapy.

| Kontrolka | Co wywołuje |
|---|---|
| Konto demo (A0–A6, A8) | P07, P09, rola i sesja |
| Dostawca poczty: działa, 502, 503, brak | P02, P12; s03.11–s03.12, s04.7–s04.8, s06.2; rejestracja i gra działają zawsze |
| Limit prób (429), błąd serwera, brak sieci | P03, P04, P05; s01.6–s01.8, s02.6–s02.8, s03.13–s03.14 |
| Już zalogowany w innej karcie (409) | P11; s01.9, s02.12 |
| Baza niedostępna | P04; s04.11, s05.8 |
| Strony się ładują (Szkielet) | s04.12, s05.9 |
| Link bez tokenu w adresie | s03.7 |
| E-mail potwierdzony w innej karcie (409), sesja wygasła przy „Wyślij ponownie” (401) | P10; s04.9–s04.10 |
| Wygaś sesję, Wyloguj w innej karcie | P07; s02.11 |
| Zegar: +1 h, +24 h, +7 dni, +14 dni, +31 dni, powrót do 10:00 | P08; link wygasa po 24 h, zamknięty baner wraca po 7 dniach, niepotwierdzone konto bez partii znika po 14 dniach, sesja po 30 dniach |
| Zaproszenie s07: stan (według sesji, już uczestnik, własne, inna partia, oczekująca partia, limit, nieważne) i „Rozegraj partię” (konto ma partię, więc niepotwierdzone nie jest kasowane) | P09; s07.1–s07.9, reguła 14 dni |
| Szerokość ekranu: pełna, 1440, 360, 320 px | P13 |
| Reset symulacji | P14, wraca na s01 |
| **Usunięcie konta (P15–P18).** Limit prób, błąd serwera, sesja wygasła przy następnym wysłaniu; „Brak sieci” z P05 działa też tu | s05.17, s05.18, s05.19 |
| „Poddaj partię (w innej karcie)”, „Odśwież stronę konta”, „Przeciwnik dołącza do mojej oczekującej partii (strona nieodświeżona)” | s05.12, s05.20 |
| Widok przeciwnika (s08): przeciwnik usunął konto, komunikat „Rewanż niedostępny”, oglądający jest gościem | s08.1, s08.2, s08.4 |

Rejestracja ma też prawdziwy limit w symulacji: 6. próba w jednej sesji daje „Zbyt wiele prób”.

## Ograniczenia symulacji

- Nic nie jest wysyłane. E-mail, sesja i limity to stan w pamięci strony; odświeżenie strony go kasuje (poza komentarzami, które silnik trzyma w przeglądarce).
- Skrzynka demo pokazuje to, co dostałby właściciel adresu; nie jest ekranem produktu. Szablon wiadomości to Panel z tekstem (luka D01).
- Hasła nie są zbierane ani zapisywane poza pamięcią strony; wpisuj tylko hasło demo.
- Poza prototypem są: logowanie przez zewnętrzny serwis (D-12 go wyłącza), reset hasła, zmiana hasła, usunięcie konta, lobby, historia, tworzenie zaproszeń i gra gościa. Przyciski do nich otwierają dialog „Poza tym prototypem”.
- Teksty, których nie ma w specyfikacji, to założenia (np. błędy pól, błąd serwera i sieci, przycisk „Przejdź dalej”, wygląd banera dla 409, 401 i 503). Są zebrane w README szarego prototypu (A-01…A-10) i w uwagach przy ekranach.
- Prototyp nie rozstrzyga otwartych luk z mapy (m.in. L01, L04, L05, L10–L13, L18, L19, L20, L21, L24); ich lista jest w `lekcja-07/mapa-ekranow.md`.
- Konto A5 jest zasiane jako utworzone 6 dni temu, żeby po „+14 dni” znikało (BR-28: niepotwierdzone konto bez partii); data z mapy (2026-10-17) dawałaby konto starsze niż 14 dni już na starcie.
- Przycisk „Zaloguj się” w nagłówku ekranu logowania wysyła formularz (uwaga z przeglądu); na pozostałych ekranach jest linkiem.
- Lobby i Historia są w nagłówku każdego zalogowanego (BR-26). „Wyloguj” jest na koncie (s05) i na stronie głównej zalogowanego (s04), nie w nagłówku (decyzja właściciela 2026-10-27).
- Prototyp nie dowodzi popytu ani gotowości produkcyjnej.

## Dla developera

- `src/sim.ts`: symulowany serwer (konta, sesja 30 dni, tokeny 24 h, limity, scenariusze). Reguły z `.ai/specs/implemented/2026-10-24-account-registration.md`, `login-logout.md` i `email-verification.md`.
- `src/screens/s0N-*.tsx`: jeden plik na ekran, nazwy zgodne z mapą. `src/chrome.tsx`: nagłówek, dialog „Poza prototypem”, przejścia (`go`).
- `src/review/`: silnik przeglądu (`prototype.js` bez zmian), most do tokenów (`mostek.css`) i style hosta (`host.css`).
- Przy budowie prawdziwych ekranów: te same komponenty `@gomoku/ui/game/*`; zmieniają się źródła danych (route handlery zamiast `sim.ts`).

## Usunięcie konta (rewizja 2026-10-30, E01-S06, #37)

Źródło: `.ai/specs/2026-10-24-account-deletion.md` (zaktualizowana 2026-10-30, sekcje Resolved Q1–Q9, UI/UX, Edge Cases, Open Questions O1–O6). Reguły z briefu: BR-17 (kasuje e-mail, hash, sesje; partie zostają jako „Usunięty gracz”), BR-21 („Najpierw dokończ albo poddaj partię”), BR-13, BR-24, BR-29 i D-27 („{nick} (gość)”), D-16. Brief nie został zmieniony. Droga wyjścia z blokady to poddanie partii (`.ai/specs/implemented/2026-10-29-game-resignation.md`, już na `main`: przycisk „Poddaj partię” na stronie partii).

Nic nie jest wysyłane. Hasło do usunięcia to hasło demo. Usunięcie jest w symulacji nieodwracalne do „Reset symulacji”.

### Stany

| Stan | Co widać | Jak go wywołać |
|---|---|---|
| s05.10 | Sekcja „Usuń konto” pod danymi konta, obramowana kolorem `status-danger`: ostrzeżenie „Tego nie da się cofnąć” (konto, e-mail, hasło znikają od razu; zakończone partie zostają u przeciwników jako „Usunięty gracz”), pole hasła, pole wyboru, przycisk nieaktywny z powodem obok | konto A1 (Ala_7), s05 |
| s05.11 | To samo + zdanie o oczekującej partii (też w dialogu) | konto A8 (Ola_W) |
| s05.12 | Alert „Najpierw dokończ albo poddaj partię.” z linkiem „Przejdź do partii” (w prototypie dialog „Poza tym prototypem”) i wskazaniem „Poddaj partię”; przycisk nieaktywny z powodem. Po „Poddaj partię (w innej karcie)” strona dalej blokuje, aż „Odśwież stronę konta” | konto A3 (Marek_Z) |
| s05.13 | Hasło + zaznaczone pole: przycisk aktywny | wpisz hasło, zaznacz pole |
| s05.14 | Dialog „Usunąć konto Ala_7?”, przyciski „Zostaw konto” (fokus startuje tu) i „Usuń konto na zawsze”; Esc zamyka, fokus wraca na przycisk | kliknij przycisk |
| s05.15 | Przycisk w dialogu zajęty, drugie kliknięcie nic nie wysyła; Esc blokowany, „Zostaw konto” wygląda na aktywny, ale klik nic nie robi (`ConfirmDialog` nie ma `cancelDisabled`, luka DU1) | otwórz bez `?fast`, potwierdź |
| s05.16 | Błędne hasło: dialog zamyka się, „Nieprawidłowe hasło.” przy polu, pole wyczyszczone, fokus na polu; bez licznika prób (decyzja 2026-10-30: tylko 429 z czasem odczekania) | wpisz złe hasło |
| s05.16b | Puste hasło: „Wpisz hasło.” przy polu, dialog się nie otwiera | zaznacz pole i kliknij bez hasła |
| s05.17 | Alert „Zbyt wiele prób — Spróbuj ponownie za {n} min.”, dialog zamknięty; po 10 błędach także dobre hasło daje limit, okno 15 min liczy zegar demo (+1 h zdejmuje limit) | 10 złych haseł albo przełącznik „Limit prób” |
| s05.18 | Dialog zostaje otwarty z komunikatem „Nie udało się usunąć konta. Nic nie zostało zmienione. Spróbuj ponownie.” (`role="alert"`); ten sam komunikat przy braku sieci; „Usuń konto na zawsze” ponawia | „Błąd serwera” albo „Brak sieci” |
| s05.19 | Sesja wygasła: przekierowanie na s02, po zalogowaniu powrót na s05 | „Sesja wygasła w trakcie” |
| s05.20 | Przeciwnik dołączył do oczekującej partii, gdy strona była otwarta: po potwierdzeniu `409`, dialog zamyka się, pojawia się blokada s05.12 i dostaje fokus | „Przeciwnik dołącza do mojej oczekującej partii” |
| s04.14 | Powrót na stronę główną bez sesji z zamykalnym komunikatem „Konto zostało usunięte” (`/?notice=account-deleted`); logowanie usuniętym kontem daje ogólne „Nieprawidłowy e-mail lub hasło”, rejestracja tym samym e-mailem i nazwą działa od razu (Q4) | potwierdź usunięcie |
| s08.1 | Partia zakończona: „Wygrałeś”, białe: **Usunięty gracz**, podpis „Ten gracz usunął konto. Wynik i przebieg partii zostają bez zmian.”, bez bloku rewanżu | po usunięciu konta albo „Przeciwnik usunął konto” |
| s08.2 | + Alert „Rewanż niedostępny” (decyzja właściciela 2026-10-30); nagłówek pokazuje oglądającego („Zalogowano jako Olek_R”) | przełącznik w „Widok przeciwnika” |
| ~~s08.3~~ | Wycofany (decyzja 2026-10-30): oferta rewanżu `pending` jest zamykana po cichu, przeciwnik nie widzi alertu „Zaproszenie do rewanżu odrzucone”. ID zostaje wolne | nie istnieje |
| s08.4 | Oglądający jest gościem „Piotr (gość)” (BR-29): bez bloku rewanżu i bez „Zalogowano jako” w nagłówku | przełącznik w „Widok przeciwnika” |

Stany są numerowane tak, by dopisać je do mapy (sekcja 7 w `lekcja-07/mapa-ekranow.md`); s05.1–s05.9 i s04.1–s04.13 się nie zmieniają.

### Decyzje właściciela z 2026-10-30 („zgoda na rekomendacje”)

Właściciel zatwierdził O1–O6 oraz pięć pytań z przeglądu. Znaczniki `[ASSUMPTION …]` zastąpiono przez `[DECYZJA 2026-10-30]` (ślad: dawne oznaczenie w nawiasie). Wpisy są też w `.ai/specs/2026-10-24-account-deletion.md`.

1. **Bez licznika prób** (dawne A-D5, LU3): błędne hasło daje zawsze „Nieprawidłowe hasło.”; po 10 błędach w 15 minutach tylko 429 z czasem odczekania. `data.attemptsLeft` NIE wchodzi do API. Wariant s05.16c usunięty.
2. **Widok przeciwnika** (LU2): komunikat „Rewanż niedostępny” TAK (s08.2); „Zaproszenie do rewanżu odrzucone” NIE, oferta `pending` jest zamykana po cichu (s08.3 wycofany).
3. **Blokada s05.12** (A-D6): tekst wprost każe wybrać „Poddaj partię” i odświeżyć stronę; poddanie jest możliwe w każdej partii `active` (A-D10, `GameMoveService.resign`).
4. **Komponenty DS** (A-D12, DU1, DU2): `Alert`, panel z obramowaniem `status-danger` jako „strefa niebezpieczna” i slot na komunikat w `ConfirmDialog`. Mała zmiana DS wchodzi w tym samym PR co implementacja #37. W prototypie luki DU1/DU2 zostają jako `LUKA` z adnotacją „zatwierdzone do wdrożenia”.
5. **s08 zostaje w mapie kont** (LU1): sekcja 7 `lekcja-07/mapa-ekranow.md`, nie `mapa-ekranow-partia.md`.

### Decyzje z O1–O6 (zatwierdzone przez właściciela 2026-10-30)

- `[DECYZJA 2026-10-30]` (dawniej `[ASSUMPTION O1]`) O1: endpoint `POST /api/account/delete`; prototyp go nie pokazuje (nie ma adresów), ale kolejność kontroli (sesja, limit, hasło, partia) jest z kontraktu.
- `[DECYZJA 2026-10-30]` (dawniej `[ASSUMPTION O2]`) O2: oferta rewanżu `pending` z udziałem usuwanego konta jest zamykana jako `declined`; przeciwnik nie widzi o tym alertu (zamknięcie po cichu, s08.3 wycofany), a serwer odrzuca nowe oferty guardem `REMATCH_UNAVAILABLE`. UI przeciwnika: tylko „Rewanż niedostępny” (s08.2); wobec usuniętego gracza nie ma bloku „Rewanż” (s08.1).
- `[DECYZJA 2026-10-30]` (dawniej `[ASSUMPTION O3]`) O3: ten prototyp; rozszerzenie `konta-i-role`, nie osobny katalog.
- `[DECYZJA 2026-10-30]` (dawniej `[ASSUMPTION O4]`) O4: reguła 9.4 (14 dni) w tym samym PR: bez ekranu, niczego tu nie dodaje.
- `[DECYZJA 2026-10-30]` (dawniej `[ASSUMPTION O5]`) O5: pole hasła w panelu, nie w dialogu; dialog ma tylko opis.
- `[DECYZJA 2026-10-30]` (dawniej `[ASSUMPTION O6]`) O6: brak e-maila po usunięciu; prototyp nie ma skrzynki dla tego zdarzenia.

### Założenia prototypu spoza O1–O6 (do przeglądu)

- `[ASSUMPTION A-D1]` Panel „Usuń konto” stoi pod „Dane konta” (spec: pod „Zmień hasło”, którego prototyp nie ma, L19).
- `[ASSUMPTION A-D2]` Puste hasło jest łapane po stronie klienta przed dialogiem („Wpisz hasło.”, s05.16b). Spec pokazuje tylko `400 VALIDATION` z serwera.
- `[ASSUMPTION A-D3]` Etykieta przycisku w panelu i w dialogu to „Usuń konto na zawsze” (wzorzec DS i spec), nie „Usuń konto na stałe”.
- `[ASSUMPTION A-D4]` Błąd hasła czyści pole i przenosi fokus na nie (spec: „fokus na polu”; czyszczenie jak na s02).
- `[DECYZJA 2026-10-30]` (dawniej `[ASSUMPTION A-D5]`) **Bez licznika prób.** Kontrakt API nie zwraca liczby pozostałych prób i tak zostaje: s05.16 pokazuje tylko „Nieprawidłowe hasło.”, a limit dopiero po fakcie jako 429 z czasem odczekania. `data.attemptsLeft` nie wchodzi do API (mapa LU3 rozstrzygnięta).
- `[DECYZJA 2026-10-30]` (dawniej `[ASSUMPTION A-D6]`) Treść bloku s05.12: „Masz partię w toku. Na stronie partii wybierz „Poddaj partię”, a potem odśwież tę stronę.” plus link „Przejdź do partii”. Spec daje tylko zdanie z BR-21 i link; wskazanie drogi wyjścia („Poddaj partię” i odświeżenie strony) zatwierdzone przez właściciela.
- `[ASSUMPTION A-D7]` Limit 429: „Zbyt wiele prób — Spróbuj ponownie za {n} min.” (jak na s02), z `Retry-After` liczonym od pierwszego błędu w oknie 15 min; wymuszony przełącznikiem pokazuje 12 min.
- `[ASSUMPTION A-D8]` Pomocniczy ekran s08 i jego podpis „Ten gracz usunął konto. Wynik i przebieg partii zostają bez zmian.” jest propozycją; komunikat „Rewanż niedostępny” (s08.2) jest decyzją właściciela 2026-10-30; spec (Edge Cases) wymaga tylko, by UI nie pokazywał „Rewanż”.
- `[ASSUMPTION A-D9]` Wygaśnięcie okna limitu i leniwe zamykanie starych slotów (Q7) nie mają osobnych stanów; prototyp pokazuje tylko wynik (usunięcie przechodzi albo blokada).
- `[ASSUMPTION A-D10]` Partia `active`, do której przeciwnik jeszcze nie wszedł (spec, Edge Cases: do sprawdzenia, czy poddanie jest wtedy możliwe): prototyp nie rozróżnia jej. Sprawdzone w kodzie (przegląd PR #105, 2026-10-30): `GameMoveService.resign` dopuszcza poddanie w każdej partii `active`, także przed pierwszym ruchem i bez `seen_at` któregokolwiek gracza, a `resolveParticipant` wymaga tylko bycia uczestnikiem; strona partii pokazuje „Poddaj partię” zawsze, gdy partia nie jest zakończona. Komunikat s05.12 jest więc prawdziwy także w tym przypadku i użytkownik nie czeka 15 minut bez wyjścia.

- `[ASSUMPTION A-D11]` Teksty spoza specyfikacji: powód przy partii w toku „Usunięcie jest możliwe dopiero po zakończeniu partii.”, tytuł ostrzeżenia „Tego nie da się cofnąć” (z wzorca DS), podpowiedź „Podaj hasło, aby potwierdzić, że to Ty.”.
- `[DECYZJA 2026-10-30]` (dawniej `[ASSUMPTION A-D12]`) Spec nazywa komponenty `ErrorMessage` (429) i `DismissibleNotice` (s04.14), które są w aplikacji, a nie w `@gomoku/ui/game/*`; prototyp używa `Alert` (+ `Button` „Zamknij”). `[DECYZJA 2026-10-30]` zatwierdzone: `Alert`, panel `status-danger` i slot w `ConfirmDialog` (zob. decyzja 4).
- `[ASSUMPTION A-D13]` s08: automatycznie włącza się po usunięciu dowolnego konta demo (także Ali bez zakończonych partii), a treść „Wygrałeś / Przeciwnik poddał się” jest stała. „Usunięty gracz” dotyczy tylko konta; flaga „Oglądający jest gościem” pokazuje gościa jako oglądającego („Ty (Piotr (gość))” to artefakt demo), a nie jako przeciwnika. Nagłówek s08 pokazuje oglądającego („Zalogowano jako Olek_R”), a dla gościa nie pokazuje „Zalogowano jako”.
- `data-testid` ze specyfikacji: `-confirm`, `-submit`, `-active-game` są; `delete-account-password` jest tylko jako `id` pola (`PasswordField` nie przyjmuje `data-testid`; luka DS DU3).

### Luki w design systemie

- **DU1** (`LUKA` w `delete-account.tsx`, zatwierdzone do wdrożenia 2026-10-30): `ConfirmDialog` ma tylko `description`, więc błąd serwera jest zdaniem w opisie z `role="alert"`; slot na komunikat dochodzi do komponentu jako mała zmiana DS w PR implementacji #37. Pole hasła zostaje w panelu (O5). Prototyp nie zmienia komponentu.
- **DU2** (`LUKA`, zatwierdzone do wdrożenia 2026-10-30): brak wzorca „strefa niebezpieczna”; to Panel z obramowaniem `border-status-danger` (token), bez nowego wariantu.
- Fokus wraca na przycisk po zamknięciu dialogu tylko wtedy, gdy przycisk jest `trigger` komponentu `ConfirmDialog` (Radix). Z przyciskiem poza dialogiem fokus ginął (wynik pierwszego przejścia); prototyp używa `trigger`. Wymaga tego samego rozwiązania w kodzie produkcyjnym.

### Czego prototyp nie robi

- Nie sprawdza współbieżności, blokad bazy ani kaskad (to testy PostgreSQL w specyfikacji).
- Usunięcie oczekującej partii nie zmienia ekranu zaproszenia s07 (spec: link staje się „zaproszenie nieważne”; w prototypie s07 wybierasz ręcznie „Nieważne”).
- Licznik błędnych haseł jest liczony per konto demo (jak `account-delete:user:{id}`).
- Nie pokazuje listy historii przeciwnika (#27) ani panelu zmiany hasła (#36).
- „Przejdź do partii” otwiera dialog „Poza tym prototypem”; prawdziwy ekran partii z poddaniem jest w prototypie `partia-z-zaproszenia` (p05).
- Zegar 15-minutowego okna limitu liczy zegar demo (nie czas rzeczywisty).
