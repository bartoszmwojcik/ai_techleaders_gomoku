# Dostawca wysyłki poczty (E01-S03-T01, #38)

> Status: **zatwierdzona** (`om-auto-write-spec`, 2026-10-24; założenia potwierdzone przez właściciela — Bartosz Wójcik, „a” — 2026-10-24).

## 📝 TLDR

Potwierdzenie e-maila (#34) i reset hasła (#35) potrzebują wysyłki poczty; dziś nie ma dostawcy (Q-02). Ograniczenia: tylko darmowy plan (D-20) i **brak własnej domeny** (G1 — subdomena mikr.us `byst.re` nie jest nasza, więc nie ustawimy dla niej SPF/DKIM). Proponujemy (zachowanie przyszłe) jeden adapter `SmtpEmailSender` za portem `EmailSender` i konfigurację wskazującą skrzynkę **Gmail właściciela przez SMTP z hasłem aplikacji** jako start — z możliwością przełączenia na Brevo (SMTP) lub dostawcę z własną domeną samą konfiguracją.

## Resolved assumptions (autonomous defaults)

| # | Pytanie | Zastosowane założenie | Dlaczego | Potwierdzenie |
|---|---|---|---|---|
| Q1 | Który dostawca na start? | Konto Gmail (dedykowane dla gry, np. `gomoku.…@gmail.com`) przez SMTP `smtp.gmail.com:465` z hasłem aplikacji. | Bez własnej domeny tylko wiadomość wysłana **przez serwery właściciela adresu** przechodzi uwierzytelnienie nadawcy (SPF/DKIM/DMARC) — Gmail podpisuje własne wiadomości; serwis zewnętrzny wysyłający „jako @gmail.com” tego nie zapewni. Koszt 0 zł (D-20). | ✅ potwierdzone przez właściciela 2026-10-24 — wybór dostawcy i konto pocztowe właściciela |
| Q2 | Jak wysyłać technicznie? | Jeden adapter SMTP przez bibliotekę `nodemailer` (nowa zależność w `@gomoku/app`); dostawca to tylko konfiguracja (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`). | Gmail, Brevo i prawie każdy dostawca obsługują SMTP — zmiana dostawcy bez zmiany kodu; własny klient SMTP to kod bezpieczeństwa (TLS, uwierzytelnianie) do utrzymania. | ✅ potwierdzone przez właściciela 2026-10-24 — nowa zależność (`AGENTS.md`, OD-3) |
| Q3 | Dzienny limit (`EMAIL_DAILY_LIMIT`, #34 Q10) | Ustawiany poniżej limitu wybranego planu; wartość wpisywana przy konfiguracji wdrożenia, nie w kodzie. | Limity planów się zmieniają; nie zgadujemy liczby. | odwracalne |
| Q5 | Czy mikr.us przepuszcza wychodzące SMTP (465/587)? | Nieznane — wielu dostawców VPS blokuje te porty. Przed potwierdzeniem Q1 spike: połączenie `openssl s_client -connect smtp.gmail.com:465` z VPS. Gdy porty są zablokowane: adapter HTTP API (Brevo lub Resend) za tym samym portem `EmailSender`. | Bez tego wybór SMTP może być niewykonalny. | ✅ potwierdzone przez właściciela 2026-10-24 — wynik spike'a przed wyborem |
| Q4 | Sekrety | `SMTP_PASSWORD` tylko w env serwera (mikr.us), nigdy w repo; `.env.example` bez wartości. | Standardy §Secrets. | odwracalne |

## 📝 Porównanie (sprawdzone 2026-10-24, źródła na dole)

| Opcja | Darmowy limit (wg źródeł) | Bez własnej domeny? | Uwagi |
|---|---|---|---|
| **Gmail SMTP** (hasło aplikacji) | brak danych z tego przeglądu — limity Google nie zostały sprawdzone | tak — nadawcą jest adres Gmail | Wymaga 2FA na koncie; wiadomości wychodzą z adresu właściciela; dobra dostarczalność, bo Gmail podpisuje własne wiadomości (wiedza ogólna, niezweryfikowana pomiarem). |
| **Brevo** (SMTP) | 300 wiadomości dziennie (strona Brevo) | niepotwierdzone — jedno źródło zewnętrzne mówi o weryfikacji pojedynczego nadawcy, np. adresu Gmail | Wysyłka z serwerów Brevo „jako” cudza domena może nie przejść DMARC → spam; zalecana autoryzacja własnej domeny. |
| **Resend** (API/SMTP) | 3 000 miesięcznie, 100 dziennie, 1 domena (blog Resend, recenzje 2026) | nie dla zewnętrznych odbiorców — testowy nadawca `onboarding@resend.dev` tylko do developmentu | Najlepszy przy własnej domenie. |
| **Własna domena + dowolny z powyższych** | jak wyżej | — | Koszt domeny (rocznie) narusza D-20/D-19 bez decyzji właściciela; otwiera też Cloudflare (G1, wariant b). |

**Wniosek (propozycja):** przy D-20 i braku domeny — Gmail SMTP na start; po ewentualnym zakupie domeny — Resend lub Brevo z autoryzowaną domeną, bez zmiany kodu (Q2).

## 📝 Architecture

- `SmtpEmailSender` w `app/src/server/services/email/smtp-email-sender.ts` implementuje `EmailSender` z #34 (`send({ to, subject, text, html })`); transport `nodemailer` tworzony raz (singleton) przez wstrzykiwaną fabrykę `createTransport` (testy jednostkowe na fałszywym transporcie — 100% pokrycia), TLS wymagany (`secure: true` dla 465 albo `requireTLS` dla 587), jawne `connectionTimeout`, `greetingTimeout` i `socketTimeout` (po 10 s) — wysyłka w #34 biegnie w żądaniu rejestracji, więc zawieszony serwer SMTP nie może jej blokować dłużej. Przy Gmailu `EMAIL_FROM` musi być równe `SMTP_USER` (Gmail podmienia inne nadawcy) — sprawdzane przy budowie kontenera.
- `container.ts`: `EMAIL_TRANSPORT=smtp` → `SmtpEmailSender`; brak zmiennych SMTP przy `smtp` → `UnconfiguredEmailSender` z #34 i ostrzeżenie w logu (bez wartości).
- Błędy SMTP (odrzucone uwierzytelnienie, limit dostawcy, timeout 10 s) → błąd wysyłki → `502 EMAIL_SEND_FAILED` (#34); log z kodem błędu, bez adresu i treści.

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Skutek |
|---|---|
| Hasło aplikacji unieważnione / zmienione | `502` przy każdej wysyłce; gra gościa działa (BR-22); naprawa = nowa wartość `SMTP_PASSWORD`. |
| Przekroczony limit dostawcy | `502` (błąd SMTP) albo wcześniej `503` z naszego `EMAIL_DAILY_LIMIT` (#34 Q10). |
| Wiadomość w spamie | Baner w #34 radzi sprawdzić folder spam; brak pomiaru dostarczalności (A-03). |
| Google blokuje konto za nietypową aktywność | Jak unieważnione hasło; ryzyko rośnie przy dużej liczbie wysyłek — powód do przejścia na domenę i Resend/Brevo. |

## 📝 Risks & Impact Review

- Konto pocztowe właściciela staje się infrastrukturą gry; adres nadawcy widzą wszyscy gracze — zalecane osobne konto dla gry.
- Nowa zależność `nodemailer` (Q2) — popularna, bez zależności natywnych (do sprawdzenia `npm audit` przy instalacji).
- Odwracalność wysoka: zmiana dostawcy = zmiana env; zmiana adresu nadawcy nie psuje wysłanych linków (linki wskazują `APP_ORIGIN`).

## 📝 Decisions in play

- **D-20** (darmowy plan), **D-19** (koszty ponosi właściciel — tylko hosting), **Q-02** (do zamknięcia po potwierdzeniu), specyfikacja #19 **G1** (brak własnej domeny), #34 **Q1/Q10**. Właściciel: Bartosz Wójcik.

## 📋 Implementation Plan

0. Spike na VPS mikr.us: wychodzące połączenie do `smtp.gmail.com:465`/`587` (Q5); sprawdzenie aktualnych dziennych limitów wysyłki Gmaila w dokumentacji Google przed ustawieniem `EMAIL_DAILY_LIMIT`. Wynik w komentarzu #38.
1. `npm install nodemailer -w @gomoku/app` (+ typy, jeśli pakiet ich nie zawiera); `SmtpEmailSender` z testami jednostkowymi na zamockowanym transporcie (sukces, błąd uwierzytelnienia, timeout, brak adresu w logach). Opcjonalnie test integracyjny z kontenerem Mailpit (Testcontainers).
2. Wybór w `container.ts` (`EMAIL_TRANSPORT=smtp`) i zmienne w `.env.example` (bez wartości); testy wyboru implementacji.
3. README: konfiguracja Gmail (2FA, hasło aplikacji) i alternatyw; `EMAIL_DAILY_LIMIT`.
4. Po wdrożeniu: ręczny test wysyłki na konto zewnętrzne (inbox vs spam) — wynik w komentarzu #38; zamknięcie Q-02 w briefie za zgodą właściciela.

Źródła: [Brevo — free SMTP](https://www.brevo.com/en/free-smtp-server/), [Resend — new free tier](https://resend.com/blog/new-free-tier), [Resend Review 2026](https://wpmailsmtp.com/resend-review/), [Resend free tier 2026](https://automationatlas.io/answers/resend-free-tier-explained-2026/), [Achromatic — Resend test domain](https://www.achromatic.dev/docs/starter-kits/pro-nextjs-prisma/email/configuration), [GoSMTP — Brevo](https://gosmtp.net/docs/gosmtp-mailers/brevo-formerly-sendinblue).
