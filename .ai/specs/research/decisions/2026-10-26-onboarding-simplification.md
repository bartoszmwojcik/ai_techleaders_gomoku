# Decyzje: uproszczony start konta (2026-10-26)

- **Właściciel:** Bartosz Wójcik. **Charakter:** osąd właściciela, **nie wynik badania**. Podstawą jest przegląd klikalnego prototypu Epiku 01 i panel syntetycznych person (`research/walkthroughs/2026-10-26-account-registration-session-001/report.md`, 4 persony z założeń, bez prawdziwego gracza); jego wnioski to hipotezy `[SYNTHETIC]`. Test z prawdziwymi graczami świadomie pominięty (projekt szkoleniowy, D-11).
- **Źródła:** brief `.ai/specs/briefs/2026-10-26-account-onboarding-simplification.md`, specyfikacja `.ai/specs/2026-10-26-account-onboarding-simplification.md`, rozmowa z 2026-10-26 (`om-brainstorm`, bramka challenger).

## Decyzje

| ID | Decyzja | Nadpisuje |
|---|---|---|
| D-24 / BR-26 | Konto aktywne od razu po rejestracji; potwierdzenie e-maila osobną czynnością asynchroniczną bez blokad gry; baner z powodem (zamykalny, wraca po 7 dniach, pamięć w przeglądarce). | D-17, BR-23 |
| D-25 / BR-28 | Hasło 8–72 bajty, bez listy popularnych haseł. | G3 |
| D-26 / BR-27 / BR-28 | Reset hasła tylko po potwierdzeniu e-maila; niepotwierdzone konta bez partii kasowane po 14 dniach od założenia; konta z partią zostają. | BR-25, Q14 |
| Wejście z zaproszenia | Zmiana istniejącej strony `/invite/[code]` (bez stanu „zalogowany bez potwierdzenia”); w mapie ekranów s07. | Q15, Q19 w `game-invitations` |
| Podział prac | Trzy PR-y: decyzje; specyfikacje i mapa; prototypy. Edycje zgłoszeń GitHub osobno, przed startem implementacji. | |
| Limity prób | Bez zmian względem obecnych specyfikacji. | |

## Odrzucone alternatywy

- **OAuth (GitHub/Google) zamiast e-maila:** D-12 odrzuca logowanie zewnętrzne i biblioteki auth; dochodzą rejestracja aplikacji u dostawców, nowe stany błędów i atrapa dostawcy w testach; GitHub słabo pasuje do znajomych spoza branży. Upraszcza ścieżkę gracza i usuwa pocztę.
- **OAuth obok e-maila:** najdroższe (dwa modele naraz).
- **Link logujący bez hasła (magic link):** znika hasło, ale zostaje zależność od dostawcy poczty na ścieżce logowania.
- **Tylko poprawa ekranów bez zmiany polityki:** najtańsze, ale nie usuwa głównej bariery.
- **Tańsze warianty z przeglądu:** tylko hasło 8 i ekran zaproszenia; potwierdzenie nieblokujące wyłącznie dla zaproszonych. Właściciel wybrał pełne odwrócenie.
- **Nie buduj nic (zostawić D-17, BR-23, G3):** koszt to utrzymanie bariery uznanej za nieakceptowalną; zmiana jest teraz tania, bo w kodzie nie ma jeszcze kont.

## Przyjęte ryzyka (właściciel: Bartosz Wójcik)

- Osoba, która zajmie cudzy adres e-mail i zagra jedną partię, utrzymuje go bezterminowo; prawdziwy właściciel nie założy konta ani nie zresetuje hasła (BR-14, BR-16, BR-27). Ścieżka „To nie ja” może być późniejszą historią.
- Literówka w adresie oznacza konto bez odzyskiwania hasła, dopóki adres nie zostanie potwierdzony.
- Hasła 8-znakowe bez listy popularnych haseł i bez kontroli wycieków.

## Skutki dla artefaktów (PR 2 i 3, zgłoszenia osobno)

Specyfikacje `account-registration`, `email-verification`, `password-reset`, `password-change`, `expired-records-cleanup`, `game-invitations`; `backlog.md` (#19 zamknięte bez kodu, #20, #21, #25, #26, #34–#39); standardy (komunikat reguły hasła); dokumentacja design systemu (podpis hasła, baner, wzorzec uprawnień; zmiana komponentu banera wymaga zgody właściciela); mapa ekranów (s07, wycofane s01.12 i bramka L06); oba prototypy; nota przy raporcie panelu.
