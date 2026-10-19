# Zasady code review

Zasady review tego repozytorium. Stosuje je każdy recenzent — człowiek i `om-code-review` (a więc `om-auto-review-pr`), który czyta ten plik automatycznie. Uzupełniają one, a nie zastępują:

- **checklistę z `.ai/docs/2026-09-01-engineering-standards.md`** (sekcja „Code Review Checklist”, z oznaczeniami blocker/major) — wskazaną też jako `reviewChecklist` w `.ai/agentic.config.json`;
- **reguły z `AGENTS.md`** (stack, granice pakietów, konwencje, testy) — przy sprzeczności `AGENTS.md` wygrywa;
- **`BACKWARD_COMPATIBILITY.md`** — zmiany chronionych powierzchni kontraktu.

## Priorytety

Recenzuj w tej kolejności; uwaga z wyższego poziomu nie czeka na rozwiązanie niższych.

1. **Poprawność gry i danych** — zasady gomoku (BR-01…BR-11 w `.ai/specs/product-brief.md`), zegar, wynik i historia partii rozstrzygane po stronie serwera; brak wyścigów przy współdzielonym stanie.
2. **Bezpieczeństwo** — autoryzacja konkretnego rekordu (uczestnik *tej* partii, *jego* tura, *jego* wpis w lobby), panel `/backend` tylko dla administratora, brak sekretów w logach i odpowiedziach.
3. **Kontrakty** — publiczne API pakietów `@gomoku/*`, trasy HTTP, schemat bazy, zmienne środowiskowe (`BACKWARD_COMPATIBILITY.md`).
4. **Testy** — 100% pokrycia testami jednostkowymi zmienionych plików i scenariusz integracyjny dla nowych stron, przepływów i endpointów.
5. **Jakość i konwencje** — czytelność, zgodność z otaczającym kodem, brak zbędnych zmian.

## Sprawdzenia specyficzne dla repozytorium

### Architektura i granice pakietów

- Kierunek zależności `app → core, db, ui`, `db → core`; `core` nie importuje `next`, `react` ani `@mikro-orm/*`, `ui` nie importuje `db` ani kodu serwerowego. Naruszenie to **blocker**.
- Logika domenowa (zasady, zegar, przejścia stanów) jest czystą funkcją w `packages/core/src/<koncept>/`; serwis w `app` tylko ładuje, wywołuje i zapisuje. Logika gry w route handlerze lub komponencie to **major**.
- Kontener DI składa się wyłącznie w `packages/app/src/server/container.ts`; zależności rejestrowane jawnie (`asClass`/`asFunction`/`asValue`), bez `loadModules`/globów. Serwisy przyjmują zależności przez destrukturyzację w konstruktorze (`constructor({ orm }: Deps)`).
- Route handlery, server actions i server components używają `withRequestScope(({ cradle }) => …)`; zapytanie przez globalne `orm.em` zamiast forka z `cradle.em` to **blocker** (współdzielony identity map między żądaniami).
- Strona lub handler czytający bazę wywołuje `await connection()` przed zapytaniem; ORM nie jest inicjalizowany na poziomie modułu (`next build` ewaluuje moduły tras).
- `(frontend)` nie importuje shadcn/ui ani `@gomoku/ui/globals.css`; `(backend)` nie importuje `frontend.css`.

### Dane i MikroORM

- Encje przez `defineEntity` (bez dekoratorów), dopisane jawnie do `packages/db/src/entities/index.ts`.
- Zmiana schematu tylko przez nową migrację; edycja już zastosowanej migracji, `schema:update` lub `ensureDatabase` w aplikacji to **blocker**. Migracja sprawdzona w górę i w dół na prawdziwym PostgreSQL, a plan wycofania jest w opisie PR (`risk-high`, zob. `SDLC.md`).
- Dostępność bazy sprawdzana zapytaniem, nie `orm.checkConnection()` (lekcja 2026-10-18).
- `@mikro-orm/*` i `kysely` zostają w `serverExternalPackages` w `next.config.ts`.
- Write endpointy przekazują do `em.create()`/`em.assign()` tylko sparsowane, jawnie typowane pola — nigdy surowe body (mass assignment).
- Każde sprawdź-i-działaj na współdzielonym stanie (ruch, dołączenie, przyjęcie zaproszenia, wybór z lobby, jedna aktywna partia) jest chronione transakcją i/lub unikalnym ograniczeniem — brak to **blocker**.

### HTTP i odpowiedzi

- Odpowiedzi błędów nie ujawniają szczegółów infrastruktury (hosty, porty, stack trace) w produkcji — wzorzec: `/api/health` ukrywa `reason`, gdy `NODE_ENV=production`.
- Komunikaty błędów logowania są ogólne i nie zdradzają, czy konto istnieje.

### Testy

- Każdy zmieniony lub nowy plik w zakresie pokrycia ma 100% (statements, branches, functions, lines) — job CI `unit` to egzekwuje; recenzent sprawdza, że testy **weryfikują zachowanie**, a nie tylko wykonują linie (asercje na wynikach, gałęzie błędów, przypadki brzegowe).
- Nowe wyjątki w `coverage.exclude`, obniżone progi lub komentarze `v8 ignore`/`istanbul ignore` bez zgody użytkownika to **blocker**.
- Nowy komponent shadcn jest dopisany do `SHADCN_COMPONENTS` w `vitest.config.ts`; własny komponent `ui` nie trafia na tę listę.
- Mocki tylko na granicach (`next/server`, `@/server/container`, ORM, `@next/env`); środowisko przez `vi.stubEnv`, bez zakładania `NODE_ENV`/`DATABASE_URL` z otoczenia.
- Nowa strona, przepływ użytkownika lub endpoint ma scenariusz w `tests/integration`; elementy bez roli/tekstu wybierane przez `data-testid`.
- Zmiana zachowania ma test, który nie przechodzi na kodzie sprzed zmiany; poprawka bezpieczeństwa — test regresji (**major**).

### Konfiguracja i zależności

- Nowa zmienna środowiskowa jest w `.env.example` (z bezpieczną wartością domyślną lub jawnym błędem przy braku) i w tabeli w `README.md`; sekrety nigdy w repozytorium.
- Nowa biblioteka, zmiana ORM/DI/biblioteki UI/menedżera pakietów wymaga wyraźnej zgody użytkownika (`AGENTS.md`, OD-3 w standardach) — bez niej **blocker**.
- Zależność instalowana do konkretnego pakietu (`-w @gomoku/<pakiet>`); `package-lock.json` zmienia się tylko w PR, który zmienia zależności (usunięte pola `libc` to akceptowany szum — lekcja 2026-10-19).

### Język i styl

- Kod, identyfikatory i komentarze po angielsku; teksty UI i dokumentacja projektu po polsku.
- TypeScript strict, bez `any`; komentarz tylko dla nieoczywistego „dlaczego”; brak martwego kodu i debugowych `console.log`.
- Diff wynika w całości z celu PR — bez przypadkowych zmian nazw i formatowania.

## Bramka walidacyjna

Review nie zatwierdza PR, którego bramka nie przechodzi: `npm run lint` → `npm run typecheck` → `npm test` → `npm run build` → `npm run test:integration` (lokalnie `npm run check`, na PR — joby CI). Zmiany UI dodatkowo sprawdzone w działającej aplikacji, łącznie z przypadkami brzegowymi.

## Waga uwag

| Waga | Znaczenie | Przykłady w tym repo |
|---|---|---|
| **blocker** | Nie merguj, dopóki nie naprawione. | brak autoryzacji rekordu, stan partii zaufany od klienta, wyścig bez transakcji/ograniczenia, sekret w logu, edycja zastosowanej migracji, naruszenie kierunku zależności, obniżony próg pokrycia, nieuzgodniona nowa biblioteka, złamany kontrakt z `BACKWARD_COMPATIBILITY.md` bez ścieżki migracji |
| **major** | Napraw w tym PR, chyba że autor uzasadni inaczej, a recenzent się zgodzi. | logika gry poza `core`, brak testu integracyjnego nowej strony, testy bez sensownych asercji, brak `await connection()`, brak brute-force control na zmienionym logowaniu |
| **minor** | Popraw, gdy tanio; może trafić do zgłoszenia uzupełniającego. | nazewnictwo, drobna duplikacja, brakujący przypadek brzegowy w teście niekrytycznej ścieżki |
| **nit** | Opcjonalne. | styl, kolejność importów, sformułowanie komentarza |

Uwagi minor i nit, których autor nie poprawia, `om-auto-fix-pr` zamienia w zgłoszenia uzupełniające zamiast blokować PR.
