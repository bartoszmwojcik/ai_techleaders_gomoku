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
| Backend — panel administracyjny | `src/app/(backend)` | `/backend` (tylko poza produkcją, w produkcji `404` do czasu roli administratora) | shadcn/ui z `@gomoku/ui` |
| API | `src/app/api` | `/api/*` | — |

Dzięki osobnym root layoutom style frontendu i panelu się nie mieszają. Przejście między częściami przeładowuje całą stronę.

**Bramka panelu (#152):** do czasu roli administratora (E08) `/backend` odpowiada `404` w produkcji (`NODE_ENV=production`), a w `next dev` działa. Każdy `page.tsx`, `route.ts` i plik z `"use server"` w `(backend)` musi na początku wywołać `assertBackendEnabled()` z `@/server/backend-gate` (layout nie obejmuje route handlerów ani akcji); pilnuje tego `backend-gate.test.ts`. Komunikat błędu bazy trafia tylko do logu serwera.

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

Specyfikacja i kontrakt API: [`.ai/specs/implemented/2026-10-24-account-registration.md`](.ai/specs/implemented/2026-10-24-account-registration.md).

#### Logowanie, wylogowanie i strona konta

- **Strony:** `/login` (e-mail i hasło oraz link „Nie pamiętasz hasła?” do `/forgot-password`; parametr `?next=` jak przy rejestracji, a zalogowany wchodzący na `/login` trafia na `next`) oraz `/account` (nazwa gracza, e-mail i znacznik „Potwierdzony” / „Niepotwierdzony” przy e-mailu, baner potwierdzenia dla niepotwierdzonego adresu i przycisk „Wyloguj”). Strona `/` pokazuje zalogowanemu link „Konto”, przycisk „Wyloguj” i (dla niepotwierdzonego adresu) baner, a gościowi linki „Zaloguj się” i „Załóż konto”.
- **Endpointy:** `POST /api/auth/login` (`{ email, password }`; sukces `200` z ciasteczkiem sesji) i `POST /api/auth/logout` (`200` z `{ "ok": true, "data": null }`). Oba wymagają nagłówków CSRF opisanych wyżej.
- **Kody błędów** (pole `code` w kopercie błędu):

  | Kod | Status | Kiedy |
  | --- | --- | --- |
  | `INVALID_CREDENTIALS` | `401` | zły e-mail lub hasło; treść i czas odpowiedzi są takie same dla nieznanego konta (atrapowy hash), więc nie ujawniają istnienia konta |
  | `RATE_LIMITED` | `429` | przekroczony któryś limit prób; nagłówek `Retry-After`, ten sam komunikat dla wszystkich limitów |
  | `ALREADY_AUTHENTICATED` | `409` | klient ma już ważną sesję (ciasteczko z wygasłą lub nieznaną sesją nie przeszkadza i jest nadpisywane) |
  | `VALIDATION` | `400` | zły kształt danych (brak pola, nieprawidłowy e-mail, hasło dłuższe niż 1024 znaki); bez reguł hasła z rejestracji |

- **Zmiana hasła:** formularz „Zmień hasło” na `/account` (obecne hasło, nowe hasło co najmniej 8 znaków i różne od obecnego; wygasła sesja przenosi na `/login?next=%2Faccount`) wywołuje `POST /api/auth/password` (`{ currentPassword, newPassword }`, wymaga sesji i nagłówków CSRF). Odpowiedzi: `200`; `400` `INVALID_CURRENT_PASSWORD` (złe obecne hasło lub przegrany wyścig dwóch równoległych zmian, błąd przy polu `currentPassword`); `400` `VALIDATION` (słabe lub niezmienione nowe hasło); `401` `UNAUTHORIZED`; `429` `RATE_LIMITED` z `Retry-After`. Limit: 10 nieudanych prób na 15 minut na konto, udana zmiana go zeruje. Zmiana hasła i unieważnienie wszystkich innych sesji konta (bieżąca zostaje, także tych w trakcie partii) to jedna transakcja. Ta sama transakcja unieważnia też niewykorzystane linki resetu hasła konta (`invalidateResetTokens` usuwa je przez przekazany `em` transakcji), więc stary link z poczty przestaje działać. Specyfikacja: [`.ai/specs/implemented/2026-10-24-password-change.md`](.ai/specs/implemented/2026-10-24-password-change.md).
- **Limity prób logowania** (bez blokady konta): 30 prób na godzinę na adres klienta, 10 nieudanych na parę e-mail + adres w 15 minut i 100 nieudanych na sam e-mail w godzinę (przeciw atakowi z wielu adresów). Liczniki rosną przed sprawdzeniem hasła, więc równoległe próby nie omijają limitu; udane logowanie zeruje oba liczniki e-mailowe, a limit na adres zostaje. Właściciel konta, którego e-mail ktoś zgaduje z jednego adresu, loguje się normalnie z innego. Klucze limitów to skróty SHA-256 (w bazie nie ma e-maili ani adresów); wiersze sprząta czyszczenie wygasłych rekordów (#39).
- **Adres klienta** pochodzi z `CLIENT_IP_HEADER` według `TRUST_PROXY_HOPS` (IPv6 skrócony do /64). Źle ustawione `TRUST_PROXY_HOPS` psuje limity: za duże pozwala podszyć się pod adres, za małe wrzuca wszystkich pod adres proxy, więc jedna osoba wyczerpie limit całej aplikacji. W dev (bez `TRUST_PROXY_HOPS`) wszyscy współdzielą klucz `local`.
- **Ciasteczko sesji:** `httpOnly`, `SameSite=Lax`, `Path=/` (w produkcji `__Host-gomoku_session` z `Secure`). Każde logowanie tworzy nową sesję z nowym tokenem (brak session fixation). Wylogowanie unieważnia tylko bieżącą sesję w bazie (inne urządzenia zostają zalogowane) i usuwa ciasteczko; jest idempotentne, a przy niedostępnej bazie odpowiada `500`, ale ciasteczko i tak jest usuwane (przycisk „Wyloguj” traktuje wtedy `500` jak udane wylogowanie i przechodzi na `/`; błąd sieci pokazuje komunikat i pozwala ponowić). Wszystkie pozostałe sesje konta unieważnia zmiana hasła (#36), a wszystkie sesje konta (bez wyjątku) reset hasła (#35).
- **Strażnik sesji** (`packages/app/src/server/http/auth.ts`): `requireSession()` w route handlerach (bez sesji `401` przez `apiHandler`) i `requirePageSession(path)` na stronach (przekierowanie na `/login?next=<path>`). Obie zawodzą bezpiecznie: przy błędzie bazy nie ma sesji. Każda nowa chroniona trasa lub strona woła jedną z nich jako pierwszą.
- **Wylogowanie w trakcie partii (Q4):** `/account` i `/` przekazują do `LogoutButton` prop `hasActiveGame` z `gameParticipation.hasActiveGame(userId)` (po zamknięciu okna fokus wraca na przycisk „Wyloguj”); gdy jest `true`, przed wylogowaniem pojawia się potwierdzenie „Trwa partia — po wylogowaniu zegar biegnie dalej. Wylogować?”. `GameParticipation` czyta ją z bazy (partia `active` z aktywnym miejscem gracza).
- **Koszt hasha:** `PASSWORD_HASH_COST` (opis wyżej) dotyczy też logowania: nieznany e-mail jest weryfikowany względem atrapowego hasha o tym samym koszcie, żeby czas odpowiedzi nie zdradzał istnienia konta. W produkcji zostaw domyślne `12`.

Specyfikacja i kontrakt API: [`.ai/specs/implemented/2026-10-24-login-logout.md`](.ai/specs/implemented/2026-10-24-login-logout.md).

#### Potwierdzenie e-maila

Po rejestracji aplikacja wysyła wiadomość z linkiem `APP_ORIGIN/verify-email?token=…` (ważnym 24 godziny). Potwierdzenie niczego nie blokuje (BR-26): konto jest aktywne od rejestracji, a błąd wysyłki nie blokuje rejestracji ani gry (rejestracja dalej kończy się `201`, przyczyna trafia do logu). Wejście w link (GET) niczego nie zmienia (skanery poczty i podglądy linków otwierają adresy): strona pokazuje przycisk „Potwierdź e-mail”, a dopiero jego kliknięcie wysyła `POST /api/auth/email-verification/confirm` (`{ token, next? }`, nagłówki CSRF jak wyżej, sesja niewymagana; potwierdzenie nie loguje). Odpowiedź `200` ma `{ ok: true, data: { next } }`, gdzie `next` to bezpieczna ścieżka powrotu (`/` dla każdej innej). Strona `/verify-email` ma nagłówek `Referrer-Policy: no-referrer`, bo token jest w adresie.

- **Zmienne `EMAIL_*`** (`.env.example`): `EMAIL_TRANSPORT` (`file`: dopisuje wiadomości jako linie JSON do pliku; `brevo`: wysyłka przez Brevo; bez wartości wysyłka kończy się `EMAIL_SEND_FAILED`), `EMAIL_OUTBOX_PATH` (plik-skrzynka, ignorowany przez git), `EMAIL_FROM_NAME` (nazwa nadawcy, alias `EMAIL_FROM`), `EMAIL_FROM_ADDRESS` i `BREVO_API_KEY` (transport `brevo`), `EMAIL_DAILY_LIMIT` (globalny dzienny limit wysyłek; weryfikacja e-maila zużywa najwyżej 70%, zaokrąglone w dół, ale co najmniej 1 wysyłkę dziennie - przy `EMAIL_DAILY_LIMIT=1` weryfikacja nie jest blokowana; reset hasła ma osobną pulę. **Pule są niezależne:** weryfikacja używa najwyżej 70% limitu (licznik `email-daily:verification`), reset może użyć całości (licznik `email-daily:reset`), więc łączny dzienny wolumen może sięgnąć 170% `EMAIL_DAILY_LIMIT`. Jeśli limit odzwierciedla limit dostawcy poczty (#38), ustaw go tak, by 1,7 × wartość mieściło się w limicie dostawcy (czyli ≤ limit dostawcy / 1,7), bo inaczej dostawca zablokuje wysyłkę wcześniej niż aplikacja). Transport `file` w produkcji (`next start`) jest dozwolony tylko przy `APP_ORIGIN` zaczynającym się od `http://`. **Produkcja wymaga dostawcy poczty z #38** (Brevo, niżej): bez niego nikt nie potwierdzi e-maila, a wysyłka zwraca `502`.
- **Brevo (#38):** `EMAIL_TRANSPORT=brevo` wysyła przez API HTTPS (`POST https://api.brevo.com/v3/smtp/email`, port 443, bez nowej zależności). Wymaga `BREVO_API_KEY` (klucz z uprawnieniem tylko do wiadomości transakcyjnych), `EMAIL_FROM_ADDRESS` (jeden adres nadawcy zweryfikowany w Brevo) i opcjonalnie `EMAIL_FROM_NAME` (domyślnie „Gomoku”; starsza nazwa tego ustawienia to `EMAIL_FROM`). **Na VPS:** wpisz je do `.env.production` (klucz tylko tam, nigdy do repozytorium; `compose.prod.yaml` przekazuje je do kontenera) i zrestartuj stos (`docker compose --env-file .env.production -f compose.prod.yaml up -d`). Brak klucza lub nieprawidłowy adres nadawcy przy `brevo` nie przerywa startu: aplikacja loguje ostrzeżenie (bez wartości), a wysyłka zwraca `502 EMAIL_SEND_FAILED`, tak jak bez transportu; nieznana wartość `EMAIL_TRANSPORT` też nie przełącza się po cichu na `file`. Błąd Brevo, błąd sieci lub przekroczenie 10 s kończy się `502 EMAIL_SEND_FAILED`, a w logu jest tylko nazwa błędu i krótki kod (`BREVO_HTTP_<status>`, `BREVO_NETWORK`, `BREVO_TIMEOUT`, `BREVO_ABORTED`); klucz, adres ani treść wiadomości tam nie trafiają. **Limit:** darmowy plan Brevo to według cennika około 300 wiadomości dziennie (do potwierdzenia w aktualnym cenniku przed wdrożeniem). Ponieważ pule weryfikacji i resetu sumują się do 170% `EMAIL_DAILY_LIMIT`, ustaw `EMAIL_DAILY_LIMIT` na najwyżej 176. **Znane ograniczenie:** wysyłka z jednego zweryfikowanego adresu bez własnej domeny (bez SPF/DKIM na naszej domenie) może trafiać do spamu; baner w aplikacji radzi sprawdzić folder spam, dostarczalności nie mierzymy (A-03). Pełnej wysyłki do Brevo nie sprawdzono bez prawdziwego klucza: po wdrożeniu wyślij testową wiadomość na zewnętrzne konto.
- **Ponowne wysłanie:** `POST /api/auth/email-verification/resend` (bez treści; wymaga sesji i nagłówków CSRF) wysyła zalogowanemu graczowi z niepotwierdzonym adresem nowy link (prowadzi na `/`, bez `next`) i zwraca `200` z `{ "ok": true, "data": null }`. Kolejność kontroli: sesja (`401`), „już potwierdzony” (`409`), limity (`429`), dzienny limit wysyłek (`503`), wysyłka (`502`). Limity: 3 wysyłki na godzinę na konto i 10 na godzinę na adres klienta; liczniki rosną przed wysyłką i nie cofają się po jej błędzie. Starsze niewykorzystane linki tracą ważność dopiero po udanej wysyłce nowego, więc nieudana wysyłka zostawia poprzedni link ważny.
  - Limit adresu dotyczy adresu wspólnego (np. za NAT), więc osoby za nim mogą się wzajemnie blokować, a licznik konta rośnie także wtedy, gdy żądanie odrzuca limit adresu.
  - **Znane ryzyko (zaakceptowane do wyboru dostawcy w #38):** limit adresu (10/h) nie chroni dziennej puli `EMAIL_DAILY_LIMIT` przed zużyciem przez `resend` z jednego adresu (do 240 jednostek na dobę, wystarczy jedno konto). Przy małym limicie dziennym blokuje to potwierdzenia nowym graczom (`503`). Do rozważenia później: niższy budżet dzienny dla `resend` niż dla rejestracji albo limit dobowy na konto. Konto założone na cudzy niepotwierdzony adres może też wysłać do 72 wiadomości na dobę do tej skrzynki (limit 3/h na konto). Szczegóły: adnotacje przy Q4 i Q10 w [`.ai/specs/implemented/2026-10-24-email-verification.md`](.ai/specs/implemented/2026-10-24-email-verification.md).
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

Specyfikacja: [`.ai/specs/implemented/2026-10-24-email-verification.md`](.ai/specs/implemented/2026-10-24-email-verification.md).

#### Reset hasła

Gracz, który nie pamięta hasła, wchodzi z `/login` (link „Nie pamiętasz hasła?”) na `/forgot-password`, podaje e-mail i zawsze widzi ten sam komunikat („Jeśli konto z tym adresem istnieje i adres jest potwierdzony, wysłaliśmy link (ważny 1 godzinę). Sprawdź też folder spam.”). Link z wiadomości prowadzi na `/reset-password?token=…`. Obie strony są dynamiczne; `/reset-password` ma nagłówek `Referrer-Policy: no-referrer`, bo token jest w adresie, a samo wejście w link (GET) niczego nie zmienia: hasło ustawia dopiero wysłanie formularza. Zalogowany wchodzący na `/forgot-password` trafia na `/account` (tam zmienia hasło formularzem „Zmień hasło”).

- **Prośba:** `POST /api/auth/password-reset/request` (`{ email }`, nagłówki CSRF jak wyżej, sesja niewymagana) po walidacji i limicie adresu zawsze zwraca `200` z `{ "ok": true, "data": null }` (identycznie dla nieznanego, niepotwierdzonego i potwierdzonego konta oraz przy błędzie wysyłki). Cała praca zależna od konta (wyszukanie, zapis tokenu, wysyłka, unieważnienie starszych linków) dzieje się po odpowiedzi w `after()` z własnym zakresem żądania, więc czas odpowiedzi nie zdradza konta. Wiadomość dostaje tylko konto z **potwierdzonym** e-mailem (BR-27); dla niepotwierdzonego nic nie jest wysyłane. Błędy wysyłki i limity w `after()` są tylko logowane (klasa i kod błędu, bez adresu i tokenu).
- **Potwierdzenie:** `POST /api/auth/password-reset/confirm` (`{ token, newPassword }`; nowe hasło jak przy rejestracji: co najmniej 8 znaków, najwyżej 72 bajty). Link jest ważny 1 godzinę i jednorazowy (warunkowy `UPDATE`, więc z równoległych żądań przechodzi jedno). Skutki udanego `confirm` (jedna transakcja): nowe hasło, usunięcie **wszystkich** sesji konta (także tych w trakcie partii: zegar biegnie dalej), unieważnienie pozostałych linków resetu. Reset nie loguje: po sukcesie formularz pokazuje komunikat „Hasło zmienione” z linkiem „Zaloguj się” do `/login`, a `emailVerifiedAt` się nie zmienia.
- **Kody błędów** `confirm`: `INVALID_TOKEN` (`400`; token nieznany, użyty, wygasły lub unieważniony, komunikat „Link wygasł lub został już użyty.”, formularz pokazuje wtedy link „Wyślij nowy link”), `VALIDATION` (`400`; zły kształt danych, słabe hasło przy `fieldErrors.newPassword`), `RATE_LIMITED` (`429` z `Retry-After`), `FORBIDDEN` (`403`, brak nagłówków CSRF). `request` zwraca poza `200` tylko `VALIDATION`, `RATE_LIMITED` i `FORBIDDEN`.
- **Limity:** `request` 10 na godzinę na adres klienta (licznik rośnie przed walidacją, więc `400` też go zużywa) oraz 3 wiadomości na godzinę na skrót SHA-256 e-maila (liczone są próby wysyłki, także nieudane; po przekroczeniu nie wysyłamy nowej wiadomości, a poprzedni link zostaje ważny, odpowiedź dalej jest identyczna); `confirm` 10 prób na 15 minut na adres klienta. Reset ma osobną pulę dzienną `EMAIL_DAILY_LIMIT` (klucz `email-daily:reset`), niezależną od puli weryfikacji (`email-daily:verification`, najwyżej 70% limitu): reset może użyć całości, więc łączny dzienny wolumen obu pul może sięgnąć 170% `EMAIL_DAILY_LIMIT` - ustaw go na ≤ limit dostawcy / 1,7 (patrz opis `EMAIL_*` wyżej).
- **Ręczne sprawdzenie w dev:** konfiguracja skrzynki-pliku jak przy potwierdzeniu e-maila (`EMAIL_TRANSPORT=file`, `EMAIL_OUTBOX_PATH=/tmp/outbox.jsonl`). Konto musi mieć **potwierdzony** e-mail (najpierw potwierdź go linkiem z rejestracji). Wejdź na `/forgot-password`, podaj e-mail, a link wyciągnij z ostatniej linii pliku (wysyłka kończy się chwilę po odpowiedzi): `tail -n 1 /tmp/outbox.jsonl | jq -r .text`. Otwórz go, ustaw nowe hasło i zaloguj się nim na `/login`; stare hasło oraz poprzednie sesje przestają działać.
- **Wdrożenie:** jak przy potwierdzeniu e-maila, na produkcji (HTTPS) wiadomość wyśle dopiero dostawca poczty z #38; do tego czasu `request` dalej zwraca `200`, ale wiadomość nie dochodzi (błąd trafia do logu).

Specyfikacja: [`.ai/specs/implemented/2026-10-24-password-reset.md`](.ai/specs/implemented/2026-10-24-password-reset.md).

#### Usunięcie konta

Sekcja „Usuń konto” na `/account` (pod „Zmień hasło”, panel z czerwonym obramowaniem) usuwa konto od razu i na zawsze (BR-17, bez karencji i bez e-maila). Gracz podaje hasło w panelu, zaznacza „Rozumiem, że tego nie da się cofnąć” i potwierdza w oknie (fokus na „Zostaw konto”); po sukcesie strona przeładowuje się na `/?notice=account-deleted` z zamykalnym komunikatem „Konto zostało usunięte”.

- **Endpoint:** `POST /api/account/delete` (`{ "password": "…", "confirm": true }`, sesja i nagłówki CSRF jak wyżej; POST, a nie DELETE, bo proxy gubią treść DELETE). Kolejność kontroli: CSRF (`403`) → sesja (`401`) → walidacja (`400` `VALIDATION`, nie zużywa próby) → limit (`429` `RATE_LIMITED` z `Retry-After`) → hasło (`400` `INVALID_PASSWORD`, błąd przy polu `password`, bez licznika pozostałych prób) → blokada partii (`409` `ACTIVE_GAME`, „Najpierw dokończ albo poddaj partię.”, `data.gameId`) → `200`. Konto już usunięte (także przegrany wyścig dwóch usunięć) to `401`, a trasa kasuje wtedy ciasteczko sesji. Przy `500` nic nie jest usunięte i ciasteczko zostaje (można ponowić).
- **Limit:** 10 nieudanych prób (błędne hasło) na 15 minut i konto (`account-delete:user:{id}`). Każdy inny wynik poza błędnym hasłem oddaje próbę (`release`), sukces zeruje licznik.
- **Skutki dla danych:** wiersz `users` jest usuwany twardo; kaskadą znikają sesje (każda przeglądarka) i tokeny potwierdzenia e-maila oraz resetu hasła. Uczestnik partii zostaje z `user_id = NULL` i `kind = 'account'`, a przeciwnik widzi go jako „Usunięty gracz” (`displayName: null`); wynik, plansza i czas partii się nie zmieniają. Oczekująca partia konta (`waiting`) jest usuwana razem z zaproszeniem (link staje się „nieważny”). Oferta rewanżu `pending` z udziałem konta jest zamykana po cichu jako `declined`. Czat nie jest historią (wyjątek od BR-18/BR-24, BR-34): wiadomości wszystkich partii konta (także przeciwnika) są kasowane w tej samej transakcji, a przeciwnik, który zostaje, widzi czat jako niedostępny. Ciasteczko gościa tej przeglądarki jest nietknięte. Ponowna rejestracja tym samym e-mailem i nazwą jest dozwolona od razu.
- **Partia w toku (BR-21):** blokuje usunięcie. Przed sprawdzeniem serwis leniwie zamyka stare sloty konta (partia z wyczerpanym zegarem kończy się przegraną na czas, nieotwarta przez 15 minut zostaje anulowana), więc blokuje tylko partia naprawdę w toku. Strona pokazuje wtedy komunikat z linkiem „Przejdź do partii” i drogą wyjścia: „Poddaj partię” na stronie partii, potem odświeżenie `/account` (poddanie jest możliwe w każdej partii w toku, także przed pierwszym ruchem). Ten sam komunikat pojawia się, gdy partia ruszyła po załadowaniu strony (`409`).
- **Współbieżność:** `AccountService.delete` (`packages/app/src/server/services/auth/account-service.ts`) weryfikuje hasło przed transakcją, a w jednej transakcji (zapisy przez `tx`) blokuje wiersz użytkownika, potem jego otwarte partie rosnąco po `id` (kolejność `users → games → zapis`), odrzuca `active` przed jakimkolwiek zapisem, usuwa `waiting`, zamyka rewanże, kasuje czat partii konta i usuwa `users … where password_hash = <zweryfikowany>` (równoległa zmiana hasła kończy się `INVALID_PASSWORD` i cofnięciem wszystkiego). `GameService.create` blokuje wiersz użytkownika (`for no key update`) przed wstawieniem partii, żeby wyścig „utwórz partię ∥ usuń konto” nie zostawił partii-widma. Kolejność i zakleszczenia sprawdzają testy na dwóch połączeniach PostgreSQL (`tests/integration/account-delete-db.test.ts`).
- **Schemat:** jedna migracja, addytywna: indeks `game_players_user_id_index` (akcja `set null`, sprzątanie i historia nie skanują tabeli). Wycofanie: `drop index game_players_user_id_index`. Test-strażnik pilnuje, że każdy klucz obcy do `users` ma `cascade` albo `set null`.
- **Sprzątanie:** konto niepotwierdzone, bez żadnej partii, starsze niż 14 dni usuwa `npm run db:cleanup` ([Sprzątanie wygasłych rekordów](#sprzątanie-wygasłych-rekordów), reguła BR-28).
- **Ograniczenia:** brak eksportu danych i panelu administratora do usuwania kont; kopie zapasowe zawierają dane usuniętego konta poza czatem (rotacja ogranicza je do 5 ostatnich kopii, [Kopie zapasowe bazy](#kopie-zapasowe-bazy)). Punkt integracji z rewanżem (E02-S06, #88, osobny PR): UI rewanżu wobec uczestnika `kind = 'account'` z `user_id NULL` ma pokazywać wyłącznie „Rewanż niedostępny”, a serwer odrzucać nową ofertę i akceptację kodem `409` `REMATCH_UNAVAILABLE`; ten PR zamyka tylko oferty `pending` konta.

Testy: `account-service.test.ts`, `route.test.ts`, `delete-account-form.test.tsx` (jednostkowe), `account-delete-db.test.ts` (PostgreSQL), `account-delete-api.test.ts` (HTTP) i `account-delete-pages.test.ts` (przeglądarka). Specyfikacja: [`.ai/specs/implemented/2026-10-24-account-deletion.md`](.ai/specs/implemented/2026-10-24-account-deletion.md); prototyp: `prototypes/konta-i-role` (stany s05.10–s05.20, s04.14, s08).

#### Partia z zaproszenia

Zalogowany gracz tworzy partię na `/` (przycisk „Utwórz zaproszenie”), dostaje link `APP_ORIGIN/invite/ABCD-EFGH` i kod `ABCD-EFGH` (alfabet bez `0 O 1 I L`, wielkość liter i myślnik nie mają znaczenia), a przeciwnik dołącza z konta albo jako gość (bez konta, ciasteczko `gomoku_guest`, w produkcji `__Host-gomoku_guest`). Strony: `/` (tworzenie, wejście do własnej partii; dla niezalogowanego przycisk „Zagraj ze znajomym bez konta” i, gdy przeglądarka-gość ma partię oczekującą lub w toku, „Masz partię”), `/play` (p08, E02-S08: nick, ostrzeżenie i „Rozumiem, utwórz zaproszenie” — tworzenie partii bez konta; zalogowany widzi tylko odsyłacz na stronę główną), `/join` (wpisanie kodu), `/invite/[code]` (wszystkie stany zaproszenia), `/games/[gameId]` (oczekiwanie, plansza i koniec partii — patrz „Rozgrywka” niżej). Ekrany odwzorowują zatwierdzony prototyp etapu A (`prototypes/partia-z-zaproszenia/`) i mapę `lekcja-07/mapa-ekranow-partia.md`; komponenty z `@gomoku/ui/game/*`.

- **API** (nagłówki CSRF jak wyżej; odpowiedzi w kopercie `{ ok, data | error }`):

  | Żądanie | Sukces | Błędy |
  | --- | --- | --- |
  | `POST /api/games` (z sesją, bez ciała) | `201` `{ gameId, invitation: { code, url, expiresAt } }` | `409 ACTIVE_GAME_EXISTS` (BR-13), `429 RATE_LIMITED` (10 utworzeń na godzinę na użytkownika) |
  | `POST /api/games` **bez sesji** `{ acknowledgedGuestWarning: true, nickname?, cancelOwnWaitingGame? }` (E02-S08) | `201` jak wyżej + `Set-Cookie` gościa | `400` (brak `acknowledgedGuestWarning: true`; niepoprawny `nickname`; brak ciała), `409` (`ACTIVE_GAME_EXISTS`, `OWN_WAITING_GAME`; oba z `data.gameId`), `429` (10 utworzeń na godzinę na adres klienta), `500` (adres klienta nieustalony w produkcji: fail closed) |
  | `POST /api/invitations/{code}/accept` `{ as: "user" \| "guest", acknowledgedGuestWarning?, cancelOwnWaitingGame?, nickname? }` | `200` `{ gameId }` (gość dostaje token tylko w ciasteczku) | `400` (gość bez `acknowledgedGuestWarning: true`; niepoprawny `nickname`; `nickname` przy `as: "user"` — `fieldErrors.nickname`), `401`, `409` (`GUEST_NOT_ALLOWED`, `OWN_INVITATION`, `OWN_WAITING_GAME`, `ACTIVE_GAME_EXISTS`), `410 INVALID_INVITATION` (nieznany, użyty, wygasły, anulowany i źle zapisany kod: jedna odpowiedź), `429` |
  | `GET /api/games/{id}` (uczestnik) | `200` status, miejsca, kto otworzył stronę, dla twórcy oczekującej partii zaproszenie; po zakończeniu partii `finishedAt` (ISO; token gościa działa godzinę od tej chwili) oraz, gdy ktoś proponował, `rematch: { state: "pending" \| "accepted" \| "declined" \| "expired", offeredBySeat, expiresAt, gameId }` (brak pola = nikt nie proponował; `expired` liczone leniwie przy odczycie; `gameId` nowej partii po przyjęciu) | `404` dla obcego i nieistniejącej partii (jedna odpowiedź) |
  | `POST /api/games/{id}/cancel` (twórca: konto albo gość) | `200` | `404` (obcy, także bez sesji i ciasteczka), `409 GAME_NOT_CANCELLABLE` (przeciwnik zdążył dołączyć) |
  | `POST /api/games/{id}/rematch` (uczestnik zakończonej partii, konto lub gość) | `200` `{ state: "pending", offeredBySeat, expiresAt, gameId: null }` (propozycja ważna 5 min) | `403` (CSRF), `404`, `409 GAME_NOT_FINISHED` / `REMATCH_ALREADY_OFFERED` (otwarta lub przyjęta), `429` (10 propozycji na gracza na godzinę) |
  | `POST /api/games/{id}/rematch/accept` (przeciwnik proponującego) | `200` `{ gameId }` — nowa partia `active`, `origin = 'rematch'`, te same miejsca, kolory zamienione; gość dostaje token nowej partii w ciasteczku | `404`, `409` (`REMATCH_NOT_OFFERED`, `REMATCH_EXPIRED`, `REMATCH_UNAVAILABLE` — konto usunięte albo token gościa wygasł, `ACTIVE_GAME_EXISTS` z `data.gameId` własnej partii — BR-13 dla obu graczy; propozycja zostaje) |
  | `POST /api/games/{id}/rematch/decline` (każdy uczestnik: odrzucenie, wycofanie, wyjście do panelu) | `200` `null` (powtórzenie też `200`) | `404`, `409` (`REMATCH_NOT_OFFERED`, `REMATCH_EXPIRED`) |

- **Rewanż (backend, E02-S06):** propozycja żyje w wierszu zakończonej partii (`rematch_*`, bez nowej tabeli). Przyjęcie w jednej transakcji (blokada kont, potem partii; zapisy przez `tx`) sprawdza BR-13 dla obu kont i tworzy nową partię z odwróconymi kolorami (`rematchBlackSeat`), tymi samymi miejscami, bez zaproszenia, z pustym `seen_at` (zegar rusza, gdy obaj otworzą stronę; 15 min na otwarcie jak zawsze). Nick gościa jest kopiowany. **Token gościa w rewanżu:** jest wyprowadzany deterministycznie z tokenu starej partii i id nowej (`deriveRematchToken`) — gość przyjmujący dostaje go w ciasteczku od razu, a gość proponujący odbiera go przy najbliższym `GET` starej partii po przyjęciu (`RematchService.claimGuestSeat`, idempotentnie; baza zna tylko hash). Wygaśnięcie jest leniwe (bez crona).
- **Zaproszenie nic nie zużywa przy otwarciu** (Q12): `/invite/[code]` woła `InvitationService.preview`, a zużywa je dopiero przycisk. Nieudane wyszukania kodu (strona i `accept`) liczą się do wspólnej puli: 20 na adres klienta w 15 min albo 300 globalnie, gdy adres nie jest wiarygodny (Q13); po wyczerpaniu nawet poprawny kod dostaje `429`/„Zbyt wiele prób”. `preview` zamyka leniwie przeterminowane sloty widza (własną wygasłą oczekującą partię, partię nieotwartą w 15 min), tak samo jak `accept`, więc strona nie twierdzi „Masz partię” tam, gdzie dołączenie by się udało. Strona ma `Referrer-Policy: no-referrer` (`<meta name="referrer">`) i `noindex`.
- **Gość:** „Graj jako gość” pokazuje ostrzeżenie „Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii”, a dopiero „Rozumiem, graj jako gość” wysyła `accept`; przycisk jest wyłączony na czas żądania i żądanie idzie dokładnie raz (drugie dostałoby `410` i zużyło pulę). Zalogowany gracz nie widzi opcji gościa (`GUEST_NOT_ALLOWED`). Ostrzeżenie jest na stronie partii stale. **Nick gościa** (`nickname`, opcjonalny, E02-S07): normalizowany (NFC, znaki sterujące i formatujące usunięte, spacje zwinięte), 1–24 punkty kodowe (litery, cyfry, `_`, `-`, spacje); pusty = brak. `players[].displayName` w `GET /api/games/{id}` to nick gościa albo `Gracz {miejsce}` (wyliczane z miejsca, niezapisywane); `null` tylko dla usuniętego konta. **UI nicku:** na `/invite/[code]` po „Graj jako gość” jest pole „Twój nick (opcjonalnie)” z podpowiedzią „Zostaw puste, a będziesz „Gracz 2”” (przed przyciskiem „Rozumiem, graj jako gość”); nick jest sprawdzany w przeglądarce tym samym `nicknameSchema` z `@gomoku/core` (punkty kodowe, nie `maxLength`), błąd (też `400` z `fieldErrors.nickname`) pokazuje się w linii pola z fokusem, wartość zostaje. Sufiks „(gość)” dodaje warstwa UI z `players[].kind` (`PlayerLabel`, `lib/games/play.ts#playerNameOf`): długi nick jest obcinany wielokropkiem w jednej linii, „(gość)” zawsze widać, pełna etykieta jest w `title`; własna etykieta gościa to „Ty: {nick} (gość)”, konta „Ty (Ala_7)”. Zdanie „Gość nie ma nazwy ani historii” zastąpiono „Gość nie ma historii partii”. Test integracyjny: `tests/integration/game-guest-nickname-pages.test.ts`.
- **Gość tworzy partię (E02-S08):** UI: ekran `/play` (stany p08.1–p08.8: błąd nicku przy polu, tworzenie w toku z blokadą `useRef`, limit `429` z czasem, błąd serwera z ponowieniem, `409 ACTIVE_GAME_EXISTS` z linkiem, `409 OWN_WAITING_GAME` z „Anuluj i utwórz nową” za dialogiem „Anulować poprzednie zaproszenie?”, brak sieci); na `/games/[id]` gość-twórca ma Kartę kodu i stałe ostrzeżenie „Nie zmieniaj przeglądarki, bo stracisz dostęp do partii.”, przez 1 h po wygaśnięciu widzi „Zaproszenie wygasło” z przejściem na `/play`; strona zaproszenia nazywa twórcę „{nick} (gość)”, a gość-twórca oczekującej partii może ją anulować i dołączyć („Anuluj moją partię i dołącz”, `accept` z `as: guest` + `cancelOwnWaitingGame`). Scenariusze: `tests/integration/game-guest-create-pages.test.ts`. Backend: `POST /api/games` bez sesji (ciało `{ acknowledgedGuestWarning: true, nickname?, cancelOwnWaitingGame? }`; z sesją pola gościa są ignorowane i ciało nie jest czytane). Odpowiedź `201` ustawia ciasteczko gościa (`gomoku_guest`, w produkcji `__Host-gomoku_guest`; `httpOnly`, `SameSite=Lax`) z `Max-Age` do `expires_at` zaproszenia + 1 h (≤ 25 h); po dołączeniu przeciwnika i przy odczycie partii `active` ciasteczko ma 2 h (przesuwane przy każdym odczycie). Jedna przeglądarka = jeden token = jedno miejsce: nowa partia **przejmuje token już niesiony przez przeglądarkę** (zdejmuje go ze starych, zakończonych partii; ciasteczko mieści tylko jeden token), więc sprawdzenie BR-13 i wstawienie pod `pg_advisory_xact_lock(hashtext(token_hash))` widzi partię z równoległego żądania z tym samym ciasteczkiem (`409 OWN_WAITING_GAME`, albo z `cancelOwnWaitingGame: true` anulowanie i utworzenie nowej w jednej transakcji). Dwa równoległe żądania **bez** ciasteczka mają różne tokeny i dają dwie partie (druga nadpisuje ciasteczko; skalę ogranicza limit adresu). Limit: klucz `games-create-guest:ip:{sha256(adres)}`, 10 na godzinę; adres z `x-forwarded-for`/`CLIENT_IP_HEADER` jak przy limitach logowania (bez puli globalnej). Token twórcy działa także dla oczekującej partii i przez 1 h po wygaśnięciu niezużytego zaproszenia (strona pokazuje „Zaproszenie wygasło”, potem `404`); anulowanie przez twórcę lub zamknięcie rozpoczętej partii (15 min) unieważnia token od razu. Przegrana na czas przeglądarki-gościa jest rozstrzygana przed sprawdzeniem BR-13. `invitationService.preview` zwraca `creatorKind` (`account` | `guest`), a `creatorName` gościa to nick albo `Gracz 1`; `GameParticipation.currentGameOfGuest(tokenHash)` jest odczytem „masz partię” po tokenie (UI: zadanie 6.8). Scenariusze: `tests/integration/guest-slot.test.ts`, `guest-create.test.ts`, `game-guest-create-api.test.ts`.
- **Strona partii:** twórca czeka na przeciwnika (Karta kodu: link, kod, „Ważne do …”, Kopiuj, Udostępnij tylko tam, gdzie jest `navigator.share`, Anuluj z potwierdzeniem). Aplikacja odpytuje `GET /api/games/{id}` co 3 s, gdy partia czeka albo gdy któryś gracz jeszcze nie otworzył strony (Q6, Q20), i przechodzi przez „Przeciwnik dołączył” do planszy (gdy obaj otworzyli stronę; wcześniej „Czekamy na otwarcie partii”); po trzech nieudanych odpytywaniach pokazuje baner z „Sprawdź teraz”. Anulowanie wraca na `/` z komunikatem, a link staje się „nieważny”. Wygasłe zaproszenie (24 h) i partia nieotwarta w 15 min mają własne komunikaty. Obca lub nieistniejąca partia to `404` z jednym tekstem („Ta partia nie istnieje albo nie masz do niej dostępu”); strona nie ma `loading.tsx`, bo szkielet ładowania (p07.1) wymusiłby status `200` także dla `404`.
- **Odstępstwa od prototypu** (decyzje przy implementacji): brak nagłówka strony z prototypu (strony E01 też go nie mają, jest tylko przełącznik motywu); `/join` sprawdza tylko kształt kodu (limit prób pokazuje strona zaproszenia, nie `/join`; p02.3 i p02.4 to s07.8 i s07.9); nie ma ekranu „Partia gotowa” z przyciskiem „Przejdź do planszy” — gdy obaj otworzyli stronę, od razu widać planszę (kolory losuje serwer przy dołączeniu); „Ważne do” w strefie `Europe/Warsaw` (stałej, bez rozjazdu hydracji).
- **Ręczne sprawdzenie (curl)** po `npm run dev` na świeżej bazie (nie na bazie dev z danymi, której nie chcesz zaśmiecać): zakładasz dwa konta, tworzysz partię, dołączasz drugim, trzeci jest odrzucony, gość z ostrzeżeniem, anulowanie. Każde żądanie `POST` potrzebuje nagłówków `Origin: http://localhost:3000` i `X-Gomoku-Request: 1`:

  ```bash
  H=(-H 'Origin: http://localhost:3000' -H 'X-Gomoku-Request: 1' -H 'Content-Type: application/json')
  curl -s -c a.jar "${H[@]}" -d '{"email":"a@example.com","displayName":"Ala_7","password":"secret123"}' localhost:3000/api/auth/register
  curl -s -c b.jar "${H[@]}" -d '{"email":"b@example.com","displayName":"Kuba_P","password":"secret123"}' localhost:3000/api/auth/register
  curl -s -b a.jar "${H[@]}" -X POST localhost:3000/api/games          # gameId, code ABCD-EFGH
  curl -s -b b.jar "${H[@]}" -d '{"as":"user"}' localhost:3000/api/invitations/ABCD-EFGH/accept  # 200 { gameId }
  curl -s "${H[@]}" -d '{"as":"guest","acknowledgedGuestWarning":true}' localhost:3000/api/invitations/ABCD-EFGH/accept  # 410: kod już użyty
  curl -s -b a.jar localhost:3000/api/games/<gameId>                   # status active, seen obu graczy
  ```

  Gość: `-c g.jar` na `accept` z `{"as":"guest","acknowledgedGuestWarning":true}` i świeżym kodzie (bez `acknowledgedGuestWarning` to `400`), potem `curl -b g.jar …/api/games/<gameId>`. Strony: patrz lista kroków w `track-e02.md` (po fazie 2).
- **Testy:** jednostkowe obok kodu (serwisy, route'y, strony, komponenty), integracyjne `tests/integration/game-invitations-api.test.ts` (API, wyścigi) i `tests/integration/game-invitation-pages.test.ts` (przeglądarka: tworzenie, `/join`, gość, konto, anulowanie, BR-13, 404, limit).

Specyfikacja: [`.ai/specs/implemented/2026-10-24-game-invitations.md`](.ai/specs/implemented/2026-10-24-game-invitations.md).

#### Rozgrywka (plansza, ruchy, koniec partii)

`/games/[gameId]` w stanie `active` (obaj gracze otworzyli stronę) i `finished` pokazuje planszę 15×15 (`@gomoku/ui/game/board`, `role="grid"`, strzałki + Enter, roving `tabindex`). Ekrany wg zatwierdzonego prototypu etapu B (`prototypes/partia-z-zaproszenia/`, stany p05.1, p05.2, p05.4–p05.9, p05.11, p06.1, p06.2, p06.4, p06.5, p06.6) i mapy `lekcja-07/mapa-ekranow-partia.md`. Kod: `packages/app/src/components/games/play-field.tsx` (UI planszy i ruchów), `game-room.tsx` (odpytywanie i scalanie stanu), `packages/app/src/lib/games/play.ts` (czyste funkcje: scalanie `moves`, treści wyniku, etykiety).

- **Ruch:** mysz/klawiatura — jedno kliknięcie albo Enter wysyła ruch; ekran dotykowy (`pointer: coarse`) — dotknięcie zaznacza przecięcie (przerywany obrys kamienia), „Postaw kamień” albo drugie dotknięcie wysyła (#22 Q7). `POST /api/games/{id}/moves` z `{ x, y, moveNumber }`, gdzie `moveNumber = moveCount + 1` widzianego stanu; kamień pojawia się od razu („Wysyłanie ruchu…”), podwójne kliknięcie wysyła jedno żądanie (`useRef`).
- **Błędy ruchu:** `STALE_MOVE`, `NOT_YOUR_TURN`, `GAME_FINISHED`, `GAME_NOT_ACTIVE` — krótki komunikat i natychmiastowe odświeżenie planszy; `CELL_OCCUPIED` — „To pole jest już zajęte” i odświeżenie; błąd sieci (i każdy inny) — „Spróbuj ponownie” wysyła **ten sam** ruch z tym samym `moveNumber` (serwer odpowiada `200` na powtórkę, #22 Q4); `404` — „Ta partia nie istnieje…”.
- **Odpytywanie:** `GET /api/games/{id}?after=<liczba znanych ruchów>` co 2 s przez cały czas trwania partii `active`, także na własnym ruchu (zegar biegnie, a partia może skończyć się bez ruchu: przegrana na czas); wstrzymane w ukrytej karcie, po powrocie odczyt od razu; zatrzymane po `finished`. Trzy nieudane odczyty z rzędu — baner „Sprawdź teraz”. Odpowiedź starsza niż to, co klient już ma, nie cofa planszy (`mergeState`).
- **Zegar (#23, p05.1, p05.3, p06.3):** `clock` w odpowiedzi `GET`/`POST` to `{ remainingMs: [m1, m2], running: 1 | 2 | null, now }`, gdzie `now` to czas serwera (ms epoki) z chwili obliczenia — zmiana addytywna. Hook `useGameClock` (`components/games/use-game-clock.ts`) odlicza lokalnie między odczytami względem czasu **serwera** (przy każdej odpowiedzi mierzy offset `now` do monotonicznego `performance.now()`, więc zegar systemowy przeglądarki nie ma znaczenia); tyka tylko zegar gracza na ruchu (`running`), nie schodzi poniżej 0:00, po `finished` i przed startem stoi. Pierwszy render (też serwerowy) pokazuje wartości serwera bez odliczania, żeby HTML się zgadzał. Gdy lokalny zegar dojdzie do zera, hook raz na odpowiedź woła odczyt stanu (`onRefresh`): o przegranej decyduje wyłącznie serwer (`settleExpired` przy odczycie). `GameClock` (`components/games/game-clock.tsx`) opakowuje Zegar gracza z `@gomoku/ui/game/player-clock` (cyfry m:ss, słowo „Twój ruch”/„Ruch przeciwnika” i obrys gracza na ruchu). **Mało czasu** (poniżej 60 s, `isLow`): jaskrawy kolor cyfr i grubszy obrys (4 px, tokeny `--status-danger`, `--space-1`) **bez żadnego widocznego tekstu**, jak w prototypie (#23 Q1). **LUKA D04:** Zegar gracza nie ma wariantu bez tekstu, więc wariant to opakowanie `.low-clock[data-low]` w `frontend.css` (same tokeny); do czasu rozszerzenia komponentu w DS zostaje tak. Dla czytników ekranu wizualnie ukryty `role="status"` ogłasza **raz** „Zostało mniej niż minuta”, gdy własny zegar zejdzie poniżej progu (zatrzask: korekta czasu przez odczyt wokół progu nie powtarza ogłoszenia; zegara przeciwnika nie ogłasza). Koniec przez czas: baner „Przegrałeś — skończył się Twój czas” / „Wygrałeś — przeciwnikowi skończył się czas”, zegary zamrożone, plansza tylko do odczytu.
- **Koniec:** baner „Wygrałeś”/„Przegrałeś”/„Remis” (`role="status"`), linia wygrywająca z `winLine` (gruby obrys), plansza tylko do odczytu, „Wróć do panelu głównego”. Odświeżenie w trakcie i po końcu odtwarza planszę z `GET` (stan nie żyje w kliencie). Gość widzi stałe ostrzeżenie (p05.11) w trakcie gry; po końcu zamiast niego „Wynik zobaczysz w tej przeglądarce do 1 godziny po zakończeniu partii.” (p06.6).
- **Powrót po rozłączeniu (#24, p05.10, p06.5, p06.6, p06.7):** dostęp bez zmian po stronie serwera (`resolveParticipant`: konto z każdego urządzenia, gość tylko z przeglądarki z tokenem, `404` z innej przeglądarki i po 1 h od końca, konto bez limitu). Klient: `usePageVisibility` (`components/games/use-page-visibility.ts`) śledzi `visibilitychange` i mierzy nieobecność od ukrycia karty do powrotu; przy każdym powrocie `GameRoom` czyta stan od razu (bez czekania na cykl 2 s) i zegar odświeża się wartością serwera. Gdy nieobecność przekroczyła `RETURN_NOTICE_THRESHOLD_MS` (30 s, `core/src/games/return-notice.ts`, `shouldShowReturnNotice` — ściśle powyżej progu), po pierwszym udanym odczycie partii w toku pojawia się `role="status"` „Wróciłeś do partii. Twój zegar: m:ss.” (czas z serwera, ustalony w chwili pokazania, nie tyka); znika po następnym ruchu (dowolnego gracza) albo po 8 s (`RETURN_NOTICE_MS`). Gdy partia skończyła się w nieobecności, pokazuje się wynik (p06.3), bez komunikatu. Po odświeżeniu strony komunikatu nie ma (nieobecności nie da się zmierzyć). **Bez wskaźnika „przeciwnik rozłączony”** (#24 Q1): widać tylko zegar przeciwnika. Wejście na zakończoną partię (odświeżenie, drugie urządzenie) pokazuje wynik, planszę tylko do odczytu i zdanie „Powrót do zakończonej partii: wynik jest ten sam, ruch nie jest możliwy.” (p06.5); partia kończąca się na oczach gracza go nie pokazuje.
- **Poddanie — backend (E02-S05, #87):** `POST /api/games/{id}/resign` (bez ciała, CSRF jak `moves`; uczestnik: konto albo gość z tokenem) kończy partię `active` — także przed pierwszym ruchem i w turze przeciwnika: wygrywa drugi gracz, `endReason = resignation`, `finishedAt = now`, oba sloty `is_active = false` (BR-13) w jednej transakcji pod blokadą wiersza `games`. Odpowiedź ma kształt `GET /api/games/{id}` (`status: "finished"`, `result: { winnerSeat, reason: "resignation", winLine: null }`). Kody: `200` (także powtórzenie przez gracza, który się poddał), `404` (obcy, brak partii, gość bez tokenu), `409 GAME_FINISHED` (partia skończyła się inaczej, w tym przegraną na czas wykrytą pod blokadą, albo poddał się przeciwnik), `409 GAME_NOT_ACTIVE` (`waiting`/`cancelled` — tam jest anulowanie), `403` (CSRF). Wynik reguły: `resolveResignation` w `@gomoku/core`; migracji brak (`resignation` jest w `CHECK` od fazy 3). Test: `tests/integration/game-resign-api.test.ts`.
- **Poddanie — UI (E02-S05, #87):** pod planszą partii `active` (także przed pierwszym ruchem i w turze przeciwnika; nie w `waiting` ani po zakończeniu) jest przycisk „Poddaj partię”. Otwiera dialog „Czy na pewno chcesz się poddać? Przeciwnik wygra partię.” (`ConfirmDialog` z DS; fokus początkowy na „Wróć do gry”, Esc zamyka bez wysyłania). Potwierdzenie wysyła `POST /api/games/{id}/resign` z blokadą podwójnego kliknięcia (`useRef`); w trakcie przycisk pokazuje „Poddawanie…”, przy błędzie sieci lub serwera dialog zostaje z komunikatem i „Spróbuj ponownie” (ponowienie jest idempotentne, p05.14), przy `409 GAME_FINISHED`/`GAME_NOT_ACTIVE` dialog się zamyka, stan jest odświeżany i widać faktyczny wynik. Po sukcesie poddający widzi „Przegrałeś, poddałeś partię” (p06.9 z mapy: przegrana), a przeciwnik „Wygrałeś, przeciwnik poddał partię” (p06.8) — odpytywanie pokazuje to bez przeładowania; konto i gość tak samo. Stany: p05.13, p05.14, p06.8, p06.9. Testy: `play-field.test.tsx`, `tests/integration/game-resignation-pages.test.ts`.
- **Rewanż — UI (E02-S06, #88):** na ekranie wyniku zakończonej partii (każdy powód końca, konto i gość) jest blok „Rewanż” (`components/games/rematch-panel.tsx`, stany p06.10–p06.15 z prototypu): „Rewanż” (propozycja; podpowiedź, jakimi kolorami zagrasz), oczekiwanie z odliczaniem 5 min do `expiresAt` i „Wycofaj propozycję” (= `decline`), u przeciwnika „{nick} proponuje rewanż” z „Przyjmij” i „Odrzuć”, odrzucenie („Zaproszenie do rewanżu odrzucone” u proponującego, „Zaproponuj ponownie”), wygaśnięcie (po stronie klienta według `expiresAt` oraz z `state: expired` serwera) i przyjęcie — obaj przechodzą na `/games/{rematch.gameId}`, gdzie kolory są zamienione („Rewanż: kolory zostały zamienione. Grasz …”, `fromRematch` w `GET /api/games/{id}`). „Wróć do panelu głównego” przy otwartej propozycji wysyła `decline` (L21) i dopiero przechodzi na `/`. Zakończona partia jest odpytywana co 3 s, dopóki rewanż nie zostanie przyjęty — dzięki temu przeciwnik widzi propozycję bez przeładowania; po 3 min bez propozycji tempo spada do 12 s (wraca po powrocie na kartę, przy zmianie stanu rewanżu i przy otwartej ofercie), odczyt gościa kończy się 55 min po `finishedAt`, a błędy odczytu zakończonej partii nie pokazują baneru. Odliczanie oferty liczone jest względem `clock.now` serwera (zegar urządzenia nie ma znaczenia). Błędy: sieć/serwer z „Spróbuj ponownie”, `429 RATE_LIMITED` z czasem oczekiwania, `409 ACTIVE_GAME_EXISTS` (link do własnej partii tylko gdy serwer podał `data.gameId`), `REMATCH_UNAVAILABLE` (bez ponowienia), `REMATCH_EXPIRED`/`REMATCH_NOT_OFFERED` (odczyt stanu), `404` (bramka „Brak dostępu”). **Token gościa:** gość *proponujący* odbiera token nowej partii wyłącznie przez `GET /api/games/{stara}` po przyjęciu — odpytywanie jest tym odczytem; po przeładowaniu strony w stanie `accepted` (SSR nie ustawia ciasteczka) panel robi jeden `GET` starej partii przed nawigacją (przy błędzie „Spróbuj ponownie”, bez pętli). Gość *przyjmujący* dostaje ciasteczko w odpowiedzi `accept` i przechodzi od razu. Nowa partia pokazuje gościowi „Nowa partia ma nowy dostęp w tej przeglądarce” (p06.15). Znane odstępstwa od prototypu: serwer nie odróżnia wycofania od odrzucenia, więc po przeładowaniu proponujący, który wycofał ofertę, zobaczy ją jako odrzuconą; po odrzuceniu proponujący ma „Zaproponuj ponownie”. Testy: `rematch-panel.test.tsx`, `play-field.test.tsx`, `tests/integration/game-rematch-pages.test.ts`.
- **Co zostaje (punkty zaczepienia):** wskaźnik „karta w tle” (p05.12) — odpytywanie jest wstrzymane, komunikatu nie ma.
- **Odstępstwa od prototypu:** bez nagłówka strony; brak komunikatu „Karta w tle…” (nikt go w ukrytej karcie nie zobaczy); „Wróć do panelu głównego” to link do `/` (panelu głównego jeszcze nie ma); „Przeciwnik dołączył” → plansza bez pośredniego „Partia gotowa”. Luka DS D01 (zaznaczenie + „Postaw kamień”) odwzorowana jak w prototypie: `selected` z Planszy i zwykły Przycisk.
- **Testy:** jednostkowe `play-field.test.tsx`, `game-room.test.tsx`, `lib/games/play.test.ts`; integracyjne `tests/integration/game-reconnection-pages.test.ts` (powrót po >30 s i po 20 s, partia przegrana na czas w nieobecności, drugie urządzenie konta, gość: wynik, `404` z innej przeglądarki i po 1 h) oraz `tests/integration/game-play-pages.test.ts` (dwie przeglądarki: twórca z kontem i gość grają do piątki, ruch poza turą, odświeżenie w trakcie, linia wygrywająca, 360 px bez przewijania poziomego).

Specyfikacja: [`.ai/specs/implemented/2026-10-25-game-moves-win-detection.md`](.ai/specs/implemented/2026-10-25-game-moves-win-detection.md).

#### Lobby: status „szukam gry” (E03-S01, #25 i migracja #31)

Zalogowany użytkownik bez partii otwiera `/lobby` (link „Lobby” na stronie głównej; gość jest przekierowany na `/login?next=%2Flobby`), klika „Szukam przeciwnika” i przez **5 minut** (BR-12, `SEEKING_TTL_MS`) figuruje na liście innych szukających. Czas liczony od oznaczenia, **bez odnawiania**; ponowne kliknięcie w trakcie zwraca ten sam status. Lista pokazuje publiczną nazwę gracza, „szuka od …” i czas do wygaśnięcia, bez własnego wiersza i bez adresów e-mail; Status trzyma tabela `lobby_seekers` (jeden wiersz na konto, `ON DELETE CASCADE`); wygasanie jest leniwe (odczyt filtruje `expires_at > now`), a martwe wiersze sprząta `npm run db:cleanup` (klucz `lobbySeekers`).

| Metoda i ścieżka | Wynik | Błędy |
| --- | --- | --- |
| `GET /api/lobby` | `200` `{ me: null \| { id, createdAt, expiresInMs }, currentGame: null \| { gameId, status }, seekers: [{ id, displayName, sinceMs, expiresInMs }] }` (do 50 najstarszych statusów; czasy względne liczy serwer) | `401` |
| `PUT /api/lobby/seeking` (bez ciała, nagłówki CSRF) | `200` `{ me }` | `401`, `403`, `409 ACTIVE_GAME_EXISTS` (BR-13, `data.gameId`), `429` (30 oznaczeń na godzinę na użytkownika) |
| `DELETE /api/lobby/seeking` | `200` `{ me: null }` (także bez statusu) | `401`, `403` |

Status znika też, gdy użytkownik tworzy partię, przyjmuje zaproszenie lub rewanż (oba konta rewanżu) oraz przy wylogowaniu (w tej samej transakcji, co wejście do partii). Strona odpytuje `GET /api/lobby` co 3 s, tylko gdy karta jest widoczna, i odlicza czas lokalnie zegarem monotonicznym; po wygaśnięciu własnego statusu wraca przycisk i pojawia się „Status wygasł”. Ręcznie: `npm run dev`, dwie przeglądarki (lub okno prywatne) z dwoma kontami: A klika „Szukam przeciwnika”, B widzi A bez przeładowania; A „Wycofaj” — znika. Testy: `tests/integration/lobby-api.test.ts`, `lobby-pages.test.ts`, `cleanup.test.ts`. Specyfikacja: [`.ai/specs/implemented/2026-10-31-lobby-seeking-status.md`](.ai/specs/implemented/2026-10-31-lobby-seeking-status.md).


#### Lobby: wybór przeciwnika (E03-S02, #26)

Przy każdym wierszu listy jest przycisk „Zagraj” (potwierdzenie to jedno kliknięcie). `POST /api/lobby/seekers/{id}/pick` (`id` = `lobby_seekers.id`, bez ciała, nagłówki CSRF) w **jednej transakcji** blokuje oba konta (`users` rosnąco po `id`), usuwa status wybranego (`DELETE … WHERE expires_at > now RETURNING` to bramka wyścigu), usuwa własny status wybierającego i tworzy partię `origin = 'lobby'` (status `active`, wybierający na miejscu 1, kolor losowany, `seen_at` puste — zegar rusza, gdy obaj otworzą partię). Wybierający przechodzi na `/games/{id}`, wybrany dostaje przekierowanie z odpytywania `GET /api/lobby` (`currentGame` pojawia się po tym, jak strona go nie znała). Kilku wybierających tego samego szukającego daje dokładnie jedną partię.

| Endpoint | Sukces | Błędy |
| --- | --- | --- |
| `POST /api/lobby/seekers/{id}/pick` | `200` `{ gameId }` | `401`, `403`, `404` (`id` nie jest uuid), `409 ACTIVE_GAME_EXISTS` (BR-13, `data.gameId`), `409 LOBBY_SEEKER_TAKEN` (ktoś był szybszy, wycofał się albo wiersza już nie ma), `409 LOBBY_SEEKER_EXPIRED`, `409 CANNOT_PICK_SELF`, `429` (60 wyborów na godzinę, liczone także przy błędach) |

Testy: `tests/integration/lobby-api.test.ts` (wyścigi N wybierających, A↔B, wybór kontra `POST /api/games`, wygaśnięcie, BR-13, limit), `lobby-pages.test.ts` (przeglądarka). Specyfikacja: [`.ai/specs/implemented/2026-10-31-lobby-opponent-selection.md`](.ai/specs/implemented/2026-10-31-lobby-opponent-selection.md).

#### Agent dołącza do partii przez MCP (E06-S01, #127; decyzja D-29 i migracja #126)

Właściciel może zagrać z własnym agentem LLM (D-28). Człowiek tworzy partię prywatną jak dotąd (kod lub link) i przekazuje ją agentowi, a agent dołącza **przez MCP**, jako osobny typ uczestnika `agent` (BR-31): z własnym tokenem jednej partii, bez konta, ciasteczka, historii i bez możliwości tworzenia zaproszeń czy wchodzenia do lobby. Człowiek widzi go jako **„Agent”**, a gdy agent podał nazwę modelu — **„Agent · {nazwa} (deklarowane)”** (zwykły tekst, niezweryfikowany; w partii, na ekranie końca i w historii). Rewanżu z agentem nie ma (`409 REMATCH_UNAVAILABLE`, panel pokazuje podpowiedź). Nazwa konta „Agent” jest zastrzeżona przy rejestracji.

**Endpoint:** `POST /api/mcp` (Streamable HTTP, rewizja MCP 2026-07-28 oraz bezstanowa forma 2025; `GET` i `DELETE` → `405`). Serwer MCP to `@modelcontextprotocol/server` 2.x (`createMcpHandler`), tworzony na żądanie, bez sesji. Nie czyta ciasteczek ani sesji konta; żadna trasa REST nie rozpoznaje tokenu agenta. Podłączenie klienta: `claude mcp add --transport http gomoku https://<adres>/api/mcp`.

**Wskazówka dla człowieka (E06-S04, #140):** na ekranie oczekującej partii pod kartą zaproszenia jest zwinięty panel „Jak podłączyć agenta” (`@gomoku/ui/game/agent-connect-card`): adres serwera, gotowe polecenie `claude mcp add …` i kod z przyciskami kopiowania. Adres pochodzi z serwera (`APP_ORIGIN`): widok oczekującej partii ma addytywne pole `invitation.mcpUrl`. Panel nie zawiera sekretów (token agenta powstaje dopiero przy `join`).

| Narzędzie | Wejście | Wynik |
| --- | --- | --- |
| `join` | `code` (kod `ABCD-EFGH` albo link `…/invite/ABCD-EFGH`, do 64 znaków), opcjonalnie `agentName` (nazwa modelu: litery łacińskie, cyfry, spacja i `. - _ / : ( ) +`, do 40 znaków, bez adresów) | `structuredContent`: `{ token, gameId, you: { seat: 2, color }, status: "active", opponent: { kind: "account" \| "guest" } }`; **token tylko tu** (w bazie jest jego SHA-256), bez nicku, nazwy ani e-maila człowieka |
| `get_state` | `token`, opcjonalnie `waitSeconds` (0–25: czeka na Twoją turę albo koniec partii, a z `afterMessage` także na nową wiadomość przeciwnika; bez transakcji, pętla odczytów co 1 s), `afterMove` (ile ruchów już znasz) i `afterMessage` (`chatLastId` z poprzedniej odpowiedzi: dostajesz do 50 nowszych wiadomości; bez niego ostatnie 20) | `structuredContent`: `status`, `you`, `opponent` (tylko `kind`), `turn`, `nextMoveNumber`, `board` (15 wierszy, `.` `B` `W`), `moves`, `clock` (`youMs`, `opponentMs`, `runningSide`, `serverNow`), `result` (`win` / `loss` / `draw` z powodem i `winLine`), `retryAfterMs`; dodatkowo czat (E07-S04): `chat` (`[{ id, from: "opponent" \| "you", text, untrusted }]`, rosnąco), `chatLastId`, `chatStatus` (`open` / `disabled_by_opponent` / `unavailable` / `closed`), `chatNotice`; działa także po końcu partii (do końca ważności tokenu); bez nazw, e-maili, miejsc i czasów wiadomości |
| `play_move` | `token`, `x`, `y` (0–14), `moveNumber` (= `nextMoveNumber`) | stan jak z `get_state`; ten sam ruch ponowiony po utraconej odpowiedzi zwraca stan, nie błąd |
| `send_message` | `token`, `text` (zwykły tekst; te same reguły co w przeglądarce, limit długości `CHAT_AGENT_MAX_LENGTH`, odstęp `CHAT_AGENT_MIN_INTERVAL_MS`) | `{ message: { id, from: "you", text, untrusted: false }, retryAfterMs, chatStatus }`; nie czeka (zbyt szybka próba to od razu `RATE_LIMITED` z dokładnym `retryAfterMs`); ponowienie po utraconej odpowiedzi może dodać drugą wiadomość, więc najpierw sprawdź `get_state.chat`; agent nie ma narzędzia do zmiany ustawienia czatu |

Błąd narzędzia: `isError` i `structuredContent.error = { code, message, retryable, retryAfterMs? }`; kody: `INVALID_INPUT` (zły kształt albo niepoprawny `agentName` — bez echa wartości, kod zaproszenia pozostaje ważny), `INVALID_INVITATION` (jednolicie: nieznany, zużyty, wygasły, anulowany albo źle zapisany kod), `RATE_LIMITED`; `get_state`, `play_move` i `send_message` dodają `INVALID_TOKEN` (jednolicie: nieznany, wygasły albo obcy token), `ILLEGAL_MOVE` (`reason`: `cell_occupied` / `out_of_board`), `NOT_YOUR_TURN`, `STALE_MOVE`, `GAME_NOT_STARTED`, `GAME_NOT_ACTIVE`, `GAME_FINISHED`, `INTERNAL`, a `send_message` także `CHAT_DISABLED` (człowiek wyłączył czat), `CHAT_UNAVAILABLE` (partia nie trwa, minęła godzina po końcu albo konto przeciwnika usunięto) i `CHAT_FULL` (500 wiadomości); odrzucony tekst to `INVALID_INPUT` z `reason`: `empty`, `too_long`, `control_char`, `invisible_char`, `combining_run`, `url`, `not_text` albo `secret` (tekst zawiera token agenta lub ciąg ≥ 32 znaków `A-Za-z0-9_-`; nic nie jest zapisywane). **Błąd `play_move` nie zmienia partii ani zegarów**; jedyny wyjątek to upływ czasu strony na ruchu, który kończy partię przegraną na czasie (`GAME_FINISHED`). Zegar 10 minut biegnie także wtedy, gdy agent nie pyta. Poza narzędziem: `403` (inny `Origin`), `413` (ciało ponad 8 KB), `429` z `Retry-After` (adres), `503` (nieznany adres klienta w produkcji, fail-closed), `405`.

**Limity** (wartości początkowe bez danych, nadpisywane zmiennymi środowiskowymi, `.env.example`): żądania na adres `MCP_REQUEST_LIMIT` = 300 / min; udane dołączenia na adres `MCP_JOIN_LIMIT` = 10 / h; błędne kody agentów **w osobnej puli** `agent-lookup:*` (`MCP_LOOKUP_LIMIT` = 20 / 15 min na adres, `MCP_LOOKUP_GLOBAL_LIMIT` = 300 gdy adres niepewny); żądania na token `MCP_TOKEN_LIMIT` = 60 / min (`mcp-token:*`, liczone po rozpoznaniu tokenu); `send_message` ma **osobną pulę** `MCP_CHAT_LIMIT` = 30 / min na token (`mcp-chat:*`, liczy także odrzucone próby i nie zużywa 60/min), a limit adresu 300 / min jest wspólny dla całego endpointu — nie zużywają puli kodów przeglądarki (`invitation-lookup:*`). **Odpytywanie `get_state`:** limit 60 żądań na minutę na token oznacza, że pętla bez `waitSeconds` nie powinna pytać częściej niż co `retryAfterMs` (2000 ms); zalecany odstęp między odczytami to **≥ `retryAfterMs`**, a do czekania na ruch przeciwnika lepiej użyć `waitSeconds` (jedno żądanie na kilkadziesiąt sekund). Szybsze odpytywanie kończy się `RATE_LIMITED`. Token jest ważny jak token gościa: w trakcie partii i 1 godzinę po jej końcu (`db:cleanup` zeruje skrót); utrata odpowiedzi `join` oznacza dołączenie do nowej partii z nowym kodem. Logi nie zawierają tokenu, kodu ani nazwy modelu.

**Czat dla agenta i dane niezaufane (E07-S04, #149; A-09):** agent czyta czat w `get_state` i pisze `send_message` przez ten sam `ChatService` co przeglądarka (te same reguły tekstu i stan czatu, osobne limity `CHAT_AGENT_*`). Wiadomości człowieka są podpisane rolą (`opponent`), mają `untrusted: true`, a opisy narzędzi i stały `chatNotice` mówią modelowi, że to dane, a nie polecenia; `chatStatus` jest polem systemowym, którego treść wiadomości nie zmieni. Serwer dodatkowo nie ujawnia tokenu (odrzuca wysłanie go na czacie), nie daje agentowi narzędzia do zmiany ustawienia czatu ani innych o skutkach poza grą i czatem oraz nie loguje treści wiadomości. **Czego to nie gwarantuje:** żadna z tych barier nie sprawia, że model nie posłucha tekstu człowieka (OWASP LLM01); najgorszy możliwy skutek to ruch w tej partii wbrew woli właściciela albo niemądra wiadomość. Nie wpisuj na czacie tajnych danych. Testy: `tests/integration/agent-chat.test.ts`, `core/src/chat/agent-view.test.ts`. Specyfikacja: [`.ai/specs/implemented/2026-11-01-agent-chat-mcp.md`](.ai/specs/implemented/2026-11-01-agent-chat-mcp.md).

Ręcznie (`npm run dev`, PostgreSQL): utwórz partię i skopiuj kod, potem `curl -s -X POST localhost:3000/api/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"join","arguments":{"code":"ABCD-EFGH","agentName":"claude opus 5.5"}}}'` — strona partii pokaże „Agent dołączył do partii”. Testy: `agent-seat-service.test.ts`, `server/mcp/*.test.ts`, `tests/integration/agent-seat.test.ts`, `agent-join-api.test.ts`, `game-agent-pages.test.ts` (przeglądarka, 320 px), `game-schema.test.ts`, `cleanup.test.ts`. Specyfikacje: [`.ai/specs/implemented/2026-10-31-agent-joins-private-game.md`](.ai/specs/implemented/2026-10-31-agent-joins-private-game.md), [`.ai/specs/implemented/2026-10-31-mcp-agent-identity.md`](.ai/specs/implemented/2026-10-31-mcp-agent-identity.md). `get_state` i `play_move` to E06-S02 (#128).

#### Historia partii (E04-S01, #27)

Zalogowany użytkownik otwiera `/history` (przycisk „Historia” na stronie głównej; gość i wizytor są przekierowani na `/login?next=%2Fhistory`) i widzi **własne, zakończone** partie, od najnowszej: przeciwnika, wynik z jego punktu widzenia (Wygrana / Porażka / Remis), datę zakończenia (strefa `Europe/Warsaw`, CET/CEST) i sposób zakończenia (5 w linii, Koniec czasu, Poddanie, Plansza pełna). Przeciwnik-gość to „{nick} (gość)”, konto usunięte — „Usunięty gracz” (BR-17), a agent (E06-S01, BR-31) to „Agent” albo „Agent · {nazwa} (deklarowane)”, gdy podał nazwę swojego modelu (zwykły tekst, niezweryfikowany). Wiersz nie prowadzi do partii. To model odczytu nad `games` i `game_players`: bez nowej tabeli i bez migracji.

Lista ładuje się po 20 wierszy, paginacja kluczem (`finished_at`, `id`) bez duplikatów i luk; „Pokaż starsze” dokleja kolejne strony. Odczyt najpierw rozlicza partie przegrane na czas (`timeoutSettler.settleFor`), więc taka partia jest na liście, choć nikt jej nie otworzył; jej data to moment rozliczenia.

| Endpoint | Sukces | Błędy |
| --- | --- | --- |
| `GET /api/history?cursor=` | `200` `{ entries: [{ gameId, finishedAt, result: win\|loss\|draw, reason: five_in_row\|timeout\|resignation\|draw, opponent: { kind: account\|guest\|agent, name } }], nextCursor }` | `401` (brak sesji konta, także gość), `400` (niepoprawny `cursor`) |

Odpowiedź nie zawiera e-maila ani identyfikatora konta przeciwnika. Testy: `tests/integration/game-history-api.test.ts` (m.in. `EXPLAIN` na ~10 000 partii jednego konta), `game-history-pages.test.ts` (przeglądarka, 320 px). Specyfikacja: [`.ai/specs/implemented/2026-10-31-game-history.md`](.ai/specs/implemented/2026-10-31-game-history.md).

#### Czat w partii (E07-S01, #146)

Uczestnik partii `active` oraz `finished` (do 1 h po zakończeniu, także na ekranie wyniku) wysyła krótkie wiadomości i czyta wiadomości przeciwnika w panelu „Czat” pod planszą (`packages/app/src/components/chat/`, kompozycja komponentów `@gomoku/ui/game/*`). Partia `waiting` pokazuje tylko zdanie o dostępności po dołączeniu przeciwnika, `cancelled` nie ma panelu. Rewanż to nowa partia z pustym czatem i włączonym ustawieniem.

| Endpoint | Sukces | Błędy |
| --- | --- | --- |
| `GET /api/games/{id}/chat?after_id=&limit=` | `200` `{ state: open\|disabled_by_you\|disabled_by_opponent\|unavailable\|closed, messages: [{ id, seat, text, createdAt }], lastId, limits: { maxLength, minIntervalMs }, retryAfterMs? }`; bez `after_id` ostatnie 50 (maks. `limit` 100), z `after_id` tylko nowsze | `400` zły `after_id`/`limit` (także ponad zakres `integer`), `404` nie-uczestnik, nieistniejąca partia i wygasły token (jednolicie) |
| `POST /api/games/{id}/chat` `{ text, clientId }` | `201` `{ message, retryAfterMs }`; `200` dla powtórki tego samego `clientId` (bez duplikatu i bez zużycia limitu) | `400` z `fieldErrors.text` i `data.reason` (`empty`, `too_long`, `control_char`, `invisible_char`, `combining_run`, `url`, `not_text`; komunikat nie powtarza treści), `403` bez nagłówka CSRF, `404`, `409` `CHAT_UNAVAILABLE` (`waiting`, `cancelled`, po 1 h) / `CHAT_DISABLED` / `CHAT_FULL` (500 wiadomości), `429` `RATE_LIMITED` z `Retry-After` i `data.retryAfterMs` |

Reguły (`ChatService`, jeden serwis dla przeglądarki i, w S04, agenta): `id` wiadomości to jej numer w partii (1, 2, 3…), nadawany pod blokadą doradczą partii, więc kursor `after_id` niczego nie pomija; odstęp i okno 1 h liczy baza (`clock_timestamp()`), nie Node; wiadomość to jedna linia zwykłego tekstu 1–200 znaków **po NFKC** (zapisywana jest wersja znormalizowana), bez znaków sterujących, niewidocznych (bidi, zero-width, wypełniacze) ani adresów URL (heurystyka z krótką listą TLD, `CHAT_BLOCKED_TLDS`; obejść typu „example [kropka] com” nie wykrywa). Odpowiedź zawiera `seat`, nigdy konto, e-mail ani token; `Cache-Control: no-store`. Treść wyświetla się wyłącznie jako węzeł tekstowy Reacta. Gdy rozmówca wyłączył czat, widzisz dotychczasową rozmowę, ale nie możesz pisać (`CHAT_DISABLED`); wyłączający nie widzi rozmowy na czas wyłączenia. Każdy uczestnik (konto albo gość, nie agent) wyłącza i włącza czat tylko dla siebie przyciskiem „Wyłącz czat” / „Włącz czat” w nagłówku panelu (`PUT /api/games/[id]/chat/settings`, `ChatService.setEnabled` pod tą samą blokadą doradczą co zapis wiadomości; ustawienie jest per partia i nie jest nigdzie zapamiętywane, rewanż startuje z włączonym). Agent nie ma narzędzia do zmiany ustawienia (D-31). Wiadomości kasuje `db:cleanup` ok. 1 h po końcu partii (ostatecznie do ok. 2 h przy cronie co godzinę, [Sprzątanie](#sprzątanie-wygasłych-rekordów)) oraz usunięcie konta; partia, w której przeciwnik usunął konto, ma czat niedostępny (`unavailable`). Odczyt ukrywa treść po 1 h co do sekundy, kasowanie fizycznie usuwa ją najpóźniej w następnym przebiegu (to dwie warstwy jednego progu). Narzędzia agenta dojdą w S04 (#149).

Konfiguracja (`.env.example`, puste = wartości początkowe): `CHAT_MAX_LENGTH` (200) i `CHAT_MIN_INTERVAL_MS` (2000) dla ludzi, `CHAT_AGENT_MAX_LENGTH` i `CHAT_AGENT_MIN_INTERVAL_MS` dla agenta, `CHAT_MAX_MESSAGES_PER_GAME` (500). Treść wiadomości nie trafia do logów aplikacji: schematy nie echują wejścia, `apiHandler` loguje samą nazwę błędu, a `createOrmConfig` odmawia `DATABASE_DEBUG=true` w produkcji (debug ORM drukuje parametry zapytań).

**Wdrożenie (R1):** kasowanie (S03, #148) jest gotowe; produkcja wymaga jeszcze kroków operatora, wykonywanych na serwerze poza repozytorium (E07 wdrażamy zbiorczo na koniec epiku): wszystkie wywołania `pg_dump` z `--exclude-table-data=chat_messages`, rotacja 5 kopii, kontrola kopii (`pg_restore`) i kontrola crona `db:cleanup` (linia `exit=0` w `/var/log/gomoku-cleanup.log` z ostatniej godziny); awaria crona dłuższa niż 2 h oznacza, że obietnica BR-34 nie jest spełniona do czasu naprawy. Opis: [Kopie zapasowe bazy](#kopie-zapasowe-bazy). Przed udostępnieniem osobom z zewnątrz sprawdź też Q-11 (DSA, RODO) i uzupełnij stronę o przetwarzaniu danych. Migracja `down` kasuje wiadomości (są tymczasowe). Znane ryzyko A-08: bez zgłaszania i moderacji jedyną ochroną jest wyłączenie czatu, które działa dopiero po pierwszej wiadomości.

Testy: `packages/core/src/chat/*.test.ts` i `validators/chat/*.test.ts` (walidacja tabelaryczna), `chat-service.test.ts`, `chat/route.test.ts`, `components/chat/*.test.tsx`, integracyjne `tests/integration/chat-service.test.ts` (PostgreSQL: współbieżność, kursor, idempotencja, okno 1 h, kaskady) i `chat.test.ts` (dwie przeglądarki, API, log serwera); stories `Ekrany/Partia` (warianty „Czat”).

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

Aplikacja działa w kontenerach Docker na VPS mikr.us (plan z Dockerem, ≥ 2.1), a ruch HTTPS idzie przez darmową subdomenę mikr.us, bez własnej domeny (decyzja G1 w `.ai/specs/implemented/2026-10-24-account-registration.md`). Pliki: `Dockerfile`, `compose.prod.yaml`, `.env.production.example`.

```bash
git clone https://github.com/bartoszmwojcik/ai_techleaders_gomoku.git && cd ai_techleaders_gomoku
cp .env.production.example .env.production      # ustaw POSTGRES_PASSWORD (openssl rand -hex 24) i APP_ORIGIN
docker compose --env-file .env.production -f compose.prod.yaml up -d --build
domena gomoku.byst.re 3000                       # subdomena na porcie aplikacji (HTTPS automatycznie)
curl https://gomoku.byst.re/api/health           # {"status":"ok",...}
```

- **Mały RAM (`LOW_MEMORY=1`):** `docker compose ... up -d --build` na VPS z 2 GB RAM i jednym rdzeniem może paść w `next build` z komunikatem „Failed to type check.” (bez treści) albo `Next.js build worker exited ... SIGTERM`: Next uruchamia tylu workerów, ile procesorów widzi host, i kończy się pamięć. Ustaw w `.env.production` `LOW_MEMORY=1`: obraz buduje się wtedy z jednym workerem, a typy sprawdza osobny `tsc` przed buildem (nie są pomijane). Build trwa ok. minuty, a eksport obrazu (~2,5 GB) kolejne kilka minut; w tym czasie stara wersja działa. Nowa wersja zastępuje starą dopiero po udanym buildzie. Wycofanie: przed wdrożeniem `docker tag gomoku-app:latest gomoku-app:prev`, po awarii `docker tag gomoku-app:prev gomoku-app:latest && docker compose --env-file .env.production -f compose.prod.yaml up -d --no-build`.
- **Stos:** PostgreSQL 17 (nieopublikowany na zewnątrz, dane w woluminie `postgres-data`), jednorazowa migracja (`npm run db:migration:up`) i aplikacja. Aplikacja startuje dopiero po migracji i gotowej bazie; healthcheck wywołuje `/api/health`, który zwraca `503`, gdy baza nie odpowiada.
- **Sekrety:** `.env.production` leży tylko na serwerze (jest ignorowany przez git). Hasło bazy generuj poleceniem `openssl rand -hex 24` (heks jest bezpieczny w adresie `DATABASE_URL`).
- **IPv6:** subdomeny mikr.us wymagają, żeby usługa odpowiadała na IPv6. Aplikacja słucha w kontenerze na IPv4, a Docker publikuje port także na adresie IPv6 hosta; komenda `domena` sprawdza, czy port odpowiada, zanim utworzy subdomenę.
- **Aktualizacja:** `git pull`, potem to samo polecenie `docker compose … up -d --build` (migracje wykonują się przy każdym starcie).
- **Logi i stan:** `docker compose -f compose.prod.yaml logs -f app`, `docker compose -f compose.prod.yaml ps`.
- **Konta (`APP_ORIGIN`, `TRUST_PROXY_HOPS`, `CLIENT_IP_HEADER`):** `compose.prod.yaml` wymaga `APP_ORIGIN` i `TRUST_PROXY_HOPS` z `.env.production` (bez nich `docker compose` odmawia startu). Aplikacja w produkcji bez poprawnych wartości działa tylko częściowo: `/api/health` odpowiada, ale route'y domenowe (`/api/auth/*`) zwracają `500` (fail closed), a `/` pokazuje widok gościa. `APP_ORIGIN` to dokładny adres subdomeny z `https://` (np. `https://gomoku.byst.re`). `TRUST_PROXY_HOPS` to liczba proxy, które dopisują adres klienta do `CLIENT_IP_HEADER`; zła wartość pozwala podszyć się pod adres (za duża) albo wrzuca wszystkich pod adres proxy (za mała), więc po wdrożeniu sprawdź na serwerze, jaki adres trafia do nagłówka. Czy proxy mikr.us w ogóle go przekazuje, wyjaśnia spike #30 — jeśli nie, rejestracja zwraca `500` do czasu przejścia na Cloudflare (wtedy `CLIENT_IP_HEADER=cf-connecting-ip`). `SESSION_COOKIE_SECURE` w produkcji zostaw nieustawione.
- **Nasłuch na IPv6:** subdomena wymaga odpowiedzi na IPv6. Aplikacja w kontenerze słucha na `0.0.0.0` (IPv4), a Docker publikuje port także na adresie IPv6 hosta; jeśli publikacja IPv6 nie działa, uruchom aplikację z `-H ::` (nasłuch na obu stosach) albo włącz IPv6 w demonie Docker. Zawsze sprawdź `curl -6 https://<subdomena>/api/health`.
- **Kolejne zmienne:** `SMTP_*` (poczta, #38) dojdą z tą funkcją; produkcyjny start bez nich ma przerywać, zgodnie ze specyfikacją.
- **Czyszczenie wygasłych rekordów** (#39, BR-18): wpis `cron` na serwerze, opis w sekcji [Sprzątanie wygasłych rekordów](#sprzątanie-wygasłych-rekordów).
- **Kopie zapasowe:** procedura w podsekcji [Kopie zapasowe bazy](#kopie-zapasowe-bazy) poniżej (czat nie trafia do kopii).

### Kopie zapasowe bazy

Czat jest tymczasowy (BR-34), więc `pg_dump` pomija **dane** tabeli `chat_messages` (jej struktura w kopii zostaje, żeby odtworzenie bazy działało). Flaga `--exclude-table-data=chat_messages` musi być w **każdym** wywołaniu `pg_dump`; kopia bez niej trzyma treść rozmów do 5 kopii wstecz. Repozytorium nie zawiera skryptu kopii (to konfiguracja serwera), ale to samo polecenie sprawdza test integracyjny na PostgreSQL (`tests/integration/chat-cleanup.test.ts`, razem z kontrolą pozytywną: ten sam zrzut bez flagi zawiera wiadomość).

```bash
# Kopia (format własny, skompresowany); nazwę kontenera sprawdź przez `docker compose -f compose.prod.yaml ps`.
mkdir -p /var/backups/gomoku
docker exec gomoku_prod-postgres-1 pg_dump -U gomoku -Fc --exclude-table-data=chat_messages gomoku \
  > /var/backups/gomoku/gomoku-$(date +%F-%H%M).dump
# Rotacja: zostaje 5 ostatnich kopii.
ls -1t /var/backups/gomoku/*.dump | tail -n +6 | xargs -r rm --
```

Przykładowy wpis `cron` (`/etc/cron.d/gomoku-backup`, raz na dobę):

```cron
30 3 * * * root docker exec gomoku_prod-postgres-1 pg_dump -U gomoku -Fc --exclude-table-data=chat_messages gomoku > /var/backups/gomoku/gomoku-$(date +\%F-\%H\%M).dump && ls -1t /var/backups/gomoku/*.dump | tail -n +6 | xargs -r rm --
```

**Weryfikacja kopii** (po każdej zmianie polecenia): `pg_restore -l <plik> | grep chat_messages` pokazuje tabelę (struktura jest), a `pg_restore -a -t chat_messages -f - <plik> | grep -c '^COPY'` zwraca `0` (brak bloku z danymi; bez flagi byłby tu blok `COPY public.chat_messages` z treścią). Kopie sprzed dodania flagi, jeśli powstały po pierwszym wdrożeniu tabeli czatu, usuń. Kopie zapasowe hostingu i logi infrastruktury leżą poza obietnicą BR-34. Usunięte konto zostaje w starszych kopiach (poza czatem) do czasu rotacji.


## Motyw jasny/ciemny

Strony gracza (`(frontend)`) mają przełącznik motywu w prawym górnym rogu (wiersz nad treścią strony, na każdej stronie). Wybór zapisuje ciasteczko `gomoku_theme` (`dark` lub `light`, `Path=/`, `SameSite=Lax`, rok); serwer czyta je przy renderowaniu i ustawia `data-theme` na `<html>`. Bez poprawnego ciasteczka obowiązuje ustawienie systemu (`prefers-color-scheme`), a gdy system nie ma preferencji — motyw ciemny; mały skrypt w `<head>` ustawia motyw przed pierwszym malowaniem, więc strona nie migocze. Niepoprawna wartość ciasteczka jest ignorowana. Panel `/backend` ma własny motyw shadcn.

Ręczne sprawdzenie w dev: `npm run dev`, otwórz `/`, kliknij przełącznik („Ciemny motyw” przełącza na jasny i odwrotnie), odśwież stronę (wybór zostaje), usuń ciasteczko w narzędziach przeglądarki i zmień motyw systemu (lub emulację `prefers-color-scheme` w DevTools), odśwież — motyw podąża za systemem. Logika: `packages/core/src/theme/theme.ts`; scenariusze integracyjne: `tests/integration/theme-switch.test.ts`; przegląd ekranów: `.ai/analysis/2026-10-29-theme-review-e01.md`.

## Licznik zakończonych partii

Właściciel sprawdza, czy ktokolwiek gra z agentami (A-04), poleceniem **tylko do odczytu**; licznik jest trwały, bo `db:cleanup` usuwa partie gość–gość i gość–agent ok. godzinę po zakończeniu, więc zliczanie z `games` po fakcie zaniżałoby wynik. Gdy partia przechodzi w `finished` (pięć w linii, remis, upływ czasu także rozliczony leniwie, poddanie), **w tej samej transakcji** rośnie o 1 wiersz tabeli `game_pair_counters` (doba w `Europe/Warsaw` × para typów uczestników; bez odniesień do partii i kont, bez danych osobowych; błąd cofa partię i licznik razem). Funkcja `recordFinishedGame` (`packages/app/src/server/services/games/finished-game-counter.ts`) stoi we wszystkich ścieżkach; test strażnik `finished-game-counter.guard.test.ts` zawodzi, gdy nowy kod kończy partię bez niej.

```
npm run -s stats:games                                        # lokalnie, baza z DATABASE_URL
docker exec gomoku_prod-app-1 npm run -s stats:games          # produkcja (jak db:cleanup)
docker exec gomoku_prod-app-1 npm run -s stats:games | jq .
```

Wynik to jedna linia JSON: `timeZone`, `total`, `today`, `last7Days` (dziś i 6 poprzednich dób) oraz `pairs` (zawsze pięć par w stałej kolejności, także z zerem: `account-account`, `account-guest`, `account-agent`, `guest-guest`, `agent-guest`; potem ewentualne nieznane pary). Kod wyjścia `1` i komunikat bez sekretów na stderr, gdy baza nie odpowiada. Odczyt zapewnia `FinishedGameStatsService.finishedByPair()` (ta sama funkcja zasila polecenie i przyszły panel `/backend`, #158).

Jak czytać liczby i czego nie mówią:

- **„Agent” znaczy „dołączył przez MCP”** (`join_channel = 'mcp'`), a nie dowód, że po drugiej stronie jest model językowy. To pomiar kanału, bez oceny i bez progu „ma sens” (Q-06 pozostaje otwarte).
- **Backfill przy wdrożeniu:** migracja doliczyła zakończone partie obecne w `games`. Dla par z kontem wynik jest dokładny; gość–gość i gość–agent zakończone i sprzątnięte przed wdrożeniem są nieodzyskiwalne, więc te dwie pary są zaniżone do dnia wdrożenia. Partie zakończone starą wersją aplikacji między migracją a startem nowej (sekundy) nie wejdą do żadnej pary.
- **Partie porzucone** (gościnne, z upłyniętym zegarem, do których nikt nie wrócił w ciągu godziny) usuwa `db:cleanup` bez rozliczenia, więc nigdy nie były `finished` i nie liczą się.
- Usunięcie konta ani sprzątanie partii nie zmniejszają licznika. Rewanż to osobna partia i liczy się osobno.
- Cofnięcie migracji (`db:migration:down`) **kasuje** liczniki, których nie da się odtworzyć: przed nim zrób `pg_dump --data-only -t game_pair_counters`.
- Po wycofaniu aplikacji do starej wersji (z nową tabelą) licznik przestaje rosnąć, bez awarii; ponowne wdrożenie wznawia zliczanie z luką.

Testy: `finished-game-counter*.test.ts`, `finished-game-stats-service.test.ts`, `packages/db/src/stats/*.test.ts`, `packages/core/src/games/finished-stats.test.ts`, integracyjne `finished-game-counter.test.ts` (każda ścieżka × każda para, wyścigi, rollback, cleanup, doba, polecenie) i `game-pair-counters-migration.test.ts` (backfill, up/down). Specyfikacja: [`.ai/specs/implemented/2026-10-31-finished-games-pair-counter.md`](.ai/specs/implemented/2026-10-31-finished-games-pair-counter.md).

## Sprzątanie wygasłych rekordów

Wygasłe sesje, liczniki limitów i tokeny nie wpływają na poprawność (są filtrowane przy odczycie), ale tabele rosną, więc BR-18 wymaga ich usuwania bez udziału człowieka. Robi to komenda `npm run db:cleanup` (`packages/db/src/cleanup`), uruchamiana z `cron` na serwerze, a nie przez proces aplikacji.

**Co usuwa** (progi liczone od chwili uruchomienia; wiersz dokładnie na progu zostaje):

| Tabela | Usuwane, gdy |
| --- | --- |
| `sessions` | `expires_at` starsze niż 1 godzina (margines na partię trwającą po wygaśnięciu sesji) |
| `rate_limit_buckets` | `window_start` starsze niż 48 godzin (najdłuższe okno limitu to 24 godziny — dzienne pule `email-daily:*`; drugie 24 godziny to zapas na rozjazd zegara bazy, którym liczy limiter, i zegara Node, którym liczy sprzątanie) |
| `email_verification_tokens` | `expires_at` **lub** `used_at` starsze niż 24 godziny |
| `password_reset_tokens` | `expires_at` **lub** `used_at` starsze niż 24 godziny |
| `lobby_seekers` | `expires_at` starsze niż 1 godzina (status „szukam gry” żyje 5 minut, odczyt filtruje wygasłe, więc godzina to tylko margines na rozjazd zegarów) |
| `chat_messages` | wiadomości czatu partii `finished` (`finished_at`), `cancelled` (`created_at`) lub `active` z wygasłym zegarem (ten sam wzór co reguła partii gościnnych), starsze niż 1 godzina, **także gdy partia zostaje jako historia konta** (BR-34); reguła stoi przed regułami usuwającymi partie, a ten sam próg co tokeny gościa i agenta sprawia, że dostęp i treść znikają w jednym przebiegu |
| `games` (`waiting`) | zaproszenie wygasło ponad 1 godzinę temu (okno 1 h, w którym twórca-gość widzi „Zaproszenie wygasło”; uczestnicy i zaproszenie znikają razem z partią, `on delete cascade`) |
| `games` (`cancelled`) | `created_at` starsze niż 25 godzin (24 godziny życia zaproszenia + to samo okno 1 h dla niedołączonej wygasłej partii; razem z uczestnikami i zaproszeniem) |
| `games` (`active`, tylko goście) | partia bez uczestnika-konta (goście i agent; partia gość–agent znika jak gość–gość, konto–agent zostaje jako historia), w której zegar gracza na ruchu wygasł (a gdy zegar nie ruszył — 15 minut od `started_at`) ponad 1 godzinę temu; wynik nie jest zapisywany, usuwany jest wiersz (razem z uczestnikami i zaproszeniem) |
| `games` (`finished`, tylko goście) | partia bez uczestnika-konta zakończona ponad 1 godzinę temu (partie z choć jednym kontem, także usuniętym, to historia i zostają) |
| `game_players.guest_token_hash` | partia `finished` ponad 1 godzinę temu: hash tokenu jest zerowany (wiersz zostaje, token i tak nie działa po godzinie) |
| `game_players.agent_token_hash` | to samo dla tokenu agenta (E06-S01): zerowany 1 godzinę po zakończeniu partii; wiersz i deklarowana nazwa modelu zostają z partią konta |
| `users` | e-mail niepotwierdzony, `created_at` starsze niż 14 dni i brak jakiegokolwiek wiersza w `game_players` (BR-28; także partia `cancelled` blokuje, dopóki reguły partii jej nie usuną; sesje i tokeny znikają kaskadą). Reguła jest ostatnia, więc konto, któremu ten sam przebieg zabrał ostatnią partię, odpada od razu |

Potwierdzone konta usuwa tylko ich właściciel ([Usunięcie konta](#usunięcie-konta)). Usuwanie idzie partiami po 1000 wierszy (krótkie transakcje, `for update skip locked`). Każda reguła ma własny budżet 15 sekund (wolna reguła nie zagłodzi następnych; najgorszy przebieg to 13 reguł × 15 s = 195 s, czyli mieści się w godzinnym odstępie `cron`); po jego upływie reguła przerywa, a resztę zabierze następny przebieg (`truncated: true`). Dwa przebiegi naraz są bezpieczne.

**Wynik i kody wyjścia.** Jedna linia JSON na stdout: liczba usuniętych wierszy na regułę (przy błędzie reguły — liczba usuniętych do chwili błędu), `null` (tylko reguła oznaczona jako opcjonalna, gdy jej tabeli brak; dziś żadna nie jest), `errors` (reguły, które zgłosiły błąd) i `truncated`:

```json
{"sessions":3,"rateLimitBuckets":0,"emailVerificationTokens":1,"passwordResetTokens":0,"lobbySeekers":0,"chatMessages":0,"waitingGames":0,"cancelledGames":0,"guestOnlyActiveGames":0,"guestOnlyFinishedGames":0,"guestTokens":0,"agentTokens":0,"unverifiedUsers":0,"errors":[],"truncated":false}
```

Błąd jednej reguły (w tym brak tabeli, np. nieuruchomione migracje) nie przerywa pozostałych: linia JSON z postępem nadal trafia na stdout, a w `errors` jest `{"rule":"sessions","code":"42P01"}` (nazwa reguły i kod SQL lub nazwa klasy błędu — bez komunikatu, który mógłby zawierać dane). Wtedy kod wyjścia to `1`, a na stderr jest `{"ok":false,"errors":[…]}`. Kod `1` i `{"ok":false,"error":"…"}` (zamaskowane hasło w adresie bazy) także przy innej awarii całego przebiegu. Kod `0` oznacza brak błędów (`truncated: true` to nie błąd). Następny przebieg `cron` spróbuje ponownie. Komenda nigdy nie tworzy brakującej bazy.

> **Uwaga:** na bazie deweloperskiej `npm run db:cleanup` naprawdę kasuje wygasłe dane z bazy z `DATABASE_URL` (pliki `.env*`). Przed uruchomieniem sprawdź, na jaką bazę wskazuje. Testy integracyjne sprawdzają komendę wyłącznie na bazie z Testcontainers.

**Cron na mikr.us.** Obraz produkcyjny zawiera `tsx` i kod pakietu `db` (zależności nie są czyszczone), a `DATABASE_URL` jest w środowisku kontenera, więc komenda działa przez `docker exec`. Na serwerze (nie w repozytorium) utwórz osobny plik `/etc/cron.d/gomoku-cleanup`:

```cron
# Co godzinę; flock -n pomija przebieg, gdy poprzedni jeszcze trwa. Wynik, błędy (kod 1) i czas lądują w logu.
0 * * * * root flock -n /tmp/gomoku-cleanup.lock sh -c 'docker exec gomoku_prod-app-1 npm run -s db:cleanup; echo "$(date -Is) exit=$?"' >> /var/log/gomoku-cleanup.log 2>&1
```

`flock -n` przy zajętym locku kończy się cicho (bez wpisu w logu — przebieg jest po prostu pominięty). To optymalizacja, nie wymóg poprawności: dwa przebiegi naraz są bezpieczne dzięki `skip locked`. Linia `<data> exit=<kod>` po każdym przebiegu pozwala ocenić, kiedy ostatnio się udał. Log rośnie, więc dodaj rotację, np. `/etc/logrotate.d/gomoku-cleanup`:

```
/var/log/gomoku-cleanup.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    copytruncate
}
```

Nazwę kontenera sprawdź przez `docker compose -f compose.prod.yaml ps` (przy `name: gomoku_prod` to zwykle `gomoku_prod-app-1`). Kontrola: `docker exec gomoku_prod-app-1 npm run -s db:cleanup; echo $?` oraz `tail /var/log/gomoku-cleanup.log`. Rollback: usunięcie pliku `/etc/cron.d/gomoku-cleanup`.

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
| `npm run smoke` | Uruchamia zbudowaną aplikację i sprawdza `/`, `/backend` (oczekuje `404`), `/api/health` (z bazą) i 404; port: `SMOKE_PORT` (domyślnie 3100) |
| `npm run check` | Pełna weryfikacja: `lint` → `typecheck` → `test` → `build` → `test:integration` |
| `npm run db:migration:create` | Nowa migracja na podstawie różnic między encjami a schematem (`-- --blank`: pusta) |
| `npm run db:migration:up` / `db:migration:down` | Zastosowanie / cofnięcie migracji |
| `npm run db:migration:list` | Lista wykonanych migracji |
| `npm run db:status` | Czy baza z `DATABASE_URL` odpowiada i ile migracji czeka (JSON) |
| `npm run stats:games` | Licznik zakończonych partii wg pary typów uczestników (JSON, **tylko odczyt**; w produkcji przez `docker exec`, zob. [Licznik zakończonych partii](#licznik-zakończonych-partii)) |
| `npm run db:cleanup` | Usuwa wygasłe sesje, liczniki limitów, tokeny i nieodebrane partie z bazy z `DATABASE_URL` (JSON z liczbami; **kasuje dane**, zob. [Sprzątanie](#sprzątanie-wygasłych-rekordów)) |

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
