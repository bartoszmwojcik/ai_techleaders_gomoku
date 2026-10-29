# Przegląd ekranów E01 w obu motywach (zadanie 11.4)

Data: 2026-10-29. Build produkcyjny na porcie 3199, przeglądarka: agent-browser (Chrome), motyw ustawiany ciasteczkiem `gomoku_theme`. Jasny motyw po raz pierwszy oglądany w prawdziwej aplikacji.

## Metoda

- Każdy ekran i stan w motywie ciemnym i jasnym, szerokości 360 i 1280 px (dodatkowo 320 px dla: `home-unverified`, `register-field-errors`, `account-unverified`, `account-pw-success`, `verify-invalid-signed`). Zrzuty ekranu każdej pary zestawiono obok siebie (ciemny | jasny) i obejrzano osobiście; nie obejrzano pojedynczo wszystkich wariantów 1280 px (obejrzano `/` gość, `/account` zweryfikowany) — pozostałe 1280 px sprawdzono pomiarem (brak poziomego przewijania, kontrast).
- Kontrast: skrypt w przeglądarce — dla każdego elementu z tekstem `getComputedStyle` (kolor tekstu, złożone tło przodków, canvas do konwersji przestrzeni barw), współczynnik WCAG; próg 4,5:1 (3:1 dla dużego/pogrubionego ≥ 18,66 px). Obramowania pól, przycisków, alertów i znaczników względem tła rodzica: próg 3:1.
- Fokus: Tab po `/login`, `/register`, `/forgot-password` w obu motywach, kontrast obrysu względem tła rodzica po zakończeniu przejścia (450 ms).
- Błędy 429 i 500 wymuszone podmianą `window.fetch` w stronie (odpowiedź 429 z `Retry-After` / 500), pozostałe stany z prawdziwego serwera (konta testowe `rev-*@example.com`, usunięte po przeglądzie).

## Wyniki

Zakres wniosku: **stany domyślne ekranów, w zmierzonych szerokościach i motywach, bez naruszeń progów** (nie dotyczy stanów hover/pressed/disabled poza zmierzonym niżej disabled, ani `::placeholder` poza pomiarem niżej). Wynik 1280 px w motywie ciemnym **nie był mierzony osobno** — wynika z pomiaru przy 360 px (te same tokeny, brak zmian kolorów przy punktach przerwania); w tabeli nie ma dla niego kolumny.

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

## Dodatkowe pomiary (zadanie 11.5)

Skrypt: `.ai/analysis/2026-10-29-theme-review-measure.js` (wynik w JSON; build na porcie 3199, 360 px, `/login`, `/register`, oba motywy, motyw z ciasteczka `gomoku_theme`). Kontrast liczony z `getComputedStyle` (kolor, tło przodków, canvas do konwersji przestrzeni barw).

| Element | Ciemny | Jasny | Próg |
|---|---|---|---|
| `::placeholder` pól `TextInput` (`placeholder:text-text-muted`) na `surface-page` | 6,93:1 | 4,58:1 | 4,5:1 |
| Przycisk główny `disabled` (tekst `text-muted` na przezroczystym tle) | 6,93:1 | 4,58:1 | 4,5:1 |
| Przycisk główny `disabled` (obramowanie `border-control` względem tła) | 3,65:1 | 4,58:1 | 3:1 |

Uwagi: formularze E01 nie mają dziś atrybutów `placeholder`, więc skrypt ustawia go tymczasowo i mierzy styl komponentu (przyszłe użycie). `opacity` `::placeholder` i przycisku wynosi 1 (brak przezroczystości do uwzględnienia). Stan disabled wymuszono atrybutem `disabled` z wyłączonym `transition`, bez wysyłania formularza.

Uwaga do właściciela: `text-muted` w jasnym motywie (4,58:1, margines 0,08 nad progiem) niesie podpisy, `::placeholder` i przycisk disabled. Wartość liczona z całkowitych składowych sRGB (`#78716c` na `#fafaf9`), więc nie wynika z niedokładności canvas, ale margines jest cienki; palety nie zmieniano (decyzja projektowa). Pytanie: czy przyciemnić `text-muted` w jasnym motywie (np. do stone-600, co dałoby ok. 7:1), czy zostawić margines 0,08?

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

## Czego nie sprawdzono

- Stany hover i pressed (symulacja `:hover` w przeglądarce niewykonalna w tym środowisku), w tym wartości oznaczone w tokenach jako „propozycja” (`action-primary-bg-hover/pressed`, `action-danger-bg-hover/pressed`, `action-danger-bg`, statusy).
- Stan disabled pól tekstowych (`disabled:text-muted` na `surface-raised`) — zmierzono tylko disabled przycisku głównego.
- Przezroczystość z `opacity` poza zmierzonymi elementami (placeholder, przycisk disabled mają `opacity: 1`); `surface-overlay` (scrim dialogów) nie występuje na ekranach E01.
- Ekrany nieoglądane osobiście przy 1280 i 320 px: obejrzano tylko `/` (gość) i `/account` (zweryfikowany) przy 1280 oraz wybrane ekrany przy 320 px; resztę sprawdzono wyłącznie pomiarem.
- Wynik 1280 px w ciemnym motywie (wniosek z 360 px, zob. wyżej).
- Wygląd natywnych kontrolek po dodaniu `color-scheme` sprawdzono na `/login` i `/register` (360 px, oba motywy), nie na pozostałych ekranach.

## Pytania do właściciela

- Czy `text-muted` w jasnym motywie (4,58:1) przyciemnić dla większego marginesu (zob. „Dodatkowe pomiary”)?
- Opcjonalnie: czy tytuł alertu informacyjnego w jasnym motywie ma być bardziej wyróżniony od tekstu pomocniczego — decyzja projektowa, nie błąd kontrastu.

## Poprawki tokenów

Żadne (przed/po: brak zmian).
