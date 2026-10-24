# Zmiana hasła po zalogowaniu (E01-S05, #36)

> Status: **szkic autonomiczny** (`om-auto-write-spec`, 2026-10-24) — założenia odwracalne, do przeglądu przed merge'em. Źródło: issue #36, `.ai/specs/product-brief.md` (D-18), `.ai/specs/2026-10-24-account-registration.md` (G3, G5), `.ai/specs/2026-10-24-login-logout.md` (`/account`, `requireSession`, `RateLimiter.hit`, `PasswordField`, H1). Zależy od #19 i #20; `newPasswordSchema` współdzielony z #35.

## 📝 TLDR

Dziś (po #20) zalogowany użytkownik nie może zmienić hasła inaczej niż resetem przez e-mail. Po wdrożeniu (zachowanie przyszłe): na `/account` formularz „Zmień hasło” (aktualne + nowe, reguła G3), po sukcesie inne sesje konta są unieważniane, a bieżąca zostaje.

## Resolved assumptions (autonomous defaults)

| # | Pytanie | Zastosowane założenie | Dlaczego | Potwierdzenie |
|---|---|---|---|---|
| Q1 | Limit prób aktualnego hasła | 10 nieudanych na konto w 15 min → `429`; licznik atomowy przed weryfikacją, zerowany po sukcesie (wzorzec H1). | Skradziona sesja nie może bez końca zgadywać hasła, żeby je przejąć. | odwracalne |
| Q2 | Powiadomienie e-mailem o zmianie | Brak w tej specyfikacji. | Każda wysyłka zużywa darmowy limit (D-20); możliwe jako osobne zgłoszenie. | odwracalne |
| Q3 | Nowe hasło równe aktualnemu | Odrzucone (`fieldErrors.password`: „Nowe hasło musi się różnić od obecnego”). | Zmiana bez zmiany nie unieważnia sensownie sesji. | odwracalne |
| Q4 | Sesje po zmianie | Unieważnione wszystkie poza bieżącą (także te w trakcie partii — G5 nie chroni przed unieważnieniem). | Typowe oczekiwanie po zmianie hasła; bieżące urządzenie zostaje zalogowane. | odwracalne |

## 📝 Problem Statement

- **Kto:** zalogowany użytkownik (D-18). Bez dowodu popytu (A-01).
- **Kryteria z #36:** (1) aktualne + nowe hasło → zmiana; (2) błędne aktualne → odrzucenie, próby ograniczone limitem; (3) po zmianie pozostałe sesje unieważnione, bieżąca zostaje.

## 📝 Proposed Solution

`POST /api/auth/password` (`requireSession`, `apiHandler`) → limit (Q1) → `passwordChangeSchema` (`currentPassword` bez reguł, `newPassword` = `newPasswordSchema` z #35) → `UserService.changePassword(userId, current, new)` → `SessionService.revokeOthers(userId, currentSessionId)`. `requireSession()` z #20 zwraca dziś użytkownika — ten PR dodaje wariant zwracający `{ user, session }` (identyfikator bieżącej sesji). Zmiana jest jedną transakcją: weryfikacja aktualnego hasła, `UPDATE users SET password_hash = <nowy> WHERE id = ? AND password_hash = <odczytany>` (0 wierszy → `INVALID_CURRENT_PASSWORD` — chroni przed równoległą zmianą), usunięcie pozostałych sesji i niewykorzystanych tokenów resetu (#35). Formularz na `/account` (strona z #20). **Odrzucone:** zmiana bez aktualnego hasła (skradziona sesja przejęłaby konto), osobna strona `/account/password` (jeden formularz mieści się na `/account`). **Poza zakresem:** zmiana e-maila i nazwy (E05), powiadomienie (Q2).

## 📝 Data Model

Brak nowych encji. `users.passwordHash` (nowy hash bcrypt, async, koszt 12), `sessions` (usuwane wiersze poza bieżącym), `rate_limit_buckets` (klucz `password-change:user:<id>`).

## 📝 API Contracts

`POST /api/auth/password` — `{ "currentPassword": "…", "newPassword": "…" }`

| Wynik | Status | Treść |
|---|---|---|
| Zmieniono | `200` | `{ ok: true, data: null }` |
| Błędne aktualne hasło | `400` | `code: "INVALID_CURRENT_PASSWORD"`, `fieldErrors.currentPassword` |
| Nowe hasło niezgodne z G3 lub równe aktualnemu | `400` | `code: "VALIDATION"`, `fieldErrors.newPassword` |
| Brak sesji | `401` | `code: "UNAUTHORIZED"` |
| Limit (Q1) | `429` | `code: "RATE_LIMITED"` + `Retry-After` |
| CSRF | `403` | `code: "FORBIDDEN"` |

## 📝 UI/UX

Sekcja „Zmień hasło” na `/account`: dwa `PasswordField` z „Pokaż hasło” (`autocomplete="current-password"` i `"new-password"`, H2), podpowiedź „co najmniej 16 znaków”, przycisk „Zmień hasło”; sukces w `role="status"` „Hasło zmienione. Inne urządzenia zostały wylogowane.” i wyczyszczenie pól; błędy przy polach. Telefon od 360 px (BR-20). Mockupy: pominięte — brak deskryptora `om-prepare-test-env`.

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Co widzi użytkownik |
|---|---|
| Sesja wygasła w trakcie wypełniania | `401` → przekierowanie na `/login?next=/account`. |
| Dwie równoległe zmiany | Obie mogą przejść bcrypt na starym hashu, ale warunkowy `UPDATE … WHERE password_hash = <odczytany>` przepuszcza tylko pierwszą; druga → `INVALID_CURRENT_PASSWORD`. |
| Otwarty link resetu (#35) wysłany przed zmianą | Unieważniony w tej samej transakcji. |
| Inne urządzenie w trakcie partii | Traci sesję (Q4) — zegar biegnie (BR-06). |
| Baza niedostępna | `500 INTERNAL`; hasło bez zmian (jedna transakcja: hash + unieważnienie sesji). |

## 📝 Risks & Impact Review

`risk-high` (logowanie i sesje): testy integracyjne każdego kryterium, limitu i CSRF; review drugiej osoby; QA bez self-QA. Brak migracji — rollback = revert.

## 📝 Decisions in play

D-18, D-12, specyfikacje #19 (G3, G5), #20 (H1, H2, `requireSession`), #35 (`newPasswordSchema`). Właściciel: Bartosz Wójcik.

## 📋 Phasing

Jedna faza, jeden PR (`Closes #36`), po #20; jeśli #35 jeszcze nie wydzielił `newPasswordSchema`, robi to ten PR.

## 📋 Implementation Plan

1. `passwordChangeSchema` (+ `newPasswordSchema`, jeśli brak). Testy reguł i równości haseł.
2. `requireSession` z bieżącą sesją, `UserService.changePassword` (warunkowy `UPDATE`) i `SessionService.revokeOthers` + unieważnienie tokenów resetu w jednej transakcji. Testy jednostkowe, w tym 0 zaktualizowanych wierszy.
3. Route `api/auth/password/route.ts`. Testy integracyjne: zmiana → stare hasło nie loguje, nowe loguje; druga sesja unieważniona, bieżąca działa; `400`/`401`/`403`/`429`.
4. Formularz na `/account`. Testy komponentu; agent-browser: zmiana hasła na szerokości telefonu.

## 📝 Ustalenia z przesłuchania (grill-me, 2026-10-24)

Potwierdzone przez właściciela — Bartosza Wójcika.

- **Q4 bez wyjątku G5:** sesje innych urządzeń są unieważniane także w trakcie partii (zegar biegnie, BR-06). Formularz „Zmień hasło” pokazuje ostrzeżenie: „Inne urządzenia zostaną wylogowane, także w trakcie partii”.
