# Uproszczony start konta: hasło ≥ 8 znaków, aktywne konto bez potwierdzenia e-maila, potwierdzenie asynchroniczne, ścieżka z zaproszenia

- Date: 2026-10-26
- Category: feature
- Priority signal: medium — żadna z funkcji kont nie jest jeszcze zaimplementowana w kodzie, więc zmiana jest teraz tania, ale blokuje implementację #20 i #21
- Risk signal: high — zmienia politykę bezpieczeństwa kont (potwierdzenie e-maila, reset hasła, długość hasła, sprzątanie kont)
- Routing: Next: om-spec-writing "Uproszczony start konta: hasło ≥ 8 znaków, aktywne konto bez potwierdzenia e-maila, potwierdzenie asynchroniczne, ścieżka z zaproszenia — brief: .ai/specs/briefs/2026-10-26-account-onboarding-simplification.md"

## Problem

Po przeglądzie klikalnego prototypu Epiku 01 (`prototypes/konta-i-role/`) i panelu syntetycznych person (`.ai/specs/research/walkthroughs/2026-10-26-account-registration-session-001/report.md`) start gry wygląda na zbyt kosztowny: hasło co najmniej 16 znaków (G3), potwierdzenie e-maila wymagane przed pierwszą grą (D-17, BR-23), ekran rejestracji, który o tym nie uprzedza, i brak drogi dla znajomego, który przychodzi z zaproszenia (gość istnieje wyłącznie przez link, BR-22). **To jest osąd właściciela (Bartosz Wójcik), a nie wynik badania:** panel składał się z czterech person zbudowanych głównie z założeń, bez rozmowy z prawdziwym graczem; jego wnioski to hipotezy `[SYNTHETIC]`. Decyzje poniżej zapisuje się jako takie. Projekt ma charakter szkoleniowy (D-11), więc test z prawdziwymi ludźmi został świadomie pominięty, a kolejny panel syntetyczny nie może być traktowany jako potwierdzenie tej decyzji.

## Agreed direction

Zostaje uwierzytelnianie własne (e-mail + nazwa gracza + hasło, D-12, D-13), z łatwiejszym startem:

1. **Hasło:** minimum 8 znaków, maksimum 72 bajty (bcrypt; liczone w bajtach UTF-8, nadmiar odrzucany, nie skracany), bez listy popularnych haseł i bez kontroli wycieków. Ryzyko słabszych haseł przyjęte świadomie; chronią je limity prób logowania (H1).
2. **Konto aktywne od razu:** po rejestracji gracz jest zalogowany i może tworzyć partie, przyjmować zaproszenia i wchodzić do lobby. Nadpisuje D-17 i BR-23 (i G3).
3. **Potwierdzenie e-maila:** osobna czynność asynchroniczna, bez żadnych blokad gry. Na `/` i `/account` pokazuje się baner z powodem („bez potwierdzonego adresu nie odzyskasz konta, jeśli zapomnisz hasła, a adres jest błędny”). Baner da się zamknąć i wraca po 7 dniach. Awaria poczty nie blokuje rejestracji ani gry.
4. **Reset hasła tylko po potwierdzeniu e-maila.** Nadpisuje BR-25 (wraca zasada BR-19). Potwierdzenie ma więc jedyną realną funkcję: bez niego nie ma odzyskiwania hasła.
5. **Sprzątanie kont:** niepotwierdzone konta bez żadnej partii od założenia są kasowane po 14 dniach. Zastępuje Q14 (7 dni) i odpowiednią regułę w #39.
6. **Ścieżka z zaproszenia:** ekran wejścia (`/invite/[code]`) z wyborem „Zaloguj się”, „Załóż konto” i „Graj jako gość” (BR-22), po zmianie bez stanu „zalogowany bez potwierdzenia”. W mapie ekranów dostaje ID **s07**; stany wycofane (np. s01.12) nie są przenumerowywane.

**Odrzucone (i dlaczego):**
- **OAuth (GitHub/Google) zamiast e-maila.** Upraszcza ścieżkę gracza i usuwa pocztę, ale D-12 odrzuciło logowanie zewnętrzne i biblioteki auth, dochodzą rejestracja aplikacji u dostawców, nowe stany (dostawca niedostępny, odmowa zgody, brak e-maila, powiązanie kont) i atrapa dostawcy w testach; GitHub słabo pasuje do znajomych spoza branży.
- **OAuth obok e-maila** (najdroższe: dwa modele naraz).
- **Link logujący na e-mail bez hasła (magic link).** Znika hasło, ale zostaje zależność od dostawcy poczty (#38, D-20) na ścieżce logowania.
- **Tylko poprawa ekranów** (zapowiedź potwierdzenia, droga z zaproszenia, podpisy pól) bez zmiany polityki. Najtańsze, ale nie usuwa głównej bariery (potwierdzenie przed grą, 16 znaków).
- **Tańsze warianty zasugerowane przez recenzenta:** (i) tylko minimum hasła 8 i ekran zaproszenia, bez ruszania potwierdzenia; (ii) potwierdzenie nieblokujące tylko dla zaproszonych. Właściciel wybrał pełne odwrócenie D-17/BR-23.
- **„Nie buduj nic” (zostawić D-17, BR-23, G3).** Kosztem jest utrzymanie bariery, którą właściciel uznał za nieakceptowalną na starcie; ponieważ w kodzie nie ma jeszcze kont, zmiana teraz kosztuje tylko dokumenty.

## Resolved unknowns

| Question | Answer (from the conversation) |
|----------|--------------------------------|
| OAuth czy e-mail + hasło? | E-mail + hasło zostaje (OAuth odrzucony; wyjaśnienia w „Agreed direction”). |
| Minimalna długość hasła? | 8 znaków; maksimum 72 bajty bez zmian; bez listy popularnych haseł. |
| Czy konto jest aktywne bez potwierdzenia e-maila? | Tak, od rejestracji: zalogowany i grający. |
| Czy brak potwierdzenia ma jakikolwiek skutek? | Brak blokad gry; tylko baner z powodem (zamykalny, wraca po 7 dniach). |
| Reset hasła na niepotwierdzony adres (BR-25)? | Nie: reset tylko po potwierdzeniu e-maila. |
| Usuwanie niepotwierdzonych kont (Q14)? | Zostaje w nowej formie: niepotwierdzone konto bez partii od założenia jest kasowane po 14 dniach. |
| Wejście z zaproszenia? | Nowy ekran s07 (Zaloguj się / Załóż konto / Graj jako gość); stan „zalogowany bez potwierdzenia” odpada. |
| Rola dostawcy poczty (#38, Q-02)? | Przestaje blokować rejestrację i grę; potrzebny tylko dla potwierdzenia i resetu (#35, #38 idą razem później). |
| Zajęcie adresu przez osobę z partią? | Akceptowane (właściciel, 2026-10-26); ścieżka „To nie ja” może być późniejszą historią. |
| Test z prawdziwymi ludźmi przed zmianą? | Nie (projekt szkoleniowy). Decyzja oznaczona jako osąd właściciela. |
| Podział prac? | Trzy PR-y po kolei: (1) decyzje i brief, (2) specyfikacje i mapa, (3) prototypy. Edycje zgłoszeń GitHub: osobna, jawna pozycja. |
| Numeracja ekranów w mapie? | Nowy ekran dostaje s07; wycofane stany nie są przenumerowywane. |

## Accepted risks (owner: Bartosz Wójcik)

- **Zajęcie cudzego adresu e-mail.** Ktoś może założyć konto na adres ofiary i od razu grać. Ofiara nie odzyska konta resetem (reset wymaga potwierdzonego adresu) i nie założy własnego, bo e-mail jest unikalny (BR-14, BR-16). Jedyna ochrona: usunięcie konta bez partii po 14 dniach; atakujący, który gra, utrzymuje konto.
- **Literówka w adresie** = konto bez możliwości odzyskania hasła, dopóki adres nie zostanie potwierdzony (baner mówi to wprost).
- **Słabsze hasła** (8 znaków, bez listy i bez kontroli wycieków).
- **Do określenia w specyfikacji (nikt ich jeszcze nie ustalił):** limity prób — rejestracje na adres klienta, prośby o reset, ponowne wysłanie potwierdzenia, zamknięcie banera i jego powrót po 7 dniach.

## Non-goals

- Logowanie zewnętrzne (GitHub, Google) i magic link: poza zakresem tej zmiany (odrzucone).
- Zmiana adresu e-mail i nazwy gracza (E05, później).
- Osobny test z prawdziwymi graczami przed zmianą (świadomie pominięty).
- Implementacja kodu: ta praca zmienia dokumenty, zgłoszenia i prototypy; w `main` nie ma jeszcze encji ani route'ów kont.
- Nowe funkcje spoza zaproszenia (gra gościa po zakończeniu partii, przejęcie partii przez konto: BR-22 bez zmian).

## Affected areas (if known)

Ustalone w rozmowie, bez zgadywania:
- **PR 1, decyzje:** `product-brief.md` (nowe wiersze nadpisujące dla D-17, BR-23, BR-25, G3, Q14 i A-03, aktualizacja Q-02, zakresu MVP i Kluczowego przepływu), `research/decisions/` (nowy wpis), lekcja w `.ai/lessons/`.
- **PR 2, specyfikacje i mapa:** `2026-10-24-account-registration.md`, `email-verification.md`, `password-reset.md`, `password-change.md`, `expired-records-cleanup.md`, `game-invitations.md`, `email-provider.md` (zakres), standardy (OD-2 i „Auth error messages”), `backlog.md`, `lekcja-07/mapa-ekranow.md` (s07, wycofane stany), teksty w dokumentacji design systemu (podpis „Co najmniej 16 znaków”, baner „Potwierdź e-mail, aby grać”, wzorzec stanu zależnego od uprawnień, `czego-brakuje.mdx`).
- **PR 3, prototypy:** `.ai/prototypes/discovery/account-registration/` (nowa rewizja przez `--refresh`), `prototypes/konta-i-role/` (sim, ekrany, scenariusze, testy, `checks/`), nota przy raporcie panelu.
- **Osobna pozycja:** zgłoszenia GitHub #15, #19 (zamknięte bez kodu: uzgodnić ze stanem rzeczywistym), #20, #21, #25, #26, #34–#39 (edycja albo zamknięcie z odnośnikiem do następcy, nie usuwanie).
- **Rzeczy, które wymagają rozstrzygnięć projektowych w specyfikacji:** limity prób i bezpieczeństwo (wyżej), treść i zachowanie banera, reguła sprzątania 14 dni (kiedy liczyć „ostatnią partię”), dokładny przepływ ekranu s07 i jego stany.
