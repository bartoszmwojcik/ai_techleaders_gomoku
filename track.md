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
- [ ] 1.6 `UserService.register`, `apiHandler`, CSRF (`Origin` + `X-Gomoku-Request`)
- [ ] 1.7 Route `POST /api/auth/register` + testy integracyjne

## Faza 2 — Formularz rejestracji i stan zalogowania (#19, PR B: kroki 8–10)

Ręczny test po fazie: `npm run dev` → `/register`: rejestracja, przekierowanie na `/`, widoczne „Zalogowano jako …”, błędy pól, telefon 360 px.

- [ ] 2.1 `apiCall` i `safeNextPath`
- [ ] 2.2 Komponenty formularza (`FormField`, `SubmitButton`, `ErrorMessage`, jsdom + Testing Library)
- [ ] 2.3 Strona `/register`, `/` ze stanem zalogowania, dokumentacja (README, standardy)

## Faza 3 — Logowanie (#20, kroki 1–5)

Ręczny test po fazie: `/login` (poprawne dane, złe hasło ten sam komunikat, `?next=`, limit prób, „Pokaż hasło”).

- [ ] 3.1 `RateLimiter.hit` i `reset`
- [ ] 3.2 `normalizeEmail`, `loginSchema`
- [ ] 3.3 Atrapowy hash i `UserService.authenticate`
- [ ] 3.4 Route `POST /api/auth/login`
- [ ] 3.5 `PasswordField`, strona `/login`

## Faza 4 — Wylogowanie, strażnik sesji i konto (#20, kroki 6–8)

Ręczny test po fazie: wylogowanie, `/account` bez sesji przekierowuje na `/login?next=…`, linki na `/`.

- [ ] 4.1 `SessionService.revoke` i `POST /api/auth/logout`
- [ ] 4.2 `requireSession` / `requirePageSession`, `activeGameCheck`, `/account`, `LogoutButton`, linki na `/`
- [ ] 4.3 Dokumentacja (README: logowanie, limity)

## Faza 5 — Zmiana hasła (#36)

Ręczny test po fazie: `/account` → zmiana hasła; stare hasło nie loguje; druga sesja wylogowana.

- [ ] 5.1 `passwordChangeSchema` (+ `newPasswordSchema`)
- [ ] 5.2 `UserService.changePassword`, `SessionService.revokeOthers`
- [ ] 5.3 Route `POST /api/auth/password`
- [ ] 5.4 Formularz na `/account`

## Faza 6 — Potwierdzenie e-maila (#34, Faza 1: kroki 1–5; port poczty z #38)

Ręczny test po fazie: rejestracja → plik-skrzynka (`EMAIL_TRANSPORT=file`) → link → `/verify-email` potwierdza adres.

- [ ] 6.1 Encja i migracja `email_verification_tokens`
- [ ] 6.2 `EmailSender`, `FileEmailSender`, `UnconfiguredEmailSender`, `clock`, wybór w `container.ts`
- [ ] 6.3 Szablon wiadomości
- [ ] 6.4 `EmailVerificationService.issue/confirm`, wywołanie po rejestracji
- [ ] 6.5 Route `…/confirm` i strona `/verify-email`

## Faza 7 — Ponowne wysłanie i baner (#34, Faza 2: kroki 6–8)

Ręczny test po fazie: baner „Potwierdź adres e-mail” na `/` i `/account`, zamknięcie, „Wyślij ponownie”, znika po potwierdzeniu.

- [ ] 7.1 `resend` i limity
- [ ] 7.2 `VerifyEmailBanner` (zamykalny, powrót po 7 dniach)
- [ ] 7.3 Dokumentacja

## Faza 8 — Reset hasła (#35)

Ręczny test po fazie: `/forgot-password` → link ze skrzynki → `/reset-password`; tylko dla potwierdzonego e-maila (BR-27).

- [ ] 8.1 Encja i migracja `password_reset_tokens`
- [ ] 8.2 `newPasswordSchema` + schematy resetu
- [ ] 8.3 `PasswordResetService` + szablon
- [ ] 8.4 Route `…/request` i `…/confirm`
- [ ] 8.5 Strony `/forgot-password`, `/reset-password`, link na `/login`
- [ ] 8.6 Dokumentacja

## Faza 9 — Sprzątanie wygasłych rekordów (#39, z regułą 14 dni dla niepotwierdzonych kont)

Ręczny test po fazie: `npm run db:cleanup` na bazie ze starymi rekordami.

- [ ] 9.1 `cleanupExpired` (+ reguły dla sesji, liczników, tokenów)
- [ ] 9.2 `cleanup-cli.ts`, `db:cleanup`
- [ ] 9.3 Testy integracyjne progów, README (cron)
- [!] 9.4 Reguła „niepotwierdzone konto bez partii po 14 dniach” — zablokowana do #29 (tabela uczestników partii)

## Faza 10 — Usunięcie konta (#37)

- [!] Zablokowana: wymaga #29 (tabele partii) i prawdziwego `activeGameCheck` (E02). Po E02-S01 kroki 1–5 ze specyfikacji `account-deletion`.

## Poza zakresem tego przebiegu

- #38 w części decyzji o produkcyjnym dostawcy poczty (spike SMTP) i #30 (adres klienta): produkcja wymaga ich rozstrzygnięcia; lokalnie używamy `FileEmailSender`.
