---
date: 2026-10-24
type: decision-record
confirmer: Bartosz Wójcik (właściciel produktu)
---

# Konta, dane i potwierdzenia domyślnych wartości (2026-10-24)

Źródło: odpowiedzi właściciela w sesji `om-discover --refresh` (2026-10-24) oraz w bramce pytań
specyfikacji `.ai/specs/implemented/2026-10-24-account-registration.md` (2026-10-24). Każda decyzja poniżej
była wyborem właściciela spośród wariantów przedstawionych przez agenta; przy każdej podano, czy
pokrywała się z rekomendacją agenta.

## Potwierdzenia wcześniejszych wartości domyślnych (sesja `om-discover --refresh`)

| Pytanie | Odpowiedź | Rekomendacja agenta? |
| --- | --- | --- |
| Czas wygaśnięcia statusu „szukam gry” (BR-12/D-09) | „1a” — zostaje 5 minut, jako świadoma decyzja | nie dotyczy (agent nie rekomendował) |
| Co najwyżej jedna aktywna partia (BR-13/D-10) | „2a” — zostaje, jako świadoma decyzja | nie dotyczy |

## Nowe decyzje (sesja `om-discover --refresh`)

| Pytanie | Odpowiedź | Rekomendacja agenta? |
| --- | --- | --- |
| Reset hasła i usuwanie konta | „3a” — oba w MVP | nie; agent rekomendował (b) lub (c) — reset później |
| Partie usuniętego konta w historii przeciwnika | „4a” — zostają, z nazwą „Usunięty gracz”; e-mail, hasło i sesje kasowane | tak |
| Weryfikacja e-maila | „5b” — potwierdzenie e-maila wymagane przed pierwszą grą | nie; agent rekomendował (a) — weryfikacja dopiero przed resetem |
| Retencja | „6a” — historia bez limitu, dopóki konto istnieje; wygasłe sesje i liczniki limitu kasowane automatycznie | tak |

## Doprecyzowania (sesja `om-discover --refresh`, runda 3)

| Pytanie | Odpowiedź | Rekomendacja agenta? |
| --- | --- | --- |
| Stan po rejestracji przed potwierdzeniem e-maila | „7a” — gracz jest zalogowany, widzi komunikat „Potwierdź e-mail, aby grać”; tworzenie partii, przyjmowanie zaproszeń i lobby zablokowane do potwierdzenia | nie dotyczy (agent przedstawił tradeoff bez rekomendacji) |
| Zmiana danych konta w MVP | „8a” — zmiana hasła w MVP; zmiana e-maila i nazwy gracza później | nie dotyczy |

## Pytania otwarte briefu (sesja z 2026-10-24, po odświeżeniu)

| Pytanie | Odpowiedź | Rekomendacja agenta? |
| --- | --- | --- |
| Q-02 Koszt wysyłki poczty | „A a” — tylko darmowy plan dostawcy (z jego limitem wiadomości); wybór dostawcy w #38 | nie dotyczy |
| Usunięcie konta w trakcie aktywnej partii (#37) | „B a” — usunięcie odrzucone z komunikatem „Najpierw dokończ albo poddaj partię” | nie dotyczy (agent przedstawił tradeoff) |
| Q-08 Gra w przeglądarce telefonu | „C a” — w MVP; plansza i zegary działają na ekranie telefonu | nie dotyczy |
| Q-04 Zapis sposobu powstania partii | „D a” — potwierdzone (`invite` / `lobby`) | nie dotyczy |
| Q-05 Informacja o przetwarzaniu danych | „E b” — później, przed udostępnieniem gry osobom z zewnątrz (S3); dla znajomych nie jest wymagana | nie dotyczy |
| Q-06 Kryteria rezygnacji | „przed realnym produktem będę próbował innych gier i technologii” (dosłownie) | nie dotyczy |
| Q-07 Kanał promocji | „nie wiem” | nie dotyczy |

## Przesłuchanie specyfikacji rejestracji (`grill-me`, 2026-10-24)

| Pytanie | Odpowiedź | Rekomendacja agenta? |
| --- | --- | --- |
| G1 Hosting | VPS mikr.us; „a” — ruch przez darmową subdomenę mikr.us; brak własnej domeny | tak |
| G2 Wzmocnienia sesji i CSRF (`__Host-`, obowiązkowy `Origin` = `APP_ORIGIN`, fail closed) | „tak, wszystkie trzy” | tak |
| G3 Hasło | „hasło przynajmniej 16 znaków, bez dodatkowych wymagań” (reguła właściciela) | nie; agent rekomendował listę popularnych haseł |
| G4 Zastrzeżone nazwy gracza | „a” — lista zastrzeżonych rdzeni | tak |
| G5 Czas życia sesji | „b lecz z wariantem że sesja nie wygasa w trakcie aktywnej partii” — 30 dni + wyjątek dla trwającej partii | częściowo (agent rekomendował 30 dni bez wyjątku) |
| G6 Unikalność nazwy | „a” — klucz po normalizacji (polskie znaki, `_`, `-`) | tak |
| Gra gościa z zaproszenia | właściciel: „z zaproszenia można grać bez rejestracji … nie ma się konta, nazwy, oraz własnej historii partii. u zapraszającego historia zostaje ale partner to »zaproszony przez link«”; granice „wg rekomendacji”: gość tylko dołącza z zaproszenia, zapraszający ma konto z potwierdzonym e-mailem, lobby tylko dla kont, zalogowany zaproszony gra jako on sam | inicjatywa właściciela; granice — tak |
| Tożsamość gościa | „a” — ciasteczko z tokenem jednej partii (do końca partii + 1 h), tylko ta sama przeglądarka | tak |
| Gość zakłada konto po partii | „a” — bez przejęcia partii | tak |
| `?next=` po rejestracji/logowaniu | „a” — `safeNextPath` we wspólnej warstwie | tak |

## Potwierdzenie założeń specyfikacji #34, #35, #37, #38 (2026-10-24)

Właściciel odpowiedział „a” na pytanie, czy potwierdza wszystkie założenia oznaczone ⚠ w PR-ach #42, #43, #45, #46 tak, jak zostały zaproponowane przez agenta:

| Specyfikacja | Założenie potwierdzone |
| --- | --- |
| #34 Q1 | Produkcja bez skonfigurowanego dostawcy poczty działa; potwierdzanie e-maila zwraca `502`. |
| #34 Q9, #35 Q1 | Reset hasła działa także dla niepotwierdzonego e-maila i go potwierdza → BR-25 (nadpisuje propozycję BR-19). |
| #37 Q1 | Uczestnik partii (#29): `user_id` NULL-owalne, `on delete set null`, wyświetlane jako „Usunięty gracz”. |
| #37 Q3 | Usunięcie konta natychmiastowe i nieodwracalne, bez karencji. |
| #38 Q1, Q2, Q5 | Konto Gmail gry przez SMTP (hasło aplikacji), zależność `nodemailer`; najpierw spike, czy mikr.us przepuszcza wychodzące SMTP. |

Wszystkie te założenia zaproponował agent (rekomendacje); potwierdzenie zbiorcze nie zmienia ich statusu dowodowego.

## Decyzje ze specyfikacji rejestracji (bramka pytań, 2026-10-24)

| Pytanie | Odpowiedź | Rekomendacja agenta? |
| --- | --- | --- |
| Q1 Mechanizm uwierzytelniania | własny: hasło + sesja w PostgreSQL, token w ciasteczku `httpOnly` | tak |
| Q2 Hashowanie hasła | `bcryptjs`, koszt 12 | tak |
| Q3 Walidacja | `zod` | tak |
| Q4 Dane konta | „Q4 b” — e-mail (login) + nazwa gracza (widoczna dla innych) + hasło | nie; agent rekomendował (a) — bez e-maila |
| Q5 Zapis limitu prób | tabela w PostgreSQL | tak |
| Q6 Zakres | migracja #28 w #19; rejestracja tworzy sesję | tak |
| Q7 Zajęty e-mail przy rejestracji | „Q7 b” — jednolity komunikat, bez wskazania pola | tak |
| Q8 Podział implementacji | „Q8 a” — dwa PR-y | tak |

## Konsekwencje wskazane właścicielowi przed decyzją

- Reset hasła wymaga wysyłki poczty — nowa usługa i koszt poza hostingiem. Dostawca i koszt
  nie zostały wybrane; właściciel płaci za hosting (`2026-10-20-stakeholders.md`).
- Weryfikacja przed pierwszą grą (5b) zmienia przepływ: rejestracja nadal loguje, ale gra wymaga
  potwierdzonego e-maila — dotyczy zgłoszeń #19 i #21–#26 oraz specyfikacji rejestracji.
