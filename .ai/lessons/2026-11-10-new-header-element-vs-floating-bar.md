# Nowy element nagłówka a pływający pasek na planszy

- **Problem:** przełącznik języka dodany do nagłówka `(frontend)` zasłaniał poniżej `sm` początek nagłówka „Partia w toku” na `/games/[gameId]` (QA PR #302, 320–480 px). Na tej stronie pasek pływa nad wierszem nagłówka (`data-theme-overlay`), a `play-field.tsx` wcina `h1` o `pl-11` — miejsce tylko na przełącznik motywu. Test układu w `game-play-mobile.test.ts` sprawdzał nakładanie tylko dla `theme-switch` i `signed-in-as`, więc nowego elementu nie widział.
- **Reguła:** każdy nowy element paska nagłówka dopisz do listy w teście nakładania (`game-play-mobile.test.ts`) i obejrzyj `/games/<id>` przy 320 px; w trybie pływającym poniżej `sm` element bez miejsca ukryj (`group-has-[[data-theme-overlay]]/body:max-sm:hidden`, jak link „Gomoku”) albo zmień wcięcie nagłówka.
- **Powiązane:** `packages/app/src/app/(frontend)/layout.tsx`, `.ai/specs/2026-11-10-i18n.md` (I7), lekcja `2026-10-25-design-system-layout-and-class-merging.md`.
