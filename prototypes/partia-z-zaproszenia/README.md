# Klikalny prototyp: Epik 02, partia z zaproszenia (etapy A i B: od zaproszenia do rewanżu)

Prototyp pokazuje, jak będą wyglądać i działać ekrany z zatwierdzonej mapy (`lekcja-07/mapa-ekranow-partia.md`), zanim powstanie kod produkcyjny. Korzysta z niego gracz, który klika i komentuje, oraz developer, który buduje z niego prawdziwe ekrany. Nic tu nie jest prawdziwą usługą: konta, partie, zaproszenia i limity istnieją tylko w pamięci strony, a dane są fikcyjne.

**Zakres etapu A:** utworzenie zaproszenia (p01), kod na `/join` (p02), wejście z linku (s07, wspólne z Epikiem 01), oczekiwanie twórcy (p03) i „Partia gotowa” (p04). **Etap B (D3.2):** plansza z zegarami (p05), koniec partii z wynikiem, poddaniem i rewanżem (p06), błędy dostępu i ładowania (p07), powrót po rozłączeniu. „Przejdź do planszy” i „Partia w toku” prowadzą teraz na prawdziwą planszę (w etapie A otwierały dialog „Poza tym prototypem”); poza tym zachowanie etapu A jest bez zmian.

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

Testy nawigacji i reguł: `npx vitest run --config prototypes/partia-z-zaproszenia/vitest.config.ts` (`tests/navigation.test.tsx` etap A, `tests/stage-b.test.tsx` etap B). Sprawdzenia w przeglądarce (agent-browser, serwer HTTP na porcie z `PORT`, domyślnie 8767 dla etapu B i 8766 dla etapu A):

- etap A: `checks/etap-a-walk.sh` (port 8766), wynik `checks/etap-a-log.txt`, zrzuty `checks/etap-a-evidence/`,
- etap B: `PORT=8767 checks/etap-b-walk.sh`, wynik `checks/etap-b-log.txt`, zrzuty `checks/etap-b-evidence/`.

Skrypty etapu A czytają port z adresu na stałe (8766); skrypt etapu B przyjmuje `PORT`.

## Co zawiera

| ID | Ekran | Stany z mapy |
|---|---|---|
| p01 | Utworzenie partii (strona główna `/`, akcja „Utwórz zaproszenie”) | p01.1–p01.7 (p01.4 widać jako „p03.1 + p01.4”: przejście do własnej oczekującej partii z komunikatem) |
| p02 | Kod zaproszenia `/join` | p02.1–p02.5 (p02.4 to s07.9) |
| s07 | Wejście z zaproszenia `/invite/[code]` (wspólne z E01) | s07.1–s07.9 |
| p03 | Partia czeka na przeciwnika `/games/{id}` | p03.1–p03.10 |
| p04 | Partia gotowa `/games/{id}` | p04.1–p04.4 (p04.4 jako „p04.1 + p04.4” i „p04.2 + p04.4”) |
| p05 | Partia w toku `/games/{id}` | p05.1–p05.14 (nakładają się: pasek pokazuje je razem, np. `p05.1 + p05.5`, `p05.2 + p05.8`) |
| p06 | Koniec partii `/games/{id}` | p06.1–p06.15 (wynik + stan rewanżu, np. `p06.2 + p06.11`; p06.7 jako 404 na tym samym ekranie) |
| p07 | Brak dostępu i błędy `/games/{id}` | p07.1 (ładowanie), p07.2, p07.3, p07.4 (baza niedostępna); te same bramki pokazują p03–p06 |

Wszystkie ekrany partii (p03–p06) pokazują te same bramki p07: „Ta partia nie istnieje albo nie masz do niej dostępu” (p07.2 i p07.3, a po godzinie od końca u gościa p06.7), szkielet ładowania (p07.1) i błąd serwera (p07.4). Ekran p07 w pasku pozwala je otworzyć wprost.

**Pokrycie mapy:** wszystkie stany z mapy mają ekran albo kontrolkę, która je wywołuje: p05.1–p05.14, p06.1–p06.15, p07.1–p07.4. Szczegóły w „Scenariuszach” i w POSTEP.md.

Identyfikatory ekranów i stanów są stałe, bo przypięte są do nich komentarze. Pasek przeglądu pokazuje „Stan: …” dla ekranu na wierzchu (stany, które obowiązują naraz, są połączone plusem). Ekrany składają się z komponentów `@gomoku/ui/game/*` i tokenów `game-tokens.css`; w kodzie nie ma kolorów ani odstępów spoza tokenów. Miejsca bez komponentu są oznaczone w kodzie słowem `LUKA`:

- D03 (etap A): wiersz wyniku kopiowania pod Kartą kodu,
- D01 (p05.4): brak wzorca „zaznaczone przecięcie + Postaw kamień”; użyto `selected` z Planszy i zwykłego Przycisku,
- D04 (p05.3): Zegar gracza zna tylko tekstowy stan „Mało czasu”; wariant bez tekstu (kolor `status-danger` i obrys 4 px, #23 Q1) to opakowanie `.low-clock` w `src/styles.css` z samych tokenów,
- Dialog potwierdzenia nie ma miejsca na błąd: błąd poddania jest alertem w opisie dialogu,
- D06 (p06): brak komponentu akcji po końcu partii; blok „Rewanż” jest z Alertu, Przycisków i tekstu.

## Pasek przeglądu

Na górze: oznaczenie „Prototyp”, stały „teraz” (poniedziałek 2026-10-26 10:00), bieżąca sesja, stan ekranu, wybór ekranu (p01, p02, s07, p03, p04, p05, p06, p07), przełącznik motywu (ciemny, jasny) i przyciski silnika przeglądu: Clickable i Comment, Show hotspots, Presentation, Threads, Hide pins, ← Back. Komentarze eksportujesz przyciskami „Export for repository” (nowy `src/review/comments.js` do commita) albo „Export Markdown”. Pod nimi rozwijany panel „Scenariusze”; to kontrolki prototypu, nie funkcje produktu.

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
| **Etap B.** Odbuduj do punktu: p05.1, p05.2, p05.11, p06.1, p06.2, p06.4 | Q02; skróty do planszy i wyniku (Ala_7, czarne albo białe, gość) |
| Wylosowano: losowo / Ty czarne / Ty białe | Q02; kolor oglądającego przy „Przejdź do planszy” (#22 Q1) |
| Urządzenie wejścia: wykryj (`pointer: coarse`) / mysz / dotyk | Q06; p05.4, p05.5 |
| Ruchy przeciwnika: rozproszone (nigdy piątka) / piątka w rzędzie; „Przeciwnik gra ruch” | Q02; ruch przeciwnika, przegrana pięcioma |
| Następny ruch: przyjęty / błąd sieci / nieaktualny widok / nie Twoja kolej / pole zajęte | Q05; p05.6–p05.9 (jednorazowo) |
| Następne poddanie: błąd sieci; baza niedostępna; wolne ładowanie partii; gość w innej przeglądarce | p05.14, p07.4, p07.1, p07.3 |
| Zegar partii: „Zegar dotyczy” (mój/przeciwnika), +30 s, +1 min, Skocz do 0:50, Minął czas, Odliczaj zegar (x10, x30, x1) | Q03; p05.3, p06.1, p06.3 |
| Wynik: Pokaż wygraną / przegraną / remis, Prawie pełna plansza, Przeciwnik poddał się, Odśwież stronę partii | Q02; p06.1, p06.2, p06.4, p06.8, p06.5 |
| Karta w tle 20 s / 45 s | Q07, Q11; p05.12, p05.10 |
| Rewanż: przeciwnik proponuje / wycofuje / przyjmuje / odrzuca / wychodzi do panelu; „Ktoś z graczy ma inną partię (BR-13)”; „+5 min” w zegarze demo | p06.10–p06.15 |
| Reset symulacji | Q12, wraca na p01 |

Limity z mapy liczą się naprawdę: 11. utworzenie zaproszenia w godzinę daje p01.5; 6. nieudane sprawdzenie kodu daje p02.3 / s07.8 (w produkcie 20 w 15 min). Limit, wygasanie (24 h) i anulowanie po 15 min bez otwarcia (Q21) wynikają z zegara demo.

Kontrolki etapu B opisuje druga połowa tabeli. Czas demo płynie też dla zegara gracza na ruchu: duże skoki („+15 min”, „+1 h”, „+24 h”) kończą trwającą partię przegraną na czas (BR-06, BR-07). „+5 min” wygasza propozycję rewanżu, „+1 h” po końcu partii kończy token gościa (p06.7).

## Ograniczenia symulacji

- Nic nie jest wysyłane. Konta, sesja, partie i limity to stan w pamięci strony; odświeżenie strony go kasuje (poza komentarzami, które silnik trzyma w przeglądarce).
- „Kopiuj” i „Udostępnij” niczego nie kopiują ani nie udostępniają: pokazują komunikaty zamiast schowka i okna systemowego (A-08).
- Odpytywanie o dołączenie przeciwnika działa co sekundę (w produkcie co 3 s, Q6). Krok „Przeciwnik dołączył” sam przechodzi dalej po 2,5 s (A-04).
- Zegary na p04 stoją na 10:00 (nic się nie liczy przed otwarciem planszy). Na planszy czas demo stoi, dopóki nie włączysz „Odliczaj zegar” (domyślnie x10) albo nie użyjesz skoków; prawdziwy czas nie płynie (A-13 szarego prototypu).
- **Naprawdę liczy symulator:** stawianie kamienia tylko na wolnym polu, naprzemienność, pięć i więcej kamieni w poziomie, pionie i na dwóch przekątnych (swobodne gomoku, BR-10) z podświetleniem całej linii, remis na pełnej planszy (wygrana ostatnim kamieniem ma pierwszeństwo), zegar serwerowy (10:00 na gracza, zegar ma tylko gracz na ruchu, rusza przy starcie planszy, przegrana na czas rozstrzygana leniwie w chwili, gdy zegar doszedł do zera), poddanie w każdej chwili partii, rewanż jako nowa partia z odwróconymi kolorami (5 min, BR-13 przy przyjęciu, nowy token gościa), token gościa do godziny po końcu.
- **Symulowane kontrolkami:** ruchy przeciwnika (dwa stałe układy), błędy ruchu (sieć, nieaktualny widok, nie Twoja kolej, pole zajęte: każdy jednorazowy; „pole zajęte” i „nie Twoja kolej” udają zdarzenie z innej karty, bo komponent Plansza nie pozwala kliknąć zajętego pola ani wykonać ruchu poza turą), dotyk (nie ma ekranu dotykowego w przeglądzie; domyślnie wykrywa `pointer: coarse`), remis i wygrana skrótem (A-15: gotowy układ nadpisuje planszę), karta w tle (nieobecność jest dodawana do czasu demo; prawdziwa zmiana widoczności karty też działa, próg 30 s), błąd odpytywania w partii (liczy się jak p05.7), baza niedostępna, wolne ładowanie, gość w innej przeglądarce (rola T6).
- **Nowe założenia etapu B** (przeniesione z szarego prototypu, A-12…A-26, bez zmian treści): A-12 (co liczy symulator), A-13 (zegar statyczny, „Odliczaj” x10), A-14 (dotyk w dwóch krokach), A-15 (skróty wyniku nadpisują planszę), A-16 (przyjęcie rewanżu przechodzi od razu na planszę; nowa partia ma `seen_at` obu), A-17 (treści bez źródła: p05.8, p05.9, błąd sieci, „Wylosowano”, banery wyniku), A-18 (kolor losuje się przy „Przejdź do planszy”), A-19 (treści rewanżu), A-20 (karta w tle), A-21 (stany nakładają się w pasku), A-22 (kolejność przycisków w dialogu poddania), A-23 (p07.1, p07.3, p07.4), A-25 (409 przy rewanżu), A-26 (jedna partia naraz). A-24 (szare wizualia) nie dotyczy: ekrany używają komponentów i tokenów.
- **Odstępstwa od szarego prototypu:** wskaźnika „przeciwnik rozłączony” nie ma, bo mapa (L11) i #24 Q1 go nie przewidują (zegar przeciwnika po prostu biegnie); mało czasu to obrys i kolor z tokenów (`status-danger`) zamiast `#ff2d00`; wynik rewanżu przechodzi na planszę bez p04 (A-16); stan p05.7 obejmuje też błąd odpytywania (jak w szarym prototypie).
- Rewanż: zakończona partia zostaje w pamięci obok nowej (A-26); „Wróć do panelu głównego” z własną, trwającą propozycją zapisuje ją jako odrzuconą (L21).
- Sprawdzenia ręczne, których nie wykonano: czytnik ekranu (sprawdzono role i atrybuty, nie odczyty), kontrast pomierzony narzędziem, prawdziwy ekran dotykowy, równoległe karty dwóch graczy, przeglądarki inne niż Chromium.
- Logowanie, rejestracja i Konto należą do prototypu kont (Epik 01): przyciski otwierają dialog „Poza tym prototypem”; konto wybierasz w panelu. Lobby i Historia są poza prototypem.
- Prototyp symuluje wszystkich uczestników jednym widzem: stan partii jest wspólny, zmiana konta w panelu zmienia tylko to, kogo oglądasz. Gość to przeglądarka T5 (jedna na prototyp).
- Wejście na s07 z paska bez linku pokazuje cudze oczekujące zaproszenie (np. Ewy_B) albo przygotowuje zaproszenie Ala_7 `ABCD-EFGH`; „Otwórz zaproszenie Ala_7” otwiera ostatnie zaproszenie Ali w dowolnym stanie. To skróty prototypu.
- Wejście na p03 lub p04 bez partii pokazuje „nie masz dostępu”, jak produkt. Skrót „Odbuduj symulację” buduje partię.
- Teksty, których nie ma w specyfikacji, to założenia z szarego prototypu (A-02 i dalej: L01, L02, L03, L05, L06, treść dialogu anulowania, limit „za N min”); przy ekranach są uwagi.
- Prototyp nie rozstrzyga otwartych luk z mapy (L01–L03, L05, L06, L08, L10, L15, L18, L19) ani luk w design systemie (D03, D05); ich lista jest w mapie.
- Prototyp nie dowodzi popytu ani gotowości produkcyjnej.

## Dla developera

- `src/sim.ts`: symulowany serwer (konta, partie, zaproszenia, BR-13, wygasanie 24 h i 15 min, anulowanie, limity; od etapu B plansza, reguły ruchu i wygranej, zegar, poddanie, rewanż, karta w tle). Reguły z `.ai/specs/2026-10-24-game-invitations.md` i z #22, #23, #24, poddania i rewanżu. Stan gry to `Game.play` (`Play`: ruchy, tura, zegary w chwili `tickAt`, wynik, oferta rewanżu); czas liczy się z różnicy do „teraz” demo (`remainingMs`), rozstrzygnięcie czasu dzieje się w `settle` przy każdej zmianie stanu.
- `src/screens/`: jeden plik na ekran (`p01-home`, `p02-join`, `s07-invite`, `p03-waiting`, `p04-ready`, `p05-board`, `p06-result`, `p07-errors`), wspólne `play-shared` (nazwy graczy, Zegar z wariantem „mało czasu”) i bramka `game-gate` (p07.1, p07.2, p07.3, p07.4, p06.7 dla wszystkich ekranów partii). `src/chrome.tsx`: nagłówek, dialog „Poza prototypem”, przejścia (`go`), trasowanie ekranów partii. `src/stateId.ts`: numer stanu w pasku.
- `src/review/`: silnik przeglądu (`prototype.js` bez zmian), most do tokenów (`mostek.css`) i style hosta (`host.css`).
- Przy budowie prawdziwych ekranów: te same komponenty `@gomoku/ui/game/*`; zmieniają się źródła danych (route handlery zamiast `sim.ts`).
