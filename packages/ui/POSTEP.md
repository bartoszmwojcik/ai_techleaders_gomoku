# Postęp: design system Gomoku

Prompt źródłowy: `lekcja-06/prompt-story-book.txt` (README lekcji mówi o `prompt-storybook.md`, taki plik nie istnieje). Język dokumentacji: polski. Język interfejsu produktu: polski i angielski z opcją dodawania kolejnych (patrz „Otwarte pytania”, Q3).

## Etapy

| Etap | Status |
|---|---|
| 0. Inwentaryzacja i plan | zakończony 2026-10-25 (odpowiedzi właściciela: Q1 tak, Q2 zgoda, Q3 tak, Q4 tak, Q5 tak; „dalej”) |
| 1. Fundamenty | **zakończony, czeka na „dalej”** (2026-10-25) |
| 2. Komponenty bazowe | **zakończony, czeka na „dalej”** (2026-10-25): 14 komponentów w trzech partiach |
| 3. Komponenty produktu, wzorce i ekrany | **zakończony, czeka na „dalej”** (2026-10-25) |
| 4. Strony, które uczą | **zakończony, czeka na „dalej”** (2026-10-25) |
| 5. Sprawdzenie i raport | **zakończony** (2026-10-25), raport przekazany właścicielowi |


## Materiały przeczytane

`lekcja-06/referencje.md`, `lekcja-06/tokeny.md`, `lekcja-06/audyt.md`, `lekcja-06/przyklad-tokeny.html` (zatwierdzony: „bardzo się podoba”), `.ai/specs/product-brief.md`, `.ai/specs/backlog.md` i specyfikacje `.ai/specs/2026-10-24-*.md`, `2026-10-25-game-moves-win-detection.md`, `.ai/docs/2026-09-01-engineering-standards.md`, `AGENTS.md`.

## Stan repozytorium (sprawdzony)

- Menedżer pakietów: npm workspaces (`packages/app|core|db|ui`), Node 22.23, npm 10.9. Next 16.4.2, React 19.2.8, Tailwind 4.3.3, TypeScript 5.9, Vitest 5.
- `packages/ui` **już istnieje** i jest design systemem panelu `/backend`: `components.json` (shadcn, styl new-york, baza neutral, ikony lucide), 4 komponenty shadcn (`badge`, `button`, `card`, `table`), `src/styles/globals.css` (motyw shadcn w oklch, jasny i ciemny), zależności `radix-ui`, `class-variance-authority`, `cn`, `lucide-react`, `tw-animate-css`. Katalog `hooks/` jest pusty.
- Strony graczy: `packages/app/src/app/(frontend)/`, czysty Tailwind, tokeny gry w `frontend.css` (`--color-board`, `--color-board-line`, `--color-stone-black`, `--color-stone-white`). `AGENTS.md` i standardy: „bez shadcn/ui w `(frontend)`”, komponenty graczy w `packages/app/src/components/<concept>/`.
- Brak Storybooka, brak i18n, brak ikon na stronach graczy.
- Pokrycie testami: 100% per plik dla `packages/*/src/**/*.{ts,tsx}` (`vitest.config.ts`), wyjątki zamknięte (shadcn, migracje, testy, `*.d.ts`).
- Storybook w rejestrze npm: najnowszy `10.6.3` (sprawdzone `npm view`).

## Decyzje zatwierdzone (z `referencje.md` i `tokeny.md`)

Źródło decyzji: właściciel, 2026-10-25.

- **Charakter:** oszczędny, czytelny, ciepły (drewniany), spokojny, rzeczowy.
- **Antycharakter:** pstrokaty, niskokontrastowy, retro-pikselowy, techniczny (dokumentacyjny), generyczny.
- **Bierzemy:** R01.1 ciemne tło; R01.2 oszczędność (tytuł, krótki opis, jedna linia meta); R01.3 plansza z przykładową pozycją; R01.4 drewniany kolor planszy; R01.5 wyraźna tekstura słojów w kodzie; R01.6 tekst wprost o grze online 1:1; R01.7 krój bezszeryfowy wąsko-średni (obecny); R01.8 kontrasty ≥ 4,5:1 i ≥ 3:1; R02.1 wyraźny przycisk logowania w nagłówku; R02.2 czytelność; R02.3 pomarańcz jako kolor akcji; R02.4 bez zdjęć.
- **Antyreferencje:** A01.1–A01.4 (Datastar: niski kontrast menu, niebieski tekst, font pikselowy, bloki kodu), A02 generyczny wygląd AI, A03 pstrokaty układ, A04 grywalizacja, A05 ukryte czekanie w lobby, A06 czat. Z8 (zakaz rankingów, odznak i czatu) **usunięta** decyzją właściciela.
- **Konflikty rozstrzygnięte:** ciemny/jasny (oba motywy, ciemny domyślny); tekstura (wyraźna, ale nie przesadna); krój (zostaje obecny wygląd). **Konflikty otwarte:** brak (K2 pomarańcz a nagłówki zatwierdzona jako Z1).
- **Zasady:** Z1–Z7 i Z9 z `tokeny.md`; Z5 luźna.

## Decyzje z etapu 0 (właściciel, 2026-10-25)

- Q1: komponenty graczy w `packages/ui/src/game/` obok shadcn panelu; wpis w `AGENTS.md` (tabela pakietów) **jeszcze nie dopisany** (do zrobienia przed pierwszym komponentem w etapie 2).
- Q2: zgoda na nowe zależności deweloperskie Storybooka i na wyjątek pokrycia dla stories i MDX. Stories i MDX leżą dziś w `packages/ui/docs/` (poza `src/`, więc wyjątek w `vitest.config.ts` nie był potrzebny); wyjątek będzie potrzebny dopiero, jeśli stories komponentów trafią do `src/`.
- Q3: komponenty przyjmują teksty przez propsy (bez wbudowanych napisów); biblioteka tłumaczeń to osobny temat.
- Q4: kolory stanów: ciepłe odcienie, bez zielonego i czerwonego jako jedynego nośnika (wartości to propozycje, patrz „Otwarte pytania”).
- Q5: ikony `lucide-react`, ruch 150 i 200 ms z `prefers-reduced-motion`, skala nagłówków 48/28/20/18 px.

## Etap 1: co powstało

- Storybook 10.6.3 w `packages/ui/.storybook` (`@storybook/react-vite`, dodatki docs, a11y z `test: 'error'`, vitest; `remark-gfm` dla tabel MDX; `msw` zainstalowany pod etap 3). Interfejs pokazuje tylko nazwę „Gomoku”, checklista startowa, telemetria i komunikaty o nowej wersji wyłączone.
- Tokeny: `src/styles/game-tokens.css` (trzy warstwy, oba motywy przez `data-theme`, źródło przy każdym tokenie). Domyślne skale Tailwinda (kolory, rozmiary tekstu, promienie, cienie, krój, grubości) są wyłączone, więc istnieją tylko klasy z tokenów. Eksport: `@gomoku/ui/game-tokens.css`.
- Przełącznik motywu w pasku narzędzi; motyw ustawiany na elemencie głównym dokumentu (także dla stron dokumentacji, `?globals=theme:light` działa w adresie).
- Strony Fundamenty (`docs/foundations/*.mdx`): Kolor (role i kontrast liczony na żywo), Typografia, Odstępy i układ, Kształt i głębia, Ruch, Ikony, Motywy. Stories `Fundamenty/Kontrola tokenów` renderują te same bloki, żeby testy dostępności objęły je w obu motywach.
- Skrypty (`packages/ui`): `storybook`, `build-storybook`, `test:stories` (oba motywy), `check:tokens` (tylko `src/game`; kolory spoza tokenów, klasy palety Tailwinda, wartości arbitralne, odstępy spoza skali, domyślne skale; logika w `src/tools/find-untokenized-values.ts` z testami 100%).
- Czcionki: krój systemowy (R01.7), więc żadne pliki fontów nie są potrzebne i nic nie jest ładowane z CDN.
- Zmiany poza `packages/ui`: `.gitignore` (`storybook-static/`), `eslint.config.mjs` (ignorowanie `storybook-static`), `package-lock.json` (nowe zależności i zwykły szum po polach `libc`).

## Etap 2: partia 1 (2026-10-25)

Komponenty w `src/game/` (import `@gomoku/ui/game/<nazwa>`): `button`, `text-link`, `text-input`, `field`, `checkbox`, `alert`, plus `cn.ts` (scalanie klas znające nazwy tokenów; domyślne reguły usuwały `text-body`, gdy stał obok koloru tekstu). Każdy ma test jednostkowy (100%), stories (Playground, warianty, macierz stanów, długa treść przy 320 px, test interakcji) i stronę MDX z 13 sekcjami w `docs/components/`.

**Czym różnią się od domyślnej bazy (shadcn) i z jakiej decyzji:**

| Cecha | Domyślna baza | Gomoku | Źródło |
|---|---|---|---|
| Wysokość i cel dotyku | 36 px (`h-9`) | co najmniej 44 px | `target-min`, BR-20 |
| Promień | `rounded-md` (zmienny, oparty na `--radius`) | jeden, 6 px | A02, `radius-base` |
| Obramowanie kontrolek | 10–15% przezroczystości (około 1,5:1) | pełne, ≥ 3:1 (`border-control`) | R01.8 |
| Odstęp wewnętrzny | `px-4 py-2`, `text-sm` | 16 px poziomo, 12 px w polach, tekst 16 px | `space-*`, przyklad-tokeny.html |
| Krój i waga | `text-sm font-medium` | 16 px, pogrubiony na przyciskach | R01.2, R01.7 |
| Fokus | pierścień 3 px z 50% krycia | obrys 2 px, odstęp 2 px, kolor `focus-ring` | R01.8 |
| Cień | `shadow-xs` na polach i przyciskach | brak (cień tylko plansza i kamienie) | A02, R01.3 |
| Hover | zmiana krycia (`/90`) | osobny kolor `action-primary-bg-hover` | R02.3 |
| Stan zablokowany | 50% krycia | obramowanie i przygaszony tekst (`text-muted`), powód podany obok | propozycja |
| Ładowanie | brak | spinner, `aria-busy`, blokada drugiego wysłania, bez obrotu przy `prefers-reduced-motion` | Q5, propozycja |
| Stan | sam kolor | zawsze ikona i słowo (Alert, błąd pola, ptaszek w polu wyboru) | WCAG 1.4.1 |

**Decyzje właściciela po partii 1 (2026-10-25):**
- Wciśnięty ma osobny wygląd: ciemniejsze wypełnienie (`action-primary-bg-pressed` `#a64e0a` ciemny / `#7c2d12` jasny, `action-danger-bg-pressed` `#ab4529` / `#8f2616`, secondary `border-default`). Wypełnienie przycisku wciśniętego ma 3:1 względem tła strony, ale w ciemnym motywie 2,6–2,7:1 względem panelu; to stan chwilowy, a napis identyfikuje przycisk (WCAG 1.4.11), więc para jest oznaczona „bez wymogu”.
- Stan zablokowany (obramowanie, przygaszony tekst, powód obok) i wymagany tytuł Alertu: zatwierdzone.
- Opisy API w tabelach zostają po angielsku (z komentarzy w kodzie); dokumentacji nie tłumaczymy na siłę, strony i teksty własne są po polsku.

## Etap 2: partia 2 (2026-10-25)

Komponenty w `src/game/`: `panel`, `status-badge`, `dialog`, `confirm-dialog`, `skeleton` (Skeleton i SkeletonRegion), `empty-state`, plus wspólny `status.ts` (ikona, kolor i rola każdego stanu; Alert i Znacznik z niego korzystają). Każdy ma test jednostkowy (dialogi w jsdom z Testing Library), stories z testami interakcji i stronę MDX z 13 sekcjami.

**Czym różnią się od domyślnej bazy:** Panel bez cienia, z obramowaniem 1 px i tłem `surface-raised` (A02); Znacznik z kwadratowymi rogami, ikoną i słowem (A02, WCAG 1.4.1); Dialog z płaskim tłem bez rozmycia i bez cienia, otwarcie 200 ms z obsługą `prefers-reduced-motion` (propozycja, Q5); Dialog potwierdzenia jako `alertdialog` z fokusem na rezygnacji i przyciskiem potwierdzenia opisanym czasownikiem (wzorzec potwierdzenia usunięcia); Szkielet bez gradientów, nie pulsuje przy ograniczonym ruchu; Pusty stan wyrównany do lewej, bez ilustracji (A02, A03).

**Nowe tokeny (propozycje do akceptacji):** `surface-overlay` (tło za dialogiem: ciemny `rgb(0 0 0 / 0.6)`, jasny `rgb(28 25 23 / 0.5)`), `layout-width-dialog` (480 px), animacja `animate-fade-in` (200 ms).

**Nowe zależności deweloperskie:** `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event` (testy dialogów; `AGENTS.md` przewiduje je dla komponentów klienckich z interakcją).

**Znalezione i naprawione:** długie nazwy bez spacji (np. nick gracza) wychodziły poza dialog przy 320 px; teksty w komponentach mają teraz `wrap-anywhere`. Wszystkie stories sprawdzone przy 320 px w obu motywach skryptem przeglądarkowym: brak elementów wychodzących poza ekran.

## Etap 2: partia 3 (2026-10-25) i podsumowanie

Komponenty: `error-state` (Stan błędu: `role="alert"`, powód, co zrobić, ponowienie) i `page-header` (Nagłówek strony: nazwa jako link, nawigacja z nazwą, akcje; R02.1). Decyzje właściciela po partii 2: tło za dialogiem (`surface-overlay`), szerokość dialogu 480 px i zależności `jsdom` + Testing Library **zatwierdzone**.

**Komponenty bazowe razem (14):** Przycisk, Link tekstowy, Pole tekstowe, Pole formularza, Pole wyboru, Alert, Panel, Znacznik statusu, Dialog, Dialog potwierdzenia, Szkielet ładowania, Pusty stan, Stan błędu, Nagłówek strony. Pominięte celowo (żaden ekran ich nie potrzebuje, patrz plan etapu 0): select, radio, przełącznik, pole wielowierszowe, menu, popover, podpowiedź, zakładki, awatar, toast.

**Do wpisania na stronę „Czego brakuje” (etap 4):** link „przejdź do treści”; nagłówek ekranu partii (czy pełny ekran dla planszy bez nagłówka); stan „wciśnięty” dla linku; polskie opisy API (zostawione po angielsku decyzją właściciela); podpowiedź (tooltip) dla zablokowanego przycisku jest zastąpiona tekstem obok.

## Etap 3: plan (do zatwierdzenia)

Komponenty produktu według epików (wszystkie w `src/game/`, nazwy robocze):
- **E01 Konta:** Pole hasła (Pole formularza + pole + „Pokaż hasło”), Baner potwierdzenia e-maila (Alert + „Wyślij ponownie”: wysyłanie, wysłano, limit, błąd).
- **E02 Partia:** Plansza (siatka 15×15, kamienie, ostatni ruch, linia wygrywająca, tylko do odczytu, dwa kroki na ekranie dotykowym), Zegar gracza, Status tury, Karta kodu zaproszenia (link, kod, kopiuj, udostępnij, „ważne do”, anuluj), Baner wyniku, Ostrzeżenie dla gościa (Alert), Komunikat ponownego połączenia (Alert).
- **E03 Lobby:** Status „szukam gry” (odliczanie do wygaśnięcia, wycofanie), Lista i wiersz lobby.
- **E04 Historia:** Lista i wiersz historii partii (przeciwnik, w tym „Usunięty gracz” i „Zaproszony przez link”, wynik, data, sposób zakończenia).

Wzorce, każdy ze wszystkimi stanami jako osobne stories: Formularz (symulowane API przez MSW: sukces, oczekiwanie, błąd pola, błąd serwera, brak sieci; fokus na pierwszym błędzie; blokada podwójnego wysłania), Lista (lobby i historia: ładowanie, pusto, błąd, częściowe dane, dużo danych, długie teksty), Widok szczegółów (partia: ładowanie, „nie istnieje albo brak dostępu”), Potwierdzenie usunięcia (konto, anulowanie własnej partii, wylogowanie w trakcie partii), Zaproszenie przez link lub kod, Stan zależny od uprawnień (niezalogowany, e-mail niepotwierdzony, gość).

Ekrany z mapą stanów: `/register`, `/login`, `/account`, `/verify-email`, `/forgot-password`, `/reset-password`; `/invite/[code]` (9 stanów ze specyfikacji), `/join`, `/games/[id]` (czekanie, ruch gracza, ruch przeciwnika, koniec: wygrana, porażka, remis, czas), lobby; historia.

Szacunek: 14 komponentów produktu, 6 wzorców, około 15 ekranów, około 150 nowych stories.

## Etap 3: wynik (2026-10-25)

Odpowiedzi właściciela na plan: zegar (cyfry, obrys i słowo, „Mało czasu” poniżej minuty, bez animacji), wygląd planszy (obrys ostatniego ruchu, przerywany obrys zaznaczonego pola, gruby obrys linii wygrywającej, współrzędne), zwykły nagłówek na ekranie partii i lista bez filtrów: **zatwierdzone**.

**Odstępstwo od zatwierdzonej propozycji:** znacznik ostatniego ruchu i linii wygrywającej ma kolor `board-marker` (ciemny brąz drewna, 4,06:1 na planszy), a nie kolor akcji, bo pomarańcz ma na drewnie około 2,5:1. Współrzędne są widoczne, gdy plansza ma co najmniej 448 px (zapytanie o kontener), a nie „od 768 px”.

**Komponenty produktu (10, w `src/game/`):** Plansza, Zegar gracza, Status tury, Baner wyniku, Karta kodu zaproszenia (E02); Pole hasła, Baner potwierdzenia e-maila (E01); Status szukania gry, Lista graczy (E03); Lista partii (E04). Pomocnicze: `formatClock`, wspólny `status.ts`, `cn.ts`. Alert dostał `role`, Pole hasła `id` (do ustawiania fokusu po błędzie).

**Wzorce (6, strony i stories w `docs/patterns/`):** Formularz (symulowane odpowiedzi API: sukces, oczekiwanie, błąd pola, błąd serwera, brak sieci; fokus na pierwszym błędzie; blokada podwójnego wysłania), Lista (lobby i historia: ładowanie, pusto, błąd, częściowe, dużo, długie), Widok szczegółów, Potwierdzenie usunięcia, Zaproszenie przez link lub kod, Stan zależny od uprawnień.

**Ekrany (`docs/screens/`):** Strona główna (3 stany), Konta (19 stanów: rejestracja, logowanie, konto, potwierdzenie e-maila, reset hasła), Partia (8 stanów `/invite`, 2 stany `/join`, 13 stanów `/games/[id]`), Lobby (9), Historia (5). Mapa „stan ekranu → story” jest na stronach epików (`docs/epics/`), 4 strony.

**Liczby:** 14 + 10 = 24 komponenty, 6 wzorców, 4 strony epików, 238 stories w obu motywach, 269 testów jednostkowych (100% pokrycia).

**Decyzja techniczna:** odpowiedzi API w wzorcu Formularz symuluje funkcja `submit` przekazana do przykładu, a nie MSW (Service Worker w testach przeglądarkowych jest kruchy, a funkcja pokazuje te same pięć odpowiedzi). `msw` i `msw-storybook-addon` są zainstalowane, ale nieużywane: do decyzji, czy je usunąć.

**Znalezione i naprawione:** ukryta kolumna współrzędnych przesuwała komórki planszy na telefonie (lekcja `.ai/lessons/2026-10-25-design-system-layout-and-class-merging.md`); test układu pilnuje teraz pozycji i kwadratowości komórek w ramce 320 px.

**Do wpisania na „Czego brakuje” (etap 4):** link „przejdź do treści”; stan „wciśnięty” linku; pola planszy na telefonie mają około 17 px (poniżej 24 × 24 px z WCAG 2.5.8; świadomy wyjątek ze specyfikacji, złagodzony dwoma krokami); filtry list (backlog ich nie ma); odtwarzanie partii; logika stron (czas rzeczywisty #30, zegar serwera, serwisy).

## Etap 4: wynik (2026-10-25)

Strony w grupie „Design system” (kolejność wymusza `storySort`): Start (charakter, pięć kroków, tabela wszystkich 24 komponentów), Komponenty (katalog z działającym podglądem i linkiem), Jak wybrać komponent (8 tabel „jeśli… to użyj…”), Użycie i dostępność (klawiatura, formularze, kolor, ruch i treść, układ, reguły produktu; każda reguła ze źródłem), Treść i komunikaty (ton, przyciski, błędy, puste stany, formaty), Czego unikać (3 części, rozpoznawanie w kodzie), Czego brakuje (pokrycie backlogu i luki), Jak zmieniać system, oraz 4 strony epików z mapą stanów i plikami źródłowymi. Pliki `docs/design-system/*.mdx` (Start i Komponenty są generowane z jednej listy komponentów; po dodaniu komponentu trzeba je zaktualizować).

Plik dla agentów: `packages/ui/docs/design-system.md` (charakter, zasady, tabela komponentów z importem, tokeny z klasami, przewodniki, czego unikać, komendy). Odwołanie w `AGENTS.md` (konwencja „Design system graczy”): agent budujący ekran czyta go jako pierwszy.

**Propozycje do akceptacji:** trzy zdania, których produkt nie mówi (strona Treść i komunikaty), oraz konkretne rozpoznawanie antywzorców w kodzie (strona Czego unikać). Z8 usunięta decyzją właściciela, więc rankingi, odznaki i czat nie są na liście antywzorców.

**Sprawdzono:** wszystkie linki wewnętrzne w MDX wskazują istniejące strony (skrypt), 12 stron „Design system” przy 1440, 768 i 320 px w obu motywach (bez błędów, surowych tabel i przewijania w poziomie), menu w przeglądarce (kolejność, nazwa „Gomoku”), lint, typecheck, 269 testów (100%), 238 stories w obu motywach, `check:tokens`, `npm run build`.

## Test agentem: przygotowany, nie wykonany w tej sesji

Test robi właściciel w nowej sesji, osobnym promptem, bo z tej rozmowy znam odpowiedzi, których nie ma w plikach. Agent testowy dostaje tylko repozytorium: ma sam znaleźć `packages/ui/docs/design-system.md` (przez `AGENTS.md`) i Storybook.

**Ekran do zbudowania (nie ma go w Storybooku):** strona główna `/` zaraz po usunięciu konta, czyli stan niezalogowanego gościa z komunikatem „Konto zostało usunięte”. Źródło: `.ai/specs/2026-10-24-account-deletion.md` (sekcja UI/UX: „po sukcesie przekierowanie na `/` z komunikatem”) i `.ai/specs/implemented/2026-10-24-login-logout.md` (strona `/` dla niezalogowanego).

**Wymagania:**
- ekran jako story w `packages/ui/docs/screens/` w obu motywach, przy 320, 768 i 1440 px;
- ze stanami: z komunikatem i po jego zniknięciu (zwykła strona główna niezalogowanego);
- tylko komponenty z `@gomoku/ui/game/*` i tokeny; `npm run check:tokens`, `npm run test:stories` i lint bez błędów;
- dokumentacja nowego ekranu na stronie epiku „Konta” (wiersz w mapie stanów).

**Co sprawdzimy po teście:** każde miejsce, w którym agent musiał zgadywać (np. jaki komponent niesie komunikat, jaka rola dla czytnika, czy komunikat można zamknąć, gdzie stoi na stronie, jak zachowuje się fokus). Takie miejsce uzupełniamy w dokumentacji albo wpisujemy do „Czego brakuje”.

## Etap 5: sprawdzenie i raport (2026-10-25)

Build Storybooka, lint, typecheck, `npm test` (269 testów, 100% pokrycia), `npm run build`, `check:tokens` (czysto), 238 stories w obu motywach z dostępnością (0 naruszeń). Przegląd przeglądarkowy 1078 załadowań: 49 stron dokumentacji przy 1440, 768 i 320 px w obu motywach oraz wszystkie stories przy 320 px w obu motywach i ekrany, wzorce i komponenty produktu przy 768 i 1440 px: bez błędów, surowych tabel i przewijania w poziomie. Klawiatura i nakładki: dialog potwierdzenia w obu motywach (fokus startuje na rezygnacji, `Tab` krąży w dialogu, `Escape` zamyka i oddaje fokus, motyw działa w portalu).

Jedyne 9 odchyleń przeglądu dotyczyło motywu jasnego na trzech stronach z historyjkami w ramkach (Dialog, Dialog potwierdzenia, Potwierdzenie usunięcia) **przy otwarciu `iframe.html` bezpośrednio z adresu**; w prawdziwym Storybooku (z menedżerem) wszystkie trzy mają poprawny motyw, także ramki. Poprawiłem dodatkowo odczyt motywu w `preview.tsx`.

Migracja strony głównej aplikacji na tokeny (osobne zadanie): `frontend.css`, `layout.tsx`, `page.tsx` i ich testy; strona wygląda jak wcześniej, a linia meta ma kontrast 6,93:1 zamiast 3,65:1.

## Menu Storybooka (nazwy po polsku)

System projektowy: Start (jak zbudować ekran), Komponenty, Jak wybrać komponent, Użycie i dostępność, Treść i komunikaty, Czego unikać, Czego brakuje, Jak zmieniać system, strony epików (Konta, Partia z zaproszenia, Otwarte lobby, Historia partii). Fundamenty. Prymitywy. Produkt. Wzorce. Kolejność wymusza `storySort` w `preview.tsx`. W etapie 1 istnieje tylko grupa Fundamenty (w menu pod nazwą „Fundamenty”).

## Otwarte pytania i propozycje do decyzji

1. **Para poniżej progu:** `action-primary-bg-hover` / `surface-raised` w motywie ciemnym: 2,93:1 (próg elementu 3:1). Zatwierdzona wartość hover `#c2410c` z `tokeny.md` nie spełnia progu na panelu. Przycisk jest rozpoznawalny po napisie, więc WCAG 1.4.11 nie wymaga kontrastu wypełnienia, ale zasada „para poniżej progu” każe pytać. Propozycja: hover w ciemnym `#bd580c` (biały tekst 4,6:1, względem panelu 3,3:1, względem strony 3,8:1). **Przyjęte przez właściciela 2026-10-25 i wpisane w `game-tokens.css`.** `lekcja-06/tokeny.md` nadal podaje stary `#c2410c` (do zsynchronizowania).
2. **Kolory stanów (propozycje, Q4):** sukces `#b5c47a`/`#4d6a1f`, uwaga `#fbbf24`/`#92400e`, błąd `#f2907a`/`#9f2d1a`, informacja `#d6d3d1`/`#57534e` (ciemny/jasny); akcja destrukcyjna `#be4e2c`, hover `#c45230`/`#a8341f`. Wszystkie pary tekstowe ≥ 4,5:1 i elementowe ≥ 3:1 (tabela na stronie Kolor).
3. **Jasny motyw:** paleta z `tokeny.md` (propozycja), do przeglądu na prototypach.
4. **Zakres `check:tokens`:** rozstrzygnięty 2026-10-25: skanuje tylko komponenty (`src/game`); Storybook (konfiguracja, stories, dokumentacja) nie jest sprawdzany tym skryptem. Zrobione.
5. **Linie wysokości:** `line-height` ciała 1.5 i tytułu 1.1 pochodzą z zatwierdzonego `przyklad-tokeny.html`; wartość 1.25 dla nagłówków to propozycja.
6. **Plik `scripts/runStorybook`** (jedna linia uruchamiająca Storybook) pojawił się w repozytorium w trakcie sesji; nie został utworzony przez ten etap. Nie ruszany.
7. **Przepięcie `frontend.css` na tokeny z `ui`** odłożone (zmiana w aplikacji); `game-tokens.css` wyłącza domyślną paletę Tailwinda, więc obecne klasy `stone-*` na stronie głównej przestałyby działać po podłączeniu. Zrobimy to razem z pierwszą migracją strony.

## Sprawdzono (etap 1)

`npm run lint`, `npm run typecheck`, `npm test` (30 plików, 163 testy, 100% pokrycia), `npm run build`, `npm run check:tokens`, `npm run build-storybook`, `npm run test:stories` (8 testów w obu motywach; kontrolnie potwierdzono, że naruszenie dostępności kończy się błędem i że motyw jasny faktycznie się ustawia). Strony Fundamenty obejrzane w przeglądarce przy 1440, 768 i 320 px w obu motywach: brak poziomego przewijania.

**Nie sprawdzono:** `npm run test:integration` (wymaga Dockera i nie dotyczy zmian), nawigacji klawiaturą po stronach dokumentacji, nakładek (dialogi i menu pojawią się dopiero z komponentami), przełącznika motywu w pasku narzędzi managera (sprawdzone tylko przez adres `?globals=theme:`), dodatku Vitest w Storybooku poza uruchomieniem z linii poleceń.

## Plan techniczny (propozycja)

Do zatwierdzenia przed etapem 1; nic z poniższego nie zostało zainstalowane.

- Pakiet: `packages/ui`; nowe komponenty w osobnej gałęzi `packages/ui/src/game/` (eksport `@gomoku/ui/game/*`), żeby nie mieszać z komponentami shadcn panelu. Motyw panelu (`globals.css`) bez zmian.
- Tokeny: `packages/ui/src/styles/game-tokens.css` (trzy warstwy, oba motywy przez `data-theme`), podpięte do Tailwinda przez `@theme`.
- Baza: Radix (`radix-ui`, już w zależnościach) + `class-variance-authority`, własne style z tokenów; bez kopiowania komponentów shadcn do frontendu.
- Storybook `10.6.x`, `@storybook/react-vite`, dodatki: docs, a11y (`test: 'error'`), vitest, `msw` + `msw-storybook-addon` (symulacja API formularzy), `remark-gfm`. Nowe zależności deweloperskie wymagają zgody (AGENTS.md).
- Skrypty: `storybook`, `build-storybook`, `test:stories` (oba motywy), `check:tokens` (wartości spoza tokenów, błąd w CI).

## Następny krok

Decyzje właściciela do punktów 1–5 z „Otwarte pytania”, potem „dalej” do etapu 2 (komponenty bazowe, pierwsza partia około sześciu).
