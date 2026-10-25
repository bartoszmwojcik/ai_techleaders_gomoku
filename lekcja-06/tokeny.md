# Tokeny: Gomoku 1:1 online

Źródło decyzji: `lekcja-06/referencje.md`. Zatwierdził: Bartosz Wójcik, 2026-10-25, po obejrzeniu `lekcja-06/przyklad-tokeny.html` (poprawka: kolor słojów `board-grain` złagodzony do `#d3aa53`). Istniejące tokeny z `packages/app/src/app/(frontend)/frontend.css` zmapowane niżej; klasy palety Tailwinda `stone-*` użyte dziś w kodzie traktowane jako warstwa surowa.

Wartości „ciemny / jasny”: pierwsza dla motywu ciemnego (domyślny), druga dla jasnego. Gdy jest jedna wartość, obowiązuje w obu motywach.

## Tabela tokenów

| Token | Warstwa | Wartość | Pochodzenie | Gdzie używać | Gdzie nie używać |
|---|---|---|---|---|---|
| `palette-stone-{50,100,200,300,400,500,600,700,800,900}` | surowa | `#fafaf9` `#f5f5f4` `#e7e5e4` `#d6d3d1` `#a8a29e` `#79716b` `#57534e` `#44403c` `#292524` `#1c1917` | R01.1, R01.2 (obecne klasy `stone-*`) | tylko w pliku tokenów | w komponentach |
| `palette-amber-700`, `palette-orange-{400,700,800}` | surowa | `#b45309`, `#fb923c`, `#c2410c`, `#9a3412` | R02.3 (pomarańcz ciemny lub brązowawy); odcienie zatwierdzone po przykładzie | tylko w pliku tokenów | w komponentach |
| `palette-wood-{surface,line,grain}` | surowa | `#dcb35c`, `#6b4a1b`, `#d3aa53` | R01.4, R01.5; `surface` i `line` istnieją w `frontend.css`, `grain` nowy | tylko w pliku tokenów | w komponentach |
| `surface-page` | znaczenie | `#1c1917` / `#fafaf9` | R01.1; konflikt „ciemny czy jasny” rozstrzygnięty: oba motywy, ciemny domyślny | tło strony | tło planszy |
| `surface-raised` | znaczenie | `#292524` / `#ffffff` | zatwierdzona propozycja (panele lobby i historii) | panele, wiersze list | tło strony |
| `text-primary` | znaczenie | `#f5f5f4` / `#1c1917` | R01.2, R02.2 | tytuły, tekst główny | tekst pomocniczy |
| `text-secondary` | znaczenie | `#d6d3d1` / `#57534e` | R01.2 | opisy pod tytułem | tytuły |
| `text-muted` | znaczenie | `#a8a29e` / `#79716b` | R01.8 (zastępuje `#79716b` w ciemnym, 3,65:1) | linia meta, podpisy | tekst na działaniach |
| `text-accent` | znaczenie | `#fb923c` / `#9a3412` | R02.3, Z1 | linki w tekście | nagłówki, tekst statyczny |
| `action-primary-bg` | znaczenie | `#b45309` | R02.1, R02.3 | tło głównego przycisku | tekst, ikony dekoracyjne |
| `action-primary-bg-hover` | znaczenie | `#c2410c` / `#9a3412` | R02.3 | najechanie na główny przycisk | stan domyślny |
| `action-primary-text` | znaczenie | `#ffffff` | R02.3, R01.8 | tekst na `action-primary-bg` | tekst na innych tłach |
| `focus-ring` | znaczenie | `#fb923c` / `#9a3412` | R01.8 (kontrast elementów) | obrys fokusu 2 px z odstępem 2 px od elementu | wypełnienie |
| `border-default` | znaczenie | `#44403c` / `#e7e5e4` | R02.4 (kolor z planszy i jednej akcji, bez cieni) | podział treści (dekoracja) | brzegi pól formularza |
| `border-control` | znaczenie | `#79716b` | R01.8 (elementy ≥ 3:1) | brzegi pól i przycisków drugorzędnych | dekoracyjne podziały |
| `board-surface` | znaczenie | `#dcb35c` | R01.4; mapowanie z `--color-board` | tło planszy | tło strony |
| `board-line` | znaczenie | `#6b4a1b` | R01.4; mapowanie z `--color-board-line` | linie siatki | obrysy kamieni |
| `board-grain` | znaczenie | `#d3aa53` | R01.5 (wyraźna, ale nie przesadna tekstura; w kodzie, bez obrazu) | słoje na planszy | gdziekolwiek poza planszą |
| `piece-black` | znaczenie | `#1c1917` | R01.3; mapowanie z `--color-stone-black` (zmiana nazwy zatwierdzona) | czarny kamień | tło strony |
| `piece-white` | znaczenie | `#fafaf9` | R01.3; mapowanie z `--color-stone-white` (zmiana nazwy zatwierdzona) | biały kamień | tekst |
| `piece-outline` | znaczenie | `#1c1917` | R01.8 (białe kamienie 1,89:1 → obrys) | obrys obu kolorów kamieni, 1 px | linie siatki |
| `font-family-base` | znaczenie | domyślny stos sans: `ui-sans-serif, system-ui, sans-serif` | R01.7 | cały tekst | monospace, kroje pikselowe (A01.3) |
| `font-size-meta` `-body` `-lead` `-title` | znaczenie | 14 / 16 / 18 / 48 px | R01.2 | meta, tekst, opis, tytuł strony | rozmiary spoza listy |
| `font-weight-regular` `-strong` | znaczenie | 400 / 700 | R01.2 (tytuł pogrubiony) | tekst / tytuł i przyciski | inne wagi |
| `space-{1,2,3,4,6,8,12}` | surowa | 4, 8, 12, 16, 24, 32, 48 px | R01.2 (oszczędność); skala zatwierdzona | tylko w pliku tokenów | w komponentach |
| `space-group` | znaczenie | 8 px | zatwierdzona propozycja | w grupie: etykieta–pole, ikona–tekst | między sekcjami |
| `space-stack` | znaczenie | 16 px | zatwierdzona propozycja | między grupami | wewnątrz panelu |
| `space-panel` | znaczenie | 24 px | zatwierdzona propozycja | wewnątrz panelu i marginesy strony | między sekcjami |
| `space-section` | znaczenie | 48 px | zatwierdzona propozycja (zastępuje 64 px z `py-16`) | między sekcjami | wewnątrz grupy |
| `radius-base` | znaczenie | 6 px | A02 (bez pigułek i dużych zaokrągleń); obecne `rounded-md` | przyciski, pola, panele, plansza | kamienie |
| `radius-piece` | znaczenie | 9999 px | R01.3 | tylko kamienie | przyciski, plansza |
| `shadow-board` | znaczenie | `0 25px 50px -12px rgb(0 0 0 / 0.25)` | R01.3, obecne `shadow-2xl`; A02 (karty bez cienia) | tylko plansza | karty, panele, przyciski |
| `shadow-piece` | znaczenie | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | R01.3, obecne `shadow-md` | tylko kamienie | pozostałe elementy |
| `piece-size` | komponentu | 80% komórki | R01.3, obecne `size-[80%]` | kamień na planszy | poza planszą |
| `board-padding` | komponentu | 12 px (`space-3`) | R01.3, obecne `p-3` | wewnętrzny margines planszy | inne panele |
| `board-line-width` | komponentu | 1 px | R01.3, obecne `h-px`/`w-px` | linie siatki | obrysy |
| `target-min` | komponentu | 44 px | zatwierdzona propozycja (BR-20, telefon; WCAG 2.5.8 wymaga tylko 24 px) | wysokość i szerokość przycisków i pól | linki w zdaniu |

## Pary kolorów i kontrast

Progi: tekst 4,5:1, elementy interfejsu 3:1.

**Ciemny motyw**

| Para | Kontrast | Wynik |
|---|---|---|
| `text-primary` / `surface-page` | 16,03 | ok |
| `text-secondary` / `surface-page` | 11,74 | ok |
| `text-muted` `#a8a29e` / `surface-page` | 6,93 | ok |
| `text-muted` `#79716b` / `surface-page` (dawna wartość) | 3,65 | poniżej 4,5, poprawione na `#a8a29e` |
| `text-primary` / `surface-raised` | 13,9 | ok |
| `text-secondary` / `surface-raised` | 10,18 | ok |
| `text-muted` / `surface-raised` | 6,01 | ok |
| `text-accent` / `surface-page` | 7,73 | ok |
| `text-accent` / `surface-raised` | 6,7 | ok |
| `action-primary-text` / `action-primary-bg` | 5,02 | ok |
| `action-primary-text` / `action-primary-bg-hover` | 5,18 | ok |
| `action-primary-bg` / `surface-page` (element) | 3,48 | ok |
| `action-primary-bg-hover` / `surface-page` (element) | 3,38 | ok |
| `focus-ring` / `surface-page` (element) | 7,73 | ok |
| `border-control` / `surface-page` (element) | 3,65 | ok |
| `border-control` / `surface-raised` (element) | 3,17 | ok |
| `border-default` / `surface-page` | 1,7 | dekoracja, bez wymagania |
| `surface-raised` / `surface-page` | 1,15 | dekoracja, panel rozpoznawany po treści |

**Jasny motyw**

| Para | Kontrast | Wynik |
|---|---|---|
| `text-primary` / `surface-page` | 16,74 | ok |
| `text-secondary` / `surface-page` | 7,3 | ok |
| `text-muted` / `surface-page` | 4,58 | ok |
| `text-muted` / `surface-raised` (biały) | 4,79 | ok |
| `text-accent` / `surface-page` | 7,0 | ok |
| `text-accent` / `surface-raised` | 7,31 | ok |
| `action-primary-text` / `action-primary-bg` | 5,02 | ok |
| `action-primary-text` / `action-primary-bg-hover` | 7,31 | ok |
| `action-primary-bg` / `surface-page` (element) | 4,81 | ok |
| `focus-ring` / `surface-page` (element) | 7,0 | ok |
| `border-control` / `surface-page` (element) | 4,58 | ok |

**Plansza (oba motywy)**

| Para | Kontrast | Wynik |
|---|---|---|
| `board-line` / `board-surface` (element) | 4,06 | ok |
| `board-line` / `board-grain` (element) | 3,68 | ok |
| `piece-black` / `board-surface` | 8,87 | ok |
| `piece-black` / `board-grain` | 8,03 | ok |
| `piece-white` / `board-surface` | 1,89 | poniżej 3, rozwiązane obrysem `piece-outline` |
| `piece-white` / `board-grain` | 2,08 | poniżej 3, ten sam obrys |
| `piece-outline` / `board-surface` (element) | 8,87 | ok |
| `piece-white` / `piece-outline` | 16,74 | ok |

`focus-ring` rysowany z odstępem 2 px od elementu, więc liczy się kontrast względem tła strony. Bezpośrednio na przycisku głównym spadłby do 2,22 (ciemny) i 1,46 (jasny).

Kontrast liczony skryptem (wzór WCAG) na wartościach powyżej. Zmiana którejkolwiek wartości wymaga ponownego pomiaru tych par przed zapisem.

## Decyzje, które nie są tokenami

**Zasady**
- Z1. Pomarańcz tylko na elementach interaktywnych (przyciski, linki, fokus), nigdy na nagłówkach.
- Z2. Minimalne kontrasty: tekst 4,5:1, elementy 3:1. Każdy nowy token mierzony w obu motywach.
- Z3. Dwa motywy, ciemny domyślny. Przełączenie podmienia tylko warstwę znaczeń.
- Z4. Brak zdjęć, gradientów jako stylu marki, pigułek, cieni na kartach i niebieskich tekstów (R02.4, A01.2, A02, A03). Wyjątek: tekstura słojów planszy rysowana w kodzie (R01.5).
- Z5. Jedna dominująca akcja na widok. Zasada luźna: można ją przełamać, gdy jest potrzeba (np. „Zaloguj się” w nagłówku obok „Załóż konto”).
- Z6. Pierwszy ekran: tytuł, krótki opis, jedna linia meta, najwyżej trzy poziomy tekstu (R01.2).
- Z7. Tekst na stronie wprost mówi, że to gra online 1:1 (R01.6).
- Z8. *(usunięta decyzją właściciela)*. Rankingi, odznaki i czat nie są zakazane w standardzie wyglądu; zakres funkcji nadal wyznacza brief (N-02, N-04).
- Z9. W lobby czas do wygaśnięcia statusu jest zawsze widoczny (A05, BR-12).

**Cechy komponentów**
- C1. Plansza: tekstura słojów w kodzie (R01.5), podpis „Przykładowa pozycja” pod planszą pokazową, opis dla czytnika ekranu zamiast `aria-hidden` (R01.3).
- C2. Kamienie: obrys 1 px obu kolorów (R01.8).
- C3. Przycisk główny: wypełnienie `action-primary-bg`, tekst biały, wysokość ≥ `target-min`, `radius-base`.
- C4. Przycisk logowania w nagłówku, wyraźny (R02.1).
- C5. Pola formularza: widoczna etykieta, brzeg `border-control` (z audytu `lekcja-06/audyt.md`).

**Bez tokenów, bo brak referencji (zostają w lukach z `referencje.md`)**
- ruch i reakcja (czasy animacji),
- ton komunikatów,
- zegar, lobby i historia jako komponenty,
- wysokość linii.
