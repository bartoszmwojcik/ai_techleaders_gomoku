# Mapa ekranów: Epik 01, rejestracja, logowanie, potwierdzenie e-maila, brak dostępu

- Data: 2026-10-25. Status: **zatwierdzona przez właściciela produktu** (nic nie zbudowano). Identyfikatory ekranów (s01–s06), stanów (sNN.M), scenariuszy (P01–P14) i luk (L01–L26, D01–D08) są od teraz stałe.
- Przepływ: Epik E01 (#15), historie #19 (rejestracja), #20 (logowanie i wylogowanie), #34 (potwierdzenie e-maila) oraz „brak dostępu” (BR-23 i strażnik stron). Reset hasła (#35), zmiana hasła (#36) i usunięcie konta (#37) są poza tą mapą, bo nie ma ich na liście przepływu. Dotykają jej tylko w trzech miejscach (L19).
- Materiały przeczytane: `.ai/specs/product-brief.md`, `.ai/specs/backlog.md`, `2026-10-24-account-registration.md`, `login-logout.md`, `email-verification.md`, `password-reset.md` (tylko styk z logowaniem), `game-invitations.md` (tylko stany dla niezalogowanego i niepotwierdzonego), `packages/ui/docs/design-system.md`, `docs/epics/konta.mdx`, `docs/patterns/permissions.mdx`, `docs/design-system/czego-brakuje.mdx`, `docs/screens/konta.stories.tsx`, `screen.tsx`, `home-screen.tsx`. Persony: brak (`.ai/specs/research/` nie zawiera `personas.md`).

## Uwaga o różnicy między poleceniem a materiałami

Polecenie wspomina logowanie GitHubem oraz role mentee, mentor i operator. W materiałach tego projektu (Gomoku 1:1 online) ich nie ma. Uwierzytelnianie jest własne, e-mail + hasło, a logowanie zewnętrzne jest wyłączone wprost (D-12, spec #19 „Poza zakresem”). Role to: niezalogowany odwiedzający, gość partii (BR-22), zalogowany z niepotwierdzonym e-mailem i zalogowany z potwierdzonym e-mailem. Roli operatora nie ma w żadnej specyfikacji (L16). „GitHub niedostępny” zastępuje w tej mapie „dostawca poczty niedostępny”, bo to jedyna zewnętrzna usługa przepływu (Q-02, #38).

## 0. Historie i kryteria w zakresie

Oznaczenia kryteriów: `#19/K1` = kryterium 1 historii #19. Decyzje spoza kryteriów podaję z ich numerem (BR, D, G, H, Q) i specyfikacją, gdy numer się powtarza.

| Historia | Kryteria akceptacji (skrót) | Źródło |
|---|---|---|
| E01-S01 #19 Rejestracja | K1 poprawne dane: konto powstaje, gość jest zalogowany. K2 zajęty identyfikator: odrzucenie, drugie konto nie powstaje. K3 niepoprawne dane: widoczny błąd, konto nie powstaje. | `account-registration.md` |
| E01-S02 #20 Logowanie, wylogowanie | K1 poprawne dane: zalogowany. K2 błędne hasło: odmowa, komunikat nie zdradza istnienia konta. K3 po wylogowaniu strony wymagające logowania są niedostępne. | `login-logout.md` |
| E01-S03 #34 Potwierdzenie e-maila | K1 po rejestracji wychodzi wiadomość z linkiem. K2 ważny link: e-mail potwierdzony, gra odblokowana. K3 link użyty lub wygasły: brak potwierdzenia, komunikat z możliwością ponownego wysłania. K4 ponowne wysłanie daje nowy link, liczba próśb ograniczona. | `email-verification.md` |
| E01-S03-T01 #38 (zadanie) | Wybór dostawcy poczty. Bez UI, ale warunkuje stany „wynik zewnętrznej usługi”. | backlog |

Reguły przekrojowe, z których wynikają stany: BR-14 (unikalny e-mail i nazwa), BR-16 i D-14 (zajęty e-mail nie jest ujawniany), BR-20 (telefon), BR-22 (gość), BR-23 i D-17 (bez potwierdzenia nie gra), D-12 (własne uwierzytelnianie), D-20 (darmowy plan poczty), G2 (CSRF), G5 (sesja 30 dni), G8 (`next`), G9 i H2 (Pokaż hasło), H1 (limity logowania), `email-verification` Q1–Q16.

## 1. Tabela ekranów

Znak ⚠ przy stanie oznacza, że żadne kryterium ani decyzja go nie opisuje (luka, szczegóły w sekcji 4). Pełna lista stanów z uzasadnieniem jest w sekcji 1a.

| ID | Ekran | Rola | Stany | Historia lub kryterium | Komponenty DS |
|---|---|---|---|---|---|
| s01 | Rejestracja `/register` | Niezalogowany. Zalogowany jest przekierowany na `/`. Gość partii z aktywną partią nie może się zarejestrować (L14) | s01.1 domyślny, s01.2 błędy pól, s01.3 nazwa zajęta, s01.4 e-mail zajęty, s01.5 wysyłanie, s01.6 limit prób, s01.7 błąd serwera ⚠, s01.8 brak sieci ⚠, s01.9 już zalogowany (409) ⚠, s01.10 sukces, s01.11 zalogowany wchodzi, s01.12 rejestracja niedostępna (brak poczty), s01.13 gość z aktywną partią | #19/K1–K3, BR-14, BR-16, G3, G4, G6, G8, G9 | Nagłówek strony, Pole formularza, Pole tekstowe, Pole hasła, Przycisk (`loading`), Alert, Link tekstowy |
| s02 | Logowanie `/login` | Niezalogowany. Zalogowany jest przekierowany na `next` | s02.1 domyślny, s02.2 z `next` (po odbiciu ze strony chronionej) ⚠, s02.3 błędne dane, s02.4 błędy pól, s02.5 wysyłanie ⚠, s02.6 limit prób, s02.7 błąd serwera, s02.8 brak sieci ⚠, s02.9 sukces, s02.10 zalogowany wchodzi, s02.11 sesja wygasła ⚠, s02.12 już zalogowany (409) ⚠, s02.13 gość z aktywną partią nie może się zalogować | #20/K1–K3, H1, H2, G5, G8 | Nagłówek strony, Pole formularza, Pole tekstowe, Pole hasła, Przycisk, Alert, Link tekstowy |
| s03 | Potwierdzenie e-maila `/verify-email?token=…` | Każdy z linkiem z wiadomości (zalogowany lub nie, token jest dowodem) | s03.1 przed kliknięciem, s03.2 potwierdzanie, s03.3 sukces niezalogowany, s03.4 sukces zalogowany, s03.5 link nieważny (zalogowany), s03.6 link nieważny (niezalogowany), s03.7 brak tokenu, s03.8 już potwierdzony, s03.9 nowy link wysłany, s03.10 nowy link: limit, s03.11 nowy link: błąd wysyłki, s03.12 nowy link: dzienny limit poczty ⚠, s03.13 błąd serwera ⚠, s03.14 brak sieci ⚠, s03.15 zalogowany na inne konto | #34/K2, K3, K4; #34 Q3, Q5, Q7, Q11 | Nagłówek strony, Alert, Przycisk, Link tekstowy |
| s04 | Strona główna `/` | Niezalogowany, niepotwierdzony, potwierdzony | s04.1 niezalogowany, s04.2 niepotwierdzony, s04.3 potwierdzony, s04.4 baner: wysyłanie, s04.5 baner: wysłano, s04.6 baner: limit, s04.7 baner: błąd wysyłki, s04.8 baner: dzienny limit poczty ⚠, s04.9 baner: już potwierdzony ⚠, s04.10 baner: sesja wygasła ⚠, s04.11 baza niedostępna, s04.12 ładowanie ⚠ | #19 (widok „zalogowany”), #20 (linki), #34/K1, K4, BR-23 | Nagłówek strony, Plansza (podgląd), Przycisk, Link tekstowy, Baner potwierdzenia e-maila, Alert |
| s05 | Konto `/account` | Zalogowany (obie odmiany). Niezalogowany jest odesłany na s02.2 | s05.1 potwierdzony, s05.2 niepotwierdzony, s05.3 wylogowanie w toku ⚠, s05.4 wylogowanie w trakcie partii (dialog), s05.5 wylogowanie nieudane ⚠, s05.6 brak sesji, s05.7 wylogowany, s05.8 baza niedostępna, s05.9 ładowanie ⚠ | #20/K1, K3, #20 Q4, BR-23, #34 UI | Nagłówek strony, Panel, Znacznik statusu, Baner potwierdzenia e-maila, Przycisk, Dialog potwierdzenia, Alert |
| s06 | Wiadomość e-mail z linkiem (artefakt poza aplikacją) | Właściciel skrzynki | s06.1 dostarczona, s06.2 niedostarczona lub w spamie ⚠ | #34/K1, Q5, Q8 | brak (D01) |

Prototypowa „skrzynka” do otwierania s06 jest kontrolką prototypu (P01), nie ekranem produktu.

### 1a. Stany ekranów i ich źródła

**s01 Rejestracja**

| Stan | Co widać | Źródło |
|---|---|---|
| s01.1 | Pola: E-mail, Nazwa gracza (podpis „Widzą ją Twoi przeciwnicy”), Hasło (podpowiedź „Co najmniej 16 znaków”, Pokaż hasło); przycisk „Załóż konto”; link „Masz już konto? Zaloguj się” | #19 UI, G9, DS Konta |
| s01.2 | Błędy pod polami (e-mail, nazwa 3–24 znaki i dozwolone znaki, nazwa zastrzeżona, hasło < 16 znaków lub > 72 bajty), fokus na pierwszym błędnym polu | #19/K3, G3, G4 |
| s01.3 | „Ta nazwa jest zajęta” przy polu nazwy; konto nie powstaje | #19/K2, Q7, G6 |
| s01.4 | Jednolity komunikat nad formularzem „Nie udało się założyć konta. Jeśli masz już konto, zaloguj się.” bez wskazania pola; także gdy zajęte są oba | #19/K2, BR-16, D-14 |
| s01.5 | Przycisk nieaktywny, etykieta „Zakładanie konta…” | #19 UI |
| s01.6 | „Zbyt wiele prób. Spróbuj ponownie za {n} min.” (429, 5 prób na godzinę) | #19 Edge Cases |
| s01.7 ⚠ | 500/brak bazy: „Nie udało się założyć konta, spróbuj ponownie” w `role="alert"` nad formularzem. Treść jest w spec, ale story w DS nie ma | #19 Edge Cases; D05 |
| s01.8 ⚠ | Utrata sieci lub odpowiedź nie-JSON: komunikat ogólny, formularz zachowuje dane poza hasłem | #19 Edge Cases; D05 |
| s01.9 ⚠ | Odpowiedź `409 ALREADY_AUTHENTICATED` (zalogowanie w drugiej karcie w trakcie wypełniania). Spec ma kod, nie ma treści | #19 API; L04 |
| s01.10 | Przekierowanie `router.replace(safeNextPath(next) ?? "/")`; `/` pokazuje „Zalogowano jako {nazwa}” i, bo e-mail jest niepotwierdzony, baner (s04.2) | #19/K1, G8, BR-23 |
| s01.11 | Zalogowany wchodzący na `/register` trafia na `/` (nie na `next`) | #19 Architecture |
| s01.12 | Rejestracja niedostępna, gdy nie działa wysyłka poczty (produkcja bez dostawcy): formularz zastąpiony komunikatem. **Decyzja właściciela (L03)**: e-mail jest warunkiem rejestracji. Treść komunikatu do ustalenia | #34 Q13, decyzja L03 |
| s01.13 | Gość z aktywną partią wchodzi na `/register`: rejestracja niedostępna (tylko z aktywną partią, po jej zakończeniu może się zarejestrować). **Decyzje L14, L23, L26**. Treść komunikatu do ustalenia (L05) | decyzje L14, L23 |

**s02 Logowanie**

| Stan | Co widać | Źródło |
|---|---|---|
| s02.1 | E-mail, Hasło (Pokaż hasło), „Zaloguj się”, linki „Nie pamiętasz hasła?” (L19) i „Nie masz konta? Załóż konto” (z tym samym `next`) | #20 UI, H2 |
| s02.2 ⚠ | Ten sam formularz po przekierowaniu z `/account` (adres `/login?next=%2Faccount`). Spec nie przewiduje komunikatu, dlaczego użytkownik tu trafił | #20/K3, L01 |
| s02.3 | „Nieprawidłowy e-mail lub hasło.” w `role="alert"` nad formularzem, bez wskazania pola. Ta sama treść dla nieznanego e-maila, złego hasła i konta usuniętego po 7 dniach bez potwierdzenia | #20/K2, standardy §1 |
| s02.4 | Błędy kształtu przy polach (pusty lub nie-e-mail); bez reguł długości hasła | #20 API |
| s02.5 ⚠ | Wysyłanie: przycisk nieaktywny; etykiety stanu spec nie podaje (rejestracja ma „Zakładanie konta…”) | #20 UI; L05 |
| s02.6 | „Zbyt wiele prób. Spróbuj ponownie za {n} min.” (10 na parę e-mail + adres w 15 min, 100 na e-mail w godzinę, 30 na adres w godzinę, ten sam komunikat) | #20 H1 |
| s02.7 | 500/baza: komunikat ogólny | #20 Edge Cases |
| s02.8 ⚠ | Brak sieci lub odpowiedź nie-JSON | #19 `apiCall`; D05 |
| s02.9 | Przekierowanie na `safeNextPath(next)`; obcy `next` (`//evil.com`) daje `/`. Konto niepotwierdzone loguje się normalnie i widzi baner | #20/K1, G8, BR-23 |
| s02.10 | Zalogowany na `/login` trafia na `safeNextPath(next)` | #20 UI |
| s02.11 ⚠ | Wygasła sesja (30 dni, G5) jest traktowana jak brak sesji; użytkownik widzi zwykły formularz | G5, #19 Edge Cases; L01 |
| s02.12 ⚠ | `409 ALREADY_AUTHENTICATED` na formularzu logowania | #20 API; L04 |
| s02.13 | Gość z aktywną partią wchodzi na `/login`: logowanie niedostępne, tak samo jak rejestracja. Logowanie jest możliwe, dopóki gość nie rozpoczął gry. **Decyzje L14, L26**. Treść komunikatu do ustalenia (L05) | decyzje L14, L26 |

**s03 Potwierdzenie e-maila**

| Stan | Co widać | Źródło |
|---|---|---|
| s03.1 | Nagłówek „Potwierdź adres e-mail”, przycisk „Potwierdź e-mail”; samo wejście z linku niczego nie zmienia | #34/K2, Q3 |
| s03.2 | Przycisk zablokowany po kliknięciu (dwa kliknięcia nie potwierdzają dwa razy) | #34 Edge Cases |
| s03.3 | „Adres potwierdzony — możesz grać”, przejście do `next` (lub `/`), gracz pozostaje niezalogowany. Czy przejście jest automatyczne: L13 | #34/K2, Q5 |
| s03.4 | To samo dla zalogowanego; po przejściu baner na `/` i `/account` znika | #34/K2 |
| s03.5 | „Link wygasł lub został już użyty.” + przycisk „Wyślij nowy link”. Jednolite dla: użyty, wygasły (24 h), unieważniony nowszym linkiem, nieznany, konto usunięte | #34/K3, Q2, Q7, Q11 |
| s03.6 | Ten sam komunikat + link „Zaloguj się, aby wysłać nowy link” (`/login?next=/account`) | #34 UI |
| s03.7 | Adres bez `token`: ten sam komunikat błędu | #34 UI |
| s03.8 | Zalogowany z potwierdzonym kontem: „Adres jest już potwierdzony” | #34 Q11 |
| s03.9 | Po „Wyślij nowy link”: potwierdzenie wysłania (poprzedni link przestaje działać) | #34/K4, Q7 |
| s03.10 | Limit: 3 wysyłki na konto na godzinę i 10 na adres; `Retry-After` | #34/K4, Q4 |
| s03.11 | „Nie udało się wysłać wiadomości. Spróbuj później.” (502); poprzedni link zostaje ważny | #34 API, Q1, Q7 |
| s03.12 ⚠ | „Wysyłka wiadomości jest chwilowo niedostępna. Spróbuj jutro albo zagraj jako gość z zaproszenia.” (503) pochodzi z API `resend`; strona błędu nie mówi, czy te wyniki pokazuje | #34 API Q10; L10 |
| s03.13 ⚠ | 500 przy potwierdzaniu (API `confirm` ma tylko 200/400/403) | L10 |
| s03.14 ⚠ | Brak sieci przy potwierdzaniu | L10 |
| s03.15 | Zalogowany na inne konto: potwierdzane jest konto z tokenu, komunikat nie ujawnia, które | #34 Edge Cases |

**s04 Strona główna**

| Stan | Co widać | Źródło |
|---|---|---|
| s04.1 | Podgląd planszy, jedna główna akcja „Załóż konto” oraz „Zaloguj się” | #19, #20, DS permissions (zasada 3) |
| s04.2 | „Zalogowano jako {nazwa}”, baner „Potwierdź e-mail, aby grać. Link wysyłamy na {adres} — sprawdź też folder spam.”, lobby i historia ukryte w nagłówku (L06); pozostałe akcje gry zablokowane z powodem obok (L17) | BR-23, #34 UI, DS permissions |
| s04.3 | „Zalogowano jako {nazwa}”, brak banera, link „Konto”; akcje gry z E02/E03 pokazane jak w DS, ale nieaktywne (decyzja L17) | #34/K2, #20 UI |
| s04.4–s04.10 | Stany banera: wysyłanie, wysłano, limit z czasem i zablokowanym przyciskiem, błąd wysyłki, dzienny limit poczty ⚠, już potwierdzony (409) ⚠, sesja wygasła (401) ⚠ | #34/K4, Q4, Q6, Q10; L11 |
| s04.11 | Błąd odczytu sesji (baza) daje widok niezalogowany, nie 500 | #19 Architecture |
| s04.12 ⚠ | Strona jest dynamiczna (`await connection()`); stanu ładowania spec nie opisuje | L18 |

**s05 Konto**

| Stan | Co widać | Źródło |
|---|---|---|
| s05.1 | Nazwa gracza, e-mail ze znacznikiem „Potwierdzony”, przycisk „Wyloguj” | #20 UI |
| s05.2 | To samo ze znacznikiem „Niepotwierdzony” i banerem (stany banera jak s04.4–s04.10) | BR-23, #34 UI |
| s05.3 ⚠ | Wylogowanie w toku (przycisk zajęty) | L20 |
| s05.4 | Przy aktywnej partii dialog „Trwa partia — po wylogowaniu zegar biegnie dalej. Wylogować?” | #20 Q4 |
| s05.5 ⚠ | Wylogowanie zwróciło 500; ciasteczko i tak usunięte. Co widzi użytkownik: spec milczy | #20 API; L20 |
| s05.6 | Wejście bez sesji: przekierowanie na `/login?next=%2Faccount` (s02.2) | #20/K3 |
| s05.7 | Po wylogowaniu `router.replace("/")`; ponowne wejście na `/account` odsyła na logowanie | #20/K1, K3 |
| s05.8 | Błąd odczytu sesji (baza): przekierowanie na `/login` (fail closed) | #20 Edge Cases |
| s05.9 ⚠ | Ładowanie | L18 |

**s06 Wiadomość e-mail**

| Stan | Co widać | Źródło |
|---|---|---|
| s06.1 | Nadawca z `EMAIL_FROM` („Gomoku”), polski tekst + prosty HTML, link `/verify-email?token=…&next=…`, zdanie „Jeśli to nie Ty zakładałeś konto w Gomoku, zignoruj tę wiadomość” | #34/K1, Q5, Q8 |
| s06.2 ⚠ | Wiadomość nie dochodzi lub ląduje w spamie. Baner mówi „sprawdź też folder spam”, ale nic ponad to | #34 Risks; L21 |

Stan „pusty” nie dotyczy żadnego z tych ekranów (nie ma list). Stan „brak dostępu” wynika z przekierowań i blokad, nie z osobnej strony (L15).

### 1b. Role i dostęp

| Ekran | Niezalogowany | Gość partii (BR-22) | Zalogowany, e-mail niepotwierdzony | Zalogowany, e-mail potwierdzony |
|---|---|---|---|---|
| s01 `/register` | formularz | z aktywną partią: niedostępne (L14, L23, L26); bez niej: formularz | przekierowanie na `/` | przekierowanie na `/` |
| s02 `/login` | formularz | z aktywną partią: niedostępne (L14, L26); przed rozpoczęciem gry: formularz | przekierowanie na `next` | przekierowanie na `next` |
| s03 `/verify-email` | działa (token = dowód) | działa | działa; „Wyślij nowy link” | działa; jeśli już potwierdzony, s03.8 |
| s04 `/` | s04.1 | s04.1 | s04.2, baner, lobby i historia ukryte | s04.3 |
| s05 `/account` | przekierowanie na s02.2 | przekierowanie na s02.2 (decyzja L15) | s05.2 | s05.1 |
| Akcje gry (tworzenie partii, lobby, dołączenie jako on sam) | brak | tylko dołączenie z linku jako gość | lobby i historia niewidoczne (L06); tworzenie partii i dołączenie jako on sam zablokowane z powodem (`EMAIL_NOT_VERIFIED`), alternatywa: gość z linku | dostępne (poza tą mapą) |

## 2. Scenariusze do przełączania w prototypie

To kontrolki prototypu (panel przeglądu), nie funkcje produktu. Każdy scenariusz ma ID, żeby komentarze mogły się do niego odwoływać.

| ID | Scenariusz | Wywołuje stany |
|---|---|---|
| P01 | Skrzynka demo: otwórz ostatnią wiadomość i kliknij link (ważny, wygasły po przesunięciu zegara, użyty, unieważniony nowszym, bez tokenu, token obcego konta) | s06.1, s03.1–s03.8, s03.15 |
| P02 | Dostawca poczty: działa, awaria (502), dzienny limit (503), niedostarczone (nic w skrzynce) | s03.11, s03.12, s04.7, s04.8, s06.2 |
| P03 | Limit prób (429 z `Retry-After`) dla rejestracji, logowania i ponownego wysłania | s01.6, s02.6, s03.10, s04.6 |
| P04 | Baza niedostępna (500, fail closed) | s01.7, s02.7, s03.13, s04.11, s05.5, s05.8 |
| P05 | Brak sieci lub odpowiedź nie-JSON | s01.8, s02.8, s03.14 |
| P06 | Konflikty rejestracji: zajęta nazwa, zajęty e-mail, zajęte oba, nazwa zastrzeżona (`Admin`), nazwa różniąca się tylko znakami (`Lukasz` przy `Łukasz`) | s01.2, s01.3, s01.4 |
| P07 | Sesja: wygasła (30 dni), unieważniona w innej karcie, wylogowana | s02.11, s04.10, s05.6, s05.7 |
| P08 | Zegar demo: „teraz” + 1 h, + 24 h (link wygasł), + 7 dni (niepotwierdzone konto usunięte), + 30 dni (sesja wygasła) | s03.5, s02.3, s02.11 |
| P09 | Konto z aktywną partią (dialog wylogowania) | s05.4 |
| P10 | Stan e-maila zmieniony poza kartą (potwierdzono na telefonie), potem „Wyślij ponownie” (409) | s04.9 |
| P11 | Już zalogowany w drugiej karcie (409 przy wysyłaniu formularza) | s01.9, s02.12 |
| P12 | Dostawca poczty nieskonfigurowany (produkcja bez #38) | s01.12 |
| P13 | Szerokość 320 / 360 / 1280 px, motyw ciemny i jasny | wszystkie |
| P14 | Przeglądarka: nowa sesja bez ciasteczek (czysty odwiedzający) | s04.1 |

## 3. Konta i dane demo

Wszystko fikcyjne. Adresy w domenie `example.com`, hasło demo wszystkich kont: `drewniana-plansza-2026` (22 znaki, spełnia G3).

**Stały „teraz” zegara demo: poniedziałek 2026-10-26 10:00 (Europe/Warsaw).** Od niego liczą się: ważność linku (24 h), limit okna (1 h, 15 min), sesja (30 dni), usunięcie niepotwierdzonego konta (7 dni, Q14).

| Konto | Rola / połączenie ról | E-mail | Nazwa gracza | Stan |
|---|---|---|---|---|
| A0 | Niezalogowany odwiedzający | brak | brak | brak sesji |
| A1 | Zalogowany, e-mail potwierdzony | ala@example.com | Ala_7 | konto z 2026-10-12, sesja do 2026-11-25, bez partii |
| A2 | Zalogowany, e-mail niepotwierdzony | kuba@example.com | Kuba_P | konto z 2026-10-26 09:55, link ważny do 2026-10-27 09:55 |
| A3 | Zalogowany, e-mail potwierdzony, aktywna partia (dialog wylogowania, BR-13) | marek@example.com | Marek_Z | partia w toku z A1; zajęta nazwa i e-mail dla konfliktów rejestracji |
| A4 | Połączenie: niepotwierdzony + gość partii (BR-22, BR-23, `game-invitations` Q7) | kuba@example.com | Kuba_P | zalogowany niepotwierdzony, ma też token gościa jednej partii (L14) |
| A5 | Niepotwierdzone konto starsze niż 7 dni (do skasowania, Q14) | ewa@example.com | Ewa_B | założone 2026-10-17, widoczne tylko po przesunięciu zegara (P08) |
| A6 | Gość partii bez konta | brak | brak | token jednej partii w ciasteczku, ważny do końca partii + 1 h |
| A7 | Operator | brak w materiałach | | L16 |

Dane z briefu, których używa prototyp: nazwa „Gomoku”; podgląd planszy 15×15 (swobodne zasady, 5 w linii); 10 minut na gracza; hasło co najmniej 16 znaków, najwyżej 72 bajty; nazwa gracza 3–24 znaki; link potwierdzenia ważny 24 h; limity: 5 rejestracji na godzinę, 10 prób logowania na parę w 15 min, 3 ponowne wysłania na godzinę. Zastrzeżone nazwy: `usunietygracz`, `admin`, `administrator`, `moderator`, `system`, `gomoku`, `support`. Ceny, terminy handlowe i oferty: brak w briefie (gra jest darmowa, D-19), więc nie ma czego pokazywać.

## 4. Luki w specyfikacji

Typy: **K** = kryterium bez ekranu lub stanu, **S** = stan bez kryterium, **X** = sprzeczność, **D** = decyzja, której nikt nie podjął. Niczego nie rozstrzygam.

| ID | Typ | Luka | Gdzie | Pytanie do właściciela produktu |
|---|---|---|---|---|
| L01 | S | Odbicie ze strony chronionej i wygasła sesja nie mają komunikatu. Użytkownik trafia na zwykły formularz logowania bez wyjaśnienia (s02.2, s02.11) | #20/K3, G5 | Czy `/login` ma pokazać powód („Zaloguj się, aby zobaczyć tę stronę”, „Sesja wygasła”)? Czy rozróżniamy te dwa przypadki? |
| L02 | D | Po rejestracji nowy gracz ląduje na `/` (lub `next`) z banerem. Brief mówi, że gra wymaga potwierdzenia, ale nie ma ekranu „sprawdź skrzynkę”. Przy `next=/invite/…` baneru nie ma wcale | #19/K1, #34/K1, G8 | Czy po rejestracji jest dedykowany krok („Sprawdź skrzynkę”), czy wystarczy baner? Czy przy `next` baner ma być widoczny na stronie docelowej? |
| L03 | X | **ROZSTRZYGNIĘTE** (wykładnia do potwierdzenia, patrz niżej). Właściciel: „rejestracja mejlem musi być do rejestracji”. Przyjęta wykładnia: rejestracja wymaga działającej wysyłki e-maila, więc wygrywa Q13; Q1/Q6 (rejestracja mimo awarii) nie obowiązuje przy braku dostawcy. | #34 Q1, Q6, Q13 | Zostaje do ustalenia: treść komunikatu s01.12; czy chwilowa awaria wysyłki (502 po wysłaniu formularza) cofa rejestrację, czy konto powstaje z banerem „Wyślij ponownie”? |
| L04 | S | Brak treści i miejsca w UI dla `403 FORBIDDEN` (CSRF) oraz `409 ALREADY_AUTHENTICATED` na formularzach rejestracji i logowania | #19 API, #20 API | Co widzi użytkownik, gdy żądanie odrzucono przez Origin lub gdy zalogował się w drugiej karcie? Przekierowanie czy komunikat? |
| L05 | S | Brak treści: błędy pól rejestracji (e-mail, nazwa poza zakresem, zastrzeżona, hasło krótkie, hasło > 72 bajty), etykieta przycisku logowania podczas wysyłania, komunikat błędu sieci | #19 UI, #20 UI | Kto zatwierdza teksty błędów? Czy podajemy je zbiorczo w specyfikacji? |
| L06 | X | **ROZSTRZYGNIĘTE**: bez potwierdzonego e-maila nie widać lobby ani historii (ukryte w nagłówku, nie zablokowane). Zmienia to DS permissions zasada 1 („zablokowana z powodem, nie ukryta”) i story „Niepotwierdzony”. Zostaje: czy „Wyloguj” w nagłówku (DS) czy tylko na `/account` (spec #20); co widzi niepotwierdzony wchodzący na adres lobby lub historii. | #20, `screen.tsx` | Nagłówek: „Wyloguj” w nagłówku czy na `/account`? Co pokazuje adres lobby/historii niepotwierdzonemu (przekierowanie, brak dostępu — L15)? |
| L07 | X | Spec #19 pkt 9 wymienia własne komponenty formularza w `app/src/components/` (czysty Tailwind). AGENTS.md i DS wymagają `@gomoku/ui/game/*` na stronach graczy | #19 Wspólna warstwa; `AGENTS.md` | Czy spec #19 ma zostać poprawiona, by używała komponentów DS (Pole formularza, Pole hasła, Alert)? |
| L08 | X | Minimalna szerokość: spec 360 px (BR-20), DS 320 px | #19 UI, DS zasada 6 | Który próg obowiązuje? Prototyp sprawdzam przy obu |
| L09 | X | Treści różnią się między specyfikacją a DS: błąd linku (spec: „Link wygasł lub został już użyty.”, DS: „Ten link jest nieważny / Mógł wygasnąć…”), limit (spec: „…za {n} min.”, DS: „Spróbuj za chwilę”), sukces („możesz grać” vs „Przechodzimy dalej”), powód blokady („Potwierdź e-mail, aby grać” vs „Potwierdź e-mail, aby tworzyć partie i wchodzić do lobby”) | #19, #34, DS Konta, permissions | Którą wersję traktujemy jako źródło? Czy limit pokazuje liczbę minut? |
| L10 | S | `/verify-email`: spec nie mówi, jakie wyniki „Wyślij nowy link” pokazuje strona (wysłano, limit, 502, 503, 401), ani co przy 500 i braku sieci przy samym potwierdzaniu (API ma tylko 200/400/403) | #34 API, UI | Czy strona błędu pokazuje te same stany co baner? Co przy 500 podczas potwierdzania? |
| L11 | S | Baner ma w spec stany: wysyłanie, wysłano, limit, błąd. API `resend` zwraca jeszcze `409 ALREADY_VERIFIED`, `401` i `503 EMAIL_QUOTA_EXCEEDED`, a UI nie mówi, jak je pokazać (czy baner znika po 409? co po 401?) | #34 API, UI | Jak wygląda baner dla 409, 401 i 503? |
| L12 | D | Q14: niepotwierdzone konta starsze niż 7 dni są usuwane, a baner ma mówić „Niepotwierdzone konto zostanie usunięte po 7 dniach”. DS baner tego nie ma. Po usunięciu użytkownik widzi tylko „Nieprawidłowy e-mail lub hasło” | #34 Q14, #39 | Czy ostrzeżenie ma pokazywać datę lub liczbę dni? Czy po usunięciu konta gracz dostaje jakąś informację (np. e-mail)? |
| L13 | D | Po sukcesie potwierdzenia: czy przejście do `next` jest automatyczne (DS: „Przechodzimy dalej”) czy przyciskiem? Niezalogowany po potwierdzeniu na telefonie nie dostaje sesji (Q5), a `next` często wymaga logowania | #34 Q5, UI | Czy ekran sukcesu dla niezalogowanego ma przycisk „Zaloguj się” zamiast automatycznego przejścia? |
| L14 | D | **ROZSTRZYGNIĘTE, zmienione decyzją L26**: gość z aktywną partią nie może się ani zarejestrować, ani zalogować. Logowanie i rejestracja są możliwe, dopóki nie rozpoczął gry. (Wcześniejsza wersja — logowanie w trakcie partii z zapisem partii w historii — wycofana.) | brief BR-22, BR-13; #19 | brak |
| L15 | K | **ROZSTRZYGNIĘTE**: brak dostępu nie ma osobnej strony, tylko przekierowuje na rejestrację/logowanie. Szczegóły w L24. | #20/K3 | patrz L24 |
| L16 | D | Brak roli operatora i panelu użytkowników; polecenie zakłada role mentee/mentor/operator, a brief ma graczy i gościa. Panel `(backend)` istnieje w architekturze, ale `#19` wyłącza panel administracyjny użytkowników | brief, #19 Poza zakresem | Czy w MVP jest jakakolwiek rola poza graczem i gościem? Czy prototyp ma ją pokazywać? |
| L17 | D | **ROZSTRZYGNIĘTE** („to co łatwiej”): prototyp używa ekranu `/` z DS bez zmian, akcje gry z E02/E03 (w tym nawigacja) są widoczne, ale nieaktywne i nic nie robią. Wyjątek: lobby i historia ukryte dla niepotwierdzonego (L06). | `home-screen.tsx` | brak |
| L18 | S | Brak stanu ładowania: `/` i `/account` są dynamiczne (`await connection()`), a DS wymaga Szkieletu na każdym ekranie | #19, #20, DS zasada 6 | Czy te strony mają pokazywać Szkielet, czy nie ma czego czekać? |
| L19 | D | Granica zakresu: link „Nie pamiętasz hasła?” (pojawia się z #35, ale DS go pokazuje), stan „Hasło zmienione — zaloguj się” na `/login` (#35 Q5) oraz panele „Zmień hasło” i „Usuń konto” na `/account` (#36, #37; DS je zawiera) | #20 UI, #35 Q5, DS Konta | Czy w prototypie Epiku 01 te elementy są widoczne (nieaktywne), ukryte, czy prowadzą do osobnej mapy? |
| L20 | S | Wylogowanie: brak stanu „w toku” i brak opisu, co widzi użytkownik przy `500` (ciasteczko jest usuwane mimo błędu) | #20 API | Czy przy 500 pokazujemy błąd, czy zachowujemy się jak po udanym wylogowaniu? |
| L21 | S | Wiadomość e-mail: nie ma tematu, brak opisu przypadku „nie dotarła” poza zdaniem w banerze. Treść i forma tylko w Q5 i Q8 | #34 Q8, Risks | Jaki temat i jaki dokładny tekst ma mieć wiadomość? Czy ekran „nie dotarło?” ma pojawić się gdzieś poza banerem? |
| L22 | X | **ROZSTRZYGNIĘTE, bezprzedmiotowe po L26**: partia gościa nie przechodzi na konto, więc BR-22 i BR-24 pozostają bez zmian. | brief BR-22, BR-24 | brak |
| L23 | D | **ROZSTRZYGNIĘTE**: rejestracja i logowanie zablokowane tylko dla gościa z aktywną partią (L26). Treść komunikatu zostaje do ustalenia razem z L05. Zakładam, że po zakończeniu partii blokada znika (token trwa jeszcze 1 h). | decyzje L14, L26 | brak |
| L24 | D | **CZĘŚCIOWO ROZSTRZYGNIĘTE**: niezalogowany jest przekierowywany na `/login`, który ma link do rejestracji (zgodnie ze spec #20). Zostaje niepotwierdzony na adresie lobby lub historii: strona logowania nie ma sensu, bo jest zalogowany. | decyzja L15, #20 | Dokąd wysłać niepotwierdzonego (np. `/` z banerem)? |
| L25 | D | **ROZSTRZYGNIĘTE, bezprzedmiotowe po L26**: gość z aktywną partią się nie loguje, więc nie ma konfliktu z kontem mającym własną partię. Wejście zalogowanego na własną aktywną partię z drugiego urządzenia to zwykłe logowanie, poza tą mapą. | BR-13 | brak |
| L26 | D | **ROZSTRZYGNIĘTE**: dopóki gość ma aktywną grę, nie może się logować (ani rejestrować). Logowanie możliwe, dopóki nie rozpoczął gry. | BR-13, BR-22 | brak |

## 5. Luki w design systemie

| ID | Luka | Gdzie potrzebna | Pytanie |
|---|---|---|---|
| D01 | Brak szablonu wiadomości e-mail (układ, tokeny) | s06 | Czy wiadomość ma własny szablon z tokenów DS, czy tekst bez stylu? Prototyp pokaże ją jako zwykłą kartę |
| D02 | Baner potwierdzenia e-maila nie ma stanów dla dziennego limitu poczty (503), „już potwierdzony” (409) i sesji wygasłej (401). Są: `idle`, `sending`, `sent`, `limited`, `failed` | s04.8–s04.10, s05.2 | Dodać stany, czy użyć Alertu obok banera? (L11) |
| D03 | Baner nie ma ostrzeżenia „Niepotwierdzone konto zostanie usunięte po 7 dniach” | s04.2, s05.2 | Osobny tekst w banerze czy dodatkowy Alert? (L12) |
| D04 | Brak zasady użycia dla pełnoekranowego „brak dostępu / nie znaleziono”. Stan błędu jest opisany dla list i partii | brak ekranu (L15) | Użyć Stanu błędu na całej stronie? |
| D05 | Brak stories stanów: rejestracja (e-mail zajęty, błąd serwera, brak sieci, wysyłanie, 409), logowanie (z `next`, błąd serwera, sesja wygasła), `/verify-email` (już potwierdzony, wyniki „Wyślij nowy link”, 500), `/` (zalogowany z potwierdzonym kontem po rejestracji, baner 409/503/401), wylogowanie (dialog w partii) | wszystkie stany z ⚠ w sekcji 1 | Dopisać stories przed budową prototypu, czy prototyp ma je tworzyć sam z komponentów? |
| D06 | Nagłówek ma warianty `none`, `guest`, `player`; **po decyzji L06** potrzebny wariant „zalogowany, niepotwierdzony” bez „Lobby” i „Historia” | s04.2, s05.2 | Dodać wariant nagłówka? |
| D07 | Brak wzorca Szkieletu dla pojedynczego formularza i strony konta | s04.12, s05.9 | Jaki kształt ma Szkielet strony konta? (L18) |
| D08 | Brak linku „przejdź do treści” (znane braki DS) | wszystkie | Czy prototyp ma go zawierać? |

## 6. Liczby

| Pozycja | Liczba |
|---|---|
| Ekrany (s01–s06, w tym artefakt e-mail s06) | 6 |
| Stany ekranów | 64 (s01: 13, s02: 13, s03: 15, s04: 12, s05: 9, s06: 2) |
| w tym stany bez żadnego kryterium (⚠) | 19 |
| Scenariusze do przełączania | 14 (P01–P14) |
| Konta demo | 8 (A0–A7; A7 operator bez podstaw w materiałach) |
| Luki w specyfikacji | 26 (L01–L26), z czego 9 rozstrzygniętych (L03, L06, L14, L15, L17, L22, L23, L25, L26) i 17 otwartych: 8 S, 3 X, 6 D (L24 częściowo; L19 bez zmian) |
| Luki w design systemie | 8 (D01–D08) |
| Historie w zakresie / kryteria akceptacji | 3 / 10 (#19: 3, #20: 3, #34: 4); wszystkie mają ekran |

Stany s04.4–s04.10 liczone osobno (7 stanów banera). Stany banera na s05.2 odwołują się do nich i nie są liczone drugi raz.

**Mapa zatwierdzona.** Przed budową prototypu potrzebuję odpowiedzi na pytania z sekcji 4 (L19 i L24 zostają bez zmian na Twoją decyzję) oraz decyzji z sekcji 5.
