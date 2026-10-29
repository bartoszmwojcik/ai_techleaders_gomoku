# Przegląd ekranów E01 w obu motywach (zadanie 11.4)

Data: 2026-10-29. Build produkcyjny na porcie 3199, przeglądarka: agent-browser (Chrome), motyw ustawiany ciasteczkiem `gomoku_theme`. Jasny motyw po raz pierwszy oglądany w prawdziwej aplikacji.

## Metoda

- Każdy ekran i stan w motywie ciemnym i jasnym, szerokości 360 i 1280 px (dodatkowo 320 px dla: `home-unverified`, `register-field-errors`, `account-unverified`, `account-pw-success`, `verify-invalid-signed`). Zrzuty ekranu każdej pary zestawiono obok siebie (ciemny | jasny) i obejrzano osobiście; nie obejrzano pojedynczo wszystkich wariantów 1280 px (obejrzano `/` gość, `/account` zweryfikowany) — pozostałe 1280 px sprawdzono pomiarem (brak poziomego przewijania, kontrast).
- Kontrast: skrypt w przeglądarce — dla każdego elementu z tekstem `getComputedStyle` (kolor tekstu, złożone tło przodków, canvas do konwersji przestrzeni barw), współczynnik WCAG; próg 4,5:1 (3:1 dla dużego/pogrubionego ≥ 18,66 px). Obramowania pól, przycisków, alertów i znaczników względem tła rodzica: próg 3:1.
- Fokus: Tab po `/login`, `/register`, `/forgot-password` w obu motywach, kontrast obrysu względem tła rodzica po zakończeniu przejścia (450 ms).
- Błędy 429 i 500 wymuszone podmianą `window.fetch` w stronie (odpowiedź 429 z `Retry-After` / 500), pozostałe stany z prawdziwego serwera (konta testowe `rev-*@example.com`, usunięte po przeglądzie).

## Wyniki

Kolumny: min. kontrast tekstu / min. kontrast obramowań (wartość najgorszego elementu na ekranie). Wynik OK = brak tekstu poniżej progu, brak obramowania poniżej 3:1, brak poziomego przewijania we wszystkich zmierzonych szerokościach i motywach.

| Ekran / stan | Szerokości | 360 ciemny | 360 jasny | 1280 jasny | Wynik |
|---|---|---|---|---|---|
| home-guest | 360,1280 | 5.02 / 3.65 | 4.58 / 4.58 | 4.58 / 4.58 | OK |
| home-unverified | 320,360,1280 | 5.02 / 3.17 | 4.58 / 4.58 | 4.58 / 4.58 | OK |
| home-verified | 360,1280 | 5.02 / 3.65 | 4.58 / 4.58 | 4.58 / 4.58 | OK |
| register-empty | 360,1280 | 5.02 / 3.65 | 4.58 / 4.58 | 4.58 / 4.58 | OK |
| register-field-errors | 320,360,1280 | 5.02 / 3.65 | 4.58 / 4.58 | 4.58 / 4.58 | OK |
| register-error-500 | 360,1280 | 5.02 / 3.65 | 4.58 / 4.58 | 4.58 / 4.58 | OK |
| register-error-429 | 360,1280 | 5.02 / 3.65 | 4.58 / 4.58 | 4.58 / 4.58 | OK |
| login-empty | 360,1280 | 5.02 / 3.65 | 5.02 / 4.58 | 5.02 / 4.58 | OK |
| login-field-errors | 360,1280 | 5.02 / 3.65 | 5.02 / 4.58 | 5.02 / 4.58 | OK |
| login-401 | 360,1280 | 5.02 / 3.65 | 5.02 / 4.58 | 5.02 / 4.58 | OK |
| login-429 | 360,1280 | 5.02 / 3.65 | 5.02 / 4.58 | 5.02 / 4.58 | OK |
| account-unverified | 320,360,1280 | 5.02 / 3.17 | 4.79 / 4.58 | 4.79 / 4.58 | OK |
| account-verified | 360,1280 | 5.02 / 3.17 | 4.79 / 4.58 | 4.79 / 4.58 | OK |
| account-pw-field-errors | 360,1280 | 5.02 / 3.17 | 4.79 / 4.58 | 4.79 / 4.58 | OK |
| account-pw-error | 360,1280 | 5.02 / 3.17 | 4.79 / 4.58 | 4.79 / 4.58 | OK |
| account-pw-success | 320,360,1280 | 5.02 / 3.17 | 4.79 / 4.58 | 4.79 / 4.58 | OK |
| forgot-empty | 360,1280 | 5.02 / 3.65 | 5.02 / 4.58 | 5.02 / 4.58 | OK |
| forgot-field-error | 360,1280 | 5.02 / 3.65 | 5.02 / 4.58 | 5.02 / 4.58 | OK |
| forgot-sent | 360,1280 | 5.02 / 3.65 | 5.02 / 4.58 | 5.02 / 4.58 | OK |
| forgot-429 | 360,1280 | 5.02 / 3.65 | 5.02 / 4.58 | 5.02 / 4.58 | OK |
| reset-no-token | 360,1280 | 6.53 / 3.65 | 7.00 / 4.58 | 7.00 / 4.58 | OK |
| reset-invalid-token | 360,1280 | 6.53 / 3.65 | 7.00 / 4.58 | 7.00 / 4.58 | OK |
| verify-before | 360,1280 | 5.02 / 3.65 | 5.02 / 4.58 | 5.02 / 4.58 | OK |
| verify-success-guest | 360,1280 | 7.73 / 3.65 | 6.18 / 4.58 | 6.18 / 4.58 | OK |
| verify-success-signed | 360,1280 | 5.02 / 3.65 | 5.02 / 4.58 | 5.02 / 4.58 | OK |
| verify-invalid-signed | 320,360,1280 | 6.53 / 3.65 | 7.33 / 4.58 | 7.33 / 4.58 | OK |
| verify-invalid-guest | 360,1280 | 6.53 / 3.65 | 7.00 / 4.58 | 7.00 / 4.58 | OK |
| verify-already | 360,1280 | 5.02 / 3.65 | 5.02 / 4.58 | 5.02 / 4.58 | OK |
| verify-no-token | 360,1280 | 6.53 / 3.65 | 7.00 / 4.58 | 7.00 / 4.58 | OK |
| reset-form | 360,1280 | 5.02 / 3.65 | 4.58 / 4.58 | 4.58 / 4.58 | OK |
| reset-success | 360,1280 | 5.02 / 3.65 | 5.02 / 4.58 | 5.02 / 4.58 | OK |
| reset-password-error | 360,1280 | 5.02 / 3.65 | 4.58 / 4.58 | 4.58 / 4.58 | OK |

(Ciemny 1280 daje te same wartości co ciemny 360 px; widoki bez przewijania poziomego.)

## Fokus klawiaturą

Kolejność Tab: przełącznik motywu, pola, przycisk pokazywania hasła, przycisk wysłania, linki. Obrys 2 px, odstęp 2 px, kontrast względem tła: ciemny 7,7–14,9:1, jasny 7,0:1 (wszystkie elementy). Pierwszy odczyt 1,33–2,63:1 na przycisku głównym w jasnym motywie to artefakt przejścia koloru (`transition-colors`), po ustabilizowaniu 7,0:1.

## Przełącznik

Wiersz nad stroną: cel 44 px, brak nakładania na treść przy 320/360/1280 px, `<main>` ma `flex-1` (wyśrodkowanie pionowe stron formularzy działa w obu motywach). Pokryte też testami integracyjnymi (`tests/integration/theme-switch.test.ts`).

## Znalezione problemy

Brak problemów z kontrastem, układem ani fokusem w jasnym motywie; nie wprowadzono żadnych zmian w tokenach (Q5 potwierdzone: paleta jasna akceptowana).

Obserwacje bez poprawek:

- Najniższy kontrast tekstu w jasnym motywie to 4,58:1 (tekst pomocniczy/podpisy `text-muted` na `surface-page`) — zgodne z progiem 4,5:1, margines 0,08. Każda przyszła zmiana odcienia `text-muted` lub tła strony w jasnym motywie wymaga ponownego pomiaru.
- Tytuł alertu informacyjnego i baneru „Potwierdź adres e-mail” w jasnym motywie ma szary odcień, wizualnie zbliżony do tekstu pomocniczego (kontrast w normie; ikona i słowa niosą znaczenie).
- Najniższy kontrast obramowania w ciemnym motywie: 3,17:1 (obramowanie panelu/baneru na stronie konta) — powyżej 3:1.

## Pytania do właściciela

Brak. (Opcjonalnie: czy tytuł alertu informacyjnego w jasnym motywie ma być bardziej wyróżniony od tekstu pomocniczego — decyzja projektowa, nie błąd kontrastu.)

## Poprawki tokenów

Żadne (przed/po: brak zmian).
