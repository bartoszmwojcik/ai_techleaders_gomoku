# Strony i route handlery mają osobne kopie modułów aplikacji

- Data: 2026-10-27. Powiązane: `.ai/specs/implemented/2026-10-24-account-registration.md` (krok 10), `packages/app/src/server/container.ts`.

## Problem

Po dodaniu odczytu sesji na stronie `/` (`getCurrentUser`) wszystkie testy integracyjne `POST /api/auth/register` zaczęły zwracać `500`: `Cannot set properties of undefined (setting '__schema')` w `em.create(User, …)`. W dev i w testach jednostkowych wszystko działało; padał tylko build produkcyjny.

## Kontekst

Build produkcyjny kompiluje strony (warstwa RSC) i route handlery osobno, więc moduły aplikacji, a z nimi definicje encji z `defineEntity`, istnieją w dwóch kopiach. ORM jest singletonem na `globalThis`, więc pierwszy użytkownik (tu: pierwsze żądanie `/` w `waitUntilReady`) rejestrował w nim encje swojej kopii, a serwisy drugiej kopii przekazywały ORM-owi obce obiekty encji. Próba współdzielenia całego kontenera na `globalThis` jest gorsza: `instanceof AppError` przestaje działać między kopiami i błędy `409` stają się `500`.

## Reguła

- Singleton na `globalThis`, który trzyma stan zależny od definicji z modułów aplikacji (ORM i jego encje), kluczuj obiektem z tych definicji (`WeakMap` po `entities`), nie jedną globalną zmienną. Każda kopia encji dostaje własny ORM i pulę, więc pilnuj `DATABASE_POOL_MAX`.
- Nigdy nie współdziel między warstwami obiektów, których klasy porównujesz przez `instanceof` (błędy, serwisy).
- Nowa strona czytająca bazę zmienia, kto pierwszy tworzy ORM: po takiej zmianie uruchom `npm run build` i `npm run test:integration`; testy jednostkowe i dev tego nie wykryją.
