# Prototyp discovery: rejestracja konta (revision-001)

- Brief: `.ai/specs/product-brief.md`. Przepływ: „account registration” (Key flow, krok 1: rejestracja i potwierdzenie e-maila linkiem).
- Data: 2026-10-25. Poprzednia wersja: brak. Panel syntetyczny (`--panel-report`): nie podano, prototyp powstał bez niego.
- Mapa ekranów (zatwierdzona): `lekcja-07/mapa-ekranow.md`. ID ekranów i stanów (s01…, sNN.M) pochodzą z niej.
- Wszystkie dane są fikcyjne. Prototyp nie jest dowodem popytu ani gotowości produkcyjnej (A-01 w briefie).

## Jak otworzyć i zresetować

Otwórz `index.html` w przeglądarce (`file://`, bez serwera i sieci). Przycisk „Reset symulacji” na dole przywraca start (rejestracja), czyści konto, skrzynkę i kontrolki. Stan trzymany tylko w pamięci strony.

## Aktor, start, sukces

- Aktor: niezalogowany gość. Start: `#/register`.
- Sukces: konto założone, gracz zalogowany (strona główna z banerem), potem e-mail potwierdzony linkiem z wiadomości.
- W prototypie: s01 Rejestracja, s04 Strona główna, s06 Skrzynka demo i wiadomość, s03 Potwierdzenie e-maila.
- Poza prototypem (ekran „Poza tym prototypem”): logowanie, konto i wylogowanie (s02, s05), lobby, historia, tworzenie zaproszenia, gra gościa, reset hasła.

## Reguły i decyzje zachowane z briefu

| ID | Treść (skrót) | Źródło, status |
|---|---|---|
| BR-14 | unikalny e-mail i nazwa gracza | brief, potwierdzona |
| BR-16, D-14 | zajęty e-mail nie jest ujawniany, zajęta nazwa tak | brief, potwierdzona |
| BR-20 | działa na telefonie | brief, potwierdzona |
| BR-23, D-17 | bez potwierdzonego e-maila: brak tworzenia partii i lobby | brief, potwierdzona |
| D-12, D-13 | własna rejestracja e-mail + nazwa + hasło | brief, potwierdzona |
| G3, G4, G6 (spec #19) | hasło ≥ 16 znaków i ≤ 72 bajty; zastrzeżone nazwy; unikalność po normalizacji | `2026-10-24-account-registration.md` |
| Q2, Q3, Q5, Q7, Q11 (spec #34) | link 24 h, potwierdzenie przyciskiem (GET nic nie zmienia), bez auto-logowania, nowy link unieważnia stary, zużyty token zawsze nieważny | `2026-10-24-email-verification.md` |
| Decyzje właściciela 2026-10-25 | L03 (rejestracja wymaga działającej poczty), L06 (niepotwierdzony nie widzi Lobby i Historii), L14/L23/L26 (gość z aktywną partią), L17 (akcje gry nieaktywne), zakres prototypu (do potwierdzenia e-maila), po rejestracji strona główna z banerem | mapa ekranów, rozmowa |

Nie dotykam: non-goals N-01…N-09, reguł BR-22 i BR-24 (gość nie ma historii).

## [ASSUMPTION] Założenia i brakujące fakty

| ID | Założenie | Dlaczego potrzebne | Jak sprawdzić | Luka w mapie |
|---|---|---|---|---|
| A-01 | Konto powstaje także gdy wysyłka poczty zawiedzie po wysłaniu formularza (502, 503); baner proponuje „Wyślij ponownie” | spec #34 Q6; po decyzji L03 nie wiadomo, czy to nadal obowiązuje | pytanie do właściciela | L03 |
| A-02 | Komunikat „Rejestracja jest chwilowo niedostępna…” przy braku dostawcy poczty | decyzja L03 nie podaje treści | zatwierdzenie tekstu | L03, L05 |
| A-03 | Teksty błędów pól, błędu sieci i błędu serwera napisane przeze mnie | spec nie podaje treści | zatwierdzenie tekstów | L05 |
| A-04 | Temat wiadomości „Potwierdź adres e-mail w Gomoku”, treść z Q5 i Q8 | temat nie jest ustalony | zatwierdzenie | L21 |
| A-05 | Po potwierdzeniu przycisk „Przejdź dalej” zamiast automatycznego przejścia | spec nie rozstrzyga | decyzja | L13 |
| A-06 | Baner: 409 pokazuje „Ten adres jest już potwierdzony” z przyciskiem „Odśwież stronę”; 401 komunikat o sesji z linkiem do logowania; limit „Spróbuj za 41 min”; limit rejestracji „za 12 min” (wartości przykładowe) | spec nie podaje UI | decyzja | L11 |
| A-07 | Nagłówek ma tylko „Zalogowano jako {nazwa}” (bez „Konto” i „Wyloguj”) | konflikt spec #20 i design systemu | decyzja | L06 |
| A-08 | Brak ostrzeżenia „Niepotwierdzone konto zostanie usunięte po 7 dniach” | Q14 nie ma ustalonego wyglądu | decyzja | L12 |
| A-09 | Limit rejestracji liczony w prototypie: 6. próba w sesji daje „Zbyt wiele prób” (spec: 5 na godzinę) | pokazanie limitu bez zegara | brak | brak |
| A-10 | Dane demo: zajęty e-mail `marek@example.com`, zajęta nazwa `Marek_Z`, hasło demo `drewniana-plansza-2026` | fikcyjne konta z mapy | brak | brak |

Hipotez `[SYNTHETIC]`: brak (nie było panelu).

## Mapa ekranów i stanów (w prototypie)

| Ekran | Stany pokazane | Jak wywołać |
|---|---|---|
| s01 Rejestracja `#/register` | s01.1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12 | pusty formularz; błędne dane; `Marek_Z`; `marek@example.com`; kontrolki: limit, serwer, sieć, brak dostawcy; zalogowany wchodzący na `#/register` jest przekierowany na `#/home` |
| s04 Strona główna `#/home` | s04.1, 2, 3, 4–10 | sesja niezalogowana; po rejestracji; po potwierdzeniu; baner: wysyłanie, wysłano, limit, 502, 503, 409, 401 |
| s06 Skrzynka `#/mail` | s06.1, 2 | po rejestracji; dostawca niedziałający |
| s03 Potwierdzenie `#/verify?m=…` | s03.1–s03.15 poza s03.13 (500) pokazanym jako błąd potwierdzania | link z wiadomości; kontrolki: link wygasły, użyty, bez tokenu; sesja; błąd serwera i sieci |
| Poza prototypem | logowanie, lobby, historia, zaproszenie | linki w nagłówku i bannerach |

Niepokryte w tej rewizji: s01.9 (409 już zalogowany), s01.13 (gość z aktywną partią), s03.12 w pełni (503 przy „Wyślij nowy link” jest, ale 401 tam nie), s04.11, s04.12 (baza niedostępna, ładowanie), cała s02 i s05.

## Weryfikacja

- Statyczny przegląd: brak zewnętrznych adresów, `fetch`, magazynów przeglądarki, skryptów zewnętrznych; formularz nie wysyła niczego. Kontrast i widoczność fokusu sprawdzone tylko w CSS (obrys 3 px), bez pomiaru.
- Przeglądarka: `agent-browser` 0.39.1 z `node_modules/.bin` (`doctor` przeszedł), sesja `mockreg`, po zakończeniu zamknięta. Skrypt: 58 sprawdzeń PASS, 0 FAIL. Log: `evidence/walk-log.txt`, zrzuty: `evidence/*.png`.
- Sprawdzone: ścieżka sukcesu rejestracji i potwierdzenia, nieważny link, ponowne wysłanie, błędy walidacji i poprawa, konflikty, limity, awarie, Reset, Back/Forward, nieznany fragment, klawiatura (Tab, Enter), fokus na nagłówku po nawigacji, brak poziomego przewijania przy 360 i 320 px.
- Nie sprawdzone: odczyt komunikatów przez czytnik ekranu (tylko role w markupie), kontrast w pomiarze.

## Powtarzalna lista kontrolna

Patrz `evidence/walk-log.txt` (ID C01…C38b: akcja, oczekiwany tekst, wynik).
