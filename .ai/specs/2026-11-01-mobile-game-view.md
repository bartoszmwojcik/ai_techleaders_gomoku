# Widok partii na telefonie: „Postaw kamień” od razu widoczny, przełącznik motywu jako ikona (#181)

> Status: **szkic autonomiczny** (`om-auto-write-spec`); właściciel zatwierdza specyfikacje z góry (zlecenie 2026-11-01), więc po zielonym CI można scalić i implementować. Źródło wymagań: zgłoszenie #181 (decyzja właściciela 2026-11-01) oraz `packages/ui/docs/design-system.md`. Powiązane (wdrożone): `implemented/2026-10-28-theme-switcher.md` (przełącznik motywu), specyfikacje ekranu partii z E02 (#22, dwukrokowe stawianie na dotyku, Q7).

## TLDR

Na telefonie (`pointer: coarse`) ekran partii wymaga dziś przewijania, żeby dotrzeć do „Postaw kamień” (zmierzone na `next start`: dolna krawędź przycisku na 914 px przy oknie 568 px, 912 px przy 844 px), a drugie stuknięcie w zaznaczone pole stawia kamień bez przycisku (`play-field.tsx:180`). **Zachowanie przyszłe:** (1) kamień na dotyku stawia się wyłącznie przyciskiem; stuknięcie w pole tylko zaznacza lub zmienia zaznaczenie; (2) przełącznik motywu jest samą ikoną (nazwa dostępna dla czytnika), a poniżej `sm` leży w jednym wierszu z nagłówkiem „Partia w toku”; (3) układ aktywnej partii na wąskim ekranie jest zagęszczony: mniejsze marginesy, niższe zegary, przycisk „Postaw kamień” tuż pod planszą (przed własnym zegarem). Mysz bez zmian. Bez zmian API, bez migracji, bez nowych zależności.

## Resolved assumptions (autonomous defaults)

| # | Pytanie | Zastosowane założenie | Dlaczego | Potwierdzenie |
|---|---|---|---|---|
| R1 | Gdzie przycisk względem planszy? | **Bezpośrednio pod planszą**, przed własnym zegarem i linią „Grasz czarnymi”. Kolejność w DOM = kolejność wizualna (bez CSS `order`). | Przycisk jest głównym działaniem tury; przy 320×568 jedyny sposób na pierwszy ekran bez ukrywania zegarów. Czytnik ekranu i Tab dostają ten sam porządek co wzrok. | odwracalne |
| R2 | Przełącznik motywu na desktopie | Też sama ikona (jedna wersja komponentu), ale **w dotychczasowym wierszu** nad treścią od `sm` w górę. Układ desktopu poza tym bez zmian. | Zgłoszenie dopuszcza „bez zmian na komputerze”; dwa warianty komponentu to dwa razy więcej do utrzymania. | odwracalne |
| R3 | Nazwa dostępna przełącznika | `aria-label` = dotychczasowe etykiety („Jasny motyw” / „Ciemny motyw”, nazywają motyw włączony teraz), `title` bez zmian (brak). Ikona nadal pokazuje motyw włączony (Słońce/Księżyc). Cel dotyku 44×44 (`min-h-target min-w-target`). | WCAG 4.1.2/1.4.1: nazwa przez tekst dostępny, znaczenie nie samym kolorem. Etykieta nie jest wbudowana w komponent: dalej przez propsy. | odwracalne |
| R4 | Jak zrobić „jeden wiersz z nagłówkiem” | Poniżej `sm` przełącznik w layoutcie jest `absolute` (`top-group right-group`, `z-10`), a nagłówek `h1` ekranu aktywnej partii dostaje rezerwę po prawej (`pr-12`) i `min-h-target`, więc wiersz nagłówka ma 44 px i przełącznik go nie zakrywa. Od `sm` przełącznik wraca do wiersza w przepływie jak dziś. Na pozostałych stronach graczy przełącznik zajmuje dotychczasowe 8 px marginesu i 4 px nad treścią (padding `py-section` = 48 px), a nagłówki stron są sprawdzane zrzutami 320 px (krok 6). | Inaczej wiersz przełącznika pozostaje osobnym rzędem (52 px) na każdej stronie. Wzorzec „ukrywaj/pozycjonuj wymiarami, nie `display: none`” z lekcji o układzie DS zachowany. | odwracalne |
| R5 | Stuknięcie w już zaznaczone pole | **Nic nie zmienia** (zaznaczenie zostaje; bez odznaczania i bez wysyłki). Stuknięcie w inne pole przenosi zaznaczenie. Brak skrótów (podwójne stuknięcie, długie przytrzymanie). | Zgłoszenie: „niczego nie stawia ani nie odznacza w sposób groźny”. Odznaczanie drugim stuknięciem to znów ukryty tryb. | odwracalne |
| R6 | Zegary | `PlayerClock` w DS dostaje zagęszczony układ poniżej `sm` (`px-3 py-2`, czas `text-subsection` zamiast `text-section`), od `sm` bez zmian. Zmiana natywna komponentu (nie osobny wariant): jedyne użycie to ekran partii. | Dwa zegary po ~98 px to największy pojedynczy koszt wysokości przy 320 px (zmierzone). Zgoda właściciela na zmianę jednego komponentu DS jest zawarta w zatwierdzeniu specyfikacji. | odwracalne |
| R7 | Baner „Wylosowano: Ty grasz czarnymi” na początku partii | Baner przenosi się **pod planszę** (za blok akcji) na wszystkich szerokościach: jedno miejsce w DOM, bez wariantów `hidden`. Treść i `role="status"` bez zmian. | Baner (≈82 px) dotyczy tylko ruchu 0, ale kryterium „moja tura, nic nie zaznaczone” obejmuje właśnie ruch 0. | odwracalne |
| R8 | Marginesy | Ekrany `GameRoom` (`Shell`): `px-stack py-group` poniżej `sm` (16 / 8 px), `px-panel py-section` od `sm` (jak dziś). Plansza (`--layout-width-board`) rośnie do 288 px przy 320 px. | Marginesy 24 px po bokach i 48 px u góry to ≈ 100 px niepotrzebnej wysokości/szerokości na telefonie. Wartości z tokenów skali (8/16). | odwracalne |
| R9 | Wykrywanie dotyku | Bez zmian: `matchMedia("(pointer: coarse)")` (hybrydy z myszą jako głównym wskaźnikiem dalej stawiają jednym kliknięciem). | Poza zakresem zgłoszenia; zmiana wykrywania to osobna decyzja. | odwracalne |

## Problem Statement

- **Kto:** gracz na telefonie podczas partii (`/games/[gameId]`).
- **Dziś (zmierzone, 2× DPR, `next start`, dotyk emulowany `pointer: coarse`):**

  | Okno | Dół przycisku „Postaw kamień” (nic nie zaznaczone / zaznaczone) | Wysokość dokumentu |
  |---|---|---|
  | 320×568 | 916 / 914 px | ≈ 1500 px |
  | 360×640 | 884 / 882 px | ≈ 1470 px |
  | 390×844 | 914 / 912 px | ≈ 1440 px |

  Wiersz przełącznika motywu (52 px) + margines górny `py-section` (48 px) + „Partia w toku” + baner + status + zegar (98 px) + plansza + zegar (98 px) + „Grasz …” + przycisk. Drugie stuknięcie zaznaczonego pola wysyła ruch (`onCellSelect`: `!touch || selected === cell`), więc łatwo postawić kamień przypadkiem.
- **Kryteria #181:** przycisk w pierwszym ekranie bez przewijania (320×568, 360×640, 390×844; „moja tura, pole zaznaczone” i „nic nie zaznaczone”; oba motywy); przełącznik jako ikona z `aria-label`, cel ≥ 44 px, bez osobnego wiersza; testy: dwa stuknięcia nie wysyłają ruchu, przycisk wysyła, mysz stawia klikiem; komunikat „Zaznaczono: … Naciśnij „Postaw kamień”.” bez zmian; fokus i klawiatura bez regresji; 100% pokrycia, `check:tokens`, stories/MDX zaktualizowane.
- **Poza zakresem:** zasady gry, zegar (logika), czat, nagłówek desktopu poza koniecznym; zmiana wykrywania dotyku (R9); pozostałe ekrany `GameRoom` poza marginesami z R8.

## Proposed Solution

1. **`onCellSelect`** (`play-field.tsx`): `if (!touch) submit(...) else { setRefusal(null); setFailed(null); setPick({ cell, moveCount }) }`. Przycisk „Postaw kamień” jest jedynym źródłem ruchu na dotyku (R5). Stuknięcie w zaznaczone pole ustawia to samo zaznaczenie (idempotentne).
2. **Kolejność w `PlayField`:** blok dotykowy (przycisk + `data-testid="selection"` ze statusem) przenosi się tuż za `Board` (i `sr-only` „Przeciwnik: …”), przed własny zegar (R1). Komunikaty tekstowe bez zmian. Baner „Wylosowano/Rewanż” renderowany za blokiem akcji (R7), w jednym miejscu DOM.
3. **`ThemeSwitch`** (`@gomoku/ui/game/theme-switch`): bez widocznego tekstu, `aria-label` z propsów (`lightLabel`/`darkLabel` wybierane według motywu), kształt `min-h-target min-w-target` bez `px-3`. Stories i MDX (`packages/ui/docs/components/theme-switch.*`) i wiersz „Przełącznik motywu” w `design-system.md` zaktualizowane („sama ikona, w rogu layoutu”).
4. **Layout frontendu** (`(frontend)/layout.tsx`): kontener przełącznika `absolute right-group top-group z-10 sm:static sm:flex sm:justify-end sm:px-group sm:pt-group` (R4).
5. **`PlayerClock`** zagęszczony poniżej `sm` (R6); stories zaktualizowane.
6. **`GameRoom`/`Shell`** marginesy (R8); `h1` aktywnej i zakończonej partii `min-h-target pr-12 sm:pr-0 flex items-center`.

**Odrzucone alternatywy:** pływający (sticky) przycisk u dołu ekranu (zasłania planszę, konflikt z klawiaturą ekranową i paskiem przeglądarki, osobny wzorzec DS bez zgody); przełącznik w stopce/menu (utrata odkrywalności); potwierdzenie „Postawić kamień?” po drugim stuknięciu (ukryty tryb, dokładnie to, co zgłoszenie usuwa); zmniejszenie planszy poniżej 288 px (cele dotyku pól < 19 px, regres dla palców).

## Architecture

Zmiany tylko w `packages/app` (`play-field`, `game-room`, `layout`) i `packages/ui` (`theme-switch`, `player-clock`, docs). `core`, `db`, API, serwer bez zmian. Kierunki zależności zachowane.

## Data Model / API Contracts

Brak zmian. Zgodność wsteczna (`BACKWARD_COMPATIBILITY.md`): żaden kontrakt API ani schemat; `data-testid` (`theme-switch`, `selection`, `my-color`, `resign`, `token-notice-dismiss`) zachowane. Zmieniają się tylko testy, które szukały tekstu „Ciemny/Jasny motyw” w treści strony (tekst nadal jest nazwą dostępną).

## UI/UX (makieta)

Aktywna partia, **moja tura, pole zaznaczone**, 320×568 (cele wysokości `y`: orientacyjne, w px):

```
y=0   ┌──────────────────────────────┐ 320
  8   │ Partia w toku           [☾] │  wiersz 44 px (h1 + przełącznik 44×44)
 52   │ (●) Twój ruch (czarne)       │  status 28 px
 88   │ ┌──────────────────────────┐ │
      │ │ Przeciwnik        10:00  │ │  zegar 56 px (zagęszczony)
152   │ └──────────────────────────┘ │
      │ ┌──────────────────────────┐ │
      │ │                          │ │
      │ │   plansza 288 × 288      │ │  16 px marginesu po bokach
      │ │          ●               │ │
440   │ └──────────────────────────┘ │
448   │ [   Postaw kamień          ] │  44 px, dół ≈ 492 px < 568
      │ Zaznaczono: H8. Naciśnij …   │
      │ ┌ Ty            10:00 ────┐  │  (poniżej linii zgięcia)
      │ Grasz czarnymi.              │
      │ [Wylosowano: …] (ruch 0)     │
      │ [Poddaj partię]  Czat …      │
      └──────────────────────────────┘
```

Moja tura, nic nie zaznaczone: ten sam układ, przycisk `disabled`, pod nim „Dotknij przecięcia, żeby je zaznaczyć.” Ruch przeciwnika: przycisk `disabled` z „Poczekaj na ruch przeciwnika.” (jak dziś). Od `sm` układ jak dziś (przełącznik w wierszu nad treścią, wąski przycisk nieobecny na myszy).

Dostępność: nazwa przycisku motywu przez `aria-label`; fokus w kolejności: przełącznik (layout), pola planszy, „Postaw kamień”, własny zegar (nie fokusowalny), „Poddaj partię”. `role="status"` zaznaczenia bez zmian.

## Test plan

- **Jednostkowe (100%):** `play-field.test.tsx` — dotyk: stuknięcie A zaznacza i nie wywołuje `fetch`; drugie stuknięcie A nie wysyła i zachowuje zaznaczenie; stuknięcie B przenosi; „Postaw kamień” wysyła numer ruchu `moveCount + 1` raz; mysz: klik w pole wysyła od razu; kolejność w DOM: przycisk po planszy, przed własnym zegarem. `theme-switch.test.tsx`, `theme-toggle.test.tsx`: `aria-label` zależny od motywu, brak widocznego tekstu, klasy celu dotyku. `player-clock.test.tsx`: klasy zagęszczone. `game-room.test.tsx`, layout: istniejące asercje zaktualizowane.
- **Integracyjne** (`tests/integration/game-play-pages.test.ts` + nowy `game-play-mobile.test.ts`): sesja przeglądarki z `--args --blink-settings=primaryPointerType=2` (opcja `touch` w helperze `Browser`; sprawdzone: `matchMedia('(pointer: coarse)')` = true) i viewporty 320×568, 360×640, 390×844: (a) `bottom` przycisku `<=` wysokość okna w stanach „zaznaczone” i „niezaznaczone”; (b) dwa kliki w to samo pole nie zmieniają liczby kamieni na planszy po stronie serwera (`GET /api/games/:id`, `moveCount`), przycisk zmienia o 1; (c) brak poziomego przewijania; (d) mysz (domyślna sesja): klik w pole stawia kamień.
- **Stories:** `theme-switch.stories`, `player-clock.stories` (oba motywy, 320 px) przez `npm run test:stories -w @gomoku/ui` (celowanie w zmienione pliki, przy obciążeniu pełny przebieg przekracza czas).
- **Zrzuty (dowód):** 320×568, 360×640, 390×844 × oba motywy × {zaznaczone, niezaznaczone}, przed i po (`/tmp/gomoku-wt/shots181/`; w PR przez gałąź dowodową).

## Implementation breakdown

**Phase 1: logika dotyku (bezpieczeństwo ruchu)**
1. `onCellSelect` bez wysyłki na dotyku (R5) + testy jednostkowe.
2. Test integracyjny (opcja `touch` w `Browser`): dwa stuknięcia nie ruszają partii, przycisk tak; mysz klika jak dotąd.

**Phase 2: układ mobilny**
3. `ThemeSwitch` sama ikona + stories/MDX/`design-system.md` + testy; `layout.tsx` (R4).
4. `PlayerClock` zagęszczony (R6) + stories + testy.
5. `PlayField`: przycisk pod planszą, baner pod blokiem akcji (R1, R7); `Shell` marginesy i `h1` (R8).
6. Integracyjny test geometrii (przycisk w oknie 3 rozmiarów) oraz zrzuty 320 px stron graczy z przełącznikiem (`/`, `/login`, `/register`, `/account`, `/games/[id]` w stanach czekania i końca) w obu motywach: brak nakładania się przełącznika na treść.

**Phase 3: domknięcie**
7. `npm run check` (EXIT 0), `check:tokens`, celowane `test:stories`, zrzuty przed/po, odznaczenie kryteriów, przeniesienie specyfikacji do `implemented/`.

## Risks

| Ryzyko | Skutek | Mitygacja |
|---|---|---|
| Przełącznik `absolute` zasłania treść innych stron na < `sm` | utrata kliknięcia/linku w prawym górnym rogu | zrzuty 320 px wszystkich stron graczy (krok 6); w razie kolizji rezerwa `pr-12` na ich `h1`, nie zmiana przełącznika |
| Zagęszczony zegar gorszy kontrast/czytelność | regres a11y | `text-subsection` (20 px) to nadal rola typograficzna DS; `test:stories` z kontrolą dostępności w obu motywach |
| Baner „Wylosowano” czytany po akcji | czytnik ekranu ogłasza go później | `role="status"`, treść nie jest niezbędna do ruchu; kolejność DOM = wizualna |
| Test integracyjny dotyku zależny od flagi Chrome | niestabilność CI | flaga `--blink-settings=primaryPointerType=2` sprawdzona na Chrome 156 użytym przez `agent-browser`; test zaczyna od asercji `matchMedia('(pointer: coarse)')` |

## Acceptance criteria (z #181)

- [ ] 320×568, 360×640, 390×844, oba motywy: przycisk „Postaw kamień” widoczny bez przewijania („zaznaczone” i „nic nie zaznaczone”); zrzuty w PR.
- [ ] Przełącznik motywu: sama ikona, `aria-label`, cel ≥ 44 px, bez osobnego wiersza (< `sm`).
- [ ] Testy jednostkowy i integracyjny: dwa stuknięcia nie wysyłają ruchu, przycisk wysyła, mysz stawia klikiem.
- [ ] Komunikat „Zaznaczono: … Naciśnij „Postaw kamień”.” bez zmian; fokus i klawiatura bez regresji.
- [ ] 100% pokrycia, `check:tokens`, stories/MDX zaktualizowane.
