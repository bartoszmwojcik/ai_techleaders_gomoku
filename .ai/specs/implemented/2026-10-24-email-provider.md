# Dostawca wysyłki poczty (E01-S03-T01, #38)

> **Zmienione przez `2026-10-26-account-onboarding-simplification.md` (decyzje właściciela 2026-10-26, brief D-24…D-26, BR-26…BR-28).** Dostawca poczty **nie blokuje** rejestracji ani gry (BR-26); potrzebny jest dla potwierdzenia e-maila i resetu hasła (#34 i #35 razem, po #38).


> Status: **wdrożona (2026-10-31; zgłoszenie #38 domknięte; **punkt 4 planu otwarty**, dowody w sekcji „Odstępstwa wdrożenia i dowody”)**; wcześniej: **zatwierdzona** (`om-auto-write-spec`, 2026-10-24; założenia potwierdzone przez właściciela — Bartosz Wójcik, „a” — 2026-10-24).

> **Adnotacja 2026-10-30 (decyzja właściciela, zgłoszenie #38; wymaga zatwierdzenia właściciela przy review PR):** dostawca poczty to **Brevo** (plan Free), przez API HTTPS `POST https://api.brevo.com/v3/smtp/email`, z jednego zweryfikowanego adresu nadawcy bez własnej domeny i kluczem API z uprawnieniem tylko do wiadomości transakcyjnych. **Zastępuje Q1 i Q2** (Gmail SMTP + `nodemailer`): adapter `BrevoEmailSender` używa wbudowanego `fetch`, bez nowej zależności; wybór przez istniejące `EMAIL_TRANSPORT=brevo` (+ `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`). Spike portów SMTP (Q5) nie dotyczy (HTTPS, port 443). **Q-02 zamknięte.** Kompromis: bez SPF/DKIM na naszej domenie wiadomości mogą trafiać do spamu; limit planu Free ok. 300 wiadomości dziennie (do potwierdzenia w cenniku), a przy sumujących się pulach `EMAIL_DAILY_LIMIT` ≤ 176.

## 📝 TLDR

> **ZASTĄPIONE decyzją z 2026-10-30 — patrz adnotacja na początku dokumentu.** Treść poniżej opisuje pierwotną propozycję (Gmail/SMTP) i zostaje jako historia.

Potwierdzenie e-maila (#34) i reset hasła (#35) potrzebują wysyłki poczty; dziś nie ma dostawcy (Q-02). Ograniczenia: tylko darmowy plan (D-20) i **brak własnej domeny** (G1 — subdomena mikr.us `byst.re` nie jest nasza, więc nie ustawimy dla niej SPF/DKIM). Proponujemy (zachowanie przyszłe) jeden adapter `SmtpEmailSender` za portem `EmailSender` i konfigurację wskazującą skrzynkę **Gmail właściciela przez SMTP z hasłem aplikacji** jako start — z możliwością przełączenia na Brevo (SMTP) lub dostawcę z własną domeną samą konfiguracją.

## Resolved assumptions (autonomous defaults)

> **Q1 i Q2 poniżej: ZASTĄPIONE decyzją z 2026-10-30 — patrz adnotacja na początku dokumentu.**

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

0. [x] ~~Spike na VPS~~ (nie dotyczy Brevo, 2026-10-30) mikr.us: wychodzące połączenie do `smtp.gmail.com:465`/`587` (Q5); sprawdzenie aktualnych dziennych limitów wysyłki Gmaila w dokumentacji Google przed ustawieniem `EMAIL_DAILY_LIMIT`. Wynik w komentarzu #38.
1. [x] (2026-10-30: zastąpione adapterem `BrevoEmailSender` na `fetch`, bez nowej zależności) `npm install nodemailer -w @gomoku/app` (+ typy, jeśli pakiet ich nie zawiera); `SmtpEmailSender` z testami jednostkowymi na zamockowanym transporcie (sukces, błąd uwierzytelnienia, timeout, brak adresu w logach). Opcjonalnie test integracyjny z kontenerem Mailpit (Testcontainers).
2. [x] Wybór w `container.ts` (`createEmailSender`) (`EMAIL_TRANSPORT=brevo`) i zmienne w `.env.example` (bez wartości); testy wyboru implementacji.
3. [x] README: konfiguracja Gmail (2FA, hasło aplikacji) i alternatyw; `EMAIL_DAILY_LIMIT`.
4. [ ] Po wdrożeniu: ręczny test wysyłki na konto zewnętrzne (inbox vs spam) — wynik w komentarzu #38; zamknięcie Q-02 w briefie za zgodą właściciela.

Źródła: [Brevo — free SMTP](https://www.brevo.com/en/free-smtp-server/), [Resend — new free tier](https://resend.com/blog/new-free-tier), [Resend Review 2026](https://wpmailsmtp.com/resend-review/), [Resend free tier 2026](https://automationatlas.io/answers/resend-free-tier-explained-2026/), [Achromatic — Resend test domain](https://www.achromatic.dev/docs/starter-kits/pro-nextjs-prisma/email/configuration), [GoSMTP — Brevo](https://gosmtp.net/docs/gosmtp-mailers/brevo-formerly-sendinblue).

## 📝 Ustalenia z przesłuchania (grill-me, 2026-10-24)

> **Część dotycząca SMTP/`nodemailer` ZASTĄPIONA decyzją z 2026-10-30 — patrz adnotacja na początku dokumentu** (limit czasu, pule i kolejność wdrożenia zostają).

Potwierdzone przez właściciela — Bartosza Wójcika.

- **Stop przy zablokowanych portach (Q5):** jeśli spike pokaże, że mikr.us blokuje SMTP, nie budujemy automatycznie adaptera Brevo/Resend. Wracamy do właściciela z decyzją „kupić domenę (koszt vs D-20/D-19) albo grać tylko jako gość”.
- **Kolejność wdrożenia:** #38 → #30 → #34 i #35 razem; bez skonfigurowanego dostawcy rejestracja kont jest wyłączona (README).
- **Pula limitu:** weryfikacja e-maila zużywa najwyżej 70% `EMAIL_DAILY_LIMIT`, reset hasła całość (wartość limitu z planu dostawcy).
- **Limit czasu wysyłki (2026-10-28, po code review fazy 6 #34):** wysyłka jest awaitowana w żądaniu rejestracji, więc port `EmailSender.send(message, { signal })` wymaga respektowania `AbortSignal` (rejestracja ustawia `AbortSignal.timeout(5000)`). Adapter SMTP (`SmtpEmailSender`) **musi** przekazać sygnał do klienta i ustawić własne limity `connectionTimeout`/`greetingTimeout`/`socketTimeout` (nodemailer), a po przerwaniu odrzucić obietnicę; test jednostkowy adaptera sprawdza przerwanie sygnałem. Po przekroczeniu czasu nowy token jest usuwany, poprzedni link zostaje ważny, rejestracja zwraca `201`.
- **Pula weryfikacji przy małym limicie (2026-10-28):** `max(1, floor(EMAIL_DAILY_LIMIT × 0,7))` - przy `EMAIL_DAILY_LIMIT=1` weryfikacja dostaje 1 wysyłkę dziennie, a nie 0.

## 📝 Odstępstwa wdrożenia i dowody (2026-10-31)

Decyzja Brevo (adnotacja 2026-10-30) zastępuje Q1 i Q2 (Gmail SMTP, `nodemailer`); wdrożono `BrevoEmailSender` (`fetch`, bez nowej zależności) i wybór przez `EMAIL_TRANSPORT=brevo`. Status „wdrożona” obejmuje kod, konfigurację i dokumentację; **nie obejmuje weryfikacji na produkcji**. Zgodnie z poprawką z 2026-10-26 dostawca nie blokuje rejestracji ani gry.

**Otwarty punkt wdrożeniowy (nie wykonany):** punkt 4 planu — ręczny test wysyłki na konto zewnętrzne na produkcji (inbox vs spam) z wynikiem w komentarzu #38 oraz zamknięcie Q-02 w `product-brief.md` za zgodą właściciela (brief nadal ma Q-02 jako „open”). Potwierdzenie limitu planu Free (ok. 300 wiadomości dziennie) „do potwierdzenia w cenniku” pozostaje adnotacją, a nie sprawdzonym faktem; w kodzie chroni przed nim `EMAIL_DAILY_LIMIT` ≤ 176.

| Kryterium | Dowód |
| --- | --- |
| #38 „Done when”: dostawca wybrany w darmowym planie (D-20) | Decyzja zapisana w adnotacji 2026-10-30 tej specyfikacji; `brevo-email-sender.test.ts` — „posts the message to the Brevo API with the expected shape”, „succeeds on 201 even without a response body”, „maps a network exception to BREVO_NETWORK and drops the cause”, „maps its own timeout to BREVO_TIMEOUT”, „reports a caller cancellation as BREVO_ABORTED, not a timeout”; `create-email-sender.test.ts` — „picks the Brevo sender and wires config and the injected fetch”, „rejects an unknown transport instead of falling back” |
| #38: limit dostawcy sprawdzony względem liczby rejestracji i resetów | Częściowo: limit z cennika oznaczony „do potwierdzenia”; ochrona w kodzie — `create-email-sender.test.ts` „warns, naming only variables, when brevo runs without EMAIL_DAILY_LIMIT”, pule `EMAIL_DAILY_LIMIT` w `email-verification.test.ts` („stops sending once the verification share of the daily limit is used”) i `password-reset.test.ts` („the daily pool for reset is separate and caps the sends”) |
| #38: decyzja zapisana w `.ai/specs/` i w briefie (Q-02 zamknięte) | W `.ai/specs/`: tak (ta specyfikacja). W `product-brief.md`: **nie** (Q-02 nadal „open”, wiersze 31, 36–37, 200, 259, 287–289) — wymaga ręcznej aktualizacji przez właściciela |
| #38: zmienne dostępowe w `.env.example` bez wartości | Tylko kod: `.env.example` — `EMAIL_TRANSPORT`, `BREVO_API_KEY=`, `EMAIL_FROM_ADDRESS=`, `EMAIL_FROM_NAME`, `EMAIL_DAILY_LIMIT` |
| Plan, punkt 4: test wysyłki na produkcji | **Nie wykonany** — otwarty punkt wdrożeniowy (powyżej) |

Sprawdzenie 2026-10-31 na `origin/main` przez czytanie testów i kodu; testy nie były uruchamiane w ramach tego domknięcia (zmiana dokumentacyjna).
