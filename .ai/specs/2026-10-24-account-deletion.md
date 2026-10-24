# Usunięcie konta z anonimizacją partii (E01-S06, #37)

> Status: **zatwierdzona** (`om-auto-write-spec`, 2026-10-24; założenia potwierdzone przez właściciela — Bartosz Wójcik, „a” — 2026-10-24).

## 📝 TLDR

Dziś (po #20) nie da się usunąć konta. Po wdrożeniu (zachowanie przyszłe): na `/account` „Usuń konto” z ponownym podaniem hasła usuwa od razu konto, e-mail, hash hasła, sesje i tokeny; zakończone partie zostają u przeciwników z nazwą „Usunięty gracz” (BR-17); przy aktywnej partii usunięcie jest odrzucane (BR-21).

## Resolved assumptions (autonomous defaults)

| # | Pytanie | Zastosowane założenie | Dlaczego | Potwierdzenie |
|---|---|---|---|---|
| Q1 | Jak zachować partie po usunięciu konta? | Usuwamy wiersz `users` (twarde usunięcie); uczestnik partii (#29) ma `user_id` **NULL-owalne z `on delete set null`**, a historia wyświetla NULL jako „Usunięty gracz”. Wymaga tego kształtu w migracji #29. | Dane osobowe znikają naprawdę (BR-17), bez „zombie” konta; historia przeciwnika zostaje (BR-24). | ✅ potwierdzone przez właściciela 2026-10-24 — narzuca kształt schematu #29 |
| Q2 | Potwierdzenie usunięcia | Ponowne podanie hasła + zaznaczenie „Rozumiem, że tego nie da się cofnąć”; limit 10 nieudanych prób na konto w 15 min (wzorzec H1). | Nieodwracalne działanie; skradziona sesja nie usunie konta bez hasła. | odwracalne |
| Q3 | Okres karencji / przywrócenie konta | Brak — usunięcie natychmiastowe i nieodwracalne. | BR-17 („kasuje od razu”); karencja to przechowywanie danych, którego brief nie przewiduje. | ✅ potwierdzone przez właściciela 2026-10-24 — nieodwracalność |
| Q4 | Ponowna rejestracja tym samym e-mailem / nazwą | Dozwolona od razu (wiersz zniknął, unikalne indeksy wolne). | Brak powodu blokowania; stare partie wskazują „Usunięty gracz”, nie nazwę. | odwracalne |

## 📝 Problem Statement

- **Kto:** zalogowany użytkownik, który chce usunąć swoje dane (D-16). Bez dowodu popytu (A-01).
- **Kryteria z #37:** (1) potwierdzenie z hasłem → konto, e-mail, hash, sesje znikają, wylogowanie; (2) przeciwnik widzi partie z „Usunięty gracz”; (3) logowanie danymi usuniętego konta się nie udaje; (4) aktywna partia → odrzucenie „Najpierw dokończ albo poddaj partię” (BR-21).

## 📝 Proposed Solution

`POST /api/account/delete` (`requireSession`, `apiHandler`; POST zamiast DELETE z treścią — treść w DELETE bywa gubiona przez proxy) → limit (Q2) → `accountDeleteSchema` (`password`, `confirm: true`) → `activeGameCheck.hasActiveGame` (BR-21) → `AccountService.delete(userId, password)` w jednej transakcji → usunięcie ciasteczka (jak w #20). Kaskady w bazie: `sessions`, `email_verification_tokens` (#34), `password_reset_tokens` (#35), wpis lobby (#31), niewykorzystane zaproszenia utworzone przez użytkownika (#21/#29) — `on delete cascade`; uczestnik partii (#29) — `set null` (Q1). **Odrzucone:** miękkie usunięcie z flagą (dane osobowe zostają — sprzeczne z BR-17), anonimizacja przez nadpisanie e-maila i nazwy (konto-widmo zajmuje unikalne indeksy, łatwo o wyciek starych danych w kopiach). **Poza zakresem:** eksport danych, panel administratora do usuwania kont.

## 📝 Data Model

Brak nowych encji. Wymaganie wobec **#29**: `game_players.user_id` NULL-owalne, FK `on delete set null`; widok historii (#27) mapuje NULL na „Usunięty gracz” (gość z zaproszenia — BR-24 — ma osobny znacznik i wyświetla „Zaproszony przez link”, więc oba przypadki muszą być rozróżnialne, np. kolumna `kind` = `account` | `guest`). Wymaganie wobec #31, #34, #35: FK do `users` z `on delete cascade`. Klucze limitu (#19/#20) są hashami — nie wymagają usuwania.

## 📝 API Contracts

`POST /api/account/delete` — `{ "password": "…", "confirm": true }`

| Wynik | Status | Treść |
|---|---|---|
| Usunięto | `200` | `{ ok: true, data: null }` + ciasteczko usunięte |
| Błędne hasło | `400` | `code: "INVALID_PASSWORD"`, `fieldErrors.password` |
| Brak potwierdzenia | `400` | `code: "VALIDATION"`, `fieldErrors.confirm` |
| Aktywna partia (BR-21) | `409` | `code: "ACTIVE_GAME"`, „Najpierw dokończ albo poddaj partię.” |
| Brak sesji | `401` | `code: "UNAUTHORIZED"` |
| Limit (Q2) | `429` | `code: "RATE_LIMITED"` + `Retry-After` |
| CSRF | `403` | `code: "FORBIDDEN"` |

## 📝 UI/UX

Sekcja „Usuń konto” na `/account` (na dole, wizualnie oddzielona): opis skutków („Twoje konto, e-mail i hasło zostaną usunięte od razu i na zawsze. Twoje zakończone partie zostaną u przeciwników jako »Usunięty gracz«.”), `PasswordField`, pole wyboru potwierdzenia, przycisk „Usuń konto na zawsze” (nieaktywny bez zaznaczenia); po sukcesie przekierowanie na `/` z komunikatem „Konto zostało usunięte”. Telefon od 360 px (BR-20). Mockupy: pominięte — brak deskryptora `om-prepare-test-env`.

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Co widzi użytkownik |
|---|---|
| Aktywna partia | `409` z komunikatem BR-21 (w #37 przed #21/#22 funkcja `activeGameCheck` zwraca `false`). |
| Partia startuje równolegle z usuwaniem | Transakcja usunięcia sprawdza aktywną partię z blokadą wiersza `users` (`SELECT … FOR UPDATE`); tworzenie partii (#21, #26) blokuje te same wiersze. **Reguła dla wszystkich (wymaganie wobec #21, #26, #29, #31): wiersze `users` blokujemy zawsze w kolejności rosnącego `id`** — parowanie z lobby blokuje dwóch graczy, więc bez stałej kolejności grozi zakleszczenie. |
| Inne urządzenia zalogowane | Ich sesje znikają kaskadowo — następne żądanie jest niezalogowane. |
| Baza niedostępna | `500`; nic nie zostało usunięte (jedna transakcja). |
| Usunięty gracz w historii przeciwnika | „Usunięty gracz” (Q1); gość — „Zaproszony przez link” (BR-24). |

## 📝 Risks & Impact Review

- **Nieodwracalność (Q3)** — błąd w kaskadach usuwa za dużo albo za mało; testy integracyjne sprawdzają każdą tabelę po usunięciu oraz to, że partie przeciwnika zostały.
- **Sprzężenie ze schematem #29 (Q1)** — jeśli #29 powstanie bez `set null`, usunięcie konta z partiami złamie FK; specyfikacja #29 musi przyjąć wymaganie (komentarz w #29).
- `risk-high` (dane konta, sesje, wspólny kontrakt schematu): review drugiej osoby; QA bez self-QA.
- Kopie zapasowe bazy (jeśli powstaną) nadal zawierają usunięte dane — polityka kopii poza zakresem (D-22 / informacja o danych).

## 📝 Decisions in play

D-16, BR-17, BR-21, BR-24, BR-22, D-22; specyfikacja #20 (H1, `activeGameCheck`, `requireSession`). Właściciel: Bartosz Wójcik.

## 📋 Phasing

Jedna faza, jeden PR (`Closes #37`), **po #20, #29 i prawdziwej implementacji `activeGameCheck`** (z #21/#22 albo w tym PR na modelu z #29) — bez niej usunięcie konta w trakcie partii złamałoby BR-21. Kaskady #31/#34/#35 sprawdzane, gdy te tabele istnieją.

## 📋 Implementation Plan

1. `accountDeleteSchema`. Testy.
2. `AccountService.delete` (weryfikacja hasła, blokada wiersza, `activeGameCheck`, usunięcie). Testy jednostkowe na fałszywym `em`.
3. Route `api/account/delete/route.ts` (`POST`). Testy integracyjne: po usunięciu brak wierszy w `users`, `sessions` i tabelach tokenów; partia przeciwnika z `user_id` NULL wyświetlana jako „Usunięty gracz”; logowanie się nie udaje; ponowna rejestracja tym e-mailem działa; `409` przy aktywnej partii (fałszywa partia w bazie testowej); `400`/`401`/`403`/`429`.
4. Sekcja na `/account`. Testy komponentu (przycisk nieaktywny bez potwierdzenia); agent-browser na szerokości telefonu.
5. Komentarz w #29 o wymaganiu `set null` i rozróżnieniu `account`/`guest`.
