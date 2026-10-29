# Klikalny prototyp: Epik 02, partia z zaproszenia (etap A: zaproszenie i oczekiwanie)

Prototyp pokazuje, jak będą wyglądać i działać ekrany z zatwierdzonej mapy (`lekcja-07/mapa-ekranow-partia.md`), zanim powstanie kod produkcyjny. Korzysta z niego gracz, który klika i komentuje, oraz developer, który buduje z niego prawdziwe ekrany. Nic tu nie jest prawdziwą usługą: konta, partie, zaproszenia i limity istnieją tylko w pamięci strony, a dane są fikcyjne.

**Zakres etapu A:** utworzenie zaproszenia (p01), kod na `/join` (p02), wejście z linku (s07, wspólne z Epikiem 01), oczekiwanie twórcy (p03) i „Partia gotowa” (p04). **Etap B** (plansza, zegary, wynik, poddanie, rewanż, powrót po rozłączeniu: p05–p07) to zadanie D3.2; przyciski, które do niego prowadzą, otwierają dialog „Poza tym prototypem”.

Postęp i decyzje: `POSTEP.md`. Mapa ekranów, stany i luki: `lekcja-07/mapa-ekranow-partia.md`. Szary prototyp, z którego wzięto przepływ i założenia A-01…A-26: `.ai/prototypes/discovery/game-from-invitation/revision-002/`.

## Jak uruchomić

Źródła są w tym katalogu. Wynik budowania trafia do folderu, z którego Storybook serwuje pliki, i nie jest commitowany (ścieżka jest w `.gitignore`).

```bash
npx vite build --config prototypes/partia-z-zaproszenia/vite.config.ts
```

Podgląd musi iść przez HTTP (moduły nie ładują się z `file://`):

- Storybook: `npm run storybook -w @gomoku/ui`, potem `/prototypes/partia-z-zaproszenia/index.html` (port 6006, w sandboxie 3000),
- albo prosty serwer: `cd packages/ui/.storybook/public && python3 -m http.server 8766`, adres `http://localhost:8766/prototypes/partia-z-zaproszenia/index.html`.

Dopisek `?fast` w adresie wyłącza symulowane opóźnienia serwera (testy).

Testy nawigacji: `npx vitest run --config prototypes/partia-z-zaproszenia/vitest.config.ts`. Sprawdzenia w przeglądarce (agent-browser, serwer na porcie 8766): `prototypes/partia-z-zaproszenia/checks/etap-a-walk.sh`, wynik w `checks/etap-a-log.txt`, zrzuty w `checks/etap-a-evidence/`.

## Co zawiera

| ID | Ekran | Stany z mapy |
|---|---|---|
| p01 | Utworzenie partii (strona główna `/`, akcja „Utwórz zaproszenie”) | p01.1–p01.7 (p01.4 widać jako „p03.1 + p01.4”: przejście do własnej oczekującej partii z komunikatem) |
| p02 | Kod zaproszenia `/join` | p02.1–p02.5 (p02.4 to s07.9) |
| s07 | Wejście z zaproszenia `/invite/[code]` (wspólne z E01) | s07.1–s07.9 |
| p03 | Partia czeka na przeciwnika `/games/{id}` | p03.1–p03.10 |
| p04 | Partia gotowa `/games/{id}` | p04.1–p04.4 (p04.4 jako „p04.1 + p04.4” i „p04.2 + p04.4”) |

Dodatkowo, jako bramka bez własnego ekranu, p03 i p04 pokazują „Ta partia nie istnieje albo nie masz do niej dostępu” (p07.2 i p07.3), gdy widz nie ma partii do otwarcia. Reszta p07 (szkielet, baza niedostępna) należy do etapu B.

Identyfikatory ekranów i stanów są stałe, bo przypięte są do nich komentarze. Pasek przeglądu pokazuje „Stan: …” dla ekranu na wierzchu. Ekrany składają się z komponentów `@gomoku/ui/game/*` i tokenów `game-tokens.css`; w kodzie nie ma kolorów ani odstępów spoza tokenów. Miejsca bez komponentu są oznaczone w kodzie słowem `LUKA` (D03: wiersz wyniku kopiowania pod Kartą kodu).

## Pasek przeglądu

Na górze: oznaczenie „Prototyp”, stały „teraz” (poniedziałek 2026-10-26 10:00), bieżąca sesja, stan ekranu, wybór ekranu (p01, p02, s07, p03, p04), przełącznik motywu (ciemny, jasny) i przyciski silnika przeglądu: Clickable i Comment, Show hotspots, Presentation, Threads, Hide pins, ← Back. Komentarze eksportujesz przyciskami „Export for repository” (nowy `src/review/comments.js` do commita) albo „Export Markdown”. Pod nimi rozwijany panel „Scenariusze”; to kontrolki prototypu, nie funkcje produktu.

## Konta demo (T1–T7 z mapy)

Hasło wszystkich kont: `drewniana-plansza-2026` (konto wybierasz w panelu, formularza logowania tu nie ma).

| Kod | Rola | Nazwa | Stan |
|---|---|---|---|
| T1 | twórca, e-mail potwierdzony | Ala_7 | bez partii |
| T2 | zaproszony zalogowany, e-mail niepotwierdzony (gra normalnie, BR-26) | Kuba_P | bez partii |
| T3 | zalogowany z partią w toku (BR-13) | Marek_Z | gra z Olek_R |
| T4 | zalogowany z własną oczekującą partią (Q18) | Ewa_B | kod `KMNP-QRST` |
| T5 | gość partii (przeglądarka z tokenem) | brak nazwy | token powstaje po „Rozumiem, graj jako gość”; przed dołączeniem zachowuje się jak T6 |
| T6 | niezalogowany | | brak sesji i tokenu |
| T7 | osoba spoza partii | Zofia_K | 404 na cudzej partii |

T8 (operator) nie istnieje: żadna specyfikacja go nie opisuje (L10).

## Scenariusze do przełączania

Numery Q01–Q12 pochodzą z mapy.

| Kontrolka | Co wywołuje |
|---|---|
| Kto ogląda (T1–T7) | Q01; rola i sesja |
| Odbuduj symulację do punktu | Q02; skróty do p03, p03.5, p04.1, p04.2, p04.4 (czyści symulację, buduje partię Ala_7) |
| Przeciwnik dołącza z kontem / jako gość, Twórca otwiera stronę partii | Q02; p03.5, p04.1, p04.2 |
| Przeciwnik dołączy, zanim potwierdzę anulowanie | Q09; „Przeciwnik zdążył dołączyć” |
| +15 min bez otwarcia, +1 h, +24 h, Wróć do 10:00 | Q03; p04.3 (Q21), p03.9 (Q3) |
| Wynik „Utwórz zaproszenie”: według konta, masz już partię, oczekująca, limit, błąd serwera, brak sieci | Q04; p01.3–p01.7 |
| Limit prób kodu; strona zaproszenia: według partii, limit, nieważne; Otwórz zaproszenie Ala_7 | Q10; p02.3, s07.8, s07.9 |
| Schowek niedostępny, „Udostępnij” niedostępne, błąd odpytywania | Q08, Q11; p03.3, p03.4, p03.10 |
| Szerokość ekranu: pełna, 1440, 360, 320 px | Q12 |
| Reset symulacji | Q12, wraca na p01 |

Limity z mapy liczą się naprawdę: 11. utworzenie zaproszenia w godzinę daje p01.5; 6. nieudane sprawdzenie kodu daje p02.3 / s07.8 (w produkcie 20 w 15 min). Limit, wygasanie (24 h) i anulowanie po 15 min bez otwarcia (Q21) wynikają z zegara demo.

Nie ma w tym etapie kontrolek etapu B: urządzenie wejścia, ruchy przeciwnika, zegar partii, wynik, rewanż, baza niedostępna, karta w tle (Q05–Q07, część Q02, Q03, Q11).

## Ograniczenia symulacji

- Nic nie jest wysyłane. Konta, sesja, partie i limity to stan w pamięci strony; odświeżenie strony go kasuje (poza komentarzami, które silnik trzyma w przeglądarce).
- „Kopiuj” i „Udostępnij” niczego nie kopiują ani nie udostępniają: pokazują komunikaty zamiast schowka i okna systemowego (A-08).
- Odpytywanie o dołączenie przeciwnika działa co sekundę (w produkcie co 3 s, Q6). Krok „Przeciwnik dołączył” sam przechodzi dalej po 2,5 s (A-04).
- Zegary na p04 stoją na 10:00: biegną dopiero na planszy (etap B).
- Logowanie, rejestracja i Konto należą do prototypu kont (Epik 01): przyciski otwierają dialog „Poza tym prototypem”; konto wybierasz w panelu. Lobby i Historia są poza prototypem.
- Prototyp symuluje wszystkich uczestników jednym widzem: stan partii jest wspólny, zmiana konta w panelu zmienia tylko to, kogo oglądasz. Gość to przeglądarka T5 (jedna na prototyp).
- Wejście na s07 z paska bez linku pokazuje cudze oczekujące zaproszenie (np. Ewy_B) albo przygotowuje zaproszenie Ala_7 `ABCD-EFGH`; „Otwórz zaproszenie Ala_7” otwiera ostatnie zaproszenie Ali w dowolnym stanie. To skróty prototypu.
- Wejście na p03 lub p04 bez partii pokazuje „nie masz dostępu”, jak produkt. Skrót „Odbuduj symulację” buduje partię.
- Teksty, których nie ma w specyfikacji, to założenia z szarego prototypu (A-02 i dalej: L01, L02, L03, L05, L06, treść dialogu anulowania, limit „za N min”); przy ekranach są uwagi.
- Prototyp nie rozstrzyga otwartych luk z mapy (L01–L03, L05, L06, L08, L10, L15, L18, L19) ani luk w design systemie (D03, D05); ich lista jest w mapie.
- Prototyp nie dowodzi popytu ani gotowości produkcyjnej.

## Dla developera

- `src/sim.ts`: symulowany serwer (konta, partie, zaproszenia, BR-13, wygasanie 24 h i 15 min, anulowanie, limity). Reguły z `.ai/specs/2026-10-24-game-invitations.md`.
- `src/screens/`: jeden plik na ekran (`p01-home`, `p02-join`, `s07-invite`, `p03-waiting`, `p04-ready`, bramka `game-gate`). `src/chrome.tsx`: nagłówek, dialog „Poza prototypem”, przejścia (`go`), trasowanie ekranów partii. `src/stateId.ts`: numer stanu w pasku.
- `src/review/`: silnik przeglądu (`prototype.js` bez zmian), most do tokenów (`mostek.css`) i style hosta (`host.css`).
- Przy budowie prawdziwych ekranów: te same komponenty `@gomoku/ui/game/*`; zmieniają się źródła danych (route handlery zamiast `sim.ts`).
