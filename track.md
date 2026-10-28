# Śledzenie implementacji Epiku 01 (konta)

- Start: 2026-10-27. Gałąź robocza: `feat/e01-konta` (z `main`).
- Źródła: specyfikacje `.ai/specs/2026-10-24-{account-registration,login-logout,email-verification,email-provider,password-reset,password-change,account-deletion,expired-records-cleanup}.md` oraz zmiany z `2026-10-26-account-onboarding-simplification.md` (hasło ≥ 8 znaków, konto aktywne od razu, potwierdzenie e-maila nieblokujące, reset tylko po potwierdzeniu, kasowanie niepotwierdzonych po 14 dniach). Prototyp UI: `prototypes/konta-i-role/`, mapa: `lekcja-07/mapa-ekranow.md`.
- Zasady pracy: jedno zadanie = jeden subagent = jeden commit (z odhaczeniem w tym pliku). Każde zadanie: testy jednostkowe 100% (`npm test`), `npm run lint`, `npm run typecheck`; zmiany w `packages/db` sprawdzone na prawdziwym PostgreSQL (up/down/up). Po każdej fazie: lista kroków do ręcznego sprawdzenia i zatrzymanie na Twoje „dalej”.
- Legenda: `[ ]` do zrobienia, `[x]` wykonane, `[!]` zablokowane.

## Wymagania wstępne (środowisko)

- [x] W-1 PostgreSQL do migracji i testów: Docker Desktop uruchomiony, `docker compose up -d` (postgres:17 na `localhost:5432`, `.env.local` z `DATABASE_URL`).

## Faza 1 — Konto i sesja przez API (#19, PR A: kroki 1–7, razem z #28)

Ręczny test po fazie: `curl` (z nagłówkami `Origin` i `X-Gomoku-Request`) na `POST /api/auth/register`: 201 z ciasteczkiem, 409 dla duplikatu, 400 z `fieldErrors`, 403 bez nagłówków, 429 po przekroczeniu limitu.

- [x] 1.1 Błędy i koperta API (`core/src/http/errors.ts`, `api-result.ts`)
- [x] 1.2 Walidacja rejestracji (`zod`, `registerSchema`, normalizacja e-maila i nazwy, zastrzeżone nazwy, hasło 8–72 bajty)
- [x] 1.3 Encje i migracja: `users`, `sessions`, `rate_limit_buckets` (#28), up/down/up
- [x] 1.4 `PasswordHasher` (bcryptjs, asynchroniczny, koszt wstrzykiwany)
- [x] 1.5 `opaque-token`, `SessionService`, `RateLimiter`, `clientKey`
- [x] 1.6 `UserService.register`, `apiHandler`, CSRF (`Origin` + `X-Gomoku-Request`)
- [x] 1.7 Route `POST /api/auth/register` + testy integracyjne

## Faza 2 — Formularz rejestracji i stan zalogowania (#19, PR B: kroki 8–10)

Ręczny test po fazie: `npm run dev` → `/register`: rejestracja, przekierowanie na `/`, widoczne „Zalogowano jako …”, błędy pól, telefon 360 px.

- [x] 2.1 `apiCall` i `safeNextPath`
- [x] 2.2 Komponenty formularza (`FormField`, `SubmitButton`, `ErrorMessage`, jsdom + Testing Library)
- [x] 2.3 Strona `/register`, `/` ze stanem zalogowania, dokumentacja (README, standardy)
- [x] 2.4 Poprawki po code review Fazy 2 (M1 CI `docker` + krok curl, M2 martwe linki `/login`, M3 podpis o wysyłce, L1 log w `getCurrentUser`, L3 fokus po błędzie, L4 cel dotykowy linku, L6 `.env.production.example`)

## Faza 3 — Logowanie (#20, kroki 1–5)

Ręczny test po fazie: `/login` (poprawne dane, złe hasło ten sam komunikat, `?next=`, limit prób, „Pokaż hasło”).

- [x] 3.1 `RateLimiter.hit` i `reset`
- [x] 3.2 `normalizeEmail`, `loginSchema`
- [x] 3.3 Atrapowy hash i `UserService.authenticate`
- [x] 3.4 Route `POST /api/auth/login`
- [x] 3.5 `PasswordField`, strona `/login` (przywrócić linki do `/login` w `register-form`: komunikat przy `CONFLICT` i „Masz już konto? Zaloguj się”, usunięte w 2.4)
- [x] 3.6 Poprawki po code review Fazy 3 (M1 testy integracyjne limitów 100/e-mail i 30/adres + równoległe próby, M2 kolejność w route: limit adresu przed sesją i 409, L1 czyszczenie hasła tylko przy INVALID_CREDENTIALS, L2 autocomplete="email", L4 log bez PII, L5 dummyHash: obsługa odrzucenia i notatka o zmianie kosztu)

## Faza 4 — Wylogowanie, strażnik sesji i konto (#20, kroki 6–8)

Ręczny test po fazie: wylogowanie, `/account` bez sesji przekierowuje na `/login?next=…`, linki na `/`.

- [x] 4.1 `SessionService.revoke` i `POST /api/auth/logout`
- [x] 4.2 `requireSession` / `requirePageSession`, `activeGameCheck`, `/account`, `LogoutButton`, linki na `/`
- [x] 4.3 Dokumentacja (README: logowanie, limity)
- [x] 4.4 Poprawki po code review Fazy 4 (M1 README bez „stanu potwierdzenia”, M2 przycisk „Wyloguj” na `/` zostaje: dopisać do specyfikacji i prototypu, jeden scope dla użytkownika i `hasActiveGame`, M3 fokus po zamknięciu `ConfirmDialog`, L1 500 przy wylogowaniu traktowane jak wylogowanie lokalne, L4 zmiana nazwy `activeGameCheck`, L5 `requirePageSession` przez `safeNextPath`/komentarz)

## Faza 5 — Zmiana hasła (#36)

Ręczny test po fazie: `/account` → zmiana hasła; stare hasło nie loguje; druga sesja wylogowana.

- [x] 5.1 `passwordChangeSchema` (+ `newPasswordSchema`)
- [x] 5.2 `UserService.changePassword`, `SessionService.revokeOthers`
- [x] 5.3 Route `POST /api/auth/password`
- [x] 5.4 Formularz na `/account`
- [x] 5.5 Poprawki po code review Fazy 5 (C1 atomowość: zapisy w `em.transactional` przez przekazany `tx` w `changePassword` ORAZ w `register`, `revokeOthers` i `invalidateResetTokens` przyjmują `em`, test na PostgreSQL wymuszonej awarii; M1 obsługa 401 w formularzu; M2 sygnatura `invalidateResetTokens(userId, em)` + test kontraktu; L1 testy równoległych zmian; L5 README; L6 a11y statusu; lekcja o `em.transactional`)

## Faza 6 — Potwierdzenie e-maila (#34, Faza 1: kroki 1–5; port poczty z #38)

Ręczny test po fazie: rejestracja → plik-skrzynka (`EMAIL_TRANSPORT=file`) → link → `/verify-email` potwierdza adres.

- [x] 6.1 Encja i migracja `email_verification_tokens`
- [x] 6.2 `EmailSender`, `FileEmailSender`, `UnconfiguredEmailSender`, `clock`, wybór w `container.ts`
- [x] 6.3 Szablon wiadomości
- [x] 6.4 `EmailVerificationService.issue/confirm`, wywołanie po rejestracji (przywrócić podpis pod e-mailem w `register-form` o linku do potwierdzenia; usunięty w 2.4, bo wysyłki jeszcze nie ma)
- [x] 6.5 Route `…/confirm` i strona `/verify-email`
- [x] 6.6 Poprawki po code review Fazy 6 (M1 wyścig w `issue`: unieważniaj tylko starsze tokeny + test równoległych `issue`, M2 timeout w kontrakcie `EmailSender` i ograniczenie czasu oczekiwania w `register`, wpis w specyfikacji #38, L2 `EMAIL_DAILY_LIMIT=1`, L3 log kodu błędu domenowego przy 503/502)

## Faza 7 — Ponowne wysłanie i baner (#34, Faza 2: kroki 6–8)

Ręczny test po fazie: baner „Potwierdź adres e-mail” na `/` i `/account`, zamknięcie, „Wyślij ponownie”, znika po potwierdzeniu.

- [x] 7.1 `resend` i limity (dodatkowo: `EmailVerificationService.issue` połyka przyczynę błędu wysyłki w `catch {` — zaloguj bez danych osobowych nazwę i kod przyczyny (np. przez `describeError(cause)`), a sam `AppError` 502 zachowaj bez ujawniania przyczyny klientowi; test, że log nie zawiera adresu ani tokenu — zob. lekcja `2026-10-28-next-env-root-env-not-loaded-in-dev.md`) (dopiąć na `/verify-email` w `confirm-email.tsx`, stan „link nieważny”: przycisk „Wyślij nowy link” dla zalogowanego z niepotwierdzonym kontem (s03.5, 9–12) i link „Zaloguj się, aby wysłać nowy link” (`/login?next=/account`) dla niezalogowanego (s03.6); w 6.5 jest tylko „Wróć na stronę główną”)
- [x] 7.2 `VerifyEmailBanner` (zamykalny, powrót po 7 dniach)
- [x] 7.3 Dokumentacja (README: ponowne wysyłanie, baner, znacznik, limit 5 s, logi, ręczny test w dev, wdrożenie z #38). Do wykonania po scaleniu PR (ręcznie): komentarz w #38 o porcie `EmailSender` (`SendOptions`/`signal`, timeout 5 s, adres klienta nie jest przekazywany, kontrakt wiadomości) i zamknięcie #34
- [x] 7.4 Poprawki po code review Fazy 7 (M1 baner renderowany po stronie serwera jako otwarty dla niepotwierdzonego adresu, ukrywany po hydracji tylko gdy storage mówi „zamknięty” — bez przesunięcia układu; M2 zapis ryzyka wyczerpania puli dziennej przez `resend` w specyfikacji i README; L1 zdanie o wspólnym NAT w README; L5 usunąć re-eksport `VERIFICATION_SEND_TIMEOUT_MS` z `user-service.ts`)

## Faza 8 — Reset hasła (#35)

Ręczny test po fazie: `/forgot-password` → link ze skrzynki → `/reset-password`; tylko dla potwierdzonego e-maila (BR-27).

- [x] 8.1 Encja i migracja `password_reset_tokens`
- [x] 8.2 `newPasswordSchema` + schematy resetu
- [x] 8.3 `PasswordResetService` + szablon (dopiąć: w `container.ts` zastąpić no-op `invalidateResetTokens` (z 5.2) funkcją `(userId, em)` usuwającą/unieważniającą niewykorzystane tokeny resetu użytkownika wyłącznie przez przekazany `em` (`tx` transakcji zmiany hasła, nie wstrzyknięty `em`), z testami; sygnatura jest już gotowa od 5.5)
- [x] 8.4 Route `…/request` i `…/confirm`
- [x] 8.5 Strony `/forgot-password`, `/reset-password`, link na `/login`
- [ ] 8.6 Dokumentacja

## Faza 9 — Sprzątanie wygasłych rekordów (#39, z regułą 14 dni dla niepotwierdzonych kont)

Ręczny test po fazie: `npm run db:cleanup` na bazie ze starymi rekordami.

- [ ] 9.1 `cleanupExpired` (+ reguły dla sesji, liczników, tokenów)
- [ ] 9.2 `cleanup-cli.ts`, `db:cleanup`
- [ ] 9.3 Testy integracyjne progów, README (cron)
- [!] 9.4 Reguła „niepotwierdzone konto bez partii po 14 dniach” — zablokowana do #29 (tabela uczestników partii)

## Faza 10 — Usunięcie konta (#37)

- [!] Zablokowana: wymaga #29 (tabele partii) i prawdziwego `gameParticipation` (E02). Po E02-S01 kroki 1–5 ze specyfikacji `account-deletion`.

## Faza 11 — Przełącznik motywu jasny/ciemny (dodane 2026-10-28, decyzja właściciela; poza specyfikacjami E01)

Dziś strony gracza mają zawsze motyw ciemny (`:root`), jasny włącza `data-theme="light"` na `<html>` (`packages/ui/src/styles/game-tokens.css`); aplikacja nie ma przełącznika. Propozycja robocza do potwierdzenia w mini-specyfikacji: `data-theme` ustawiany na `<html>` według `prefers-color-scheme`, z ręcznym wyborem zapamiętanym w ciasteczku (bez migotania przy ładowaniu), przełącznik w nagłówku stron gracza.

Ręczny test po fazie: przełączenie motywu na `/`, `/register`, `/login`, `/account`; zapamiętanie wyboru po odświeżeniu; zgodność z ustawieniem systemu przy pierwszej wizycie; kontrast i fokus w obu motywach; 360 px.

- [ ] 11.1 Mini-specyfikacja `.ai/specs/YYYY-MM-DD-theme-switcher.md` (zachowanie, miejsce przełącznika, ciasteczko vs `localStorage`, brak migotania, dostępność, testy); pytania do właściciela przed kodem
- [ ] 11.2 Mechanizm motywu (czysta logika w `core`/`ui`, ustawienie `data-theme` w layoucie `(frontend)`, ciasteczko)
- [ ] 11.3 Komponent przełącznika w `@gomoku/ui/game/*` (Storybook, oba motywy) i użycie w nagłówku stron gracza
- [ ] 11.4 Testy jednostkowe, integracyjne (agent-browser) i przegląd obu motywów wszystkich ekranów E01 (w tym jasny motyw, dotąd nieoglądany)

## Poza zakresem tego przebiegu

- #38 w części decyzji o produkcyjnym dostawcy poczty (spike SMTP) i #30 (adres klienta): produkcja wymaga ich rozstrzygnięcia; lokalnie używamy `FileEmailSender`.
