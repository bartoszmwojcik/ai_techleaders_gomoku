# Zmiana adresu e-mail i nazwy gracza (E05-S01, #190)

> Status: **szkic autonomiczny** (`om-auto-write-spec`, 2026-11-02) — do zatwierdzenia przez właściciela przed kodem (osobny PR specyfikacji, `AGENTS.md`). Źródło: zgłoszenie #190 (sekcja „Rozstrzygnięte”, właściciel Bartosz Wójcik, 2026-11-02), `.ai/specs/product-brief.md` (D-18 rozszerzone tym samym PR-em; BR-14, BR-16, BR-17, BR-24, BR-26, BR-27, BR-35), specyfikacje wdrożone: `2026-10-24-account-registration.md`, `2026-10-24-email-verification.md`, `2026-10-24-password-change.md`, `2026-10-24-password-reset.md`, `2026-10-24-account-deletion.md`.

## 📝 TLDR

Dziś zalogowany użytkownik nie poprawi literówki w adresie ani nazwy gracza — jedyna droga to usunięcie konta i utrata historii. Po wdrożeniu na `/account` są dwa nowe formularze: **nazwa gracza** (zmiana od razu, najwyżej raz na dobę, dotyczy tylko nowych partii) i **adres e-mail** (aktualne hasło, link na nowy adres; adres konta zmienia się dopiero po kliknięciu linku, unieważnia sesje i stare linki resetu hasła).

## Rozstrzygnięte przez właściciela (2026-11-02) — nie są Open Questions

1. Nazwę gracza wolno zmienić najwyżej raz na dobę.
2. Zmiana nazwy dotyczy tylko nowych partii; trwające zachowują nazwę.
3. Zmiana adresu e-mail unieważnia stare linki resetu hasła.

## Resolved assumptions (autonomous defaults)

| # | Pytanie | Zastosowane założenie | Dlaczego | Potwierdzenie |
|---|---|---|---|---|
| Q1 | Jak realizować „tylko nowe partie”, skoro nazwa konta jest czytana na żywo z `users.display_name` (partia, MCP `get_state`, historia, link zaproszenia)? | Nowa kolumna `game_players.display_name` (migawka nazwy w chwili utworzenia wiersza uczestnika), wypełniona wstecz migracją; odczyty partii, historii i zaproszenia czytają migawkę. Lobby (`lobby_seekers`) i panel `/backend` zostają na żywo. Migawka jest zerowana przy usunięciu konta (BR-17). Skutek uboczny: zakończone partie pokazują nazwy sprzed zmiany także w historii przeciwnika. | Bez migawki nie da się spełnić reguły właściciela; rewanż to nowa partia, więc dostaje nową nazwę. | ⚠ NEEDS HUMAN CONFIRMATION — nowa kolumna, wypełnienie wsteczne i zmiana wyświetlania starej historii u przeciwników |
| Q2 | Kiedy idzie wiadomość informacyjna na dotychczasowy adres? | W chwili **potwierdzenia** zmiany (kryterium z #190: „zmiana zatwierdzona”), tylko gdy dotychczasowy adres był potwierdzony. Przy samym żądaniu nic na stary adres nie idzie. | Oszczędza darmowy limit poczty (D-20); stary adres, którego nikt nie potwierdził, może należeć do obcej osoby (literówka). Alternatywa: ostrzeżenie już przy żądaniu (czas na reakcję przed przejęciem) — kosztem drugiej wiadomości. | ⚠ NEEDS HUMAN CONFIRMATION — wybór między ostrzeżeniem po fakcie a przed faktem to kompromis bezpieczeństwa i limitu poczty |
| Q3 | Czy żądanie zmiany adresu ujawnia, że adres jest zajęty? | Nie: odpowiedź zawsze `202` z tym samym komunikatem; wiadomość idzie tylko, gdy adres jest wolny i różny od `ADMIN_EMAIL`; wysyłka po odpowiedzi (`after()`, wzorzec resetu). Strona konta nie pokazuje „oczekującego adresu” (wyciekłby stan zajętości). | BR-16 i #190. | odwracalne |
| Q4 | Limity prób | Błędne aktualne hasło: wspólna pula z zmianą hasła (`password-change:user:<id>`, 10 / 15 min, licznik rośnie przed weryfikacją, zerowany po sukcesie). Wysyłki: 3 na godzinę na konto (429 przy przekroczeniu), 3 na godzinę na adres docelowy (po przekroczeniu cicha odpowiedź `202`), dzienna pula `email-daily:email-change` jak reset (pełny `EMAIL_DAILY_LIMIT`, bez limitu gdy zmienna pusta). Zmiana nazwy: 20 prób / godzinę na konto (próby odrzucone walidacją nie liczą się). | Wspólna pula utrudnia zgadywanie hasła przez dwa formularze; liczby jak w istniejących limitach (wartości początkowe, bez danych). | odwracalne |
| Q5 | „Najwyżej raz na dobę” | Kolumna `users.display_name_changed_at` (NULL = nigdy; rejestracja nie liczy się). Okno kroczące 24 h od ostatniej udanej zmiany; sprawdzenie w jednym warunkowym `UPDATE`. Wpisanie dokładnie obecnej nazwy to błąd walidacji i nie zużywa okna. Zmiana samej wielkości liter (ten sam `displayNameKey`) liczy się jako zmiana. | Atomowo, bez wyścigu dwóch kart; nie wymaga crona. | odwracalne |
| Q6 | Co z porzuconą nazwą? | Zwalnia się od razu (unikat `displayNameKey` dotyczy tylko bieżących nazw); migawki w starych partiach zostają. Brak rezerwacji starej nazwy. | Najmniejsza zmiana; ryzyko podszycia się pod dawną nazwę przyjęte jak w rejestracji (nazwy nie są dowodem tożsamości). | odwracalne |
| Q7 | Konto administratora instalacyjnego (BR-35) | Zmiana e-maila tego konta jest odrzucana (`403 ADMIN_EMAIL_LOCKED`); nikt nie może zmienić adresu **na** `ADMIN_EMAIL` (traktowane jak zajęty, Q3). Nazwę administrator zmienia jak każdy. | BR-35: „nie można zmienić e-maila tego konta”, zamyka wektor przejęcia roli. | odwracalne |
| Q8 | Co potwierdza link zmiany? | Ustawia `email = nowy`, `email_verified_at = teraz` (adres potwierdzony właśnie tym kliknięciem — naprawia też literówkę z rejestracji). Link ważny 24 h, jednorazowy, działa bez zalogowania (token dowodzi dostępu do skrzynki). Nowe żądanie unieważnia poprzednie niewykorzystane linki zmiany. | Spójne z potwierdzeniem e-maila (BR-26); BR-27 nietknięte: reset nadal tylko na potwierdzony adres, a niepotwierdzonego adresu zmiana nie ustawia. | odwracalne |
| Q9 | Stare tokeny po zmianie | W transakcji potwierdzenia: unieważnione zostają niewykorzystane tokeny resetu hasła (decyzja właściciela), tokeny potwierdzenia e-maila (stary link nie może „potwierdzić” nowego adresu) i pozostałe linki zmiany adresu. Zmiana hasła i reset hasła unieważniają oczekujące linki zmiany adresu. | Link wysłany na stary adres nie może zadziałać po zmianie; skradziona sesja + zmiana hasła kasuje zaległą zmianę. | odwracalne |
| Q10 | Sesje po zmianie adresu | Wszystkie poza bieżącą (jeśli żądanie potwierdzenia niesie sesję tego konta), w przeciwnym razie wszystkie; dotyczy także sesji w trakcie partii (zegar biegnie, BR-06) — jak przy zmianie hasła. | #190 i `2026-10-24-password-change.md` (Q4). | odwracalne |
| Q11 | Wyścig i zajęty adres w chwili potwierdzenia | Konflikt unikalnego `users.email` przy potwierdzeniu daje `400 INVALID_TOKEN` (ten sam komunikat „Link wygasł lub został już użyty”); token zostaje zużyty. | Nie ujawnia, że adres ma konto. | odwracalne |
| Q12 | Pominięte mockupy | Brak mockupów: formularze odtwarzają wzorzec `change-password-form.tsx` w istniejących panelach `/account`. | Brak nowego wzorca UI; weryfikacja w przeglądarce przy implementacji (320 px). | odwracalne |

## 📝 Problem Statement

- **Kto:** zalogowany użytkownik z kontem (brief: „Użytkownicy i scenariusze”). Bez dowodu popytu (A-01); zakres z decyzji właściciela, nie z badania.
- **Problem:** literówka w adresie lub chęć zmiany skrzynki / nazwy wymusza usunięcie konta i utratę historii (D-18 w wersji z 2026-10-24, BR-24).
- **Kryteria (z #190):** (1) wolna, poprawna nazwa zmienia się i jest widoczna w nowych partiach, lobby i historii; (2) nazwa zajęta (bez względu na wielkość liter) lub zarezerwowana („Agent”) → błąd przy polu; (3) aktualne hasło + poprawny nowy adres → link na nowy adres, adres konta bez zmian do jego użycia; (4) link otwarty → adres się zmienia, nowy adres potwierdzony, pozostałe sesje unieważnione; (5) błędne hasło albo zajęty adres → odpowiedź nie ujawnia, czy adres ma konto, próby ogranicza limit; (6) po zatwierdzeniu zmiany wiadomość na dotychczasowy adres; (7) nieużyty/wygasły link → adres bez zmian i czytelny komunikat.
- **Poza zakresem:** zmiana e-maila i nazwy przez administratora (N-12, E08), 2FA i ponowne uwierzytelnienie poza hasłem (Later), anulowanie oczekującej zmiany (wygasa po 24 h albo ją zastępuje nowe żądanie), historia zmian nazw.

## 📝 Proposed Solution

### Zmiana nazwy gracza

`PATCH /api/auth/display-name` (`requireSession`, `apiHandler`) → walidacja tym samym schematem co rejestracja (`displayName`: NFKC, długość, znaki, lista zarezerwowanych; schemat wydzielony w `@gomoku/core`, jeśli dziś jest sklejony z `registerSchema`) → `UserService.changeDisplayName(userId, name)`:

```sql
UPDATE users SET display_name = :name, display_name_key = :key, display_name_changed_at = :now
WHERE id = :id AND (display_name_changed_at IS NULL OR display_name_changed_at <= :now - interval '24 hours')
```

0 wierszy → rozróżnienie: konto istnieje, więc to okno (odczyt `display_name_changed_at`, odpowiedź `429` z `retryAfterSeconds`); naruszenie `users_display_name_key_unique` → `409` z `fieldErrors.displayName` („Ta nazwa jest już zajęta”, wzorzec rejestracji). Nazwa równa obecnej → `400` bez zużycia okna. Nazwa nie wymaga hasła (sesja wystarcza; okno 24 h ogranicza nadużycie).

### Migawka nazwy w partii (Q1)

`game_players.display_name varchar(24) null` ustawiane w tych samych miejscach, które dziś tworzą wiersz uczestnika typu `account` (utworzenie partii, dołączenie, rewanż, lobby), z `users.display_name` pod blokadą wiersza użytkownika, którą te ścieżki już biorą. Odczyty: `displayNameOf` w `game-service.ts` (partia, `get_state`, wiadomości czatu liczone z miejsca), `game-history-service.ts` (`opponent_name`), `join-core.ts` (`creator_name` zaproszenia). `lobby-service.ts` i `/backend` czytają `users.display_name` na żywo. Usunięcie konta (`AccountService.delete`) zeruje `game_players.display_name` konta w tej samej transakcji (BR-17: „Usunięty gracz”). Ograniczenie CHECK: `kind = 'account' or display_name is null`.

### Zmiana adresu e-mail

1. `POST /api/auth/email-change` `{ newEmail, currentPassword }`: sesja → walidacja (`normalizeEmail`, ta sama reguła co rejestracja) → licznik prób hasła (Q4) → weryfikacja hasła (`400 INVALID_CURRENT_PASSWORD`, `fieldErrors.currentPassword`) → konto administratora instalacyjnego → `403 ADMIN_EMAIL_LOCKED`; nowy adres równy obecnemu → `400` (`fieldErrors.newEmail`, to adres użytkownika) → limit wysyłek na konto (`429`) → `202`. Po odpowiedzi (`after()`): limit na adres docelowy i dzienna pula (ciche pominięcie), sprawdzenie, czy adres jest wolny i różny od `ADMIN_EMAIL`; jeśli tak — zapis tokenu i wysyłka linku (wzorzec `EmailVerificationService.issue`: stary link unieważniany dopiero po udanej wysyłce, nieudana wysyłka usuwa nowy token).
2. Link `…/confirm-email-change?token=…` → strona kliencka (wzorzec `verify-email/confirm-email.tsx`) → `POST /api/auth/email-change/confirm` `{ token }`. Transakcja (zapisy tylko przez `tx`): zużycie tokenu jednym `UPDATE … RETURNING` (jak `CONSUME_TOKEN_SQL`), `UPDATE users SET email, email_verified_at` (konflikt unikatu lub konto administratora instalacyjnego → `INVALID_TOKEN`), unieważnienie tokenów resetu (`invalidateResetTokens`), tokenów potwierdzenia e-maila i pozostałych linków zmiany, unieważnienie sesji (Q10). Po transakcji (`after()`, błąd tylko logowany bez adresu i tokenu): wiadomość na dotychczasowy adres (Q2) z maskowanym nowym adresem i zaleceniem zmiany hasła, gdy to nie ta osoba.

**Odrzucone:** zmiana adresu od razu bez potwierdzenia nowego (przejęcie resetu hasła, BR-27); kolumna „oczekujący adres” w `users` (jeden pending, brak historii prób, więcej migracji niż tabela tokenów); wymaganie sesji przy otwarciu linku (link otwierany na telefonie bez logowania byłby bezużyteczny); zmiana nazwy z hasłem (zbędne tarcie przy błędzie odwracalnym, ograniczonym oknem 24 h).

## 📝 Data Model

Jedna migracja (`npm run db:migration:create`, przegląd, `up` i `down` na prawdziwym PostgreSQL):

- `users.display_name_changed_at timestamptz null`.
- `game_players.display_name varchar(24) null` + CHECK `kind = 'account' or display_name is null`; wypełnienie wsteczne: `UPDATE game_players p SET display_name = u.display_name FROM users u WHERE p.user_id = u.id AND p.kind = 'account'` (wiersze usuniętych kont zostają NULL).
- Nowa encja `EmailChangeToken` (`email_change_tokens`, `defineEntity`, wpis w `entities/index.ts`): `id` uuid, `user` (many-to-one, cascade, indeks), `newEmail varchar(254)`, `tokenHash char(64)` unikat (SHA-256), `createdAt`, `expiresAt` (24 h), `usedAt` nullable.
- Reguła `db:cleanup` `emailChangeTokens` (jak `emailVerificationTokens`: `expires_at < ? or used_at < ?`, `graceMs` 24 h) w `packages/db/src/cleanup/rules.ts` — test pilnujący reguł dla tabel z `expiresAt` tego wymaga.

## 📝 API Contracts

| Wywołanie | Wynik | Status | Treść |
|---|---|---|---|
| `PATCH /api/auth/display-name` `{ displayName }` | zmieniono | `200` | `{ ok: true, data: { displayName } }` |
| | niepoprawna / zarezerwowana / równa obecnej | `400` | `code: "VALIDATION"`, `fieldErrors.displayName` |
| | zajęta (bez względu na wielkość liter) | `409` | `fieldErrors.displayName` |
| | okno 24 h | `429` | `code: "DISPLAY_NAME_COOLDOWN"`, `retryAfterSeconds`, `Retry-After` |
| | limit prób / brak sesji / CSRF | `429` / `401` / `403` | `RATE_LIMITED` / `UNAUTHORIZED` / `FORBIDDEN` |
| `POST /api/auth/email-change` `{ newEmail, currentPassword }` | przyjęto (także adres zajęty, Q3) | `202` | `{ ok: true, data: null }` |
| | błędne hasło | `400` | `code: "INVALID_CURRENT_PASSWORD"`, `fieldErrors.currentPassword` |
| | niepoprawny adres / równy obecnemu | `400` | `code: "VALIDATION"`, `fieldErrors.newEmail` |
| | konto administratora instalacyjnego | `403` | `code: "ADMIN_EMAIL_LOCKED"` |
| | limity / brak sesji / CSRF | `429` / `401` / `403` | jak wyżej |
| `POST /api/auth/email-change/confirm` `{ token }` | zmieniono | `200` | `{ ok: true, data: null }` |
| | nieznany, wygasły, zużyty, konflikt adresu | `400` | `code: "INVALID_TOKEN"` |

Obsługa błędów, CSRF i `Retry-After` jak w istniejących route'ach `api/auth/*`.

## 📝 UI/UX

- `/account`, dwa nowe panele w stylu „Zmień hasło” (`@gomoku/ui/game/*`, tokeny, bez hex): **„Zmień nazwę gracza”** — pole z obecną nazwą, podpowiedź „Nazwę można zmienić raz na dobę. Trwające partie zachowają dotychczasową nazwę.”; w oknie 24 h pole nieaktywne i „Kolejna zmiana możliwa po {data i godzina}” (strona czyta `displayNameChangedAt`); po sukcesie `role="status"` i odświeżenie widocznej nazwy w „Dane konta”. **„Zmień adres e-mail”** — nowy adres, aktualne hasło (`PasswordField`, „Pokaż hasło”), podpowiedź „Wyślemy link na nowy adres. Adres konta zmieni się po jego kliknięciu; inne urządzenia zostaną wylogowane”; po `202` `role="status"`: „Jeśli ten adres może zostać użyty, wysłaliśmy na niego link (ważny 24 godziny).”, pola wyczyszczone.
- Konto administratora instalacyjnego: formularz e-maila pokazuje komunikat o zmianie adresu w konfiguracji serwera zamiast pól.
- `/confirm-email-change`: stany „Potwierdzam…”, sukces („Adres e-mail został zmieniony.” + przejście do `/login`, jeśli sesja wygasła) i błąd („Link wygasł lub został już użyty.”).
- Teksty po polsku, etykiety przez propsy komponentów; telefon od 320 px (BR-20), `data-testid` dla pól i komunikatów. Mockupy: Q12.

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Zachowanie |
|---|---|
| Dwie karty zmieniają nazwę równocześnie | Warunkowy `UPDATE` przepuszcza jedną; druga dostaje `429` okna. |
| Dwóch użytkowników chce tej samej nazwy | Unikat `displayNameKey`; przegrany `409` przy polu. |
| Zmiana nazwy w trakcie partii (własnej lub przeciwnika) | Migawki w `game_players` zostają; nowa nazwa pojawia się od następnej partii i rewanżu; lobby pokazuje nową od razu. |
| Użytkownik usuwa konto po zmianie nazwy | Migawki zerowane; przeciwnik widzi „Usunięty gracz” (BR-17). |
| Adres zajęty / równy `ADMIN_EMAIL` | `202`, brak wiadomości, brak tokenu; użytkownik nie dowiaduje się nic poza „jeśli może zostać użyty”. |
| Wiele żądań na ten sam cudzy adres | Limit 3 / h na adres: ciche `202`, bez wiadomości. |
| Wysyłka nie powiodła się lub limit dzienny | Brak linku; błąd logowany bez adresu i tokenu (po odpowiedzi nie ma jak go pokazać); użytkownik ponawia formularz. Poprzedni link zostaje ważny (nieudana wysyłka go nie kasuje). |
| Kliknięcie linku po 24 h / drugi raz / po nowszym żądaniu | `400 INVALID_TOKEN`, adres bez zmian, czytelny komunikat. |
| Stary link potwierdzenia e-maila po zmianie | Unieważniony (Q9) — nie potwierdzi nowego adresu. |
| Link resetu hasła wysłany przed zmianą adresu | Unieważniony; reset wymaga nowego żądania na nowy (potwierdzony) adres. |
| Skradziona sesja próbuje przejąć adres | Wymaga aktualnego hasła; błędne hasło zużywa wspólną pulę 10 prób; po udanej zmianie właściciel konta dostaje wiadomość na stary adres (Q2) i może zmienić hasło, co kasuje oczekujące linki zmiany (Q9). |
| Dwa konta z tokenami na ten sam nowy adres | Pierwsze potwierdzenie wygrywa, drugie `INVALID_TOKEN` (Q11). |
| Konto niepotwierdzone zmienia adres | Dozwolone (to główny przypadek literówki); wiadomość na stary adres nie idzie (Q2); po potwierdzeniu adres jest potwierdzony. |
| Baza niedostępna | `500 INTERNAL`; potwierdzenie to jedna transakcja — wszystko albo nic. |

## 📝 Risks & Impact Review

- **Ryzyko:** zmiana tożsamości konta (login, odzyskiwanie hasła) i migracja z wypełnieniem wstecznym tabeli partii — dla implementacji zalecane `risk-high`; ta specyfikacja sama jest dokumentacją (`risk-medium` zgodnie ze zgłoszeniem).
- **Wpływ:** `UserService`, `EmailVerificationService`, `PasswordResetService` (unieważnianie linków zmiany), `AccountService.delete` (zerowanie migawek), `GameService`/`GameHistoryService`/`join-core` (odczyt migawki), `db:cleanup`, MCP `get_state` (nazwy przeciwnika z migawki), czat (podpis z miejsca — bez zmian w treści), panel `/backend` (na żywo).
- **Ryzyka zachowania:** wyciek zajętości adresu (zamknięty przez Q3), przejęcie konta przez skradzioną sesję (hasło + ostrzeżenie Q2), obejście BR-27 (nowy adres staje się potwierdzony dopiero po kliknięciu), obejście BR-35 (Q7), wyścigi (warunkowe `UPDATE`, unikaty), ujawnienie starej nazwy usuniętego konta (zerowanie migawek).
- **Wsteczna zgodność:** nowe kolumny nullable i nowa tabela; rollback przez migrację `down` (traci migawki i oczekujące linki). Kontrakty API istniejących route'ów bez zmian.

## 📝 Decisions in play

D-18 (rozszerzone 2026-11-02, właściciel Bartosz Wójcik), D-16 i BR-17 (anonimizacja), BR-14 i BR-16 (unikalność, brak ujawniania adresu), BR-24 (historia), BR-26 i BR-27 (potwierdzenie; reset tylko na potwierdzony adres), BR-35 (konto administratora), D-20 (darmowy limit poczty), N-12 (administrator nie zmienia cudzych danych).

## 📋 Phasing

Jedna faza, jeden PR implementacyjny (`Closes #190`) po zatwierdzeniu specyfikacji: kod, migracja, testy i dokumentacja razem (AGENTS.md, „mało, ale pełnych PR-ów”).

## 📋 Implementation Plan

1. **Schemat i migracja:** `users.display_name_changed_at`, `game_players.display_name` (CHECK, wypełnienie wsteczne), encja `EmailChangeToken`, reguła `db:cleanup`. Migracja w górę i w dół na PostgreSQL.
2. **Migawka nazwy:** zapis przy tworzeniu wierszy `account` (ścieżki partii, zaproszeń, lobby, rewanżu), odczyt w `displayNameOf`, historii i `join-core`, zerowanie w `AccountService.delete`. Testy jednostkowe i integracyjne (zmiana nazwy w trakcie partii nie zmienia jej; nowa partia i rewanż — nowa nazwa; usunięcie konta).
3. **Zmiana nazwy:** wydzielenie schematu nazwy w `@gomoku/core`, `UserService.changeDisplayName`, route `display-name`, limity. Testy: okno 24 h (wyścig), unikat bez względu na wielkość liter, zarezerwowane „Agent”, nazwa równa obecnej.
4. **Zmiana adresu:** `EmailChangeService` (żądanie, potwierdzenie, wiadomości `email-change-message.ts`), rozszerzenie `createInvalidateResetTokens` (albo osobna funkcja) o tokeny zmiany adresu i potwierdzenia e-maila, wywołania z `changePassword` i resetu hasła, route'y `email-change` i `email-change/confirm`, kontener DI. Testy jednostkowe 100% (w tym ścieżki błędów wysyłki, limity, BR-35) i integracyjne (zajęty adres daje tę samą odpowiedź, unieważnienie linków resetu i sesji, jednorazowość linku).
5. **UI:** formularze na `/account` (stan okna 24 h, konto administratora), strona `/confirm-email-change`. Testy komponentów; agent-browser: scenariusz zmiany nazwy i adresu na szerokości 320 px, `npm run check:tokens -w @gomoku/ui`.
6. **Dokumentacja:** adnotacje w `2026-10-24-password-change.md` i `…-email-verification.md` (unieważnianie), przeniesienie tej specyfikacji do `implemented/` po spełnieniu kryteriów.
