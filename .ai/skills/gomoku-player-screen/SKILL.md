---
name: gomoku-player-screen
description: Build or change a player-facing screen in Gomoku (route group `(frontend)`, components in `packages/app/src/components`) — design-system components and tokens, Polish-first i18n catalogs with EN/FR in the same PR, the dynamic data pattern, permission checks, 100% unit coverage and an integration scenario in a real browser. Use when adding a page, a form, a panel or any visible text for players; not for the `/backend` admin panel (shadcn/ui) or e-mails.
---

# Ekran dla gracza w Gomoku

Skill projektowy (nie pochodzi z `skills-lock.json`). Łączy w jedną ścieżkę zasady, które w repo leżą w kilku miejscach. Nadrzędne są `AGENTS.md` i `packages/ui/docs/design-system.md`; przy sprzeczności wygrywają one, a ten plik popraw.

## 0. Zanim zaczniesz

1. Przeczytaj `.ai/lessons.md` i specyfikację zadania w `.ai/specs/` (kryteria akceptacji to lista kontrolna kroku 7).
2. Przeczytaj `packages/ui/docs/design-system.md` w całości: zasady nie do złamania, tabela komponentów, tokeny, przewodnik „jeśli… to użyj…”.
3. Znajdź najbliższy istniejący ekran i kopiuj jego kształt zamiast wymyślać nowy:
   - lista z danymi z bazy: `packages/app/src/app/(frontend)/history/` (`page.tsx` + `history-view.tsx`),
   - formularz konta: `packages/app/src/app/(frontend)/account/`,
   - ekran partii: `packages/app/src/app/(frontend)/play/`.

## 1. Strona (server component)

- Strona czytająca sesję lub bazę zaczyna od `await connection()` (`next/server`) — inaczej `next build` próbuje ją wyrenderować statycznie.
- Dane pobieraj przez `getCurrentUserWith((user, cradle) => …)` (`@/server/http/auth`) albo `withRequestScope(({ cradle }) => …)` — nigdy przez globalne `orm.em`.
- Uprawnienia: gość bez konta → `redirect("/login?next=…")`; cudza, nieistniejąca i usunięta partia → ta sama odpowiedź 404 (nie zdradzaj, czy zasób istnieje); strony `/show/**` → `requireAdmin()`.
- `generateMetadata` bierze tytuł z katalogu (`t("meta.title")`); strony prywatne mają `robots: { index: false, follow: false }`.
- Teksty do komponentu klienckiego: `{...clientI18n(await getI18n("<namespace>"))}` (`@/i18n/server`).

## 2. Komponenty i style

- Tylko `@gomoku/ui/game/<nazwa>`; **nigdy** `@gomoku/ui/components/*` (shadcn) ani `globals.css` w `(frontend)`.
- Klasy wyłącznie z tokenów (`bg-surface-raised`, `gap-stack`, `text-meta`…); zero hex/rgb/hsl/oklch, klas palety (`bg-zinc-900`) i wartości arbitralnych bez `var(--…)`.
- Komponenty DS nie mają wbudowanych tekstów — każdą etykietę podajesz propsem z katalogu.
- Brakuje komponentu? Użyj zamiennika z design-system.md i wpisz lukę do „Czego brakuje” w `packages/ui/POSTEP.md`; nowy komponent lub wariant wymaga zgody właściciela.
- Każdy ekran ma stany: ładowanie (Szkielet), pusto (Pusty stan z powodem i następnym krokiem), błąd (Stan błędu z ponowieniem), długie teksty, 320 px szerokości, oba motywy. Błąd wymagający działania to Alert, nie toast.
- Elementy, których test nie znajdzie po roli lub tekście, dostają `data-testid`.

## 3. Teksty (i18n)

- Źródłem jest polski katalog `packages/app/src/i18n/catalogs/pl/<namespace>.ts`; w tym samym PR dopisz te same klucze w `en/` i `fr/` (`de/` może zostać szkicem). Parzystość kluczy, form mnogich i parametrów sprawdza `catalogs.test.ts`.
- Nowa przestrzeń nazw: plik w każdym języku + wpis w `LOADERS` w `catalogs/index.ts` dla `pl`, `en`, `fr`, `de` + typ w `catalogs/types.ts`.
- Polski literał w `app/(frontend)/**`, `components/**` lub `lib/**` łamie `no-ui-literals.test.ts`. Nie dopisuj zwykłego tekstu do `i18n-allowlist.ts` — przenieś go do katalogu.
- Liczebniki przez formy mnogie (`one`/`few`/`many`/`other` w PL), nie przez sklejanie stringów.

## 4. Logika

- Wynik, czas i reguły gry liczy serwer (`packages/core` dla czystych reguł, serwis w `packages/app/src/server/services`); komponent tylko wyświetla.
- Czystą funkcję (formatowanie, wybór stanu) wydziel do `core` albo `lib/` — łatwiej ją pokryć testem niż komponent.

## 5. Testy jednostkowe (100% per plik)

- Obok kodu: `<plik>.test.tsx`. Server component: `renderToStaticMarkup(await Page())`, mockując `next/server` (`connection`) i `@/server/container` / `@/server/http/auth` fałszywym `cradle`.
- Komponent kliencki z interakcją: `@testing-library/react` w `jsdom`.
- Pokryj każdy stan z kroku 2 i każdą gałąź uprawnień (gość, właściciel, obcy użytkownik).
- Bez `v8 ignore`/`istanbul ignore` — odrzuca je hook PreToolUse (`scripts/hooks/`) i CI. Kod trudny do pokrycia przebuduj.

## 6. Test integracyjny (prawdziwa przeglądarka)

- Plik `tests/integration/<ekran>-pages.test.ts` na wzór `game-history-pages.test.ts`: `Browser` z `./browser`, `inject("baseUrl")`, konta zakładane przez API, sprzątanie w `afterAll`.
- Scenariusz jak użytkownik: wejście bez sesji (przekierowanie), szczęśliwa ścieżka, **obcy użytkownik nie widzi cudzych danych** (404 / brak danych), 320 px bez przewijania w bok.
- Integracja testuje build: `npm run build` przed `npm run test:integration`.

## 7. Weryfikacja i oddanie

1. `npm run check:tokens -w @gomoku/ui` (jeśli ruszałeś `packages/ui/src/game`), `npm run lint`, `npm run typecheck`, `npm test`.
2. `npm run build && npm run test:integration` (wymaga Dockera; bez niego napisz to wprost w PR).
3. Sprawdź ekran w `npm run dev` w obu motywach i po angielsku (`?lang=en`).
4. Odhacz kryteria akceptacji w specyfikacji i dopisz adnotację wdrożenia; jeden PR: kod + testy + teksty + dokumentacja.
