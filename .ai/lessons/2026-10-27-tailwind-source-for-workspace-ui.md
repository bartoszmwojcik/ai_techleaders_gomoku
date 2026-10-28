# Tailwind nie skanuje komponentów `@gomoku/ui` w stronach graczy

- Data: 2026-10-27. Powiązane: `packages/app/src/app/(frontend)/frontend.css`.

## Problem

Formularz rejestracji wyrenderował się bez stylów pól i przycisku (przycisk 24 px zamiast 44 px), choć testy jednostkowe przechodziły: klasy komponentów `@gomoku/ui/game/*` nie trafiły do CSS.

## Kontekst

Tailwind 4 wykrywa źródła automatycznie, ale pomija `node_modules`, a pakiet workspace rozwiązuje się przez symlink w `node_modules/@gomoku`. Strona startowa używała tylko klas z własnych plików aplikacji, więc luka nie była widoczna.

## Reguła

`frontend.css` ma jawne `@source "../../../../ui/src/game"`. Po użyciu nowego komponentu DS na stronie obejrzyj ją w przeglądarce (także przy 360 px); testy jednostkowe nie sprawdzają CSS.
