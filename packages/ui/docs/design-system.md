# Design system Gomoku: skrót dla agentów

Przeczytaj ten plik jako pierwszy, zanim zbudujesz ekran dla gracza. Pełna dokumentacja jest w Storybooku (`npm run storybook -w @gomoku/ui`, `packages/ui/.storybook`), a decyzje i ich źródła w `lekcja-06/referencje.md` i `lekcja-06/tokeny.md`. Stan prac: `packages/ui/POSTEP.md`.

## Charakter produktu

Gra planszowa dla dwóch osób online: ciemna strona, drewniana plansza, jeden pomarańczowy akcent, tekst mówiący wprost. **Charakter:** oszczędny, czytelny, ciepły (drewniany), spokojny, rzeczowy. **Antycharakter:** pstrokaty, niskokontrastowy, retro-pikselowy, techniczny, generyczny. Stan gry zawsze wynika ze słów, ikon i kształtu, nie z samego koloru. Teksty interfejsu po polsku; komponenty nie mają wbudowanych tekstów (etykiety przez propsy).

## Zasady, których nie wolno złamać

1. Komponenty tylko z `@gomoku/ui/game/*`. Nie importuj shadcn/ui do stron graczy (`(frontend)`), nie dodawaj komponentów, wariantów ani zależności bez zgody właściciela.
2. Wartości tylko z tokenów: żadnych kolorów hex/rgb/hsl/oklch, klas palety Tailwinda (`bg-zinc-900`, `text-white`), wartości arbitralnych (`p-[13px]`) ani odstępów spoza skali (4, 8, 12, 16, 24, 32, 48). Domyślna paleta Tailwinda jest wyłączona. `npm run check:tokens -w @gomoku/ui` to pilnuje.
3. Komponenty scalaj klasami przez `src/game/cn.ts`, nie przez gołe `cn`.
4. Tekst 4,5:1, elementy 3:1, w obu motywach (ciemny domyślny, jasny przez `data-theme="light"` na `<html>`). Kolor nie jest jedynym nośnikiem znaczenia.
5. Pomarańcz tylko na elementach interaktywnych. Bez gradientów, rozmycia, cieni na kartach, pigułek, emoji i iskierek. Dokładna lista: strona „Czego unikać”.
6. Każdy ekran ma stany: ładowanie (Szkielet), pusto (Pusty stan z powodem i następnym krokiem), błąd (Stan błędu z ponowieniem), dane częściowe, dużo danych, długie teksty, szerokość 320 px.
7. Błąd wymagający działania to Alert lub Stan błędu, nigdy toast. Zablokowany przycisk ma powód napisany obok. Informacja niezbędna do działania nie trafia do podpowiedzi.
8. Czas partii i wynik liczy serwer; komponenty tylko wyświetlają.

## Komponenty

| Komponent | Import | Kiedy | Kiedy nie |
|---|---|---|---|
| Przycisk | `@gomoku/ui/game/button` | wysłanie formularza, „Załóż konto”, „Dołącz do partii”, akcja destrukcyjna (wariant danger) | przejście na inną stronę (Link tekstowy), wybór opcji (Pole wyboru) |
| Link tekstowy | `@gomoku/ui/game/text-link` | odnośnik w zdaniu, „Nie pamiętasz hasła?”, „Konto” w nagłówku | akcja zmieniająca stan na serwerze (Przycisk) |
| Pole tekstowe | `@gomoku/ui/game/text-input` | zawsze wewnątrz Pola formularza | samodzielnie bez etykiety; długi tekst; wybór z listy |
| Pole formularza | `@gomoku/ui/game/field` | każde pole formularza | pole wyboru (ma własną etykietę); błąd całego formularza (Alert) |
| Pole wyboru | `@gomoku/ui/game/checkbox` | zgoda przed nieodwracalną akcją, niezależna opcja tak/nie | wybór jednej z wielu opcji, natychmiastowe włączenie czegoś |
| Alert | `@gomoku/ui/game/alert` | baner e-maila, ostrzeżenie dla gościa, błąd serwera, powodzenie | błąd jednego pola, decyzja tak/nie, chwilowe powiadomienie |
| Panel | `@gomoku/ui/game/panel` | sekcje konta, lobby, historia | panel w panelu, cała strona w jednym panelu |
| Znacznik statusu | `@gomoku/ui/game/status-badge` | wynik w historii, status partii | komunikat z instrukcją (Alert), akcja (Przycisk) |
| Dialog | `@gomoku/ui/game/dialog` | krótka czynność w kontekście, np. wpisanie kodu | potwierdzenie nieodwracalnej akcji, długi formularz, błąd |
| Dialog potwierdzenia | `@gomoku/ui/game/confirm-dialog` | usunięcie konta, anulowanie własnej partii, wylogowanie w trakcie partii | akcja odwracalna, zebranie informacji |
| Szkielet ładowania | `@gomoku/ui/game/skeleton` | lista lub widok o znanym kształcie | akcja po kliknięciu (loading przycisku), nieznany kształt |
| Pusty stan | `@gomoku/ui/game/empty-state` | lobby bez graczy, historia bez partii | ładowanie, błąd |
| Stan błędu | `@gomoku/ui/game/error-state` | lista, która się nie wczytała, partia, której nie ma | błąd pola, komunikat obok działającej treści (Alert) |
| Nagłówek strony | `@gomoku/ui/game/page-header` | każda strona gracza | nagłówek sekcji (Panel) |
| Plansza | `@gomoku/ui/game/board` | ekran partii, podgląd na stronie głównej (z podpisem) | odtwarzanie ruch po ruchu, inne rozmiary |
| Zegar gracza | `@gomoku/ui/game/player-clock` | nad i pod planszą w partii | odliczanie statusu w lobby, odmierzanie czasu w komponencie |
| Status tury | `@gomoku/ui/game/turn-status` | nad planszą w trakcie partii | wynik partii (Baner wyniku), czas (Zegar) |
| Baner wyniku | `@gomoku/ui/game/game-result-banner` | po zakończeniu partii | w trakcie partii, lista historii (Znacznik statusu) |
| Karta kodu zaproszenia | `@gomoku/ui/game/invite-code-card` | strona oczekującej partii | wpisywanie kodu przez zaproszonego (Pole formularza) |
| Pole hasła | `@gomoku/ui/game/password-field` | każde pole hasła (logowanie, rejestracja, reset, zmiana) | inne dane wrażliwe |
| Baner potwierdzenia e-maila | `@gomoku/ui/game/verify-email-banner` | `/` i `/account` przy niepotwierdzonym e-mailu (nie blokuje gry; zamykalny, wraca po 7 dniach) | po potwierdzeniu, dla gościa |
| Status szukania gry | `@gomoku/ui/game/seeking-status` | po oznaczeniu się jako szukający | zegar w partii, lista innych graczy |
| Lista graczy | `@gomoku/ui/game/lobby-list` | strona lobby | historia partii |
| Lista partii | `@gomoku/ui/game/history-list` | strona historii | lobby, trwające partie |

Nie ma jeszcze: select, radio, przełącznika, pola wielowierszowego, menu, popovera, podpowiedzi, zakładek, panelu bocznego, awatara, toasta, linku „przejdź do treści”. Użyj zamienników z „Jak wybrać komponent” i wpisz lukę do „Czego brakuje”.

## Tokeny znaczeniowe

| Token | Klasa Tailwinda | Przeznaczenie |
|---|---|---|
| `surface-page` | `bg-surface-page` | tło strony |
| `surface-raised` | `bg-surface-raised` | panele, wiersze list (nie tło strony) |
| `surface-overlay` | `bg-surface-overlay` | tło za dialogiem |
| `text-primary` | `text-text-primary` | tytuły i tekst główny |
| `text-secondary` | `text-text-secondary` | opisy pod tytułem |
| `text-muted` | `text-text-muted` | metadane, podpisy |
| `text-accent` | `text-text-accent` | linki w tekście (tylko elementy interaktywne) |
| `action-primary-bg / -hover / -pressed / -text` | `bg-action-primary-bg, hover:bg-action-primary-bg-hover, active:bg-action-primary-bg-pressed, text-action-primary-text` | główny przycisk |
| `action-danger-bg / -hover / -pressed / -text` | `bg-action-danger-bg, …` | akcja nieodwracalna |
| `focus-ring` | `focus-visible:focus-ring` | obrys fokusu (2 px, odstęp 2 px) |
| `border-default` | `border-border-default` | dekoracyjny podział treści |
| `border-control` | `border-border-control` | brzeg pól i przycisków drugorzędnych (≥ 3:1) |
| `status-success / -warning / -danger / -info` | `text-status-*, border-status-*` | stan: zawsze z ikoną i słowem |
| `board-surface, board-line, board-grain, board-marker` | `bg-board-surface, bg-board-line, board-texture, outline-board-marker` | plansza, siatka, słoje, ostatni ruch i linia wygrywająca |
| `piece-black, piece-white, piece-outline` | `bg-piece-black, bg-piece-white, border-piece-outline` | kamienie |
| `space-group / -stack / -panel / -section` | `gap-group (8), gap-stack (16), p-panel (24), py-section (48)` | odstępy według relacji |
| `radius-base, radius-piece` | `rounded-base, rounded-piece` | 6 px; okrąg tylko dla kamieni |
| `shadow-board, shadow-piece` | `shadow-board, shadow-piece` | cień tylko plansza i kamienie |
| `text-title / -section / -subsection / -lead / -body / -meta` | `text-title (48), text-section (28), text-subsection (20), text-lead (18), text-body (16), text-meta (14)` | role typografii |
| `font-regular, font-strong` | `font-regular (400), font-strong (700)` | grubości |
| `motion-fast, motion-base` | `motion-fast (150 ms), motion-base (200 ms)` | ruch; przy reduced-motion wyłączony |
| `target-min` | `min-h-target, min-w-target` | cel dotyku 44 px |

Surowe wartości (`palette-*`, `space-*`) są tylko w `packages/ui/src/styles/game-tokens.css`.

## Przewodniki „jeśli… to użyj…”

| Jeśli… | to użyj |
|---|---|
| akcja zmienia coś na serwerze | Przycisk (nieodwracalna: `danger` w Dialogu potwierdzenia) |
| prowadzi na inną stronę | Link tekstowy (jak główna akcja: `Button asChild` z `<a>`) |
| pole formularza | Pole formularza + Pole tekstowe (hasło: Pole hasła) |
| zgoda tak/nie przed akcją | Pole wyboru |
| komunikat dla strony lub formularza | Alert (`status`: info, sukces; `alert`: uwaga, błąd) |
| błąd jednego pola | błąd w Polu formularza |
| treść się nie wczytała | Stan błędu z ponowieniem |
| ładowanie listy lub widoku | Szkielet ładowania (akcja po kliknięciu: `loading` przycisku) |
| lista pusta | Pusty stan: powód i następny krok |
| krótka czynność w kontekście | Dialog |
| pytanie przed akcją nieodwracalną | Dialog potwierdzenia (czasownik na przycisku, nazwa obiektu w pytaniu) |
| grupa treści w sekcji | Panel (bez panelu w panelu) |
| lista graczy lub partii | Lista graczy, Lista partii |
| długi lub wieloetapowy formularz | osobna strona |

## Czego unikać

Gradienty, szkło i rozmycie, poświata, emoji zamiast ikon, iskierki AI, trzy identyczne karty z ikoną, wszystko w pigułkach, karta w karcie, cień jako jedyny separator, wszystko wyśrodkowane, indygo jako akcja, wymyślone liczby i opinie, `div` zamiast przycisku, placeholder zamiast etykiety, status samym kolorem, zablokowany przycisk bez wyjaśnienia, toast z błędem, podpowiedź z informacją niezbędną, plansza z `aria-hidden`, ukrywanie elementu siatki przez `display: none`, niebieski tekst, font pikselowy, ukryte czekanie w lobby. Rozpoznawanie w kodzie: strona „Czego unikać” w Storybooku.

## Komendy

| Komenda | Do czego |
|---|---|
| `npm run storybook -w @gomoku/ui` | Storybook (`localhost:6006`) |
| `npm run build-storybook -w @gomoku/ui` | statyczny build |
| `npm run test:stories -w @gomoku/ui` | stories jako testy w obu motywach, z dostępnością |
| `npm run check:tokens -w @gomoku/ui` | wartości spoza tokenów w `src/game` |
| `npm test`, `npm run typecheck`, `npm run lint` | testy (100% pokrycia), typy, lint |
