# Gomoku

Gomoku 1:1 online: dwóch zalogowanych graczy gra w czasie rzeczywistym na planszy 15×15, według swobodnych zasad (pięć w linii wygrywa), z zegarem szachowym 10 minut na gracza. Przeciwnika znajdziesz przez zaproszenie albo w otwartym lobby. Pełne wymagania produktu: [`.ai/specs/product-brief.md`](.ai/specs/product-brief.md).

## Stack

| Obszar | Technologia |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack), React 19, TypeScript |
| Baza danych | PostgreSQL + [MikroORM 7](https://mikro-orm.io) (migracje, pula połączeń) |
| Dependency Injection | [Awilix](https://github.com/jeffijoe/awilix) |
| Style — strony frontendowe | [Tailwind CSS 4](https://tailwindcss.com) |
| Style — strony backendowe | [shadcn/ui](https://ui.shadcn.com) (na Tailwind CSS 4) |
| Monorepo | npm workspaces |

## Architektura

Repozytorium to monorepo oparte na npm workspaces. Kod znajduje się w pakietach w katalogu `packages/`:

```
.
├── packages/
│   ├── app/    @gomoku/app  — aplikacja Next.js (strony, API, kompozycja DI)
│   ├── core/   @gomoku/core — logika domenowa i narzędzia wielokrotnego użytku
│   ├── db/     @gomoku/db   — MikroORM: konfiguracja, encje, migracje
│   └── ui/     @gomoku/ui   — komponenty UI wielokrotnego użytku (shadcn/ui)
├── scripts/smoke.mjs         — smoke test zbudowanej aplikacji
├── tsconfig.base.json        — wspólna konfiguracja TypeScript
├── eslint.config.mjs         — ESLint dla całego monorepo
├── compose.yaml              — lokalny PostgreSQL
└── .env.example              — zmienne środowiskowe
```

### Zależności między pakietami

```mermaid
graph LR
  app["@gomoku/app"] --> core["@gomoku/core"]
  app --> db["@gomoku/db"]
  app --> ui["@gomoku/ui"]
  db --> core
```

Zależności są jednokierunkowe. `core` nie wie nic o Next.js, Reakcie ani bazie danych, więc logikę gry można testować i używać wszędzie. `ui` nie ma dostępu do bazy ani kodu serwerowego.

Pakiety biblioteczne (`core`, `db`, `ui`) nie mają kroku build: eksportują źródła TypeScript przez pole `exports` w `package.json`, a Next.js (Turbopack) transpiluje je razem z aplikacją.

### `@gomoku/app` — aplikacja

Aplikacja Next.js z App Routerem (`packages/app/src/app`). Ma dwie części, każda z osobnym root layoutem i osobnym arkuszem stylów:

| Część | Katalog | Adres | Style |
| --- | --- | --- | --- |
| Frontend — strony dla graczy | `src/app/(frontend)` | `/`, `/register`, `/login`, `/account` | Tailwind CSS z własnym motywem gry (`frontend.css`) |
| Backend — panel administracyjny | `src/app/(backend)` | `/backend` | shadcn/ui z `@gomoku/ui` |
| API | `src/app/api` | `/api/*` | — |

Dzięki osobnym root layoutom style frontendu i panelu się nie mieszają. Przejście między częściami przeładowuje całą stronę.

Kod serwerowy znajduje się w `src/server`:

- `container.ts` — kontener DI (Awilix) z rejestracją wszystkich serwisów. ORM i jego pula połączeń to singleton procesu, odporny na HMR w trybie deweloperskim. Każde żądanie dostaje własny scope z forkiem `EntityManager` (`withRequestScope`).
- `services/` — serwisy aplikacji. Zależności przyjmują w konstruktorze, np. `HealthService` dostaje `orm`.

```ts
// Route handler / server component / server action
const report = await withRequestScope(({ cradle }) => cradle.healthService.check());
```

`GET /api/health` zwraca stan połączenia z bazą: `200` albo `503`.

#### Konta i sesje

Gracz zakłada konto na `/register` (e-mail, nazwa gracza, hasło co najmniej 8 znaków) i jest od razu zalogowany; strona `/` pokazuje „Zalogowano jako …”, a zalogowany wchodzący na `/register` trafia na `/`. Parametr `?next=` wskazuje ścieżkę powrotu po rejestracji (tylko ścieżki względne w obrębie serwisu, inne wartości dają `/`). Formularz wywołuje `POST /api/auth/register`:

- **Uwierzytelnianie:** własne, bez biblioteki. Hasło jest hashowane przez `bcryptjs` (domyślnie koszt 12, `PASSWORD_HASH_COST`), sesja leży w tabeli `sessions` (30 dni), a w ciasteczku `httpOnly` jest losowy token (w bazie tylko jego SHA-256). W produkcji ciasteczko nazywa się `__Host-gomoku_session` (`Secure`, bez `Domain`), poza produkcją `gomoku_session`.
- **Koszt bcrypt:** zmiana kosztu (`PASSWORD_HASH_COST`) działa po restarcie procesu, który przelicza atrapę hasha używaną przy logowaniu nieistniejącego konta (`PasswordHasher.dummyHash`, ten sam koszt co prawdziwe hashe). Hashe istniejących kont zachowują stary koszt, aż konto zaloguje się ponownie lub zmieni hasło (hash nie jest jeszcze przeliczany automatycznie).
- **CSRF:** każde żądanie zmieniające stan musi mieć nagłówek `Origin` równy `APP_ORIGIN` oraz `X-Gomoku-Request: 1` (dodaje go klient `apiCall`); inaczej `403`.
- **Limit prób:** 5 prób rejestracji na godzinę na adres klienta (`429` z nagłówkiem `Retry-After`). Adres pochodzi z nagłówka `CLIENT_IP_HEADER`, liczony od prawej według `TRUST_PROXY_HOPS`; IPv6 jest skracany do prefiksu /64.
- **Odpowiedzi:** zajęty e-mail daje jednolite `409` bez wskazania pola (brak ujawniania kont), zajęta nazwa gracza jest zgłaszana przy swoim polu, zalogowany klient dostaje `409 ALREADY_AUTHENTICATED`.

Specyfikacja i kontrakt API: [`.ai/specs/2026-10-24-account-registration.md`](.ai/specs/2026-10-24-account-registration.md).

#### Logowanie, wylogowanie i strona konta

- **Strony:** `/login` (e-mail i hasło; parametr `?next=` jak przy rejestracji, a zalogowany wchodzący na `/login` trafia na `next`) oraz `/account` (nazwa gracza, e-mail i znacznik „Potwierdzony” / „Niepotwierdzony” przy e-mailu, baner potwierdzenia dla niepotwierdzonego adresu i przycisk „Wyloguj”). Strona `/` pokazuje zalogowanemu link „Konto”, przycisk „Wyloguj” i (dla niepotwierdzonego adresu) baner, a gościowi linki „Zaloguj się” i „Załóż konto”.
- **Endpointy:** `POST /api/auth/login` (`{ email, password }`; sukces `200` z ciasteczkiem sesji) i `POST /api/auth/logout` (`200` z `{ "ok": true, "data": null }`). Oba wymagają nagłówków CSRF opisanych wyżej.
- **Kody błędów** (pole `code` w kopercie błędu):

  | Kod | Status | Kiedy |
  | --- | --- | --- |
  | `INVALID_CREDENTIALS` | `401` | zły e-mail lub hasło; treść i czas odpowiedzi są takie same dla nieznanego konta (atrapowy hash), więc nie ujawniają istnienia konta |
  | `RATE_LIMITED` | `429` | przekroczony któryś limit prób; nagłówek `Retry-After`, ten sam komunikat dla wszystkich limitów |
  | `ALREADY_AUTHENTICATED` | `409` | klient ma już ważną sesję (ciasteczko z wygasłą lub nieznaną sesją nie przeszkadza i jest nadpisywane) |
  | `VALIDATION` | `400` | zły kształt danych (brak pola, nieprawidłowy e-mail, hasło dłuższe niż 1024 znaki); bez reguł hasła z rejestracji |

- **Zmiana hasła:** formularz „Zmień hasło” na `/account` (obecne hasło, nowe hasło co najmniej 8 znaków i różne od obecnego; wygasła sesja przenosi na `/login?next=%2Faccount`) wywołuje `POST /api/auth/password` (`{ currentPassword, newPassword }`, wymaga sesji i nagłówków CSRF). Odpowiedzi: `200`; `400` `INVALID_CURRENT_PASSWORD` (złe obecne hasło lub przegrany wyścig dwóch równoległych zmian, błąd przy polu `currentPassword`); `400` `VALIDATION` (słabe lub niezmienione nowe hasło); `401` `UNAUTHORIZED`; `429` `RATE_LIMITED` z `Retry-After`. Limit: 10 nieudanych prób na 15 minut na konto, udana zmiana go zeruje. Zmiana hasła i unieważnienie wszystkich innych sesji konta (bieżąca zostaje, także tych w trakcie partii) to jedna transakcja. Unieważnianie niewykorzystanych tokenów resetu (`invalidateResetTokens`) jest do Fazy 8 (#35) no-opem, bo tabela tokenów jeszcze nie istnieje. Specyfikacja: [`.ai/specs/2026-10-24-password-change.md`](.ai/specs/2026-10-24-password-change.md).
- **Limity prób logowania** (bez blokady konta): 30 prób na godzinę na adres klienta, 10 nieudanych na parę e-mail + adres w 15 minut i 100 nieudanych na sam e-mail w godzinę (przeciw atakowi z wielu adresów). Liczniki rosną przed sprawdzeniem hasła, więc równoległe próby nie omijają limitu; udane logowanie zeruje oba liczniki e-mailowe, a limit na adres zostaje. Właściciel konta, którego e-mail ktoś zgaduje z jednego adresu, loguje się normalnie z innego. Klucze limitów to skróty SHA-256 (w bazie nie ma e-maili ani adresów); wiersze sprząta czyszczenie wygasłych rekordów (#39).
- **Adres klienta** pochodzi z `CLIENT_IP_HEADER` według `TRUST_PROXY_HOPS` (IPv6 skrócony do /64). Źle ustawione `TRUST_PROXY_HOPS` psuje limity: za duże pozwala podszyć się pod adres, za małe wrzuca wszystkich pod adres proxy, więc jedna osoba wyczerpie limit całej aplikacji. W dev (bez `TRUST_PROXY_HOPS`) wszyscy współdzielą klucz `local`.
- **Ciasteczko sesji:** `httpOnly`, `SameSite=Lax`, `Path=/` (w produkcji `__Host-gomoku_session` z `Secure`). Każde logowanie tworzy nową sesję z nowym tokenem (brak session fixation). Wylogowanie unieważnia tylko bieżącą sesję w bazie (inne urządzenia zostają zalogowane) i usuwa ciasteczko; jest idempotentne, a przy niedostępnej bazie odpowiada `500`, ale ciasteczko i tak jest usuwane (przycisk „Wyloguj” traktuje wtedy `500` jak udane wylogowanie i przechodzi na `/`; błąd sieci pokazuje komunikat i pozwala ponowić). Wszystkie pozostałe sesje konta unieważnia zmiana hasła (#36); do tego dojdzie reset hasła (#35).
- **Strażnik sesji** (`packages/app/src/server/http/auth.ts`): `requireSession()` w route handlerach (bez sesji `401` przez `apiHandler`) i `requirePageSession(path)` na stronach (przekierowanie na `/login?next=<path>`). Obie zawodzą bezpiecznie: przy błędzie bazy nie ma sesji. Każda nowa chroniona trasa lub strona woła jedną z nich jako pierwszą.
- **Wylogowanie w trakcie partii (Q4):** `/account` i `/` przekazują do `LogoutButton` prop `hasActiveGame` z `gameParticipation.hasActiveGame(userId)` (po zamknięciu okna fokus wraca na przycisk „Wyloguj”); gdy jest `true`, przed wylogowaniem pojawia się potwierdzenie „Trwa partia — po wylogowaniu zegar biegnie dalej. Wylogować?”. Dziś partii nie ma, więc `GameParticipation` (singleton) zawsze zwraca `false`; implementację podmieni funkcja gry (#21/#22).
- **Koszt hasha:** `PASSWORD_HASH_COST` (opis wyżej) dotyczy też logowania: nieznany e-mail jest weryfikowany względem atrapowego hasha o tym samym koszcie, żeby czas odpowiedzi nie zdradzał istnienia konta. W produkcji zostaw domyślne `12`.

Specyfikacja i kontrakt API: [`.ai/specs/2026-10-24-login-logout.md`](.ai/specs/2026-10-24-login-logout.md).

#### Potwierdzenie e-maila

Po rejestracji aplikacja wysyła wiadomość z linkiem `APP_ORIGIN/verify-email?token=…` (ważnym 24 godziny). Potwierdzenie niczego nie blokuje (BR-26): konto jest aktywne od rejestracji, a błąd wysyłki nie blokuje rejestracji ani gry (rejestracja dalej kończy się `201`, przyczyna trafia do logu). Wejście w link (GET) niczego nie zmienia (skanery poczty i podglądy linków otwierają adresy): strona pokazuje przycisk „Potwierdź e-mail”, a dopiero jego kliknięcie wysyła `POST /api/auth/email-verification/confirm` (`{ token, next? }`, nagłówki CSRF jak wyżej, sesja niewymagana; potwierdzenie nie loguje). Odpowiedź `200` ma `{ ok: true, data: { next } }`, gdzie `next` to bezpieczna ścieżka powrotu (`/` dla każdej innej). Strona `/verify-email` ma nagłówek `Referrer-Policy: no-referrer`, bo token jest w adresie.

- **Zmienne `EMAIL_*`** (`.env.example`): `EMAIL_TRANSPORT` (`file`: dopisuje wiadomości jako linie JSON do pliku; bez wartości wysyłka kończy się `EMAIL_SEND_FAILED`), `EMAIL_OUTBOX_PATH` (plik-skrzynka, ignorowany przez git), `EMAIL_FROM` (nadawca), `EMAIL_DAILY_LIMIT` (globalny dzienny limit wysyłek; weryfikacja e-maila zużywa najwyżej 70%, zaokrąglone w dół, ale co najmniej 1 wysyłkę dziennie - przy `EMAIL_DAILY_LIMIT=1` weryfikacja nie jest blokowana). Transport `file` w produkcji (`next start`) jest dozwolony tylko przy `APP_ORIGIN` zaczynającym się od `http://`. **Produkcja wymaga dostawcy poczty z #38**: bez niego nikt nie potwierdzi e-maila, a wysyłka zwraca `502`.
- **Ponowne wysłanie:** `POST /api/auth/email-verification/resend` (bez treści; wymaga sesji i nagłówków CSRF) wysyła zalogowanemu graczowi z niepotwierdzonym adresem nowy link (prowadzi na `/`, bez `next`) i zwraca `200` z `{ "ok": true, "data": null }`. Kolejność kontroli: sesja (`401`), „już potwierdzony” (`409`), limity (`429`), dzienny limit wysyłek (`503`), wysyłka (`502`). Limity: 3 wysyłki na godzinę na konto i 10 na godzinę na adres klienta; liczniki rosną przed wysyłką i nie cofają się po jej błędzie. Starsze niewykorzystane linki tracą ważność dopiero po udanej wysyłce nowego, więc nieudana wysyłka zostawia poprzedni link ważny.
  - Limit adresu dotyczy adresu wspólnego (np. za NAT), więc osoby za nim mogą się wzajemnie blokować, a licznik konta rośnie także wtedy, gdy żądanie odrzuca limit adresu.
  - **Znane ryzyko (zaakceptowane do wyboru dostawcy w #38):** limit adresu (10/h) nie chroni dziennej puli `EMAIL_DAILY_LIMIT` przed zużyciem przez `resend` z jednego adresu (do 240 jednostek na dobę, wystarczy jedno konto). Przy małym limicie dziennym blokuje to potwierdzenia nowym graczom (`503`). Do rozważenia później: niższy budżet dzienny dla `resend` niż dla rejestracji albo limit dobowy na konto. Konto założone na cudzy niepotwierdzony adres może też wysłać do 72 wiadomości na dobę do tej skrzynki (limit 3/h na konto). Szczegóły: adnotacje przy Q4 i Q10 w [`.ai/specs/2026-10-24-email-verification.md`](.ai/specs/2026-10-24-email-verification.md).
- **Interfejs:** na `/verify-email`, gdy link jest nieważny (użyty, wygasły albo unieważniony), zalogowany gracz z niepotwierdzonym kontem widzi przycisk „Wyślij nowy link”, a niezalogowany link „Zaloguj się, aby wysłać nowy link” (`/login?next=/account`). Na `/` i `/account` niepotwierdzony gracz widzi baner „Potwierdź adres e-mail” z przyciskiem „Wyślij ponownie” i przyciskiem „Zamknij”. Baner niczego nie blokuje (BR-26): serwer zawsze renderuje go otwartego (dla niepotwierdzonego adresu), a po hydracji przeglądarka ukrywa go tylko wtedy, gdy zamknięto go mniej niż 7 dni temu (kosztem krótkiego mignięcia u tych, którzy go zamknęli, zamiast przesunięcia układu u wszystkich); zamknięcie zapamiętuje przeglądarka w `localStorage` (klucz z identyfikatorem konta, bez e-maila i nazwy, więc drugie konto w tej samej przeglądarce widzi baner osobno), a po 7 dniach baner wraca; gdy `localStorage` jest niedostępny, baner jest widoczny przy każdym wejściu. Po potwierdzeniu e-maila baner znika. Strona `/account` pokazuje przy e-mailu znacznik „Potwierdzony” albo „Niepotwierdzony”.
- **Limit czasu wysyłki:** żądanie (rejestracja i ponowne wysłanie) czeka na przekazanie wiadomości transportowi najwyżej 5 sekund (`AbortSignal.timeout`, port `EmailSender` musi respektować `options.signal`). Po przekroczeniu wysyłka jest uznana za nieudaną: świeżo zapisany token zostaje usunięty (więc link z wiadomości, jeśli dostawca mimo przerwania ją dostarczył, nie zadziała; gracz prosi o nowy), poprzedni link zostaje ważny, ponowne wysłanie zwraca `502 EMAIL_SEND_FAILED`, a rejestracja `201`.
- **Logi błędów wysyłki:** przyczynę błędu (nazwa klasy i kod sterownika, przez `describeError`) loguje `console.error` jako „Verification e-mail send failed”; adres e-mail, token ani treść wiadomości nie trafiają do logów, a klient dostaje tylko ogólny komunikat `EMAIL_SEND_FAILED`.
- **Ręczne sprawdzenie w dev:** w `.env.local` ustaw `EMAIL_TRANSPORT=file` i `EMAIL_OUTBOX_PATH=/tmp/outbox.jsonl`, uruchom `npm run dev`, załóż konto na `/register`, a link wyciągnij z ostatniej linii pliku: `tail -n 1 /tmp/outbox.jsonl | jq -r .text`. Otwórz go w przeglądarce i kliknij „Potwierdź e-mail”; `email_verified_at` konta zostaje ustawione, a baner znika. Do sprawdzenia ponownego wysyłania użyj przycisku „Wyślij ponownie” w banerze na `/` (nowa linia w pliku-skrzynce; po 3 próbach w godzinę przycisk pokaże błąd limitu). `next dev` ładuje także `.env.local` z roota monorepo (`forceReload` w `next.config.ts`), ale tylko przy starcie: po zmianie `.env.local` zrestartuj `npm run dev`.
- **Kody błędów:**

  | Kod | Status | Kiedy |
  | --- | --- | --- |
  | `INVALID_TOKEN` | `400` | token nieznany, użyty (także drugie żądanie z tym samym tokenem), wygasły, unieważniony nowszym linkiem lub konto usunięte; jednolity komunikat „Link wygasł lub został już użyty.” |
  | `VALIDATION` | `400` | zły kształt danych (brak lub pusty `token`) |
  | `FORBIDDEN` | `403` | brak nagłówków CSRF |
  | `EMAIL_SEND_FAILED` | `502` | wysyłka nie powiodła się, przekroczyła 5 s lub brak dostawcy (poprzedni link zostaje ważny) |
  | `EMAIL_QUOTA_EXCEEDED` | `503` | wyczerpany dzienny limit wysyłek (`EMAIL_DAILY_LIMIT`) |

  Ostatnie dwa kody dotyczą wysyłki wiadomości (rejestracja je loguje i dalej kończy się `201`; zwraca je ponowne wysłanie). Endpoint `confirm` nie ma limitu prób: token jest jednorazowy i ma 256 bitów losowości.

  Dodatkowo `resend` zwraca:

  | Kod | Status | Kiedy |
  | --- | --- | --- |
  | `UNAUTHORIZED` | `401` | brak sesji |
  | `ALREADY_VERIFIED` | `409` | adres konta jest już potwierdzony |
  | `RATE_LIMITED` | `429` | przekroczony limit 3/h na konto lub 10/h na adres klienta; nagłówek `Retry-After` |

  `FORBIDDEN` (`403`, brak nagłówków CSRF), `EMAIL_QUOTA_EXCEEDED` i `EMAIL_SEND_FAILED` działają jak wyżej.

  **Wdrożenie:** transport plikowy (`EMAIL_TRANSPORT=file`) jest w produkcji blokowany przy `APP_ORIGIN` z `https://`, a mikr.us serwuje aplikację po HTTPS, więc na produkcji wysyłkę zapewni dopiero dostawca poczty z #38 (do tego czasu `resend` i wysyłka po rejestracji zwracają `502`, a baner pokazuje błąd).

Specyfikacja: [`.ai/specs/2026-10-24-email-verification.md`](.ai/specs/2026-10-24-email-verification.md).

### `@gomoku/core` — części wielokrotnego użytku

Czysty TypeScript bez zależności od frameworków:

- `createAppContainer()` — fabryka kontenera Awilix z ustawieniami projektu (tryb `PROXY`, `strict`), plus reeksport `asClass`, `asFunction` i `asValue`;
- zasady gry (`BOARD_SIZE`, `WIN_LENGTH`), a w przyszłości silnik gry, zegar i typy domenowe.

### `@gomoku/db` — dane

- `createOrmConfig()` — konfiguracja MikroORM dla PostgreSQL. Adres bazy i rozmiar puli pochodzą ze zmiennych środowiskowych.
- `createOrm()` — tworzy instancję ORM z własną pulą połączeń. Łączy się leniwie, przy pierwszym zapytaniu.
- `src/entities/` — encje definiowane przez `defineEntity` (bez dekoratorów), rejestrowane jawnie w `entities/index.ts`.
- `src/migrations/` — migracje generowane przez CLI MikroORM (`src/mikro-orm.config.ts`).

### `@gomoku/ui` — komponenty interfejsu

Komponenty [shadcn/ui](https://ui.shadcn.com) w `src/components` oraz motyw (zmienne CSS i Tailwind) w `src/styles/globals.css`. Importowane przez strony backendowe, np. `import { Card } from "@gomoku/ui/components/card"`. Nowe komponenty dodajesz z katalogu `packages/ui`:

```bash
cd packages/ui && npx shadcn@latest add dialog
```

## Uruchomienie

Wymagania: Node.js ≥ 22.17 i PostgreSQL 17 (najprościej Docker z `docker compose`).

```bash
npm run setup                    # przygotowuje repozytorium (można powtarzać)
npm run dev                      # http://localhost:3000
```

`npm run setup` wykonuje po kolei wszystkie kroki instalacji ręcznej (niżej): sprawdza wersję Node.js, instaluje zależności (`npm ci`), tworzy `.env.local` z `.env.example`, uruchamia PostgreSQL w Dockerze, jeśli baza nie odpowiada, i stosuje migracje. Każdy krok najpierw sprawdza, czy jest już wykonany, więc kolejne uruchomienia pomijają gotowe kroki i dokańczają tylko braki. Instalator:

- nigdy nie nadpisuje istniejącego `.env.local`;
- łączy się z tą samą bazą co `npm run dev` (pliki `.env*` jak w trybie deweloperskim) i wypisuje ją z ukrytym hasłem;
- odmawia użycia `DATABASE_URL` ze zmiennych środowiskowych, gdy różni się od plików `.env*` — świadomie: `npm run setup -- --db-from-env`;
- nie uruchamia drugiego PostgreSQL, gdy port 5432 zajmuje już inna instancja.

Opcja `npm run setup -- --with-browser` dodatkowo instaluje Chrome dla testów integracyjnych, a `npm run setup -- --help` pokazuje wszystkie opcje.

### Instalacja ręczna

```bash
npm install
cp .env.example .env.local       # dostosuj DATABASE_URL, jeśli trzeba
docker compose up -d             # lokalny PostgreSQL (opcjonalnie)
npm run db:migration:up          # zastosuj migracje
npm run dev                      # http://localhost:3000
```

Zmienne środowiskowe czytane są z plików `.env*` w katalogu głównym repozytorium, wspólnych dla aplikacji i CLI MikroORM. Zmienne ustawione w środowisku procesu mają pierwszeństwo przed plikami.

| Zmienna | Domyślnie | Opis |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://gomoku:gomoku@localhost:5432/gomoku` | Adres bazy PostgreSQL |
| `DATABASE_POOL_MIN` | `0` | Minimalna liczba połączeń w puli |
| `DATABASE_POOL_MAX` | `10` | Maksymalna liczba połączeń w puli; build produkcyjny ma dwie pule (strony i route'y), więc realnie do dwukrotności |
| `DATABASE_DEBUG` | `false` | Logowanie zapytań SQL |
| `APP_ORIGIN` | brak (dev: `http://localhost:<port>`) | Dokładny origin aplikacji, np. `https://gomoku.byst.re`; porównywany z nagłówkiem `Origin` (CSRF). **Wymagany w produkcji** |
| `TRUST_PROXY_HOPS` | brak (dev: wspólny klucz `local`) | Liczba własnych proxy przed aplikacją (liczba całkowita ≥ 1). **Wymagana w produkcji** |
| `CLIENT_IP_HEADER` | `x-forwarded-for` | Nagłówek z adresem klienta: `x-forwarded-for`, `x-real-ip` albo `cf-connecting-ip` |
| `PASSWORD_HASH_COST` | `12` | Koszt bcrypt (liczba całkowita 4–31); obniża go tylko `global-setup` testów integracyjnych (4), żeby setki prób logowania nie trwały minutami. W produkcji zostaw nieustawione |
| `SESSION_COOKIE_SECURE` | `true` | `false` tylko dla testów integracyjnych (HTTP bez TLS); przy `APP_ORIGIN` z `https://` przerywa start |

## Wdrożenie na mikr.us

Aplikacja działa w kontenerach Docker na VPS mikr.us (plan z Dockerem, ≥ 2.1), a ruch HTTPS idzie przez darmową subdomenę mikr.us, bez własnej domeny (decyzja G1 w `.ai/specs/2026-10-24-account-registration.md`). Pliki: `Dockerfile`, `compose.prod.yaml`, `.env.production.example`.

```bash
git clone https://github.com/bartoszmwojcik/ai_techleaders_gomoku.git && cd ai_techleaders_gomoku
cp .env.production.example .env.production      # ustaw POSTGRES_PASSWORD (openssl rand -hex 24) i APP_ORIGIN
docker compose --env-file .env.production -f compose.prod.yaml up -d --build
domena gomoku.byst.re 3000                       # subdomena na porcie aplikacji (HTTPS automatycznie)
curl https://gomoku.byst.re/api/health           # {"status":"ok",...}
```

- **Stos:** PostgreSQL 17 (nieopublikowany na zewnątrz, dane w woluminie `postgres-data`), jednorazowa migracja (`npm run db:migration:up`) i aplikacja. Aplikacja startuje dopiero po migracji i gotowej bazie; healthcheck wywołuje `/api/health`, który zwraca `503`, gdy baza nie odpowiada.
- **Sekrety:** `.env.production` leży tylko na serwerze (jest ignorowany przez git). Hasło bazy generuj poleceniem `openssl rand -hex 24` (heks jest bezpieczny w adresie `DATABASE_URL`).
- **IPv6:** subdomeny mikr.us wymagają, żeby usługa odpowiadała na IPv6. Aplikacja słucha w kontenerze na IPv4, a Docker publikuje port także na adresie IPv6 hosta; komenda `domena` sprawdza, czy port odpowiada, zanim utworzy subdomenę.
- **Aktualizacja:** `git pull`, potem to samo polecenie `docker compose … up -d --build` (migracje wykonują się przy każdym starcie).
- **Logi i stan:** `docker compose -f compose.prod.yaml logs -f app`, `docker compose -f compose.prod.yaml ps`.
- **Konta (`APP_ORIGIN`, `TRUST_PROXY_HOPS`, `CLIENT_IP_HEADER`):** `compose.prod.yaml` wymaga `APP_ORIGIN` i `TRUST_PROXY_HOPS` z `.env.production` (bez nich `docker compose` odmawia startu). Aplikacja w produkcji bez poprawnych wartości działa tylko częściowo: `/api/health` odpowiada, ale route'y domenowe (`/api/auth/*`) zwracają `500` (fail closed), a `/` pokazuje widok gościa. `APP_ORIGIN` to dokładny adres subdomeny z `https://` (np. `https://gomoku.byst.re`). `TRUST_PROXY_HOPS` to liczba proxy, które dopisują adres klienta do `CLIENT_IP_HEADER`; zła wartość pozwala podszyć się pod adres (za duża) albo wrzuca wszystkich pod adres proxy (za mała), więc po wdrożeniu sprawdź na serwerze, jaki adres trafia do nagłówka. Czy proxy mikr.us w ogóle go przekazuje, wyjaśnia spike #30 — jeśli nie, rejestracja zwraca `500` do czasu przejścia na Cloudflare (wtedy `CLIENT_IP_HEADER=cf-connecting-ip`). `SESSION_COOKIE_SECURE` w produkcji zostaw nieustawione.
- **Nasłuch na IPv6:** subdomena wymaga odpowiedzi na IPv6. Aplikacja w kontenerze słucha na `0.0.0.0` (IPv4), a Docker publikuje port także na adresie IPv6 hosta; jeśli publikacja IPv6 nie działa, uruchom aplikację z `-H ::` (nasłuch na obu stosach) albo włącz IPv6 w demonie Docker. Zawsze sprawdź `curl -6 https://<subdomena>/api/health`.
- **Kolejne zmienne:** `SMTP_*` (poczta, #38) dojdą z tą funkcją; produkcyjny start bez nich ma przerywać, zgodnie ze specyfikacją.
- **Czyszczenie wygasłych rekordów** (#39) będzie wpisem `cron` na serwerze: `docker compose … run --rm app npm run db:cleanup`.

## Komendy

Uruchamiane z katalogu głównego:

| Komenda | Opis |
| --- | --- |
| `npm run setup` | Idempotentna instalacja: zależności, `.env.local`, PostgreSQL, migracje (`-- --with-browser`, `-- --db-from-env`, `-- --help`) |
| `npm run dev` | Serwer deweloperski Next.js |
| `npm run build` / `npm run start` | Build produkcyjny i jego uruchomienie |
| `npm run lint` | ESLint dla całego monorepo |
| `npm run typecheck` | Sprawdzenie typów we wszystkich pakietach i w testach integracyjnych |
| `npm test` | Testy jednostkowe (Vitest) z raportem pokrycia w `coverage/`; próg 100% dla każdego pliku |
| `npm run test:watch` | Testy jednostkowe w trybie watch |
| `npm run test:integration` | Testy integracyjne zbudowanej aplikacji (Docker, wcześniej `npm run build`) |
| `npm run smoke` | Uruchamia zbudowaną aplikację i sprawdza `/`, `/backend`, `/api/health` (z bazą) i 404; port: `SMOKE_PORT` (domyślnie 3100) |
| `npm run check` | Pełna weryfikacja: `lint` → `typecheck` → `test` → `build` → `test:integration` |
| `npm run db:migration:create` | Nowa migracja na podstawie różnic między encjami a schematem (`-- --blank`: pusta) |
| `npm run db:migration:up` / `db:migration:down` | Zastosowanie / cofnięcie migracji |
| `npm run db:migration:list` | Lista wykonanych migracji |
| `npm run db:status` | Czy baza z `DATABASE_URL` odpowiada i ile migracji czeka (JSON) |

## Testy i CI

**Testy jednostkowe** (Vitest 5) leżą obok kodu jako `*.test.ts(x)`. Każdy pakiet z `packages/*` to osobny projekt Vitest. Próg pokrycia wynosi 100% (instrukcje, gałęzie, funkcje, linie) dla każdego pliku. Poza progiem są tylko komponenty shadcn/ui (lista `SHADCN_COMPONENTS` w `vitest.config.ts`) i wygenerowane migracje.

**Testy integracyjne** (`tests/integration`) uruchamiają produkcyjny build aplikacji na tymczasowym PostgreSQL w kontenerze ([Testcontainers](https://testcontainers.com/)) i sprawdzają strony i przepływy (np. rejestrację) w prawdziwej przeglądarce przez [agent-browser](https://agent-browser.dev). Wymagają Dockera i jednorazowej instalacji Chrome:

```bash
npx agent-browser install        # Chrome for Testing (raz; albo npm run setup -- --with-browser)
npm run build
npm run test:integration
```

Log serwera z ostatniego przebiegu: `tests/integration/server.log`.

**CI** (GitHub Actions, `.github/workflows/ci.yml`) na każdym pull requeście i pushu na `main` uruchamia równolegle: lint, typecheck, testy jednostkowe z progiem pokrycia, build, testy integracyjne oraz dwukrotne `npm run setup` na świeżym checkoucie (drugie uruchomienie musi pominąć wszystkie kroki).

## Praca z agentami AI

Zasady dla agentów kodujących (stack, granice pakietów, konwencje, przepływ pracy) są w [`AGENTS.md`](AGENTS.md). Specyfikacje, lekcje i logi przebiegów znajdują się w katalogu `.ai/`.
