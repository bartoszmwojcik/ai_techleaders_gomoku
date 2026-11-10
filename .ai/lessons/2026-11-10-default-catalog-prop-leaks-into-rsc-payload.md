# Domyślny katalog w komponencie serwerowym trafia do HTML

- **Problem:** po dodaniu propsa `dict` (domyślnie katalog PL) test `account-page.test.ts` znalazł w `document.body.textContent` tekst „Trwa partia” (pytanie z zamkniętego dialogu). Cała przestrzeń `header` była zserializowana w ładunku RSC (`self.__next_f.push(…)` w `<body>`), bo komponent **serwerowy** `SessionMenu` miał `dict = plHeader` jako domyślną wartość i przekazywał ją komponentowi klienckiemu. Domyślna wartość w komponencie klienckim nic nie kosztuje (jest w bundlu), ale ta sama wartość podana z serwera jest wysyłana w każdej stronie.
- **Kontekst:** E15-S01 (#291), wzorzec „serwer rozwiązuje, klient dostaje propsy”.
- **Reguła:** komponent serwerowy przekazuje `dict`/`locale` dalej tylko wtedy, gdy je dostał (bez własnych domyślnych katalogów); layout wysyła je przez `clientI18n()` (dla polskiego `{}`). Po zmianie propsów komponentów klienckich sprawdź HTML strony po polsku (`fetch` + `not.toContain` tekstu, który był tylko w JS).
- **Powiązane:** `packages/app/src/i18n/server.ts` (`clientI18n`), `packages/app/src/components/auth/session-menu.tsx`, `tests/integration/i18n-pages.test.ts`.
