# Mapa ekranów: Epik 02, partia z zaproszenia

- Data: 2026-10-26. Status: **szkic do zatwierdzenia** (nic nie zbudowano). Uwzględnia decyzje właściciela z 2026-10-26 (sekcja 0a).
- Przepływ: Epik E02 (#16): tworzenie partii i zaproszenia (#21), dołączenie (zalogowany albo gość), ruchy i wygrana (#22), zegar 10 minut (#23), powrót po rozłączeniu (#24). Kończy się ekranem wyniku. Historia (#27), lobby (#25, #26) i zarządzanie kontem są poza tą mapą.
- Materiały: `.ai/specs/product-brief.md` (po zmianie 2026-10-26), `.ai/specs/backlog.md`, `2026-10-24-game-invitations.md` (#21), `2026-10-25-game-moves-win-detection.md` (#22), zgłoszenia #23 i #24 (**nie mają specyfikacji**: kryteria z tracker'a), design system (`packages/ui/docs/design-system.md`, `docs/epics/partia.mdx`, `docs/screens/game-screen.tsx`, `invite-screens.tsx`), mapa E01 (`lekcja-07/mapa-ekranow.md`, ekran s07). Persony: brak.
- **Ekran `/invite/[code]` jest wspólny z E01:** to s07 z `mapa-ekranow.md` (stany s07.1–s07.9). Tutaj go nie powielam; wchodzi w przepływ jako krok 2. ID ekranów tej mapy mają przedrostek `p` (p01, p02, …), żeby nie kolidowały z `s01–s07`. ID są stałe.
- Różnice względem poleceń z lekcji: w projekcie nie ma ról mentee, mentor i operator, GitHuba ani płatności. Role to: twórca zaproszenia, zaproszony zalogowany, gość (token jednej partii), niezalogowany, osoba spoza partii (brak dostępu, N-05: bez obserwatorów).

## 0a. Decyzje właściciela z 2026-10-26 (rozstrzygnięte luki)

| Luka | Decyzja | Skutek dla mapy |
|---|---|---|
| ~~L04~~ (rozstrzygnięta 2026-10-26) | „Anuluj zaproszenie” pyta o potwierdzenie. Po anulowaniu link jest nieważny („To zaproszenie jest już nieważne”), a twórca wychodzi z ekranu partii na stronę główną. | p03.6, p03.8 |
| ~~L11~~ (rozstrzygnięta 2026-10-26) | Piszemy osobne specyfikacje #23 (zegar) i #24 (powrót po rozłączeniu) przed prototypem. | kolejność prac |
| ~~L12~~ (rozstrzygnięta 2026-10-26) | Poddanie wchodzi do MVP (zmiana #22 Q6, osobne zgłoszenie i specyfikacja). | p05.13, p05.14, p06.8, p06.9 |
| ~~L13~~ (rozstrzygnięta 2026-10-26) | Po końcu partii: „Rewanż” (zaproszenie do nowej partii z odwróconymi kolorami) i wyjście do głównego panelu. Gość też może zaproponować i przyjąć rewanż (nowy token w tej samej przeglądarce). Zaproszenie do rewanżu wygasa po 5 minutach. Gdy przeciwnik aktywnie wyjdzie, zapraszający od razu widzi „zaproszenie odrzucone”, a po kliknięciu trafia do głównego panelu. | p06.10–p06.15 |
| ~~L14~~ (rozstrzygnięta 2026-10-26) | Niezalogowany gracz jest dla przeciwnika „Gość”. | p04, p05, p06 |
| ~~L16~~ (rozstrzygnięta 2026-10-26) | Poprawiamy tekst w design systemie (tworzenie partii bez potwierdzenia e-maila). | zadanie dokumentacji |
| ~~L20~~ (rozstrzygnięta 2026-10-26) | Zegar pierwszego gracza rusza, gdy obaj mają `seen_at` (#21 Q20). #22 Q8 do poprawienia. | p04.1, p05.1 |
| L21 | S | „Aktywne wyjście” z ekranu wyniku: czym jest (przycisk „Wróć do panelu głównego”, zamknięcie karty, nawigacja)? Tylko przycisk jest wykrywalny na pewno | decyzja L13 | Czy „aktywnie wyszedł” = kliknął „Wróć do panelu głównego”? Zamknięcie karty = czekamy do wygaśnięcia po 5 min? |
| L22 | D | Rewanż a BR-13 (jedna aktywna partia): rewanż tworzy nową partię dopiero po przyjęciu, więc obaj gracze są wolni; co jeśli któryś wcześniej zaczął inną partię | decyzja L13, BR-13 | Czy zaproszenie do rewanżu znika, gdy przeciwnik dołączył do innej partii? |
| L23 | S | Treść i skutki poddania: wynik `resignation`, potwierdzenie, wpływ na BR-21 (usunięcie konta) i na `is_active` | decyzja L12 | Tekst potwierdzenia i czy poddanie jest możliwe od pierwszego ruchu? |
| L24 | D | Rewanż gościa: gość po 1 h od końca traci token; czy rewanż przedłuża token na nową partię | decyzja L13 | Czy wystarczy nowy token jak przy zwykłym dołączeniu? |

## 0. Historie i kryteria w zakresie

Oznaczenia: `#21/K1` = kryterium 1 zgłoszenia #21 (kolejność jak w zgłoszeniu). Reguły: BR-01, BR-04…BR-07, BR-09…BR-11, BR-13, BR-20, BR-22, BR-24, BR-26 (konto aktywne bez potwierdzenia e-maila), D-07, D-10, D-21.

| Historia | Kryteria akceptacji (skrót) |
|---|---|
| E02-S01 #21 Partia i zaproszenie | K1 utworzenie partii daje link i kod. K2 ważny link + inny zalogowany: drugi gracz, dokładnie dwóch (BR-01). K3 trzecia osoba nie dołączy (BR-11). K4 aktywna partia: odmowa utworzenia i dołączenia (BR-13). ~~K5 niepotwierdzony e-mail~~ (zastąpione, BR-26). K6 gość po ostrzeżeniu dołącza bez konta i bez nazwy (BR-22). K7 gość wraca w tej samej przeglądarce: kontynuuje, w innej: brak dostępu. K8 token gościa wygasa 1 h po końcu partii. K9 gość nie tworzy zaproszeń i nie wchodzi do lobby. K10 zalogowany nie ma opcji gościa (`409 GUEST_NOT_ALLOWED`). |
| E02-S02 #22 Ruchy i wygrana | K1 poprawny ruch: przeciwnik go widzi, tura przechodzi. K2 ruch poza turą lub na zajęte pole: odrzucony, stan bez zmian. K3 5 w linii: wygrana (BR-10). K4 pełna plansza bez piątki: remis. K5 o stanie rozstrzyga serwer. |
| E02-S03 #23 Zegar | K1 start: każdy ma 10:00 (BR-04). K2 maleje tylko zegar gracza na ruchu (BR-05). K3 zegar 0: gracz przegrywa (BR-07). K4 obowiązuje czas serwera. |
| E02-S04 #24 Powrót po rozłączeniu | K1 powrót przed upływem czasu: aktualna plansza i zegar pomniejszony o nieobecność (BR-06). K2 zegar wyczerpał się podczas rozłączenia: partia zakończona jego przegraną. K3 po końcu odświeżenie pokazuje wynik, ruch niemożliwy. |

Decyzje ze specyfikacji, z których wynikają stany: #21 Q3 (zaproszenie ważne 24 h), Q5 (anulowanie), Q6 (odpytywanie co 3 s), Q11 (ostrzeżenie dla gościa), Q12 (link niczego nie zużywa), Q13 (limity), Q18 (własna oczekująca partia), Q20 i Q21 (zegar rusza, gdy obaj otworzyli stronę; 15 min na otwarcie), Q22 (Kopiuj, Udostępnij); #22 Q1 (losowanie koloru przy dołączeniu), Q4 (idempotentny ruch), Q5 (odpytywanie co 2 s), Q6 (bez poddania i remisu na prośbę), Q7 (dotyk: dwa kroki, mysz: jedno kliknięcie).

## 1. Tabela ekranów

Znak ⚠ przy stanie oznacza stan bez kryterium ani decyzji (luka z sekcji 4).

| ID | Ekran | Rola | Stany | Historia lub kryterium | Komponenty DS |
|---|---|---|---|---|---|
| p01 | Utworzenie partii (akcja „Utwórz zaproszenie” na `/`) | Zalogowany (z potwierdzonym e-mailem lub bez) | p01.1 przycisk, p01.2 tworzenie (przycisk zajęty), p01.3 masz już partię, p01.4 masz oczekującą partię ⚠, p01.5 limit utworzeń, p01.6 błąd serwera ⚠, p01.7 brak sieci ⚠ | #21/K1, K4, Q13, BR-13 | Przycisk (`loading`), Alert, Link tekstowy |
| p02 | Kod zaproszenia `/join` | Każdy (niezalogowany też) | p02.1 pole kodu, p02.2 kod za krótki, p02.3 limit prób, p02.4 kod nieważny, p02.5 sprawdzanie ⚠ | #21 UI, Q12, Q13 | Nagłówek strony, Pole formularza, Pole tekstowe, Przycisk, Alert |
| p03 | Partia czeka na przeciwnika `/games/{id}` (status waiting) | Twórca | p03.1 domyślny (link, kod, „Ważne do”), p03.2 skopiowano, p03.3 kopiowanie niemożliwe (zaznaczenie), p03.4 „Udostępnij” niedostępne (ukryty), p03.5 przeciwnik dołączył, p03.6 potwierdzenie anulowania, p03.7 anulowanie w toku ⚠, p03.8 anulowano ⚠, p03.9 zaproszenie wygasło (24 h) ⚠, p03.10 błąd odpytywania ⚠ | #21/K1, Q3, Q5, Q6, Q22 | Nagłówek strony, Karta kodu zaproszenia, Przycisk, Dialog potwierdzenia, Alert, Szkielet |
| p04 | Partia gotowa, czeka na otwarcie strony `/games/{id}` (active bez `seen_at` obu) | Twórca, zaproszony zalogowany, gość | p04.1 czekamy, aż {nazwa} otworzy partię (do 15 min), p04.2 „Partia gotowa”, p04.3 przeciwnik nie otworzył w 15 min: partia anulowana ⚠, p04.4 stałe ostrzeżenie gościa | #21/K2, K6, Q20, Q21, BR-22 | Nagłówek strony, Alert, Status tury, Zegar gracza |
| p05 | Partia w toku `/games/{id}` | Twórca, zaproszony zalogowany, gość | p05.1 Twój ruch (czarne), p05.2 ruch przeciwnika, p05.3 mało czasu ⚠, p05.4 dotyk: kamień zaznaczony, „Postaw kamień”, p05.5 mysz: jedno kliknięcie, p05.6 wysyłanie ruchu, p05.7 błąd sieci: „Spróbuj ponownie” (ten sam ruch), p05.8 nieaktualny widok (`STALE_MOVE`) lub nie Twoja kolej: cichy powrót z komunikatem, p05.9 pole zajęte ⚠, p05.10 powrót po rozłączeniu, p05.11 gość w partii: stałe ostrzeżenie, p05.12 karta w tle: odpytywanie wstrzymane ⚠ | #22/K1, K2, K5, #23/K1, K2, K4, #24/K1, Q4, Q7, BR-05, BR-06 | Nagłówek strony, Plansza, Zegar gracza, Status tury, Przycisk, Alert |
| p06 | Koniec partii `/games/{id}` (finished) | Twórca, zaproszony zalogowany, gość | p06.1 wygrana (linia wygrywająca), p06.2 przegrana, p06.3 przegrana na czas, p06.4 remis, p06.5 powrót po końcu (odświeżenie: wynik, bez ruchu), p06.6 gość po końcu (token ważny 1 h), p06.7 po 1 h token gościa nie działa | #22/K3, K4, #23/K3, #24/K2, K3, #21/K8 | Baner wyniku, Plansza (tylko do odczytu), Zegar gracza, Przycisk, Link tekstowy |
| p07 | Partia: brak dostępu i błędy `/games/{id}` | Niezalogowany, osoba spoza partii, gość w innej przeglądarce | p07.1 ładowanie, p07.2 partia nie istnieje albo brak dostępu (`404`), p07.3 gość w innej przeglądarce (brak dostępu, zegar biegnie), p07.4 baza niedostępna ⚠ | #21/K7, Edge Cases, BR-06, N-05 | Szkielet, Stan błędu, Link tekstowy |

Ekran `/invite/[code]` (s07) jest krokiem wejścia dla zaproszonego (stany z E01: niezalogowany, ostrzeżenie dla gościa, zalogowany, już uczestnik, własne zaproszenie, inna partia, oczekująca partia, limit, nieważne).

### 1a. Stany ekranów i ich źródła

**p01 Utworzenie partii**

| Stan | Co widać | Źródło |
|---|---|---|
| p01.1 | Na `/` (s04.3) przycisk „Utwórz zaproszenie”; link „Masz kod?” prowadzi na p02 | #21 UI |
| p01.2 | Przycisk zajęty, po sukcesie przejście na p03 | #21/K1 |
| p01.3 | „Masz już partię” z linkiem do niej | #21/K4, Q7, BR-13 |
| p01.4 ⚠ | Własna oczekująca partia: `409 OWN_WAITING_GAME` (Q18) przy tworzeniu drugiej; spec opisuje tylko akceptację cudzego linku | #21 Q18; L01 |
| p01.5 | Limit 10 utworzeń na godzinę: komunikat z czasem | #21 Q13 |
| p01.6 ⚠, p01.7 ⚠ | Błąd serwera i brak sieci: treść nie jest opisana | #21 Edge Cases; L02 |

**p02 Kod zaproszenia `/join`**

| Stan | Co widać | Źródło |
|---|---|---|
| p02.1 | Pole „Kod zaproszenia” (wielkość liter i myślnik bez znaczenia), przycisk, po wysłaniu przejście na `/invite/{kod}` (s07) | #21 UI |
| p02.2 | „Sprawdź kod: ma 8 znaków.” przy polu | #21 UI |
| p02.3 | „Zbyt wiele prób — spróbuj za chwilę” | #21 Q13 |
| p02.4 | Kod nieważny: ekran s07.9 | #21 Q12 |
| p02.5 ⚠ | Sprawdzanie kodu (przycisk zajęty) | wzór z formularzy; L03 |

**p03 Partia czeka na przeciwnika**

| Stan | Co widać | Źródło |
|---|---|---|
| p03.1 | Link zaproszenia, kod `ABCD-EFGH` dużą czcionką, „Ważne do {godzina}”, „Kopiuj”, „Udostępnij”, „Anuluj zaproszenie”, „Czekamy na przeciwnika…” (`status`, odpytywanie co 3 s) | #21 UI, Q3, Q6, Q22 |
| p03.2 | Po „Kopiuj”: potwierdzenie skopiowania | #21 UI |
| p03.3 | Brak Clipboard API: zaznaczenie tekstu linku | #21 UI |
| p03.4 | Brak `navigator.share`: przycisk „Udostępnij” ukryty | #21 UI, Q22 |
| p03.5 | „Przeciwnik dołączył” i przejście na p04 | #21 UI |
| p03.6 | Dialog potwierdzenia anulowania (decyzja L04) | #21 Q5; DS; L04 |
| p03.7 ⚠ | Anulowanie w toku (przycisk zajęty) | #21 Q5 |
| p03.8 | Po anulowaniu twórca trafia na stronę główną; link zaproszenia pokazuje s07.9 „nieważne” | L04 |
| p03.9 ⚠ | Zaproszenie wygasło po 24 h: widok pokazuje wygaśnięcie (spec Edge Cases), treści brak | #21 Q3, Edge Cases; L05 |
| p03.10 ⚠ | Błąd odpytywania | L02 |

**p04 Partia gotowa**

| Stan | Co widać | Źródło |
|---|---|---|
| p04.1 | „Czekamy, aż {nazwa} otworzy partię — zegar ruszy, gdy obaj będziecie na stronie (do 15 min)” | #21 UI, Q20, Q21 |
| p04.2 | „Partia gotowa”; plansza dopiero w #22 (w prototypie przechodzi na p05) | #21 UI |
| p04.3 ⚠ | Po 15 min bez otwarcia przez któregoś: partia anulowana, brak wpisu w historii; co widzi gracz, który otworzył | #21 Q21; L06 |
| p04.4 | Gość widzi stałe ostrzeżenie „Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii” | #21 UI, BR-22 |

**p05 Partia w toku**

| Stan | Co widać | Źródło |
|---|---|---|
| p05.1 | Plansza 15×15, „Twój ruch (czarne)” (tekst, nie tylko kolor), zegary obu graczy, ostatni ruch z obramowaniem | #22 UI, #23/K1 |
| p05.2 | „Ruch przeciwnika”, plansza tylko do odczytu, odpytywanie co 2 s | #22 UI, Q5 |
| p05.3 ⚠ | „Mało czasu”: DS ma stan, spec nie podaje progu | DS; L07 |
| p05.4 | Ekran dotykowy: dotknięcie zaznacza przecięcie (podgląd kamienia), „Postaw kamień” wysyła ruch | #22 Q7 |
| p05.5 | Mysz: jedno kliknięcie wysyła ruch; klawiatura: strzałki, Enter | #22 Q7, UI |
| p05.6 | Ruch w drodze (przycisk zajęty) | #22 Q4 |
| p05.7 | Błąd sieci: „Spróbuj ponownie” ponawia **ten sam** ruch | #22 UI, Q4 |
| p05.8 | `STALE_MOVE` i `NOT_YOUR_TURN`: cichy powrót do aktualnego stanu z krótkim komunikatem | #22 UI |
| p05.9 ⚠ | `CELL_OCCUPIED` (pole zajęte): treść komunikatu | #22 API; L08 |
| p05.10 | Powrót po rozłączeniu: „Wróciłeś do partii”, aktualny czas | #24/K1, BR-06 |
| p05.11 | Gość: stałe ostrzeżenie nad partią | #21 UI |
| p05.13 | „Poddaj partię” pod planszą i dialog potwierdzenia | L12, BR-21 |
| p05.14 ⚠ | Poddanie w toku; błąd | L12 |
| p05.12 ⚠ | Karta w tle: odpytywanie wstrzymane, po powrocie wznowione; co widać po wznowieniu | #22 UI; L09 |

**p06 Koniec partii**

| Stan | Co widać | Źródło |
|---|---|---|
| p06.1 | Baner „Wygrałeś”, linia wygrywająca podświetlona (`winLine`), plansza tylko do odczytu | #22/K3 |
| p06.2 | „Przegrałeś”, przeciwnik ułożył pięć | #22/K3 |
| p06.3 | „Przegrałeś”, skończył się czas | #23/K3, BR-07 |
| p06.4 | „Remis”, plansza pełna (wygrana ostatnim kamieniem ma pierwszeństwo) | #22/K4 |
| p06.5 | Odświeżenie lub ponowne wejście po końcu: wynik, bez możliwości ruchu | #24/K3 |
| p06.6 | Gość po końcu: widzi wynik do 1 h po zakończeniu | #21/K8, BR-22 |
| p06.7 | Po 1 h token gościa nie działa: `404`, patrz p07.2 | #21/K8 |
| p06.8 | Koniec przez poddanie: „Wygrałeś, przeciwnik poddał partię” | L12 |
| p06.9 | Koniec przez poddanie: „Przegrałeś, poddałeś partię” | L12 |
| p06.10 | Pod wynikiem „Rewanż” (kolory odwrócone) i „Wróć do panelu głównego” | L13 |
| p06.11 | Rewanż zaproponowany, czekamy na odpowiedź (do 5 min), możliwość wycofania | L13 |
| p06.12 | Przeciwnik proponuje rewanż: „Przyjmij” / „Odrzuć” | L13 |
| p06.13 | Przeciwnik aktywnie wyszedł albo odrzucił: od razu „Zaproszenie do rewanżu odrzucone”, po kliknięciu panel główny | L13 |
| p06.14 ⚠ | Rewanż wygasł po 5 minutach | L13 |
| p06.15 ⚠ | Rewanż gościa: nowy token w tej samej przeglądarce; gość nie ma historii | L13, BR-22 |

**p07 Brak dostępu i błędy**

| Stan | Co widać | Źródło |
|---|---|---|
| p07.1 | Szkielet ładowania partii | DS |
| p07.2 | „Ta partia nie istnieje albo nie masz do niej dostępu” z linkiem na stronę główną | #21 Edge Cases, N-05 |
| p07.3 | Gość w innej przeglądarce lub po wyczyszczeniu ciasteczek: to samo `404`; zegar biegnie (BR-06) | #21 Edge Cases |
| p07.4 ⚠ | Baza niedostępna (`500`): treść | L02 |

Stan „pusty” nie dotyczy tych ekranów (nie ma list).

### 1b. Role i dostęp

| Ekran | Twórca | Zaproszony zalogowany | Gość (token) | Niezalogowany | Spoza partii |
|---|---|---|---|---|---|
| p01 `/` „Utwórz zaproszenie” | tak | tak | brak dostępu (BR-22) | brak (przycisku nie ma, `/` ma „Załóż konto”) | n/d |
| p02 `/join` | tak | tak | tak | tak | tak |
| s07 `/invite/[code]` | przekierowanie do partii | „Dołącz do partii” | po ostrzeżeniu dołącza | trzy wybory | zob. stany s07 |
| p03 `/games/{id}` waiting | tak | brak (jeszcze nie uczestnik) | brak | brak | `404` |
| p04, p05, p06 `/games/{id}` | tak | tak | tak (w tej przeglądarce) | `404` | `404` |
| p07 | | | gość w innej przeglądarce: `404` | `404` | `404` |

## 2. Scenariusze do przełączania w prototypie

Kontrolki prototypu (pasek przeglądu), nie funkcje produktu.

| ID | Scenariusz | Wywołuje stany |
|---|---|---|
| Q01 | Rola oglądającego: twórca, zaproszony zalogowany, gość, niezalogowany, spoza partii | p03–p07 |
| Q02 | Stan partii: czeka, gotowa, w toku (tura moja/przeciwnika), koniec (wygrana, przegrana, przegrana na czas, remis) | p03–p06 |
| Q03 | Zegar demo: stały „teraz”, przyspieszenie, „mało czasu”, „czas minął”, +15 min bez otwarcia, +24 h (wygaśnięcie zaproszenia) | p03.9, p04.3, p05.3, p06.3 |
| Q04 | Utworzenie partii: ok, aktywna partia, oczekująca partia, limit, błąd serwera, brak sieci | p01 |
| Q05 | Ruch: ok, błąd sieci (ponowienie tego samego ruchu), `STALE_MOVE`, nie Twoja kolej, pole zajęte | p05.6–p05.9 |
| Q06 | Urządzenie wejścia: dotyk (dwa kroki) albo mysz | p05.4, p05.5 |
| Q07 | Rozłączenie i powrót (zegar pomniejszony o nieobecność) | p05.10 |
| Q08 | Kopiowanie: dostępne, niedostępne; udostępnianie: dostępne, niedostępne | p03.2–p03.4 |
| Q09 | Anulowanie: potwierdź, w toku, anulowano; twórca anuluje w chwili dołączenia przeciwnika | p03.6–p03.8 |
| Q10 | Kod na `/join`: poprawny, za krótki, limit, nieważny | p02 |
| Q11 | Baza niedostępna; karta w tle | p07.4, p05.12 |
| Q12 | Szerokość 320 / 360 / 1440 px, motyw ciemny i jasny, Reset | wszystkie |

## 3. Konta i dane demo

Fikcyjne. Hasło demo wszystkich kont: `drewniana-plansza-2026`. **Stały „teraz”: poniedziałek 2026-10-26 10:00 (Europe/Warsaw).** Z briefu: plansza 15×15, 5 w linii, 10 minut na gracza, zaproszenie ważne 24 h, 15 minut na otwarcie strony po dołączeniu, token gościa do końca partii + 1 h, kod `ABCD-EFGH`. Cen i terminów handlowych brak (gra darmowa, D-19).

| Konto | Rola | E-mail | Nazwa | Stan |
|---|---|---|---|---|
| T1 | Twórca zaproszenia, e-mail potwierdzony | ala@example.com | Ala_7 | bez partii |
| T2 | Zaproszony zalogowany, e-mail niepotwierdzony (gra normalnie, BR-26) | kuba@example.com | Kuba_P | bez partii |
| T3 | Zalogowany z aktywną partią (odmowa utworzenia i dołączenia, BR-13) | marek@example.com | Marek_Z | partia w toku |
| T4 | Zalogowany z własną oczekującą partią (Q18) | ewa@example.com | Ewa_B | partia waiting |
| T5 | Gość partii | brak | brak (gość nie ma nazwy) | token jednej partii |
| T6 | Niezalogowany | brak | brak | brak sesji |
| T7 | Osoba spoza partii (brak dostępu) | zalogowany dowolny | | `404` na cudzej partii |
| T8 | Operator | brak w materiałach | | L10 |

Połączenia ról: T1 + T5 (twórca zalogowany, przeciwnik gość) i T1 + T2 (oba konta); w obu wylosowany kolor (Q1) i ten sam kod `ABCD-EFGH`.

## 4. Luki w specyfikacji

Typy: **K** = kryterium bez ekranu lub stanu, **S** = stan bez kryterium, **X** = sprzeczność, **D** = decyzja, której nikt nie podjął. Niczego nie rozstrzygam.

| ID | Typ | Luka | Gdzie | Pytanie do właściciela |
|---|---|---|---|---|
| L01 | S | Własna oczekująca partia przy próbie utworzenia drugiej (`OWN_WAITING_GAME`): spec opisuje tylko akceptację cudzego linku (Q18) | #21 Q4, Q18 | Co widzi twórca z oczekującą partią, który klika „Utwórz zaproszenie”: przejście do istniejącej, czy „Masz oczekującą partię”? |
| L02 | S | Brak treści błędów: błąd serwera, brak sieci, baza niedostępna, błąd odpytywania | #21, #22 | Jakie komunikaty i czy odpytywanie po błędzie ponawia się samo? |
| L03 | S | Stan „sprawdzanie kodu” na `/join` | #21 UI | Czy przycisk ma tekst oczekiwania jak „Zakładanie konta…”? |
| L04 | D | Po „Anuluj zaproszenie”: dokąd trafia twórca i co widzi (stan „anulowano”, przejście na `/`), czy jest potwierdzenie | #21 Q5 | Czy anulowanie pyta o potwierdzenie i co potem? |
| L05 | S | Treść widoku zaproszenia, które wygasło po 24 h | #21 Q3 | Co widzi twórca, a co osoba z linkiem (nieważne bez rozróżnienia, Q12)? |
| L06 | S | Po 15 minutach bez otwarcia strony przez któregoś gracza partia jest anulowana: nie ma opisu, co widzi gracz, który otworzył | #21 Q21 | Czy komunikat „Przeciwnik nie otworzył partii, anulowaliśmy ją” i dokąd prowadzi? |
| L07 | S | „Mało czasu”: DS ma stan, ale ani #23 (brak specyfikacji), ani #22 nie podają progu ani wyglądu | DS, #23 | Od jakiej wartości zegar mówi „mało czasu”? Czy jest dźwięk lub inny sygnał? |
| L08 | S | Komunikat `CELL_OCCUPIED` i `GAME_NOT_ACTIVE` | #22 API | Czy gracz widzi komunikat, czy plansza cicho się odświeża? |
| L09 | S | Odpytywanie wstrzymane w ukrytej karcie: co widzi gracz po powrocie, zwłaszcza gdy zegar biegł | #22 UI | Czy po powrocie jest komunikat „Wróciłeś do partii” jak po rozłączeniu (#24)? |
| L10 | D | Brak roli operatora i panelu partii | brief | Czy MVP ma jakąkolwiek rolę poza graczem i gościem? |
| L11 | K | #23 i #24 nie mają specyfikacji: nie wiadomo, jak zegar jest wyświetlany (format, odliczanie w kliencie, korekta po odpytywaniu), jak wygląda stan „rozłączony” u przeciwnika i czy przeciwnik widzi „Wróciłeś” | #23, #24, DS | Czy najpierw piszemy specyfikację #23 i #24, czy prototyp opiera się na DS? |
| L12 | D | Poddanie: BR-21 mówi „dokończ albo poddaj partię”, ale #22 Q6 wyłącza poddanie; brak drogi, żeby gracz zakończył partię (np. przy usuwaniu konta) | brief BR-21, #22 Q6 | Czy poddanie wchodzi do MVP i gdzie jest przycisk? |
| L13 | D | Po zakończonej partii: nie ma przycisku „Zagraj ponownie”, powrotu do historii (#27 poza zakresem) ani „Utwórz nowe zaproszenie” | #22 UI | Dokąd prowadzi ekran wyniku (strona główna, historia, rewanż)? |
| L14 | D | Nazwa gościa w partii: dla gościa `displayName` jest `null`; nie ma etykiety dla przeciwnika w partii (BR-24 mówi tylko o historii: „Zaproszony przez link”) | #21 API, BR-24 | Jak przeciwnik i gość są nazwani na ekranie partii („Gość”, „Zaproszony przez link”)? |
| L15 | D | Kolor wylosowany przy dołączeniu (Q1 #22): czy ekran partii mówi, że kolor jest losowy, i kto zaczyna | #22 Q1 | Czy pokazujemy „Wylosowano: Ty grasz czarnymi”? |
| L16 | X | DS `docs/epics/partia.mdx` mówi: „Zalogowany gracz z potwierdzonym e-mailem tworzy partię”, a po zmianie z 2026-10-26 (BR-26) konto tworzy partię bez potwierdzenia | DS vs brief | Poprawić tekst w design systemie? (propozycja: tak, w najbliższym PR dokumentacji) |
| L17 | X | `game-invitations` UI mówi o stronach w „czystym Tailwindzie” (`app/src/components/games/`), a AGENTS.md i DS wymagają `@gomoku/ui/game/*` na stronach graczy | spec vs AGENTS.md | Czy specyfikacja ma użyć komponentów DS (Plansza, Zegar gracza, Karta kodu zaproszenia)? |
| L18 | X | Minimalna szerokość: specyfikacje 360 px (BR-20), DS 320 px; pola planszy na wąskim ekranie ok. 17 px (DS: wyjątek z dwoma krokami) | spec vs DS | Który próg obowiązuje dla planszy? |
| L19 | D | Zaproszenie z `?next=` po zalogowaniu: czy po wejściu z zaproszenia zalogowany trafia od razu na „Dołącz do partii”, czy na stronę główną | #21 UI, G8 | Czy `next` zawsze wraca na `/invite/{kod}`? (prototyp E01 tak robi) |
| L20 | S | Dwóch graczy otworzyło stronę: moment startu zegara pierwszego gracza (Q20 #21 i Q8 #22 mówią różnie: `startedAt` przy dołączeniu a „zegar rusza po `seen_at` obu”) | #21 Q20, #22 Q8 | Który moment jest startem zegara pierwszego ruchu? |

## 5. Luki w design systemie

| ID | Luka | Gdzie potrzebna | Pytanie |
|---|---|---|---|
| D01 | Brak stanu „zaznaczone przecięcie” planszy z przyciskiem „Postaw kamień” (komponent Plansza ma `selected`, ale brak wzorca ekranu z potwierdzeniem) | p05.4 | Czy użyć `selected` i Przycisku pod planszą? |
| D02 | Stany ruchu: wysyłanie, ponowienie, `STALE_MOVE` jako cichy komunikat: brak stories | p05.6–p05.9 | Dopisać stories czy zbudować z Alertu? |
| D03 | Brak komponentu „kopiuj do schowka” (wynik: skopiowano, błąd) w Karcie kodu zaproszenia | p03.2, p03.3 | Czy Karta kodu ma wbudowane stany? |
| D04 | „Mało czasu” w Zegarze gracza bez progu (L07); brak stanu „przeciwnik rozłączony” | p05.3 | Potrzebne? |
| D05 | Stany `p03.5`–`p03.10` bez stories (dołączył, wygasło, anulowano, błąd) | p03 | Dopisać stories? |
| D06 | Brak ekranu wyniku z akcją po końcu partii (L13) | p06 | Co użyć jako następnej akcji? |
| D07 | Dostępność planszy: struktura `grid`, strzałki i Enter są w komponencie; brak stories dla klawiatury w prototypie | p05 | Czy testować w Storybooku? |

## 6. Liczby

| Pozycja | Liczba |
|---|---|
| Ekrany (p01–p07, plus s07 z mapy E01) | 7 |
| Stany ekranów | 65 (p01: 7, p02: 5, p03: 10, p04: 4, p05: 14, p06: 15, p07: 4; s07 liczone w mapie E01) |
| w tym stany bez kryterium (⚠) | 14 |
| Scenariusze do przełączania | 12 (Q01–Q12) |
| Konta demo | 8 (T1–T8; T8 operator bez podstaw w materiałach) |
| Luki w specyfikacji | 24 (L01–L24), z czego 7 rozstrzygniętych 2026-10-26 (L04, L11, L12, L13, L14, L16, L20); otwarte 17 |
| Luki w design systemie | 7 (D01–D07) |
| Historie w zakresie / kryteria akceptacji | 4 / 21 aktywnych (#21: 9, #22: 5, #23: 4, #24: 3); poddanie i rewanż to nowe historie bez zgłoszeń |

**Czekam na zatwierdzenie mapy.** Przed prototypem: specyfikacje #23, #24, poddania i rewanżu oraz poprawka #22 Q8. Otwarte luki L21–L24 można rozstrzygnąć w tych specyfikacjach.
