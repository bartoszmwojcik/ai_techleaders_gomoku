# Przełącznik motywu jasny/ciemny na stronach gracza

> Status: **szkielet — czeka na odpowiedzi właściciela** (`om-spec-writing`, tryb interaktywny, 2026-10-28). Źródło: decyzja właściciela z 2026-10-28 (dodać przełącznik do planu E01, `track.md` Faza 11), `packages/ui/docs/foundations/motywy.mdx`, `packages/ui/src/styles/game-tokens.css`, `packages/ui/docs/design-system.md`. Dotyczy tylko grupy tras `(frontend)`; panel `(backend)` ma własny motyw shadcn.

## 📝 TLDR

Dziś strony gracza zawsze mają motyw ciemny: tokeny znaczeniowe w `:root` są ciemne, a jasny włącza atrybut `data-theme="light"` na `<html>`. Aplikacja nie ma żadnego sposobu wyboru; jasny motyw widzą tylko Storybook, klikalny prototyp i narzędzia deweloperskie. Po wdrożeniu (zachowanie przyszłe) gracz wybiera motyw przyciskiem na każdej stronie, wybór jest zapamiętany, a przy pierwszej wizycie obowiązuje wybrana poniżej reguła domyślna. Strona nie migocze przy ładowaniu.

## Open Questions

- **Q1 — Domyślny motyw przy pierwszej wizycie.** (a) zawsze ciemny (zgodnie z DS: ciemny jest domyślny, R01.1), (b) według `prefers-color-scheme` systemu. Rekomendacja: (b), bo osoba z systemem w trybie jasnym dostaje jasną stronę bez klikania, a ciemny pozostaje domyślny, gdy system nie ma preferencji.
- **Q2 — Ile stanów ma przełącznik.** (a) dwa: ciemny/jasny (pierwsze kliknięcie zapisuje wybór, bez powrotu do „według systemu”), (b) trzy: system/ciemny/jasny. Rekomendacja: (a), prostszy przycisk i mniej stanów do testowania; „według systemu” działa do pierwszego kliknięcia.
- **Q3 — Gdzie zapamiętać wybór.** (a) ciasteczko (serwer zna motyw przy renderowaniu, więc brak migotania), (b) `localStorage` (brak migotania wymaga skryptu blokującego w `<head>`; serwer motywu nie zna). Rekomendacja: (a), ciasteczko `gomoku_theme` (`SameSite=Lax`, bez danych osobowych, `Max-Age` 1 rok, bez `httpOnly`, bo ustawia je klient); gdy ciasteczka nie ma i obowiązuje reguła systemowa (Q1 b), pierwszy render może mignąć, więc potrzebny jest mały skrypt w `<head>` czytający `prefers-color-scheme` przed malowaniem.
- **Q4 — Miejsce przełącznika.** Strony gracza nie mają dziś wspólnego nagłówka (jest komponent DS `PageHeader`, ale żadna strona go nie używa). (a) stały mały przycisk w rogu (prawy górny, ten sam na każdej stronie, z layoutu `(frontend)`), (b) wprowadzić `PageHeader` na wszystkich stronach gracza (osobna, większa zmiana: marka, „Zaloguj się”/„Konto”/„Wyloguj” w jednym miejscu) i dać przełącznik w nim. Rekomendacja: (a) teraz, (b) przy ekranach lobby i partii, kiedy nagłówek i tak będzie potrzebny.
- **Q5 — Jasna paleta.** DS opisuje ją jako propozycję do przeglądu po obejrzeniu prototypów (`motywy.mdx`, „Do ustalenia”); w aplikacji nigdy nie była oglądana (zob. wcześniejsze review). Czy akceptujesz jasny motyw w obecnej postaci jako obowiązujący, jeśli po wdrożeniu przejrzenie ekranów E01 w obu motywach nie wykaże problemów z kontrastem (zadanie 11.4)? Rekomendacja: tak, z poprawkami tokenów, jeśli przegląd je wykaże.

## 📝 Problem Statement

Gracz nie może zmienić motywu, mimo że DS i prototypy go przewidują, a część osób woli jasną stronę (np. przy pracy w dzień). Brak przełącznika oznacza też, że jasny motyw nie jest nigdy sprawdzany w prawdziwej aplikacji, więc ryzyko niewychwyconych błędów kontrastu rośnie z każdym nowym ekranem.

## 📝 Proposed Solution (do uzupełnienia po odpowiedziach)

Kierunek: czysta logika wyboru motywu w `@gomoku/core` (typ `Theme`, `resolveTheme({ cookie, systemPrefersLight })`, parsowanie ciasteczka), layout `(frontend)` czyta ciasteczko po stronie serwera i ustawia `data-theme` na `<html>`; klient: komponent przełącznika w `@gomoku/ui/game/*` (przycisk z `aria-pressed` i widoczną nazwą stanu, cel dotykowy 44 px, tokeny z DS, stories w obu motywach) zapisuje ciasteczko i ustawia atrybut na `document.documentElement`. Bez nowych zależności.
