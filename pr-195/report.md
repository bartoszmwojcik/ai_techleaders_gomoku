## QA PR #195 — zmiana adresu e-mail i nazwy gracza (E05-S01)

**Werdykt: PASS** (head `89dc3bf9b7d576b7946b0ad5966c10586626ebd1`; PR jest BEHIND main o 2 commity, bez konfliktów). Środowisko: świeży postgres:17 + migracje z PR, build produkcyjny, poczta w outboxie pliku, agent-browser, 320 i 1280 px, motyw jasny i ciemny.

| # | Priorytet | Scenariusz | Wynik | Zrzut |
|---|---|---|---|---|
| 1 | P1 | Walidacja nazwy 320 px: zajęta (`qa_PLAYER2` vs `QA_player2`), zarezerwowana „Agent”, za długa — błąd przy polu | PASS | s02 |
| 2 | P1 | Zmiana nazwy → komunikat sukcesu, pole i przycisk zablokowane, „Kolejna zmiana możliwa po …”, blokada po przeładowaniu; drugi PATCH = 429 z `Retry-After` ~86390 s | PASS | s01, s03 |
| 3 | P1 | Partia rozpoczęta przed zmianą (widok partii i czat) nadal „QA_player1”; nowa partia „QA_Alpha” (widok, czat); historia przeciwnika: stara partia „QA_player1”, nowa „QA_Alpha” | PASS | s04, s05, s06 |
| 4 | P0 | E-mail: złe hasło → błąd przy polu, licznik prób (10 błędnych → 429, także z poprawnym hasłem) | PASS | s07 |
| 5 | P0 | Poprawne hasło → neutralny komunikat 202, link na NOWY adres; do kliknięcia logowanie starym adresem działa, nowym 401, adres konta bez zmian | PASS | s08 |
| 6 | P0 | Adres zajęty przez inne konto → identyczne 202 `{"ok":true,"data":null}`, brak wiadomości w outboxie | PASS | — |
| 7 | P0 | Link zastąpiony nowym żądaniem / wygasły (wymuszone `expires_at` w przeszłości) / użyty → „Link wygasł lub został już użyty. Adres konta pozostał bez zmian.” | PASS | s09, s13 |
| 8 | P0 | Potwierdzenie: logowanie nowym adresem działa, starym 401, sesje (przeglądarka i ciasteczko z innego logowania) unieważnione, powrót do /login | PASS | s11 |
| 9 | P0 | Powiadomienie na stary adres: konto potwierdzone → wiadomość; konto niepotwierdzone → brak | PASS | — |
| 10 | P0 | Link resetu hasła zażądany przed zmianą adresu → po zmianie „Link wygasł lub został już użyty” (UI i API), hasło bez zmian | PASS | s12 |
| 11 | P1 | Motywy jasny/ciemny × 320/1280 px: brak poziomego przewijania (scrollWidth = szerokość okna), tła z tokenów | PASS | s20 |
| 12 | P1 | Klawiatura: fokus w polach, Tab → hasło, Enter wysyła formularz; limit wysyłek (3/h) pokazany jako „Zbyt wiele prób, spróbuj ponownie za 59 min.” | PASS | s30 |

Poza zakresem (znana luka, nie jest FAIL): ochrona konta administratora `403 ADMIN_EMAIL_LOCKED` — #156.
Uwagi: brak. Wiadomości odczytane z outboxa środowiska testowego; tokeny nie są cytowane.
