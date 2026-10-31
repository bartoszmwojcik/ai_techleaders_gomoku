# Mapa ekranów: Epik 02, partia z zaproszenia

- Data: 2026-10-26, aktualizacje 2026-10-29 i 2026-10-30. Status: **szkic do zatwierdzenia (aktualizacja 2026-10-30)** (nic nie zbudowano). Uwzględnia decyzje właściciela z 2026-10-26 (sekcja 0a), specyfikacje #23 (zegar), #24 (powrót), poddania i rewanżu z 2026-10-29, założenia robocze do prototypu (sekcja 0b) oraz zmianę z 2026-10-30: gra bez konta, nick uczestnika (E02-S07 #94) i gość tworzy partię (E02-S08 #95) (sekcja 0c).
- Przepływ: Epik E02 (#16): tworzenie partii i zaproszenia (#21; od 2026-10-30 także przez gościa, #95), dołączenie (zalogowany albo gość z nickiem, #94), ruchy i wygrana (#22), zegar 10 minut (#23), powrót po rozłączeniu (#24). Kończy się ekranem wyniku. Historia (#27), lobby (#25, #26) i zarządzanie kontem są poza tą mapą.
- Materiały: `.ai/specs/product-brief.md` (po zmianie 2026-10-26), `.ai/specs/backlog.md`, `2026-10-24-game-invitations.md` (#21), `2026-10-25-game-moves-win-detection.md` (#22), zgłoszenia #23 i #24 (**nie mają specyfikacji**: kryteria z tracker'a), design system (`packages/ui/docs/design-system.md`, `docs/epics/partia.mdx`, `docs/screens/game-screen.tsx`, `invite-screens.tsx`), mapa E01 (`lekcja-07/mapa-ekranow.md`, ekran s07). Persony: brak. Od 2026-10-30 także: `.ai/specs/implemented/2026-10-30-participant-nickname.md` (E02-S07, #94) i `.ai/specs/implemented/2026-10-30-guest-creates-game.md` (E02-S08, #95), brief po zmianie 2026-10-30 (BR-29, D-27), `.ai/specs/implemented/2026-10-29-game-rematch.md` i `…-game-resignation.md` (gość w rewanżu i poddaniu, kontrakty bez zmian).
- **Ekran `/invite/[code]` jest wspólny z E01:** to s07 z `mapa-ekranow.md` (stany s07.1–s07.9). Tutaj go nie powielam; wchodzi w przepływ jako krok 2 (zmiany tego ekranu z 2026-10-30 opisuje sekcja 1a „s07: zmiany z 2026-10-30”). ID ekranów tej mapy mają przedrostek `p` (p01, p02, …), żeby nie kolidowały z `s01–s07`. ID są stałe.
- Różnice względem poleceń z lekcji: w projekcie nie ma ról mentee, mentor i operator, GitHuba ani płatności. Role to: twórca zaproszenia (konto), zaproszony zalogowany, gość (token jednej przeglądarki; od 2026-10-30 **gość-twórca**, który sam tworzy partię, i gość-dołączający, obaj z nickiem lub „Gracz 1/2”), niezalogowany, osoba spoza partii (brak dostępu, N-05: bez obserwatorów). Zmiana z 2026-10-30: gość nie jest już rolą wyłącznie „dołączającą” (BR-22 zastąpione przez BR-29).

## 0a. Decyzje właściciela z 2026-10-26 (rozstrzygnięte luki)

| Luka | Decyzja | Skutek dla mapy |
|---|---|---|
| ~~L04~~ (rozstrzygnięta 2026-10-26) | „Anuluj zaproszenie” pyta o potwierdzenie. Po anulowaniu link jest nieważny („To zaproszenie jest już nieważne”), a twórca wychodzi z ekranu partii na stronę główną. | p03.6, p03.8 |
| ~~L11~~ (rozstrzygnięta 2026-10-26) | Piszemy osobne specyfikacje #23 (zegar) i #24 (powrót po rozłączeniu) przed prototypem. | kolejność prac |
| ~~L12~~ (rozstrzygnięta 2026-10-26) | Poddanie wchodzi do MVP (zmiana #22 Q6, osobne zgłoszenie i specyfikacja). | p05.13, p05.14, p06.8, p06.9 |
| ~~L13~~ (rozstrzygnięta 2026-10-26) | Po końcu partii: „Rewanż” (zaproszenie do nowej partii z odwróconymi kolorami) i wyjście do głównego panelu. Gość też może zaproponować i przyjąć rewanż (nowy token w tej samej przeglądarce). Zaproszenie do rewanżu wygasa po 5 minutach. Gdy przeciwnik aktywnie wyjdzie, zapraszający od razu widzi „zaproszenie odrzucone”, a po kliknięciu trafia do głównego panelu. | p06.10–p06.15 |
| ~~L14~~ (rozstrzygnięta 2026-10-26) | Niezalogowany gracz jest dla przeciwnika „Gość”. **Zastąpione 2026-10-30 (BR-29, nick Q3):** „{nick} (gość)” albo „Gracz 1/2 (gość)”; sekcja 0c. | p04, p05, p06 |
| ~~L16~~ (rozstrzygnięta 2026-10-26) | Poprawiamy tekst w design systemie (tworzenie partii bez potwierdzenia e-maila). | zadanie dokumentacji |
| ~~L20~~ (rozstrzygnięta 2026-10-26) | Zegar pierwszego gracza rusza, gdy obaj mają `seen_at` (#21 Q20). #22 Q8 do poprawienia. | p04.1, p05.1 |
| ~~L21~~ (rozstrzygnięta 2026-10-29) | S | „Aktywne wyjście” z ekranu wyniku: czym jest (przycisk „Wróć do panelu głównego”, zamknięcie karty, nawigacja)? Tylko przycisk jest wykrywalny na pewno | decyzja L13 | Czy „aktywnie wyszedł” = kliknął „Wróć do panelu głównego”? Zamknięcie karty = czekamy do wygaśnięcia po 5 min? |
| ~~L22~~ (rozstrzygnięta 2026-10-29) | D | Rewanż a BR-13 (jedna aktywna partia): rewanż tworzy nową partię dopiero po przyjęciu, więc obaj gracze są wolni; co jeśli któryś wcześniej zaczął inną partię | decyzja L13, BR-13 | Czy zaproszenie do rewanżu znika, gdy przeciwnik dołączył do innej partii? |
| ~~L23~~ (rozstrzygnięta 2026-10-29) | S | Treść i skutki poddania: wynik `resignation`, potwierdzenie, wpływ na BR-21 (usunięcie konta) i na `is_active` | decyzja L12 | Tekst potwierdzenia i czy poddanie jest możliwe od pierwszego ruchu? |
| ~~L24~~ (rozstrzygnięta 2026-10-29) | D | Rewanż gościa: gość po 1 h od końca traci token; czy rewanż przedłuża token na nową partię | decyzja L13 | Czy wystarczy nowy token jak przy zwykłym dołączeniu? |

## 0b. Rozstrzygnięcia z 2026-10-29 i założenia robocze do prototypu

Z zatwierdzonych specyfikacji (`2026-10-26-game-clock.md`, `2026-10-29-game-reconnection.md`, `…-game-resignation.md`, `…-game-rematch.md`):

| Luka | Rozstrzygnięcie | Źródło |
|---|---|---|
| ~~L07~~ (rozstrzygnięta 2026-10-29) | „Mało czasu” od 60 s: jaskrawy kolor zegara i grubszy obrys, bez widocznego tekstu i bez dźwięku; ukryte ogłoszenie `aria-live` raz przy przejściu progu | #23 Q1 |
| ~~L09~~ (rozstrzygnięta 2026-10-29) | Po powrocie karty: odczyt natychmiast; „Wróciłeś do partii” tylko po nieobecności ponad 30 s | #24 Q2, Q5 |
| L11 | Specyfikacje #23 i #24 istnieją; brak wskaźnika „przeciwnik rozłączony” (zegar przeciwnika biegnie) | #23, #24 Q1 |
| ~~L17~~ (rozstrzygnięta 2026-10-29) | Strony graczy używają komponentów DS (`@gomoku/ui/game/*`), nie własnego Tailwinda (AGENTS.md wygrywa ze specyfikacją #21) | AGENTS.md |
| L21 | „Aktywne wyjście” = „Odrzuć” lub „Wróć do panelu głównego”; zamknięcie karty = wygaśnięcie po 5 min | rewanż Q3 |
| L22 | BR-13 sprawdzane przy przyjęciu rewanżu; `409` z linkiem do innej partii | rewanż Q4 |
| L23 | Poddanie w każdej chwili partii w toku; dialog „Czy na pewno chcesz się poddać? Przeciwnik wygra partię.” | poddanie Q1, Q2 |
| L24 | Gość przy rewanżu dostaje nowy token nowej partii (wymaga ważnego tokenu starej) | rewanż Q5 |

**Założenia robocze do prototypu (propozycje do zatwierdzenia razem z mapą; prototyp pokazuje je jako założenia, a Ty je potwierdzasz lub zmieniasz po obejrzeniu):**

| Luka | Założenie |
|---|---|
| L01 | Twórca z własną oczekującą partią, który klika „Utwórz zaproszenie”: przejście do tej partii z komunikatem „Masz już oczekującą partię” (p01.4) |
| L02 | Błędy: „Nie udało się połączyć z serwerem. Spróbuj ponownie.” z przyciskiem; odpytywanie po błędzie ponawia się samo z opóźnieniem, po 3 nieudanych pokazuje baner błędu (p01.6, p01.7, p03.10, p07.4) |
| L03 | `/join`: przycisk „Sprawdzanie kodu…” w stanie zajętym (p02.5) |
| L05 | Zaproszenie wygasło po 24 h: twórca widzi „Zaproszenie wygasło. Utwórz nowe.”, osoba z linkiem „To zaproszenie jest już nieważne” (s07.9) (p03.9) |
| L06 | Po 15 min bez otwarcia strony: „Przeciwnik nie otworzył partii w ciągu 15 minut. Partię anulowano.” z przyciskiem do panelu głównego (p04.3) |
| L08 | `CELL_OCCUPIED`: plansza się odświeża i pojawia się krótki komunikat „To pole jest już zajęte”; `GAME_NOT_ACTIVE`: odświeżenie do właściwego stanu (p05.9) |
| L10 | MVP bez roli operatora (T8 pozostaje w mapie jako niezaimplementowany) |
| L15 | Status pod planszą mówi, jakim kolorem gra gracz („Grasz czarnymi”); informacja o losowaniu tylko przy starcie partii (p05.1) |
| L18 | Plansza ma min. 320 px szerokości (DS), zgodnie z dwukrokowym potwierdzeniem na dotyku; BR-20 (360 px) spełnione z zapasem |
| L19 | `?next=` z logowania i rejestracji zawsze wraca na `/invite/{kod}` (jak w prototypie E01) |

## 0c. Zmiana z 2026-10-30 (gra bez konta)

Źródła: brief (BR-29, D-27; BR-22 i wyjątek w D-23 zastąpione; BR-24 przeredagowane), `.ai/specs/implemented/2026-10-30-participant-nickname.md` (E02-S07, #94), `.ai/specs/implemented/2026-10-30-guest-creates-game.md` (E02-S08, #95), adnotacja w #21 (`2026-10-24-game-invitations.md`: etykieta gościa z L14), kontrakty rewanżu (#88) i poddania (#87) bez zmian. Zasada jak w całej mapie: niczego nie rozstrzygam; rozstrzygnięcia poniżej pochodzą z zatwierdzonych specyfikacji, a to, czego one nie opisują, jest w sekcji 4 jako L25–L35.

**Co się zmienia (BR-29, D-27).** Osoba niezalogowana może **tworzyć** zaproszenie (dotąd tylko je przyjmować), przed wejściem do partii podaje nick (1–24 znaki) albo zatwierdza domyślne „Gracz 1” / „Gracz 2” (numer miejsca: twórca = 1, dołączający = 2; kolory losowane osobno), a przeciwnik widzi ją jako „{nick} (gość)”. Nadal tylko przez kod lub link: bez lobby, historii i konta. Dwie osoby bez kont mogą grać ze sobą.

| Obszar mapy | Skutek | Stany |
|---|---|---|
| p01 (`/`, niezalogowany) | nowa akcja „Zagraj ze znajomym bez konta”; „Masz partię” dla gościa-twórcy | p01.8, p01.9 (nowe) |
| **p08** (nowy ekran) | nick + ostrzeżenie + tworzenie partii przez gościa, błędy `400`/`409`/`429`/`500` | p08.1–p08.8 (nowe) |
| p03 | widok gościa-twórcy (ta sama Karta kodu), anulowanie przez gościa, utrata dostępu przy zmianie przeglądarki, wygaśnięcie po 24 h | p03.11–p03.13 (nowe); p03.8 zmienione |
| p04, p05, p06 | etykiety graczy „{nick} (gość)” / „Gracz 1 (gość)”, „Gracz 2 (gość)” zamiast „Gość”; gość nie jest już bez nazwy | zmienione: p04.1, p04.4, p05.1, p05.2, p05.11, p06.6, p06.11–p06.13, p06.15 (bez nowych ID) |
| p07 | gość-twórca w innej przeglądarce lub po wygaśnięciu zaproszenia: `404` | p07.2, p07.3 rozszerzone (bez nowych ID) |
| s07 (wspólny z E01) | pole „Twój nick (opcjonalnie)”, błąd nicku, twórca-gość w nagłówku | s07.2 zmienione; s07.10, s07.11 proponowane (E01 wymaga aktualizacji) |

**Decyzje właściciela z 2026-10-30 (wprost ze specyfikacji, bez zmian):**

| Źródło | Decyzja | Skutek dla mapy |
|---|---|---|
| nick Q1 | Domyślna nazwa to „Gracz 1” / „Gracz 2” wg miejsca, wyliczana przy odczycie, nie zapisywana; nie zależy od koloru | podpowiedzi p08.1 i s07.2, etykiety p04–p06 |
| nick Q2 | Nick 1–24 znaków: litery, cyfry, spacje, `_`, `-`; przycinanie, bez unikalności i filtra wulgaryzmów; puste pole = domyślna nazwa | p08.2, s07.10 |
| nick Q3 | „{nick} (gość)” w partii (i w historii kont, E04); dla konta sama nazwa | p04–p06, s07.11 |
| nick Q8 / gość Q8 | Dwie specyfikacje: nick (E02-S07), gość-twórca (E02-S08, po nicku) | kolejność prac 6.3–6.8 w `track-e02.md` |
| gość Q4 | Dwie osoby bez kont mogą zagrać ze sobą; partia nie trafia do historii (BR-24) | scenariusz Q20 |
| gość Q5 | Limit tworzenia na adres klienta (`CREATE_GAME_LIMIT`, 10/godz.), bez CAPTCHA; adres nieustalony w produkcji: `500` (fail closed) | p08.4, p08.5 |
| gość Q6 | Ciasteczko twórcy-gościa ważne do wygaśnięcia zaproszenia (24 h) przy oczekującej partii, potem do końca partii + 1 h; utrata ciasteczka = utrata partii; ostrzeżenie przed utworzeniem | p08.1, p03.11–p03.13, p07.3 |
| gość Q7 | Jedna partia oczekująca/aktywna na przeglądarkę (BR-13 przez token); `cancelOwnWaitingGame` anuluje oczekującą i tworzy nową | p08.6, p08.7 |
| kierunkowa 1 | Zarządzanie slotem gościa (refaktor bez zmiany zachowania) jako pierwsze commity PR E02-S08 | bez ekranu; zadanie 6.5 |
| kierunkowa 2 | Brief (BR-22 → BR-29, BR-24, D-23 → D-27) zmieniony w osobnym PR dokumentacyjnym | źródło reguł w sekcji 0 |
| kierunkowa 3 | Gość po zalogowaniu lub rejestracji w tej samej przeglądarce: **bez blokady** i bez ostrzeżenia (konsekwencje przyjęte świadomie); rozbieżność z prototypem E01 rozstrzygnięta na korzyść kodu | L33; notatka dla E01 (s01, s02) |

**Rozstrzygnięte w specyfikacjach i przyjęte jako założenia robocze do prototypu** (prototyp pokazuje je jako założenia, Ty potwierdzasz lub zmieniasz po obejrzeniu):

| Element | Założenie (źródło) |
|---|---|
| Akcja na `/` | „Zagraj ze znajomym bez konta”, tylko dla niezalogowanego; zalogowany bez zmian (gość-twórca Architecture, UI/UX) |
| Ekran p08 | pole nicku z podpowiedzią „Zostaw puste, a będziesz „Gracz 1””, ostrzeżenie „Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii”, przycisk „Rozumiem, utwórz zaproszenie” (gość-twórca UI/UX) |
| Pole nicku w s07.2 | „Twój nick (opcjonalnie)”, podpowiedź „Zostaw puste, a będziesz „Gracz 2””, przed przyciskiem „Rozumiem, graj jako gość”; błąd w linii, wartość zostaje po błędzie; bez dodatkowego kroku (nick UI/UX) |
| Po utworzeniu | `/games/{id}` jak dla konta: Karta kodu, kopiuj/udostępnij, anuluj (gość-twórca UI/UX) |
| Strona główna gościa-twórcy | „Masz partię” z przejściem do niej, także po zamknięciu karty (gość-twórca UI/UX i Architecture) |
| Nagłówek zaproszenia od gościa | „{nick} (gość) zaprasza Cię do partii”; dla konta bez zmian (nick UI/UX, gość-twórca Architecture) |
| Sufiks „(gość)” | dodaje warstwa UI na podstawie `kind`; komponenty DS bez wbudowanych tekstów (nick Proposed Solution) |
| Własne zaproszenie gościa-twórcy | `409 OWN_INVITATION` → jak s07.5 (przekierowanie do partii) (gość-twórca Edge Cases) |
| Rewanż i poddanie gościa | kontrakty #87/#88 bez zmian; nowy token przy rewanżu, nick zachowany; nazwa domyślna podąża za nowym miejscem (nick Architecture) |
| L14 (stare rozstrzygnięcie „Gość”) | zastąpione: „{nick} (gość)”; wcześniejsze „Zaproszony przez link” w historii kont też znika (BR-24) |


## 0d. Rozstrzygnięcia z 2026-10-30 i założenia do prototypu (gra bez konta)

Właściciel zatwierdził mapę 2026-10-30, a następnie luki L25–L35 jedną decyzją „zgoda na rekomendacje” (2026-10-30). Poniżej ostateczne brzmienie: trzy rekomendacje różnią się od pierwszych założeń roboczych (L25, L29, L34) i są oznaczone **zmienione**. Prototyp pokazuje te rozstrzygnięcia; właściciel może je jeszcze zmienić komentarzem w przeglądzie prototypu.

| Luka | Założenie robocze do prototypu |
|---|---|
| L25 | p08: tytuł „Zagraj ze znajomym bez konta”; pole „Twój nick (opcjonalnie)” z podpowiedzią „Zostaw puste, a będziesz „Gracz 1””; ostrzeżenie „Grasz bez konta. Jeśli zmienisz przeglądarkę albo wyczyścisz dane, stracisz dostęp do tej partii.”; przycisk „Rozumiem, utwórz zaproszenie”; błąd nicku jak w s07.10; **zmienione:** dodatkowa linia „Zaproszenie jest ważne 24 godziny.” |
| L26 | Błąd serwera/500: „Nie udało się utworzyć zaproszenia. Spróbuj ponownie.” z przyciskiem ponowienia (jak założenie L02) |
| L27 | „Masz partię” na `/` dla gościa (twórcy i dołączającego) tylko przy partii oczekującej („Czekasz na przeciwnika”) i aktywnej („Partia w toku”); zakończona nie |
| L28 | p03.12: gość-twórca widzi stałe, krótkie ostrzeżenie pod Kartą kodu („Nie zmieniaj przeglądarki, bo stracisz dostęp do partii.”) |
| L29 | **Zmienione:** po wygaśnięciu zaproszenia gość-twórca widzi „Zaproszenie wygasło” (p03.9, jak konto) przez 1 h od wygaśnięcia, potem p07.2; wymaga zmiany w specyfikacji E02-S08 (ważność tokenu dla wygasłej oczekującej partii) |
| L30 | Długi nick jest obcinany wielokropkiem w jednej linii, a sufiks „(gość)” jest zawsze widoczny i nie kurczy się; pełny nick w `title` i w nazwie dostępnej |
| L31 | s07.10 i s07.11 zostają tylko w mapie E02; mapa E01 do aktualizacji osobnym PR-em dokumentacyjnym po zatwierdzeniu prototypu |
| L32 | p08.7: „Anuluj i utwórz nową” z dialogiem potwierdzenia jak p03.6 (jak dla konta) |
| L34 | **Zmienione:** „Zagraj ze znajomym bez konta” to drugorzędny **przycisk** (nie mały link) obok „Załóż konto” i „Zaloguj się”; „Załóż konto” zostaje główną akcją |
| L35 | Gość-twórca oczekującej partii może ją anulować i dołączyć z s07.7 (jak konto); przy partii aktywnej tylko wrócić do niej (s07.6) |

## 0. Historie i kryteria w zakresie

Oznaczenia: `#21/K1` = kryterium 1 zgłoszenia #21 (kolejność jak w zgłoszeniu). Reguły: BR-01, BR-04…BR-07, BR-09…BR-11, BR-13, BR-20, BR-24, BR-26 (konto aktywne bez potwierdzenia e-maila), **BR-29** (gra bez konta: gość tworzy i przyjmuje zaproszenie, ma nick; od 2026-10-30), D-07, D-10, D-21, **D-27**. ~~BR-22~~ zastąpione przez BR-29 (od 2026-10-30), ~~wyjątek w D-23~~ zastąpiony przez D-27. Skróty `#94/K1`, `#95/K1` liczą kryteria zgłoszeń w kolejności z tracker'a.

| Historia | Kryteria akceptacji (skrót) |
|---|---|
| E02-S01 #21 Partia i zaproszenie | K1 utworzenie partii daje link i kod. K2 ważny link + inny zalogowany: drugi gracz, dokładnie dwóch (BR-01). K3 trzecia osoba nie dołączy (BR-11). K4 aktywna partia: odmowa utworzenia i dołączenia (BR-13). ~~K5 niepotwierdzony e-mail~~ (zastąpione, BR-26). K6 gość po ostrzeżeniu dołącza bez konta i bez nazwy (BR-22). K7 gość wraca w tej samej przeglądarce: kontynuuje, w innej: brak dostępu. K8 token gościa wygasa 1 h po końcu partii. K9 gość nie tworzy zaproszeń i nie wchodzi do lobby. K10 zalogowany nie ma opcji gościa (`409 GUEST_NOT_ALLOWED`). |
| E02-S02 #22 Ruchy i wygrana | K1 poprawny ruch: przeciwnik go widzi, tura przechodzi. K2 ruch poza turą lub na zajęte pole: odrzucony, stan bez zmian. K3 5 w linii: wygrana (BR-10). K4 pełna plansza bez piątki: remis. K5 o stanie rozstrzyga serwer. |
| E02-S03 #23 Zegar | K1 start: każdy ma 10:00 (BR-04). K2 maleje tylko zegar gracza na ruchu (BR-05). K3 zegar 0: gracz przegrywa (BR-07). K4 obowiązuje czas serwera. |
| E02-S04 #24 Powrót po rozłączeniu | K1 powrót przed upływem czasu: aktualna plansza i zegar pomniejszony o nieobecność (BR-06). K2 zegar wyczerpał się podczas rozłączenia: partia zakończona jego przegraną. K3 po końcu odświeżenie pokazuje wynik, ruch niemożliwy. |
| E02-S07 #94 Nick uczestnika (gość podaje nick albo „Gracz 1/2”) | K1 gość przyjmujący zaproszenie podaje poprawny nick: zapisany przy uczestniku, widoczny dla przeciwnika jako „{nick} (gość)”. K2 pole puste: „Gracz {miejsce}” (wyliczane przy odczycie, niezapisywane). K3 nick z niedozwolonymi znakami lub dłuższy niż 24 punkty kodowe: `400 VALIDATION` z `fieldErrors.nickname`; nick przy `as = user` też `400`. K4 istniejący goście sprzed zmiany: migracja rozszerzająca (kolumna NULL, bez backfillu). |
| E02-S08 #95 Użytkownik bez konta tworzy partię | K1 brak sesji + `POST /api/games` z `acknowledgedGuestWarning: true`: `201` z kodem i linkiem oraz ciasteczko gościa ważne do wygaśnięcia zaproszenia. K2 gość-twórca z oczekującą partią próbuje utworzyć drugą lub dołączyć do innej: `409` (jedna partia na przeglądarkę); może ją anulować. K3 dwie osoby bez kont: jedna tworzy, druga przyjmuje jako gość: mogą rozegrać partię (bez historii). K4 wiele żądań z jednego adresu ponad limit: `429`; nieustalony adres w produkcji: `500` (fail closed). K5 wygasłe zaproszenie gościa, nikt nie odczytał partii: sprzątanie usuwa wiersze, a przeglądarka nie dostaje `409` wskazującego niedostępną partię. |

Decyzje ze specyfikacji E02-S07 i E02-S08 (nick Q1–Q3, Q8; gość Q4–Q8), z których wynikają stany nowe od 2026-10-30, zebrano w sekcji 0c.

Decyzje ze specyfikacji, z których wynikają stany: #21 Q3 (zaproszenie ważne 24 h), Q5 (anulowanie), Q6 (odpytywanie co 3 s), Q11 (ostrzeżenie dla gościa), Q12 (link niczego nie zużywa), Q13 (limity), Q18 (własna oczekująca partia), Q20 i Q21 (zegar rusza, gdy obaj otworzyli stronę; 15 min na otwarcie), Q22 (Kopiuj, Udostępnij); #22 Q1 (losowanie koloru przy dołączeniu), Q4 (idempotentny ruch), Q5 (odpytywanie co 2 s), Q6 (bez poddania i remisu na prośbę), Q7 (dotyk: dwa kroki, mysz: jedno kliknięcie).

## 1. Tabela ekranów

Znak ⚠ przy stanie oznacza stan bez kryterium ani decyzji (luka z sekcji 4).

| ID | Ekran | Rola | Stany | Historia lub kryterium | Komponenty DS |
|---|---|---|---|---|---|
| p01 | Utworzenie partii (akcja „Utwórz zaproszenie” na `/`; od 2026-10-30 także akcja gościa) | Zalogowany (z potwierdzonym e-mailem lub bez); niezalogowany i gość z tokenem (akcja „Zagraj ze znajomym bez konta”) | p01.1 przycisk, p01.2 tworzenie (przycisk zajęty), p01.3 masz już partię, p01.4 masz oczekującą partię ⚠, p01.5 limit utworzeń, p01.6 błąd serwera ⚠, p01.7 brak sieci ⚠, **p01.8 niezalogowany: „Zagraj ze znajomym bez konta”**, **p01.9 gość-twórca: „Masz partię”** | #21/K1, K4, Q13, BR-13; #95/K1, K2, BR-29 | Przycisk (`loading`), Alert, Link tekstowy |
| p02 | Kod zaproszenia `/join` | Każdy (niezalogowany też) | p02.1 pole kodu, p02.2 kod za krótki, p02.3 limit prób, p02.4 kod nieważny, p02.5 sprawdzanie ⚠ | #21 UI, Q12, Q13 | Nagłówek strony, Pole formularza, Pole tekstowe, Przycisk, Alert |
| p03 | Partia czeka na przeciwnika `/games/{id}` (status waiting) | Twórca (konto lub gość-twórca) | p03.1 domyślny (link, kod, „Ważne do”), p03.2 skopiowano, p03.3 kopiowanie niemożliwe (zaznaczenie), p03.4 „Udostępnij” niedostępne (ukryty), p03.5 przeciwnik dołączył, p03.6 potwierdzenie anulowania, p03.7 anulowanie w toku ⚠, p03.8 anulowano, p03.9 zaproszenie wygasło (24 h) ⚠, p03.10 błąd odpytywania ⚠, **p03.11 widok gościa-twórcy**, **p03.12 stałe ostrzeżenie gościa-twórcy ⚠**, **p03.13 zaproszenie gościa wygasło (24 h) ⚠** | #21/K1, Q3, Q5, Q6, Q22; #95/K1, K2, K5, gość Q6 | Nagłówek strony, Karta kodu zaproszenia, Przycisk, Dialog potwierdzenia, Alert, Szkielet |
| p04 | Partia gotowa, czeka na otwarcie strony `/games/{id}` (active bez `seen_at` obu) | Twórca, zaproszony zalogowany, gość | p04.1 czekamy, aż {nazwa} otworzy partię (do 15 min), p04.2 „Partia gotowa”, p04.3 przeciwnik nie otworzył w 15 min: partia anulowana ⚠, p04.4 stałe ostrzeżenie gościa | #21/K2, K6, Q20, Q21, BR-22 | Nagłówek strony, Alert, Status tury, Zegar gracza |
| p05 | Partia w toku `/games/{id}` | Twórca, zaproszony zalogowany, gość | p05.1 Twój ruch (czarne), p05.2 ruch przeciwnika, p05.3 mało czasu ⚠, p05.4 dotyk: kamień zaznaczony, „Postaw kamień”, p05.5 mysz: jedno kliknięcie, p05.6 wysyłanie ruchu, p05.7 błąd sieci: „Spróbuj ponownie” (ten sam ruch), p05.8 nieaktualny widok (`STALE_MOVE`) lub nie Twoja kolej: cichy powrót z komunikatem, p05.9 pole zajęte ⚠, p05.10 powrót po rozłączeniu, p05.11 gość w partii: stałe ostrzeżenie, p05.12 karta w tle: odpytywanie wstrzymane ⚠, p05.13 „Poddaj partię” z dialogiem potwierdzenia, p05.14 poddanie w toku lub błąd ⚠ | #22/K1, K2, K5, #23/K1, K2, K4, #24/K1, Q4, Q7, BR-05, BR-06 | Nagłówek strony, Plansza, Zegar gracza, Status tury, Przycisk, Alert |
| p06 | Koniec partii `/games/{id}` (finished) | Twórca, zaproszony zalogowany, gość | p06.1 wygrana (linia wygrywająca), p06.2 przegrana, p06.3 przegrana na czas, p06.4 remis, p06.5 powrót po końcu (odświeżenie: wynik, bez ruchu), p06.6 gość po końcu (token ważny 1 h), p06.7 po 1 h token gościa nie działa, p06.8 koniec przez poddanie (wygrana), p06.9 koniec przez poddanie (przegrana), p06.10 „Rewanż” i „Wróć do panelu głównego”, p06.11 rewanż zaproponowany, p06.12 przeciwnik proponuje rewanż, p06.13 rewanż odrzucony lub przeciwnik wyszedł, p06.14 rewanż wygasł ⚠, p06.15 rewanż gościa: nowy token ⚠ | #22/K3, K4, #23/K3, #24/K2, K3, #21/K8 | Baner wyniku, Plansza (tylko do odczytu), Zegar gracza, Przycisk, Link tekstowy |
| p07 | Partia: brak dostępu i błędy `/games/{id}` | Niezalogowany, osoba spoza partii, gość (twórca lub dołączający) w innej przeglądarce | p07.1 ładowanie, p07.2 partia nie istnieje albo brak dostępu (`404`), p07.3 gość w innej przeglądarce (brak dostępu, zegar biegnie), p07.4 baza niedostępna ⚠ | #21/K7, Edge Cases, BR-06, N-05; #95 Edge Cases | Szkielet, Stan błędu, Link tekstowy |
| **p08** | **Gość tworzy partię: nick i ostrzeżenie** (nowy ekran 2026-10-30; adres ekranu do ustalenia przy implementacji) | Niezalogowany, gość z tokenem (twórca lub dołączający) | p08.1 pole nicku z podpowiedzią „Gracz 1” i ostrzeżeniem, p08.2 błąd nicku, p08.3 tworzenie w toku ⚠, p08.4 limit adresu (`429`), p08.5 błąd serwera (`500`, w tym adres nieustalony), p08.6 masz już partię (`409`), p08.7 masz oczekującą partię (`409`) z „Anuluj i utwórz nową”, p08.8 brak sieci ⚠ | #95/K1, K2, K4, #94/K2, K3, nick Q1, Q2, gość Q5, Q6, Q7, BR-13, BR-29 | Nagłówek strony, Pole formularza, Pole tekstowe, Alert, Przycisk (`loading`), Link tekstowy |

Ekran `/invite/[code]` (s07) jest krokiem wejścia dla zaproszonego (stany z E01: niezalogowany, ostrzeżenie dla gościa, zalogowany, już uczestnik, własne zaproszenie, inna partia, oczekująca partia, limit, nieważne). Od 2026-10-30 ma w ścieżce gościa pole nicku (zmiany: sekcja 1a, „s07: zmiany z 2026-10-30”).

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
| p01.8 | **Nowe (2026-10-30).** Na `/` dla niezalogowanego, obok „Załóż konto”, dodatkowa akcja „Zagraj ze znajomym bez konta” prowadząca na p08. Gość-dołączający (przeglądarka z tokenem innej partii) widzi `/` tak samo; próba utworzenia kończy się p08.6 (BR-13). Dla zalogowanego bez zmian (p01.1). Miejsce i ranga akcji obok „Załóż konto”: L34 | #95/K1, gość UI/UX, BR-29 |
| p01.9 | **Nowe (2026-10-30).** Gość-twórca z trwającą partią widzi na `/` „Masz partię” z przejściem do niej (po zamknięciu karty inaczej jedyną drogą powrotu byłby zapisany link). Zakres (oczekująca, aktywna, zakończona; gość-dołączający) i treść: L27 | gość Architecture („Strona główna”), UI/UX |

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
| p03.8 | Po anulowaniu twórca trafia na stronę główną; link zaproszenia pokazuje s07.9 „nieważne”. **Zmienione 2026-10-30:** to samo dla gościa-twórcy (anuluje przez token; na `/` widzi p01.8) | L04; #95/K2 |
| p03.9 ⚠ | Zaproszenie wygasło po 24 h: widok pokazuje wygaśnięcie (spec Edge Cases), treści brak | #21 Q3, Edge Cases; L05 |
| p03.10 ⚠ | Błąd odpytywania | L02 |
| p03.11 | **Nowe (2026-10-30).** Widok gościa-twórcy: ta sama Karta kodu, „Kopiuj”, „Udostępnij”, „Anuluj zaproszenie” (z potwierdzeniem p03.6), „Czekamy na przeciwnika…”; dostęp przez token w ciasteczku tej przeglądarki; stany p03.2–p03.7 i p03.10 bez zmian | #95/K1, K2, gość UI/UX, Q6 |
| p03.12 ⚠ | **Nowe (2026-10-30).** Stałe ostrzeżenie o utracie dostępu przy zmianie przeglądarki na ekranie oczekiwania: spec wymaga ostrzeżenia przed utworzeniem (p08.1), a stałe ostrzeżenie opisuje tylko dla partii z przeciwnikiem (p04.4, p05.11) | gość Q6, Edge Cases; L28 |
| p03.13 ⚠ | **Nowe (2026-10-30).** Zaproszenie gościa-twórcy wygasło po 24 h: po wygaśnięciu token przestaje być rozpoznawany (`404`, p07.2), a partia jest leniwie zamykana; nie wiadomo, czy gość widzi komunikat „Zaproszenie wygasło” (jak konto, p03.9) czy `404` | #95/K5, gość Architecture; L29 |
| p03.5, p04–p06 | **Zmienione 2026-10-30:** przeciwnik gościa jest nazwany „{nick} (gość)”, bez nicku „Gracz 2 (gość)” (miejsce 2) | nick Q1, Q3 |

**p04 Partia gotowa**

| Stan | Co widać | Źródło |
|---|---|---|
| p04.1 | „Czekamy, aż {nazwa} otworzy partię — zegar ruszy, gdy obaj będziecie na stronie (do 15 min)”. **Zmienione 2026-10-30:** {nazwa} gościa to „{nick} (gość)” lub „Gracz 1/2 (gość)” | #21 UI, Q20, Q21; nick Q3 |
| p04.2 | „Partia gotowa”; plansza dopiero w #22 (w prototypie przechodzi na p05) | #21 UI |
| p04.3 ⚠ | Po 15 min bez otwarcia przez któregoś: partia anulowana, brak wpisu w historii; co widzi gracz, który otworzył | #21 Q21; L06 |
| p04.4 | Gość (twórca lub dołączający) widzi stałe ostrzeżenie „Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii”. **Zmienione 2026-10-30:** źródło BR-29 (nie BR-22); zdanie „Gość nie ma nazwy ani historii” z prototypu i DS jest nieaktualne (gość ma nick), do poprawienia: D11 | #21 UI, BR-29 |

**p05 Partia w toku**

| Stan | Co widać | Źródło |
|---|---|---|
| p05.1 | Plansza 15×15, „Twój ruch (czarne)” (tekst, nie tylko kolor), zegary obu graczy, ostatni ruch z obramowaniem. **Zmienione 2026-10-30:** nazwy przy zegarach: „{nick} (gość)” / „Gracz N (gość)” dla gościa, nazwa konta dla konta (wygląd i długi nick: L30) | #22 UI, #23/K1; nick Q3 |
| p05.2 | „Ruch przeciwnika”, plansza tylko do odczytu, odpytywanie co 2 s. **Zmienione 2026-10-30:** etykieta przeciwnika jak w p05.1 | #22 UI, Q5; nick Q3 |
| p05.3 ⚠ | „Mało czasu”: DS ma stan, spec nie podaje progu | DS; L07 |
| p05.4 | Ekran dotykowy: dotknięcie zaznacza przecięcie (podgląd kamienia), „Postaw kamień” wysyła ruch | #22 Q7 |
| p05.5 | Mysz: jedno kliknięcie wysyła ruch; klawiatura: strzałki, Enter | #22 Q7, UI |
| p05.6 | Ruch w drodze (przycisk zajęty) | #22 Q4 |
| p05.7 | Błąd sieci: „Spróbuj ponownie” ponawia **ten sam** ruch | #22 UI, Q4 |
| p05.8 | `STALE_MOVE` i `NOT_YOUR_TURN`: cichy powrót do aktualnego stanu z krótkim komunikatem | #22 UI |
| p05.9 ⚠ | `CELL_OCCUPIED` (pole zajęte): treść komunikatu | #22 API; L08 |
| p05.10 | Powrót po rozłączeniu: „Wróciłeś do partii”, aktualny czas | #24/K1, BR-06 |
| p05.11 | Gość: stałe ostrzeżenie nad partią (twórca i dołączający). **Zmienione 2026-10-30:** BR-29 | #21 UI, BR-29 |
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
| p06.6 | Gość po końcu: widzi wynik do 1 h po zakończeniu. **Zmienione 2026-10-30:** BR-29; przeciwnik z kontem widzi go jako „{nick} (gość)”, partia nie trafia do historii | #21/K8, BR-29, BR-24 |
| p06.7 | Po 1 h token gościa nie działa: `404`, patrz p07.2 | #21/K8 |
| p06.8 | Koniec przez poddanie: „Wygrałeś, przeciwnik poddał partię” | L12 |
| p06.9 | Koniec przez poddanie: „Przegrałeś, poddałeś partię” | L12 |
| p06.10 | Pod wynikiem „Rewanż” (kolory odwrócone) i „Wróć do panelu głównego” | L13 |
| p06.11 | Rewanż zaproponowany, czekamy na odpowiedź (do 5 min), możliwość wycofania. **Zmienione 2026-10-30:** gdy przeciwnik jest gościem, jego etykieta „{nick} (gość)” | L13; nick Q3 |
| p06.12 | Przeciwnik proponuje rewanż: „Przyjmij” / „Odrzuć”. **Zmienione 2026-10-30:** etykieta przeciwnika jak w p06.11 | L13; nick Q3 |
| p06.13 | Przeciwnik aktywnie wyszedł albo odrzucił: od razu „Zaproszenie do rewanżu odrzucone”, po kliknięciu panel główny. **Zmienione 2026-10-30:** gość-twórca i gość-dołączający trafiają na `/` jako niezalogowani (p01.8), nie na panel konta | L13; BR-29 |
| p06.14 ⚠ | Rewanż wygasł po 5 minutach | L13 |
| p06.15 ⚠ | Rewanż gościa: nowy token w tej samej przeglądarce; gość nie ma historii. **Zmienione 2026-10-30:** nick gościa zachowany w nowej partii; nazwa domyślna podąża za nowym miejscem (rewanż zamienia miejsca: „Gracz 1” nie zostaje na miejscu 2); dotyczy też gościa-twórcy | L13, BR-29; nick Architecture (#88) |

**p07 Brak dostępu i błędy**

| Stan | Co widać | Źródło |
|---|---|---|
| p07.1 | Szkielet ładowania partii | DS |
| p07.2 | „Ta partia nie istnieje albo nie masz do niej dostępu” z linkiem na stronę główną | #21 Edge Cases, N-05 |
| p07.3 | Gość w innej przeglądarce lub po wyczyszczeniu ciasteczek: to samo `404`; zegar biegnie (BR-06). **Rozszerzone 2026-10-30:** dotyczy też gościa-twórcy oczekującej partii (traci dostęp, zaproszenie wygasa po 24 h) | #21 Edge Cases; gość Edge Cases, Q6 |
| p07.4 ⚠ | Baza niedostępna (`500`): treść | L02 |

**p08 Gość tworzy partię: nick i ostrzeżenie** (nowy ekran 2026-10-30; wejście z p01.8)

| Stan | Co widać | Źródło |
|---|---|---|
| p08.1 | Pole nicku z podpowiedzią „Zostaw puste, a będziesz „Gracz 1””, ostrzeżenie „Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii”, przycisk „Rozumiem, utwórz zaproszenie” (kliknięcie = `acknowledgedGuestWarning: true`, jeden ekran, jedno kliknięcie); po sukcesie przejście na p03 (p03.11). Etykieta pola, tytuł i dalsza treść ostrzeżenia: L25 | #95/K1, gość UI/UX, Q6; nick Q1, UI |
| p08.2 | Nick niepoprawny (znaki, długość 1–24 punktów kodowych po normalizacji): `400 VALIDATION`, błąd w linii pola (`aria-describedby`), wpisana wartość zostaje. Treść komunikatu spec nie podaje (L25) | #94/K3, nick Q2, UI |
| p08.3 ⚠ | Tworzenie w toku (przycisk zajęty) | wzór z p01.2 |
| p08.4 | Przekroczony limit tworzenia z adresu klienta (10/godz.): `429` + `Retry-After`, komunikat z czasem jak p01.5 | #95/K4, gość Q5 |
| p08.5 | Błąd serwera: w tym `500` przy nieustalonym adresie klienta w produkcji (fail closed). Treść jak p01.6 (L02); czy „Spróbuj ponownie” ma sens przy stałym błędzie: L26 | #95/K4, gość Q5; L02, L26 |
| p08.6 | Przeglądarka ma już partię `waiting` lub `active`: `409 ACTIVE_GAME_EXISTS` (`data.gameId`) → „Masz już partię” z linkiem do niej (jak p01.3) | #95/K2, gość Q7, BR-13 |
| p08.7 | Przeglądarka ma oczekującą partię: `409 OWN_WAITING_GAME` (`data.gameId`); przycisk „Anuluj i utwórz nową” (`cancelOwnWaitingGame: true`: anulowanie i utworzenie w jednej transakcji) działa tylko dla oczekującej, nie aktywnej. Czy jest potwierdzenie, czy zamiast tego przejście do istniejącej partii (jak założenie L01): L32 | #95/K2, gość Q7, Architecture |
| p08.8 ⚠ | Brak sieci: treść jak p01.7 | L02 |

Walidacja `400` dla braku `acknowledgedGuestWarning` nie jest stanem UI (przycisk wysyła pole zawsze); to kontrakt API (#95 API Contracts).

**s07: zmiany z 2026-10-30** (ekran wspólny z E01; **nie edytuję `mapa-ekranow.md`**; mapa E01 wymaga aktualizacji, stany s07.10 i s07.11 są proponowane tutaj, numeracja kolejna po s07.9, ID istniejących stanów bez zmian; L31)

| Stan | Zmiana | Źródło |
|---|---|---|
| s07.1 | Nagłówek „{nazwa twórcy} zaprasza Cię do partii Gomoku” — gdy twórcą jest gość: patrz s07.11 | nick UI/UX |
| s07.2 | **Zmienione:** w bloku gościa nad przyciskiem „Rozumiem, graj jako gość” pole „Twój nick (opcjonalnie)” z podpowiedzią „Zostaw puste, a będziesz „Gracz 2””, pod ostrzeżeniem o zmianie przeglądarki (Q11 z #21); jedno kliknięcie. Zdanie „Gość nie ma nazwy ani historii” (prototyp, DS) nieaktualne (D11) | #94/K1, K2, nick UI/UX |
| s07.10 | **Nowe (propozycja).** Błąd nicku w s07.2: `400 VALIDATION`, błąd w linii pola, wpisana wartość zostaje; nick przy `as = user` jest błędem API, nie stanem UI (opcji nicku zalogowany nie ma, s07.3) | #94/K3 |
| s07.11 | **Nowe (propozycja).** Zaproszenie od gościa-twórcy: nagłówek „{nick} (gość) zaprasza Cię do partii” (bez nicku „Gracz 1 (gość)”); `creator_id NULL` nie oznacza „konta usuniętego”, rozróżnia `kind`; dostępny dla niezalogowanego (s07.1) i zalogowanego (s07.3) | nick UI/UX, gość Architecture („Strona zaproszenia i preview”) |
| s07.5 | Własne zaproszenie gościa-twórcy (ten sam token): `409 OWN_INVITATION` → przekierowanie do partii jak dla konta | gość Edge Cases |
| s07.6, s07.7 | Gość z tokenem innej partii (twórca oczekującej lub aktywnej) otwiera cudzy link: `409`. Czy gość widzi „Masz oczekującą partię” i „Anuluj moją partię i dołącz” jak konto: L35 | #95/K2; L35 |
| s07.3 | Zalogowany bez zmian (bez opcji gościa i bez pola nicku, `409 GUEST_NOT_ALLOWED`) | #21 Q19 |

Notatka dla E01 (`mapa-ekranow.md`): do zaktualizowania s07 (powyżej), s04.3 (akcja p01.8 obok „Załóż konto”), s01 i s02 (komórki „z aktywną partią: niedostępne” i L14, L23, L26 — blokada gościa z partią; decyzja kierunkowa 3 z 2026-10-30: **bez blokady**, patrz L33) oraz odwołania do BR-22 (zastąpione przez BR-29).

Stan „pusty” nie dotyczy tych ekranów (nie ma list).

### 1b. Role i dostęp

Role gościa od 2026-10-30 (BR-29): **gość-twórca** = przeglądarka z tokenem miejsca 1 (widzi swoją oczekującą lub trwającą partię, może ją anulować, dopóki oczekuje; nie widzi lobby ani historii, bo ich nie ma); **gość-dołączający** = token miejsca 2. Oba tokeny to ciasteczko jednej przeglądarki, ważne dla oczekującej partii do wygaśnięcia zaproszenia (24 h), potem do końca partii + 1 h. Cudza przeglądarka (inna przeglądarka tej samej osoby, wyczyszczone ciasteczka, osoba spoza partii) dostaje `404` (p07.2, p07.3). Gość z kontem w tej samej przeglądarce nie jest blokowany (kierunkowa 3).

| Ekran | Twórca (konto) | Zaproszony zalogowany | Gość-twórca (token) | Gość-dołączający (token) | Niezalogowany | Spoza partii |
|---|---|---|---|---|---|---|
| p01 `/` „Utwórz zaproszenie” | tak | tak | jak niezalogowany; p01.9 „Masz partię”; nowa partia: p08.6 lub p08.7 (`409`) | jak niezalogowany; nowa partia przy trwającej: p08.6 | brak przycisku; p01.8 „Zagraj ze znajomym bez konta” | n/d |
| p08 ekran gościa-twórcy | brak (konto używa p01.1) | brak | tak; `409` przy własnej partii (p08.6, p08.7) | tak; `409` przy trwającej partii (p08.6) | tak | n/d |
| p02 `/join` | tak | tak | tak | tak | tak | tak |
| s07 `/invite/[code]` | przekierowanie do partii | „Dołącz do partii” | własny link: przekierowanie (s07.5); cudzy: `409` (L35) | po ostrzeżeniu i nicku dołącza (s07.2) | trzy wybory | zob. stany s07 |
| p03 `/games/{id}` waiting | tak | brak (jeszcze nie uczestnik) | tak, w tej przeglądarce (p03.11–p03.13); anuluje | brak | brak | `404` |
| p04, p05, p06 `/games/{id}` | tak | tak | tak (w tej przeglądarce) | tak (w tej przeglądarce) | `404` | `404` |
| p07 | | | inna przeglądarka lub wygasłe zaproszenie: `404` | inna przeglądarka: `404` | `404` | `404` |

## 2. Scenariusze do przełączania w prototypie

Kontrolki prototypu (pasek przeglądu), nie funkcje produktu.

| ID | Scenariusz | Wywołuje stany |
|---|---|---|
| Q01 | Rola oglądającego: twórca, zaproszony zalogowany, gość (od 2026-10-30: gość-twórca albo gość-dołączający), niezalogowany, spoza partii | p03–p07 |
| Q02 | Stan partii: czeka, gotowa, w toku (tura moja/przeciwnika), koniec (wygrana, przegrana, przegrana na czas, remis) | p03–p06 |
| Q03 | Zegar demo: stały „teraz”, przyspieszenie, „mało czasu”, „czas minął”, +15 min bez otwarcia, +24 h (wygaśnięcie zaproszenia) | p03.9, p04.3, p05.3, p06.3 |
| Q04 | Utworzenie partii przez konto: ok, aktywna partia, oczekująca partia, limit, błąd serwera, brak sieci (gość: Q13–Q16) | p01 |
| Q05 | Ruch: ok, błąd sieci (ponowienie tego samego ruchu), `STALE_MOVE`, nie Twoja kolej, pole zajęte | p05.6–p05.9 |
| Q06 | Urządzenie wejścia: dotyk (dwa kroki) albo mysz | p05.4, p05.5 |
| Q07 | Rozłączenie i powrót (zegar pomniejszony o nieobecność) | p05.10 |
| Q08 | Kopiowanie: dostępne, niedostępne; udostępnianie: dostępne, niedostępne | p03.2–p03.4 |
| Q09 | Anulowanie: potwierdź, w toku, anulowano; twórca anuluje w chwili dołączenia przeciwnika | p03.6–p03.8 |
| Q10 | Kod na `/join`: poprawny, za krótki, limit, nieważny | p02 |
| Q11 | Baza niedostępna; karta w tle | p07.4, p05.12 |
| Q12 | Szerokość 320 / 360 / 1440 px, motyw ciemny i jasny, Reset | wszystkie |
| Q13 | Gość tworzy partię (od 2026-10-30): akcja na `/`, nick wpisany albo pusty („Gracz 1”), ostrzeżenie, utworzenie, widok oczekiwania gościa-twórcy | p01.8, p08.1, p08.3, p03.11, p03.12 |
| Q14 | Nick niepoprawny lub pusty: za długi (>24 punkty kodowe), niedozwolone znaki, same spacje (= domyślna nazwa); po stronie twórcy (p08) i dołączającego (s07.2); wpisana wartość zostaje | p08.1, p08.2, s07.2, s07.10 |
| Q15 | Błędy tworzenia przez gościa: limit adresu (`429`), błąd serwera (`500`, adres nieustalony), brak sieci | p08.4, p08.5, p08.8 |
| Q16 | Slot przeglądarki: gość z oczekującą partią tworzy kolejną (`OWN_WAITING_GAME`, „Anuluj i utwórz nową”), gość z aktywną partią (`ACTIVE_GAME_EXISTS`), gość-dołączający z trwającą partią próbuje utworzyć | p08.6, p08.7, p01.8 |
| Q17 | Gość-twórca anuluje własną oczekującą partię (potwierdź, w toku, anulowano, link „nieważny”) | p03.6–p03.8, s07.9, p01.8 |
| Q18 | Oczekująca partia gościa wygasa (+24 h bez dołączenia), gość traci ciasteczko lub otwiera w innej przeglądarce | p03.13, p07.2, p07.3 |
| Q19 | „Masz partię” gościa-twórcy po zamknięciu karty (partia oczekująca i aktywna), własny link otwarty jako dołączający | p01.9, s07.5 |
| Q20 | Gość–gość gra do końca: dwie nazwy („Ola (gość)” i „Gracz 2 (gość)”), ostrzeżenia p04.4/p05.11, wynik, token +1 h, `404` po godzinie, brak historii | p03.5, p04.1, p04.4, p05.1, p05.2, p05.11, p06.1–p06.7 |
| Q21 | Rewanż gościa z nickiem: nick zachowany, nowy token, nazwa domyślna podąża za miejscem po zamianie kolorów, odrzucenie i wyjście gościa | p06.10–p06.15 |
| Q22 | Gość–konto w obu kierunkach: gość-twórca zaprasza konto (s07.11, s07.3), konto zaprasza gościa z nickiem (s07.2) | s07.1–s07.3, s07.10, s07.11, p04–p06 |

## 3. Konta i dane demo

Fikcyjne. Hasło demo wszystkich kont: `drewniana-plansza-2026`. **Stały „teraz”: poniedziałek 2026-10-26 10:00 (Europe/Warsaw).** Z briefu: plansza 15×15, 5 w linii, 10 minut na gracza, zaproszenie ważne 24 h, 15 minut na otwarcie strony po dołączeniu, token gościa przy oczekującej partii do wygaśnięcia zaproszenia (24 h), potem do końca partii + 1 h (BR-29), nick 1–24 znaków, kod `ABCD-EFGH`. Cen i terminów handlowych brak (gra darmowa, D-19).

| Konto | Rola | E-mail | Nazwa | Stan |
|---|---|---|---|---|
| T1 | Twórca zaproszenia, e-mail potwierdzony | ala@example.com | Ala_7 | bez partii |
| T2 | Zaproszony zalogowany, e-mail niepotwierdzony (gra normalnie, BR-26) | kuba@example.com | Kuba_P | bez partii |
| T3 | Zalogowany z aktywną partią (odmowa utworzenia i dołączenia, BR-13) | marek@example.com | Marek_Z | partia w toku |
| T4 | Zalogowany z własną oczekującą partią (Q18) | ewa@example.com | Ewa_B | partia waiting |
| T5 | Gość-dołączający bez nicku (w prototypie E02 już istnieje: `role: "T5"`, `guestGame`; **zmienione 2026-10-30**: dotąd bez nazwy, teraz „Gracz 2” = G2) | brak | brak nicku → „Gracz 2 (gość)” | token miejsca 2 jednej partii |
| T6 | Niezalogowany | brak | brak | brak sesji |
| T7 | Osoba spoza partii (brak dostępu) | zalogowany dowolny | | `404` na cudzej partii |
| T8 | Operator | brak w materiałach | | L10 |
| T9 | Gość-twórca G1 (**nowe 2026-10-30**; w prototypie E02 jeszcze nie istnieje) | brak | „Ola” → „Ola (gość)” | token miejsca 1; bez partii albo z oczekującą partią `ABCD-EFGH` |
| T10 | Gość-dołączający G3 z nickiem (**nowe 2026-10-30**; prototyp: do dodania obok T5) | brak | „Piotr” → „Piotr (gość)” | token miejsca 2 jednej partii; test dwóch jawnych nicków i nicka niepoprawnego |

Połączenia ról: T1 + T5 (twórca zalogowany, przeciwnik gość bez nicku: „Gracz 2 (gość)”), T1 + T10 (przeciwnik gość z nickiem) i T1 + T2 (oba konta); od 2026-10-30 także T9 + T5 (gość–gość: „Ola (gość)” i „Gracz 2 (gość)”), T9 + T10 (dwa jawne nicki), T9 + T2 (gość-twórca zaprasza konto) i T9 + T1 (konto dołącza do zaproszenia gościa); w każdym wylosowany kolor (Q1) i ten sam kod `ABCD-EFGH`. Konto T1 jako gość-twórca nie występuje (zalogowany nie ma opcji gościa, `409 GUEST_NOT_ALLOWED`).

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

**Luki dopisane 2026-10-30** (po specyfikacjach E02-S07 i E02-S08; L01–L24 bez zmian). Niczego nie rozstrzygam. Pytania o rzeczy, które specyfikacje już rozstrzygają (tekst podpowiedzi „Gracz 1” / „Gracz 2”, tekst ostrzeżenia zdaniem „Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii”, „Masz partię” gościa-twórcy na `/`, sufiks „(gość)” dodawany w UI), nie są lukami: są w sekcji 0c.

| ID | Typ | Luka | Gdzie | Pytanie do właściciela |
|---|---|---|---|---|
| L25 | S | Pełna treść ekranu p08: tytuł, etykieta pola nicku (spec nick: „Twój nick (opcjonalnie)” tylko dla s07), komunikat błędu nicku, i dalsza część ostrzeżenia. Prototypowe zdania ostrzeżenia dla dołączającego („Stracisz do niej dostęp, a Twój zegar będzie biegł dalej. Gość nie ma nazwy ani historii”) nie pasują do twórcy: zegar nie biegnie, gdy partia czeka, a gość ma teraz nick | #95 UI/UX, #94 UI | Czy twórca-gość dostaje to samo ostrzeżenie co dołączający, z jakim dopiskiem o oczekującej partii i wygaśnięciu po 24 h? **Rozstrzygnięte 2026-10-30 (sekcja 0d).** |
| L26 | S | Błąd `500` przy nieustalonym adresie klienta jest stały (fail closed): „Spróbuj ponownie” nic nie zmieni; spec nie podaje treści ani akcji | #95 API Contracts | Jaki komunikat i czy przycisk ponowienia (założenie L02: „Nie udało się połączyć z serwerem. Spróbuj ponownie.”)? **Rozstrzygnięte 2026-10-30 (sekcja 0d).** |
| L27 | S | „Masz partię” gościa na `/`: spec mówi „z trwającą partią” dla gościa-twórcy; nie mówi, czy obejmuje partię oczekującą i zakończoną (do +1 h), ani gościa-dołączającego | #95 UI/UX, Architecture | Dla jakich partii i której roli gość widzi „Masz partię”, i jaki tekst (oczekująca: „Czekasz na przeciwnika”)? **Rozstrzygnięte 2026-10-30 (sekcja 0d).** |
| L28 | S | Stałe ostrzeżenie o zmianie przeglądarki na ekranie oczekiwania (p03.12): spec wymaga ostrzeżenia przed utworzeniem, a stałe opisuje dla p04.4 i p05.11 | #95 Q6, Edge Cases; #21 UI | Czy p03 gościa-twórcy ma stałe ostrzeżenie (utrata dostępu = utrata partii)? **Rozstrzygnięte 2026-10-30 (sekcja 0d).** |
| L29 | S | Zaproszenie gościa wygasło po 24 h: po wygaśnięciu token przestaje działać (`404`), a ciasteczko ma to samo wygaśnięcie; spec nie mówi, czy gość widzi komunikat „Zaproszenie wygasło” (jak konto, p03.9, L05) czy `404` p07.2 | #95 Architecture, K5 | Co widzi gość-twórca po wygaśnięciu (jeśli odświeży stronę przed i po wygaśnięciu)? **Rozstrzygnięte 2026-10-30 (sekcja 0d).** |
| L30 | S | Wygląd „(gość)” w nagłówku zegara i wyniku: sufiks dodaje UI, ale nick ma do 24 znaków, a szerokość 320 px (L18) i `PlayerClock` mają jedną linię nazwy | #94 UI, nick Proposed Solution | Czy długi nick jest obcinany, zawijany; czy sufiks „(gość)” zawsze widoczny? **Rozstrzygnięte 2026-10-30 (sekcja 0d).** |
| L31 | D | Kolizja ID s07 z E01: stany s07.10 i s07.11 są proponowane w tej mapie, a stany s07 należą do mapy E01 (stałe ID); `mapa-ekranow.md` nie jest tu edytowana | #94 UI, mapa E01 | Czy zaktualizować mapę E01 (kto, w jakim PR), czy zostawić s07.10–s07.11 tylko w mapie E02? **Rozstrzygnięte 2026-10-30 (sekcja 0d).** |
| L32 | D | Rozwiązanie `409 OWN_WAITING_GAME` dla gościa na p08.7: przycisk „Anuluj i utwórz nową” (potwierdzenie przez Dialog potwierdzenia?) czy przejście do istniejącej partii (założenie L01 dla konta, p01.4) | #95 K2, Q7 | Jaki przepływ dla gościa: z potwierdzeniem, bez, czy przejście do istniejącej partii? **Rozstrzygnięte 2026-10-30 (sekcja 0d).** |
| ~~L33~~ (rozstrzygnięta 2026-10-30) | X | Rozbieżność prototypu E01 i briefu: gość z partią nie może się logować ani rejestrować (blokada), a backend E01 tego nie egzekwuje | #95 Risks, kierunkowa 3 | Rozstrzygnięte: **bez blokady** i bez ostrzeżenia (partia gościa i partia konta naraz dozwolone); prototyp E01 i notatki do poprawienia w zadaniu 6.2 |
| L34 | S | Miejsce i ranga akcji „Zagraj ze znajomym bez konta” obok „Załóż konto” i „Zaloguj się” na `/` (s04.3 w E01) | #95 UI/UX | Czy to akcja drugorzędna (link) czy równorzędna z „Załóż konto”? **Rozstrzygnięte 2026-10-30 (sekcja 0d).** |
| L35 | S | Gość z tokenem (twórca oczekującej lub aktywnej partii) otwiera cudzy link: `409` (#95/K2), ale nie wiadomo, czy s07.6 i s07.7 (z „Anuluj moją partię i dołącz”) dotyczą także gościa | #95 K2, #21 Q18; E01 s07.6, s07.7 | Czy gość-twórca oczekującej partii może ją anulować i dołączyć z s07.7, czy tylko wrócić do swojej partii? **Rozstrzygnięte 2026-10-30 (sekcja 0d).** |

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
| D08 | Pole tekstowe (`TextInput` = `<input>` bez dodatków) nie ma licznika znaków ani limitu liczonego w punktach kodowych: `maxLength` liczy jednostki UTF-16, a nick ma 1–24 **punkty kodowe** (znak spoza BMP zajmie 2); spec nie wymaga licznika, tylko podpowiedź (`hint` w Polu formularza istnieje) i błąd w linii (`error` istnieje) | p08.1, p08.2, s07.2, s07.10 | Czy pole nicku ma licznik/limit, czy walidacja tylko na serwerze i po wysłaniu? |
| D09 | „{nick} (gość)” w Zegarze gracza: `name` to `ReactNode`, więc sufiks złoży UI; brak stories z długim nickiem (24 znaki) plus sufiksem na 320 px i zasady obcinania (L30) | p05.1, p05.2, p04.1 | Dopisać stories z długim nickiem i sufiksem? |
| D10 | Brak wzorca ekranu „pole nicku + ostrzeżenie + przycisk” (Pole formularza, Alert, Przycisk razem); `invite-screens.tsx` ma stan `guest-warning` bez pola nicku | p08.1, p08.2, s07.2, s07.10 | Dopisać stories obu ekranów (p08, s07.2 z polem)? |
| D11 | Nieaktualny tekst w DS: `docs/screens/invite-screens.tsx` (stan `guest-warning`) zawiera zdanie „Gość nie ma nazwy ani historii” (a gość ma nick, BR-29); ta sama treść w prototypie (`s07-invite.tsx`) | p04.4, s07.2 | Poprawić tekst w DS w najbliższym PR dokumentacji (jak L16)? |
| D12 | „Masz partię” (Alert info) istnieje w prototypie (`p01-home.tsx`), ale nie ma stories ani wzorca w DS dla strony głównej gościa (z opcją „oczekująca” i przejściem do partii) | p01.9 | Dopisać stories dla p01.9? |

## 6. Liczby

Stan na 2026-10-30, policzony ze stanów w sekcji 1a (każdy ID raz; wiersze-adnotacje „zmienione” nie są liczone). Poprzednia wersja podawała 65 stanów i 14 stanów ⚠; po przeliczeniu stanu sprzed zmiany wychodzi 59 i 15 (p01: 7, p02: 5, p03: 10, p04: 4, p05: 14, p06: 15, p07: 4), więc wartości poniżej są przeliczone od nowa, a nie tylko zwiększone o nowe pozycje.

| Pozycja | Liczba |
|---|---|
| Ekrany (p01–p08, plus s07 z mapy E01) | 8 (nowy: p08) |
| Stany ekranów | 72 (p01: 9, p02: 5, p03: 13, p04: 4, p05: 14, p06: 15, p07: 4, p08: 8; s07 liczone w mapie E01); nowe 2026-10-30: 13 (p01.8, p01.9, p03.11–p03.13, p08.1–p08.8) oraz 2 proponowane w s07 (s07.10, s07.11), niewliczone |
| w tym stany bez kryterium (⚠) | 19 (nowe: p03.12, p03.13, p08.3, p08.8) |
| Stany ze zmienioną etykietą lub treścią 2026-10-30 (bez nowych ID) | 15: p03.5, p03.8, p04.1, p04.4, p05.1, p05.2, p05.11, p06.6, p06.11, p06.12, p06.13, p06.15, p07.3, s07.2, s07.5 |
| Scenariusze do przełączania | 22 (Q01–Q22; nowe Q13–Q22; Q01 i Q04 uzupełnione) |
| Konta demo | 10 (T1–T10; T8 operator bez podstaw w materiałach; nowe T9, T10; T5 istnieje w prototypie E02, zmienione na „Gracz 2”) |
| Luki w specyfikacji | 35 (L01–L35): rozstrzygnięte 2026-10-26 (L04, L11, L12, L13, L14, L16, L20), 2026-10-29 (L07, L09, L17, L21–L24) i 2026-10-30 (L25–L35, w tym L33) = 25; stare z założeniami roboczymi z sekcji 0b 10 (L01–L03, L05, L06, L08, L10, L15, L18, L19); otwarte bez założenia 0 |
| Luki w design systemie | 12 (D01–D12; nowe D08–D12) |
| Historie w zakresie / kryteria akceptacji | 6 / 30 aktywnych (#21: 9, #22: 5, #23: 4, #24: 3, #94: 4, #95: 5); poddanie i rewanż to nowe historie bez zgłoszeń w tej mapie |

**Czekam na zatwierdzenie mapy.** Po zatwierdzeniu: szary prototyp etapami (A: zaproszenie i oczekiwanie, B: plansza, wynik, poddanie, rewanż), potem klikalny prototyp z design systemu. Zadanie 6.2 w `track-e02.md` (rewizja klikalnego prototypu: stany gościa-twórcy, nicku i p08) zaczyna się po zatwierdzeniu tej aktualizacji.
