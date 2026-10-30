# Przełącznik motywu jasny/ciemny na stronach gracza

> Status: **wdrożona** (2026-10-29; Q1–Q5 rozstrzygnięte) (`om-spec-writing`, tryb interaktywny, 2026-10-28). Źródło: decyzja właściciela z 2026-10-28 (dodać przełącznik do planu E01, `track.md` Faza 11), `packages/ui/docs/foundations/motywy.mdx`, `packages/ui/src/styles/game-tokens.css`, `packages/ui/docs/design-system.md`. Dotyczy tylko grupy tras `(frontend)`; panel `(backend)` ma własny motyw shadcn.

## 📝 TLDR

Dziś strony gracza zawsze mają motyw ciemny: tokeny znaczeniowe w `:root` są ciemne, a jasny włącza atrybut `data-theme="light"` na `<html>`. Aplikacja nie ma żadnego sposobu wyboru; jasny motyw widzą tylko Storybook, klikalny prototyp i narzędzia deweloperskie. Po wdrożeniu (zachowanie przyszłe) gracz wybiera motyw przyciskiem na każdej stronie, wybór jest zapamiętany, a przy pierwszej wizycie obowiązuje wybrana poniżej reguła domyślna. Strona nie migocze przy ładowaniu.

## Resolved decisions

| # | Pytanie | Decyzja (właściciel, 2026-10-28: „zgoda na rekomendacje”) |
|---|---|---|
| Q1 | Domyślny motyw przy pierwszej wizycie | Według `prefers-color-scheme` systemu; ciemny, gdy system nie ma preferencji |
| Q2 | Stany przełącznika | Dwa: ciemny/jasny; pierwsze kliknięcie zapisuje wybór (bez powrotu do „według systemu”) |
| Q3 | Pamięć wyboru | Ciasteczko `gomoku_theme` (`SameSite=Lax`, `Path=/`, `Max-Age` 1 rok, bez danych osobowych, ustawiane przez klienta); serwer czyta je przy renderowaniu; gdy go nie ma — mały skrypt w `<head>` ustawia motyw według systemu przed malowaniem |
| Q4 | Miejsce | Mały przycisk w rogu z layoutu `(frontend)`, ten sam na każdej stronie; `PageHeader` dopiero przy lobby/partii |
| Q5 | Jasna paleta | Akceptowana jako obowiązująca, jeśli przegląd ekranów E01 w obu motywach (zadanie 11.4) nie wykaże problemów z kontrastem; poprawki tokenów w razie potrzeby |

## 📝 Problem Statement

Gracz nie może zmienić motywu, mimo że DS i prototypy go przewidują, a część osób woli jasną stronę (np. przy pracy w dzień). Brak przełącznika oznacza też, że jasny motyw nie jest nigdy sprawdzany w prawdziwej aplikacji, więc ryzyko niewychwyconych błędów kontrastu rośnie z każdym nowym ekranem.

## 📝 Proposed Solution

- **`@gomoku/core` (`src/theme/`, czysta logika bez I/O):** `type Theme = "dark" | "light"`, `THEME_COOKIE = "gomoku_theme"`, `THEME_COOKIE_MAX_AGE_SECONDS`, `parseTheme(value: unknown): Theme | null` (tylko dokładne `dark`/`light`), `themeCookie(theme): string` (wartość nagłówka `Set-Cookie`/`document.cookie`: `gomoku_theme=<theme>; Path=/; Max-Age=…; SameSite=Lax`, z `Secure` gdy strona jest po HTTPS) i `themeInitScript` (źródło skryptu `<head>`: czyta ciasteczko, a gdy go nie ma, ustawia `data-theme="light"` przy `matchMedia("(prefers-color-scheme: light)")`; ciemny jako domyślny przez brak atrybutu lub `dark`).
- **Layout `(frontend)`:** czyta ciasteczko po stronie serwera (`cookies()`), ustawia `data-theme` na `<html>` (dla poprawnej, rozpoznanej wartości), dodaje inline `themeInitScript` w `<head>` (tylko gdy ciasteczka brak lub jest niepoprawne), `suppressHydrationWarning` na `<html>` (skrypt może zmienić atrybut przed hydracją). Layout staje się dynamiczny (czyta nagłówki żądania): strony i tak są dynamiczne (`await connection()`), więc koszt jest pomijalny.
- **Komponent DS `ThemeSwitch` (`@gomoku/ui/game/theme-switch.tsx`):** bez wiedzy o ciasteczku i DOM: propsy `theme`, `onToggle`, `label` (np. „Motyw”), `lightLabel`, `darkLabel`; przycisk `aria-pressed` (włączony = jasny) z widoczną ikoną i tekstem dostępnym dla czytników, cel dotykowy 44 px (`min-h-target min-w-target`), tokeny z DS, bez wbudowanych tekstów. Stories w obu motywach i test dostępności w Storybooku.
- **Opakowanie w aplikacji (`packages/app/src/components/theme/theme-toggle.tsx`, klient):** czyta aktualny motyw z `document.documentElement.dataset.theme` (`useSyncExternalStore`, snapshot serwera zgodny z motywem z ciasteczka przekazanym z layoutu), po kliknięciu ustawia `data-theme` na `<html>`, zapisuje ciasteczko (`themeCookie`) i fokus zostaje na przycisku.
- **Położenie:** przycisk w prawym górnym rogu, w normalnym przepływie nad treścią lub `absolute`, tak by nie zasłaniał treści przy 320/360 px (sprawdzić na wszystkich ekranach E01).

## 📝 Architecture

`core` (logika, brak Reacta i Next) → `ui` (`ThemeSwitch`, bez zależności od `core`) → `app` (layout i opakowanie łączą oba). Bez nowych zależności i bez migracji.

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Zachowanie |
|---|---|
| Ciasteczko z nieznaną wartością | Ignorowane (jak brak); obowiązuje reguła systemowa |
| Brak JavaScriptu | Serwer renderuje motyw z ciasteczka; bez ciasteczka i bez JS — ciemny (domyślny) |
| Ciasteczka zablokowane | Przełącznik zmienia motyw do końca wizyty (atrybut na `<html>`); po odświeżeniu wraca reguła systemowa |
| System zmienia preferencję w trakcie wizyty | Bez ciasteczka motyw nie zmienia się do odświeżenia (świadomie; brak nasłuchu) |
| Migotanie przy pierwszej wizycie bez ciasteczka | Skrypt w `<head>` ustawia atrybut przed pierwszym malowaniem |
| Hydracja | `suppressHydrationWarning` tylko na `<html>`; komponent przełącznika renderuje na serwerze ten sam stan, co na kliencie (z ciasteczka) |
| Użytkownik z jasnym systemem, bez ciasteczka | Ikona i `aria-pressed` przełącznika startują jako „ciemny” (snapshot serwera), a po hydracji przeskakują na „jasny”, podczas gdy skrypt w `<head>` ustawił `light` przed malowaniem. Zachowanie świadomie przyjęte (bez ostrzeżeń hydracji); do ewentualnej poprawki, np. ukrycie ikony do zamontowania |
| Dialogi i popovery renderowane poza drzewem strony | Dziedziczą motyw z `<html>` (zgodnie z `motywy.mdx`) |

## 📝 Risks & Impact Review

- Layout `(frontend)` zaczyna czytać `cookies()`: strony statyczne w tej grupie (jeśli jakieś są) przestają być statyczne. Dziś wszystkie strony korzystają z `connection()` albo sesji.
- Jasny motyw nigdy nie był oglądany w aplikacji: ryzyko błędów kontrastu na istniejących ekranach (zadanie 11.4).
- Skrypt inline w `<head>` wymaga zgodności z przyszłą polityką CSP (dziś brak nagłówka CSP).
- Ciasteczko ustawia klient, więc nie ma `httpOnly`; zawiera tylko `dark`/`light`.

## 📋 Implementation Plan

1. **11.2 Mechanizm motywu:** moduł `core/src/theme/` (typy, `parseTheme`, `themeCookie`, `themeInitScript`) z testami 100%; layout `(frontend)` (ciasteczko, `data-theme`, skrypt, `suppressHydrationWarning`) z testami (`renderToStaticMarkup`, mock `next/headers`).
2. **11.3 Komponent i użycie:** `ThemeSwitch` w DS (testy, stories w obu motywach, `check:tokens`, `test:stories`), opakowanie `theme-toggle.tsx` w aplikacji, umieszczenie w layoucie, sprawdzenie układu przy 320/360/1280 px.
3. **11.4 Testy i przegląd:** testy integracyjne (agent-browser): pierwsza wizyta z `prefers-color-scheme: light` bez ciasteczka → jasny bez migotania, kliknięcie zapisuje ciasteczko, odświeżenie zachowuje, ciemny domyślny, układ 360 px, brak nakładania na treść; przegląd WSZYSTKICH ekranów E01 w obu motywach (kontrast, fokus, stany błędów), poprawki tokenów, jeśli trzeba; README.

## Adnotacje z wdrożenia (2026-10-29)

- Przełącznik jest wierszem w normalnym przepływie nad stroną (`flex justify-end` w `<body>` layoutu), nie elementem `absolute`: nigdy nie nachodzi na treść, a wiersz ma stałą wysokość. Dlatego `<main>` stron ma `flex-1` (zamiast `min-h-svh`), żeby wyśrodkowanie pionowe treści działało bez przewijania.
- Przegląd wszystkich ekranów E01 w obu motywach (360/1280 px, 320 px dla wybranych; stany domyślne, bez hover/pressed): brak problemów z kontrastem, układem i fokusem, żadnych zmian tokenów (Q5 potwierdzone). Najniższy kontrast tekstu w jasnym motywie: 4,58:1 (`text-muted`). Szczegóły: `.ai/analysis/2026-10-29-theme-review-e01.md`.
- Scenariusze integracyjne: `tests/integration/theme-switch.test.ts` (preferencja systemu, ciasteczko, niepoprawna wartość, wiele stron, klawiatura, 360 px).
- Odstępstwo od propsów `lightLabel`/`darkLabel`: `ThemeSwitch` ma jedną stałą nazwę przycisku („Jasny motyw”), a stan niesie `aria-pressed` (włączony = jasny), zgodnie ze wzorcem przycisku przełączanego; zob. `packages/ui/docs/components/theme-switch.mdx`.

## Korekta 2026-10-30: etykieta nazywa aktualny motyw

- Odstępstwo z wdrożenia (jedna stała nazwa „Jasny motyw” plus `aria-pressed`) okazało się błędem widocznym dla gracza: w motywie ciemnym przycisk pokazywał księżyc i napis „Jasny motyw”. Zgodnie z założeniami (propsy `lightLabel`/`darkLabel`, prototyp „Motyw: ciemny” / „Motyw: jasny”) tekst ma nazywać motyw, który jest włączony: „☀ Jasny motyw” w jasnym i „🌙 Ciemny motyw” w ciemnym.
- `ThemeSwitch` ma propsy `lightLabel` i `darkLabel` zamiast `label`, a `aria-pressed` zniknął (nazwa niesie stan; zmienna nazwa razem z `aria-pressed` byłaby czytana podwójnie). Wrapper w aplikacji ma `data-testid="theme-switch"`; testy integracyjne czytają napis zamiast `aria-pressed`.
- Decyzja właściciela: wariant „aktualny motyw” (a nie „akcja”, czyli napis motywu, na który przełączy kliknięcie).
