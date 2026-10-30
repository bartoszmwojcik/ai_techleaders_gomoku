# Usunięcie konta z anonimizacją partii (E01-S06, #37)

> Status: **zatwierdzona 2026-10-24** (`om-auto-write-spec`; założenia Q1–Q4 potwierdzone przez właściciela — Bartosz Wójcik). **Zaktualizowana 2026-10-30** (`om-spec-writing`, tryb interaktywny) do stanu kodu po E02 (#29, #21–#24, E02-S07, E02-S08; poddanie #87 i rewanż #88 w toku): zmiany względem wersji z 24.10 opisuje sekcja „Zmiany względem wersji z 2026-10-24”. Decyzje właściciela Q1–Q4 i z przesłuchania **nie zmieniły się**; kwestie **O1–O6** i pięć pytań z przeglądu prototypu (PR #105) **rozstrzygnął właściciel 2026-10-30** („zgoda na rekomendacje”) — sekcja „Open Questions (Resolved 2026-10-30)”.

## 📝 TLDR

Dziś (po #20 i E02) nie da się usunąć konta, choć baza jest już na to gotowa (`game_players.user_id` ma `on delete set null`, `kind` odróżnia konto od gościa, ekran gry pokazuje „Usunięty gracz”). Po wdrożeniu (zachowanie przyszłe): na `/account` „Usuń konto” z ponownym podaniem hasła usuwa od razu wiersz `users`, a z nim sesje i tokeny; oczekujące partie konta znikają, zakończone zostają u przeciwników jako „Usunięty gracz” (BR-17); przy partii w toku usunięcie jest odrzucane komunikatem z **linkiem do partii** i drogą wyjścia przez poddanie (BR-21, E02-S05).

## ✅ Decyzje (Resolved)

Q1–Q4 zatwierdzone 2026-10-24 i obowiązujące; Q5–Q9 wynikają z przesłuchania, briefu i kodu. Kolumna „Stan w kodzie” pokazuje, co już istnieje.

| # | Pytanie | Decyzja | Dlaczego | Stan w kodzie (2026-10-30) |
|---|---|---|---|---|
| Q1 | Jak zachować partie po usunięciu konta? | Twarde usunięcie wiersza `users`; uczestnik partii zostaje z `user_id = NULL` i `kind = 'account'`, historia pokazuje „Usunięty gracz”. ✅ właściciel | Dane osobowe znikają naprawdę (BR-17), historia przeciwnika zostaje (BR-24). | **Gotowe:** `game_players.user_id` NULL-owalne, FK `on delete set null` (`Migration20261029143711`), `game_players_guest_no_user_check` dopuszcza `account` bez użytkownika, `lib/games/play.ts` nazywa go „Usunięty gracz”. |
| Q2 | Potwierdzenie usunięcia | Ponowne podanie hasła + pole „Rozumiem, że tego nie da się cofnąć”; limit 10 nieudanych prób na konto w 15 min (wzorzec H1, jak `PASSWORD_CHANGE_LIMIT`). | Nieodwracalność; skradziona sesja nie usunie konta bez hasła. | Wzorzec gotowy w `api/auth/password/route.ts`. |
| Q3 | Karencja / przywrócenie | Brak — natychmiast i nieodwracalnie. ✅ właściciel | BR-17 „kasuje od razu”. | — |
| Q4 | Ponowna rejestracja tym samym e-mailem / nazwą | Dozwolona od razu. | Stare partie wskazują „Usunięty gracz”, nie nazwę (brak ryzyka podszycia się). | — |
| Q5 | Co blokuje (BR-21) | Tylko partia `active` konta; w serwisie rozstrzyga ją zapytanie pod blokadą (krok 4b–c, status `active` niezależnie od `is_active`), a UI pokazuje stan przez `currentGame`/`hasActiveGame`. Partia `waiting` i wpis w lobby nie blokują. ✅ właściciel (grill-me 2026-10-24) | Zgodnie z przesłuchaniem. | `hasActiveGame` vs `occupiesSlot` rozdzielone w kodzie. |
| Q6 | Co z partią `waiting` konta | **Usuwana w transakcji usunięcia** (wiersze `games`; `game_players` i `invitations` kaskadą). Nie `GameService.cancel`. | Nie ma przeciwnika ani historii; `cancelled` zostawiłby „widmo” na 25 h do sprzątania (#39) i inny komunikat pod linkiem. Zgodne ze specyfikacją zaproszeń („twórca usuwa konto z oczekującą partią: link → nieważne”). | `cancel` nie jest używany. |
| Q7 | Partia `active`, której zegar wygasł albo nikt jej nie otworzył | Przed sprawdzeniem BR-21 serwis leniwie zamyka stare sloty konta: `timeoutSettler.settleFor(userId)` (przegrana na czas) i `closeStaleSlotsOfUser` (nieotwarta 15 min → `cancelled`). Blokuje tylko partia naprawdę w toku. | Inaczej fałszywe `409` (jak Q16/Q17 specyfikacji zaproszeń). | Oba mechanizmy istnieją (`timeout-settler.ts`, `lazy-closing.ts`). |
| Q8 | E-mail o usunięciu konta | **Nie wysyłamy.** Brief tego nie wymaga (BR-17 mówi o danych, nie o powiadomieniach); #38 **nie** jest zależnością tej funkcji. | Zakres i koszt poczty (D-20). | — |
| Q9 | Limity per adres klienta | Tylko limit per konto (Q2); limit per adres zbędny, bo wymaga ważnej sesji i hasła. Ustalenie z przesłuchania o wiarygodnym adresie (spike #30) dotyczy innych limitów. | Mniejsza powierzchnia. | — |

## 📝 Problem Statement

- **Kto:** zalogowany użytkownik, który chce usunąć swoje dane (D-16). Bez dowodu popytu (A-01).
- **Kryteria z #37:** (1) potwierdzenie z hasłem → konto, e-mail, hash, sesje znikają, wylogowanie; (2) przeciwnik widzi partie z „Usunięty gracz”; (3) logowanie danymi usuniętego konta się nie udaje; (4) aktywna partia → odrzucenie „Najpierw dokończ albo poddaj partię” (BR-21), z linkiem do partii (zadanie 5.4 w `track-e02.md`).
- **Dlaczego teraz:** zależności są gotowe (tabele partii, `hasActiveGame`, kolejność blokad, `timeoutSettler`); brakuje tylko UI poddania (#87, 5.4) jako drogi wyjścia.

## Zmiany względem wersji z 2026-10-24

| Obszar | Było (24.10) | Jest (30.10) | Dlaczego |
|---|---|---|---|
| Schemat | „Wymaganie wobec #29”: `set null`, `kind` | **Spełnione**; spec nie zmienia kolumn. Jedyna migracja: indeks `game_players(user_id)` (krok 2) | Akcja `set null`, sprzątanie i historia (#27) skanowałyby całą tabelę — indeksu nie ma (są tylko unikaty) |
| Gość | „Zaproszony przez link” | Gość to „{nick} (gość)” (BR-29, D-27); **`user_id IS NULL` nie wystarcza do rozpoznania usuniętego konta — rozstrzyga `kind = 'account'`** | E02-S07/S08: gość też ma `user_id NULL` |
| Partia `waiting` konta | „usuwana kaskadą razem z kontem” | Jawne usunięcie wierszy `games` w transakcji (Q6) | `game_players.game_id` kaskaduje z gry, a nie z użytkownika — przy samym `set null` twórca zostałby w „widmowej” partii |
| Blokada BR-21 | Komunikat bez linku; `gameParticipation` jako atrapa | Komunikat z **linkiem do partii** (`data.gameId`), prawdziwy `GameParticipation`, leniwe zamykanie starych slotów (Q7) | Zadanie 5.4; blokada ma wskazywać wyjście |
| Współbieżność | Postulat: blokuj `users` rosnąco po `id` | Kolejność **users (po `id`) → games (po `id`) → zapis** jest wdrożona w `invitation-service.ts` i `timeout-settler.ts`; usunięcie ją przejmuje | Reguła istnieje w kodzie |
| Rewanż | brak | Oferta rewanżu z udziałem usuwanego konta jest zamykana; wymóg `REMATCH_UNAVAILABLE` (Edge Cases) | E02-S06 (#88) |
| UI | sekcja w `/account` | Jak wyżej + stan blokady z linkiem, sukces przez `/?notice=account-deleted` (mechanizm `notice` istnieje na `/`), luka w prototypie (O3) | Powrót po usunięciu bez nowej infrastruktury |
| Sprzątanie | Reguła 14 dni zablokowana do #29 (9.4) | Odblokowana — krok 8 tego zadania (O4) | Tabela `game_players` istnieje |
| Zasady pracy | — | Zapisy w transakcji tylko przez `tx`, surowy SQL przez `?`, brak `down` na bazie dev, `useRef` przy podwójnym kliknięciu (lekcje 2026-10-27…29) | Wdrożone lekcje |

## 📝 Proposed Solution

`POST /api/account/delete` (`apiHandler` + CSRF; POST zamiast DELETE z treścią — proxy bywa, że gubią treść DELETE) → `requireSessionWithId` (401) → `accountDeleteSchema` (`password`, `confirm: true`; 400, nie zużywa próby) → `rateLimiter.hit("account-delete:user:{id}", 10, 15 min)` przed wolnym sprawdzeniem hasła → `AccountService.delete(userId, password)` → `clearSessionCookie` → `200`. Limit liczy tylko złe hasła: sukces robi `reset`, pozostałe wyniki przy poprawnym haśle oddają próbę (`release`).

**`AccountService.delete`** (nowy serwis, `src/server/services/auth/account-service.ts`, zależności `{ em, passwordHasher, timeoutSettler, clock }`, rejestrowany jawnie w `container.ts`):

1. `findOne(User)`; brak → `UnauthorizedError` (konto już usunięte).
2. `passwordHasher.verify` **przed** transakcją (bcrypt nie trzyma połączenia); błąd → `ValidationError` `INVALID_PASSWORD` z `fieldErrors.password` (400).
3. Leniwe zamykanie starych slotów (Q7), poza transakcją, własnymi krótkimi transakcjami: `timeoutSettler.settleFor(userId)` i `closeStaleSlotsOfUser(em, userId, now)`.
4. **Jedna transakcja `em.transactional(tx)`, zapisy wyłącznie przez `tx`**, surowy SQL przez `tx.execute` z `?`:
   a. blokada wiersza użytkownika: `select id from users where id = ? for no key update`; 0 wierszy (przegrany wyścig dwóch usunięć) → `UnauthorizedError` (401, nie `INVALID_PASSWORD`);
   b. blokada gier konta w statusach `waiting`/`active`: `select g.id, g.status from games g join game_players p on p.game_id = g.id where p.user_id = ? and g.status in ('waiting','active') order by g.id for update of g`;
   c. **BR-21:** jeśli którakolwiek z gier ma `status = 'active'` → `ConflictError` `ACTIVE_GAME` z `data: { gameId }` (rzut przed jakimkolwiek zapisem);
   d. usunięcie gier `waiting` konta (Q6): `delete from games where id in (…)` (kaskada: `game_players`, `invitations`);
   e. zamknięcie propozycji rewanżu z udziałem konta (O2), z zachowaniem kolejności blokad: `select g.id from games g join game_players p on p.game_id = g.id where p.user_id = ? and g.rematch_state = 'pending' order by g.id for update of g`, potem `update games set rematch_state = 'declined' where id in (…)`;
   f. `delete from users where id = ? and password_hash = ?` (warunek na zweryfikowanym haszu — ochrona przed wyścigiem ze zmianą hasła, jak w `changePassword`); 0 wierszy przy istniejącym użytkowniku (hasz zmieniony) → `INVALID_PASSWORD`. Akcje FK: patrz Data Model.

**Tworzenie partii a usuwanie (wymóg wobec `GameService.create`):** wstawienie `game_players` z `user_id` bierze na `users` tylko `FOR KEY SHARE`, który nie koliduje z blokadą z kroku 4a — bez zmiany `create` równoległe utworzenie partii i usunięcie konta zostawiłoby partię `waiting` z uczestnikiem `account`/`user_id NULL`/`is_active` i żywym zaproszeniem. Dlatego `GameService.create` (konto) w swojej transakcji, przed `#insertGame`, blokuje `select id from users where id = ? for no key update` (jak już robi dołączanie w `invitation-service`); krok 3 planu.
5. Poza transakcją: `rateLimiter.reset`, usunięcie ciasteczka sesji. Licznik próby: `release` w `finally` dla każdego wyniku poza błędnym hasłem (409, 401, 500 po poprawnym haśle); `reset` po sukcesie.

**Odrzucone:** miękkie usunięcie z flagą i anonimizacja przez nadpisanie e-maila/nazwy (sprzeczne z BR-17, stare dane w kopiach); dodatkowa kolumna „konto usunięte” w `game_players` (redundantna wobec `kind = 'account' AND user_id IS NULL`); `GameService.cancel` dla `waiting` (Q6); automatyczne poddawanie partii w toku za użytkownika (nieodwracalny wynik bez jego woli — użytkownik sam wybiera poddanie); e-mail o usunięciu (Q8). **Poza zakresem:** eksport danych, panel administratora do usuwania kont, ciasteczka gościa (niezwiązane z kontem).

## 📝 Architecture

- `@gomoku/core`: `accountDeleteSchema` (wzorem `passwordChangeSchema`); bez zależności od Reacta i ORM.
- `@gomoku/db`: migracja z indeksem (krok 2), reguła sprzątania (krok 8); encje bez zmian poza `.index()` na `GamePlayer.user`.
- `@gomoku/app`: `AccountService` (scoped, nowy), `api/account/delete/route.ts`, `account/delete-account-form.tsx`, komunikat na `/` (`notice=account-deleted`).
- Reużywane bez zmian: `GameParticipation.currentGame` (UI), `TimeoutSettler`, `closeStaleSlotsOfUser`, `RateLimiter` (`hit`/`release`/`reset`), `PasswordHasher`, `clearSessionCookie`, `apiHandler` (CSRF: `Origin` + nagłówek `x-gomoku-request`), wzorzec ze `ChangePasswordForm`.
- **Kolejność blokad w całej aplikacji:** `users` (rosnąco po `id`) → `games` (rosnąco po `id`) → `game_players`. Usunięcie ją zachowuje (blokuje jednego użytkownika, potem swoje gry rosnąco). Samo `DELETE FROM users` najpierw blokuje wiersz użytkownika, a dopiero potem wykonuje akcje referencyjne (`set null` na `game_players`), więc nie odwraca kolejności względem usług, które trzymają blokadę gry i modyfikują `game_players`. Tego rozumowania nie zastępuje test: zakleszczenie sprawdza test współbieżny na PostgreSQL (krok 4).

## 📝 Data Model

**Brak zmian kolumn.** Kształty, na których spec się opiera (zastosowanych migracji nie edytować):

| Tabela | Reguła FK do `users` | Skutek usunięcia |
|---|---|---|
| `sessions`, `email_verification_tokens`, `password_reset_tokens` | `on delete cascade` | wszystkie sesje (każda przeglądarka) i tokeny znikają; wyjątek G5 (sesja po wygaśnięciu w trakcie partii) nie działa, bo wiersza już nie ma |
| `game_players.user_id` | `on delete set null` | wiersz uczestnika zostaje: `kind = 'account'`, `user_id NULL`, `is_active = false` (aktywnych nie ma — blokuje BR-21) |
| `invitations.consumed_by_id` → `game_players` | `set null` | bez zmian |
| `rate_limit_buckets` | brak FK | klucze to hashe lub identyfikatory bez PII; `account-delete:user:{id}` zerowany po sukcesie; pozostałe liczniki (np. `password-change:user:{id}`) sprząta #39 po 48 h — po usunięciu identyfikator nie wskazuje na nikogo |

**Unikalności i NULL:** `game_players_game_id_user_id_unique` i częściowy `game_players_user_id_active_unique` ignorują NULL, więc dwa usunięte konta w jednej partii nie kolidują.

**Migracja (jedyna, addytywna):** `create index game_players_user_id_index on game_players (user_id)` — dziś tabela ma tylko unikat `(game_id, user_id)` i częściowy po `is_active`; `DELETE FROM users` (akcja `set null`), reguła 14 dni (`NOT EXISTS`) i historia (#27) skanowałyby całą tabelę. Zgodność wsteczna (`BACKWARD_COMPATIBILITY.md` §4: dodanie indeksu nie jest zmianą łamiącą), rollback: `drop index`. **Wymaga sprawdzenia w górę i w dół na jednorazowym PostgreSQL** (nigdy `down`/drop na bazie dev; przed poleceniem wypisz `DATABASE_URL` — lekcja 2026-10-28). PR z etykietą `risk-high` i planem wycofania w opisie.

**Test-strażnik schematu (PostgreSQL):** każda kolumna z FK do `users` w `information_schema` ma `delete_rule` ∈ {`CASCADE`, `SET NULL`}; przyszła tabela z FK `NO ACTION` zepsuje ten test, a nie usuwanie konta.

## 📝 API Contracts

`POST /api/account/delete` — `{ "password": "…", "confirm": true }`

| Wynik | Status | Treść |
|---|---|---|
| Usunięto | `200` | `{ ok: true, data: null }` + ciasteczko sesji usunięte |
| Błędne hasło (także przegrany wyścig ze zmianą hasła) | `400` | `code: "INVALID_PASSWORD"`, `fieldErrors.password` |
| Brak potwierdzenia / puste hasło | `400` | `code: "VALIDATION"`, `fieldErrors.confirm` / `fieldErrors.password` |
| Aktywna partia (BR-21) | `409` | `code: "ACTIVE_GAME"`, „Najpierw dokończ albo poddaj partię.”, `data: { gameId }` |
| Brak sesji / konto już usunięte (także przegrane równoległe usunięcie) | `401` | `code: "UNAUTHORIZED"`; trasa usuwa ciasteczko sesji (sesji i tak już nie ma) |
| Limit (Q2) | `429` | `code: "RATE_LIMITED"` + `Retry-After` |
| CSRF | `403` | `code: "FORBIDDEN"` |
| Baza niedostępna | `500` | nic nie usunięto; ciasteczko **nie** jest usuwane (inaczej niż przy wylogowaniu: tu użytkownik ma ponowić operację) |

Kolejność kontroli: CSRF (403) → sesja (401) → walidacja (400, bez zużycia próby) → limit (429) → hasło (400) → leniwe zamykanie slotów → blokada i BR-21 (409). **Idempotencja:** drugie żądanie po sukcesie nie ma sesji → `401`; równoległe podwójne kliknięcie: jedno `200`, drugie `401` (po blokadzie wiersza użytkownika już go nie ma) — oba poprawne. Kontrakt `GET /api/games/{id}` bez zmian: usunięty gracz ma `displayName: null` przy `kind: "account"` (już istnieje).

## 📝 UI/UX

**Sekcja „Usuń konto”** na `/account`, pod „Zmień hasło”, wizualnie oddzielona (strefa niebezpieczna). Układ według istniejącego wzorca DS „Wzorce/Potwierdzenie usunięcia” (`packages/ui/docs/patterns/delete-confirmation.stories.tsx`: `Panel`, ostrzegawczy `Alert`, `Checkbox`, przycisk `danger` nieaktywny z widocznym powodem, `ConfirmDialog` z fokusem na „Zostaw konto”) plus `PasswordField` (O5) i obsługa błędów serwera.

Teksty (po polsku, przez propsy; komponenty DS nie mają wbudowanych tekstów):
- ostrzeżenie: „Twoje konto, e-mail i hasło zostaną usunięte od razu i na zawsze. Twoje zakończone partie zostaną u przeciwników jako »Usunięty gracz«.” Przy partii `waiting` dodatkowo: „Twoja oczekująca partia i jej zaproszenie zostaną usunięte.” (strona zna `currentGame`);
- dialog: „Usunąć konto {nazwa}?”, przyciski „Usuń konto na zawsze” / „Zostaw konto”.

| Stan | Zachowanie |
|---|---|
| Domyślny | Pole hasła, pole wyboru, przycisk nieaktywny; powód („Zaznacz potwierdzenie, aby usunąć konto.”) w `aria-describedby`. |
| Aktywna partia (z serwera, `currentGame.status = 'active'`) | `Alert` „Najpierw dokończ albo poddaj partię.” z linkiem „Przejdź do partii” (`/games/{id}`); przycisk nieaktywny. To samo pokazuje odpowiedź `409` (partia zaczęła się w międzyczasie). Po poddaniu (E02-S05) wystarczy odświeżyć stronę. |
| Dialog | Otwiera się po kliknięciu; fokus na „Zostaw konto”; Esc zamyka. |
| Usuwanie trwa | `confirming`; podwójne wysłanie blokuje `useRef` (lekcja 2026-10-29). |
| Błędne hasło (400) | Dialog się zamyka, błąd przy polu (`aria-invalid`, komunikat), fokus na polu. |
| Limit (429) | `ErrorMessage` z czasem ponowienia; dialog zamknięty. |
| Błąd serwera (500) / sieci | Dialog zostaje otwarty: „Nie udało się usunąć konta. Nic nie zostało zmienione. Spróbuj ponownie.” (wzorzec DS). |
| Sukces | Pełne przeładowanie na `/?notice=account-deleted` (`window.location.assign`, bo layout czyta sesję); `/` pokazuje zamykalny `DismissibleNotice` „Konto zostało usunięte”, bez sesji. |
| Sesja wygasła w trakcie | `401` → przekierowanie na `/login?next=/account`. |

Dostępność: `alertdialog` (jest w `ConfirmDialog`), etykiety pól, błędy powiązane z polami, fokus wraca na przycisk po zamknięciu, kontrast w obu motywach, 360 px bez poziomego przewijania (BR-20). `data-testid`: `delete-account-password`, `delete-account-confirm`, `delete-account-submit`, `delete-account-active-game`.

**Prototyp: luka (O3).** Prototyp `prototypes/konta-i-role` (`s05-account.tsx`) i mapa ekranów (`lekcja-07/mapa-ekranow.md`, s05; L19) **nie mają** usunięcia konta (świadomie poza zakresem). Jest tylko wzorzec DS (pole wyboru + dialog, bez hasła). **Brakujące stany:** panel z polem hasła; błąd hasła przy polu; blokada z linkiem do partii; limit prób; sukces na `/` z komunikatem; wariant z partią `waiting` (ostrzeżenie); wariant telefonu 360 px.

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Co się dzieje |
|---|---|
| Partia `active` konta | `409 ACTIVE_GAME` + link; nic nie zmienione. Wyjście: poddanie (E02-S05, `POST /api/games/[id]/resign`) albo dokończenie. |
| Partia `active` z wyczerpanym zegarem lub nieotwarta 15 min | Zamknięta leniwie przed sprawdzeniem (Q7); usunięcie przechodzi. Wyścig „zegar skończył się po kroku 3” daje co najwyżej zbędne `409`; ponowna próba przechodzi. |
| Partia `waiting` konta | Usunięta z zaproszeniem (Q6); link → jednolite „zaproszenie nieważne” (`INVALID_INVITATION`). |
| Wyścig: przeciwnik dołącza do `waiting` konta w trakcie usuwania | Dołączanie blokuje `users` → `games`, usunięcie blokuje użytkownika i swoje gry. Wygrywa pierwszy: dołączenie zatwierdzone → usunięcie widzi `active` i daje `409`; usunięcie zatwierdzone → dołączenie dostaje `INVALID_INVITATION`. |
| Wyścig: rewanż z udziałem konta | `accept` sprawdza BR-13 obu graczy pod blokadą `users`; jeśli powstał `active`, usunięcie daje `409`. Jeśli usunięcie wygrało, `accept` kończy `409 REMATCH_UNAVAILABLE`. |
| Oferta rewanżu `pending` złożona przez usuwane konto lub do niego | Zamykana w transakcji (`declined`, O2). Nowa oferta lub akceptacja wobec uczestnika `kind = 'account'` z `user_id NULL` → `409 REMATCH_UNAVAILABLE`, UI nie pokazuje „Rewanż”. **Wymaganie wobec #88**; kto wdraża drugi, dopisuje test. |
| Konta obojga graczy usunięte | Wiersze partii zostają z dwoma „Usunięty gracz”; partia nikomu nie jest widoczna (historia po `user_id`). Świadomy dług: żadna reguła `CLEANUP_RULES` nie obejmuje partii `finished`; do zapisania jako osobna pozycja w #39 / `track.md`, poza zakresem #37. |
| Partia `active`, do której przeciwnik jeszcze nie wszedł (< 15 min, brak `seen_at`) | Blokuje usunięcie (BR-21), a nieotwarta partia zamyka się dopiero po 15 min (Q7). **Do sprawdzenia przy 5.3:** czy poddanie jest możliwe przed `seen_at` obu graczy; jeśli nie, użytkownik czeka do 15 min bez drogi wyjścia — wtedy komunikat mówi o tym wprost albo 5.3 dopuszcza poddanie. |
| Utworzenie partii równolegle z usuwaniem | `GameService.create` blokuje wiersz użytkownika (zob. Proposed Solution): wygrywa pierwszy; po usunięciu `create` kończy się `401`/brakiem użytkownika, po `create` usunięcie usuwa świeżą partię `waiting` (Q6). |
| Partia zakończona z gościem | Gość widzi „Usunięty gracz” jako przeciwnika w oknie 1 h od końca (token gościa, BR-22). |
| Inne urządzenia zalogowane | Sesje znikają kaskadą; następne żądanie `401`/przekierowanie na `/login`. Ciasteczko gościa tej przeglądarki (E02-S08) zostaje nietknięte i niezwiązane z kontem. |
| Hasło zmienione równolegle | Warunek `password_hash = <zweryfikowany>` w `DELETE` → 0 wierszy → `INVALID_PASSWORD`. |
| Baza niedostępna / błąd w środku | `500`, jedna transakcja — nic nie usunięte, ciasteczko zostaje. |
| Ponowna rejestracja tym samym e-mailem/nazwą zaraz po usunięciu | Działa (Q4). |
| Logowanie danymi usuniętego konta | `INVALID_CREDENTIALS` (jak nieznany e-mail). |
| Historia (#27, jeszcze nie ma) | Wymaganie wobec niej: uczestnik `kind = 'account'` z `user_id NULL` → „Usunięty gracz”. |

## 📝 Risks & Impact Review

- **Nieodwracalność (Q3)** — błąd w kaskadach usuwa za dużo/za mało; mitygacja: test-strażnik FK, testy integracyjne każdej tabeli po usunięciu i tego, że partie przeciwnika zostały bez zmian (wynik, plansza, czas).
- **Zakleszczenia i partie „widma”** — nowy `DELETE FROM users` w systemie z blokadami `users → games → game_players`; mitygacja: ta sama kolejność (także w kroku 4e), blokada użytkownika w `GameService.create`, testy deterministyczne na dwóch połączeniach PostgreSQL (krok 4); fałszywy `em` i `Promise.all` tego nie dowodzą.
- **Migracja i snapshot:** `.snapshot-gomoku.json` w głównym repo ma niezacommitowaną zmianę — krok 2 zaczyna od czystego `origin/main`; indeks generować (`db:migration:create`), nie pisać ręcznie; sprawdzić nazwę zgodną z `sessions_user_id_index`.
- **Wydajność** — bez indeksu `game_players(user_id)` usunięcie konta, sprzątanie i historia skanują tabelę; migracja addytywna.
- **Zgodność wsteczna** — nowa trasa (§2) i indeks (§4) są addytywne; bez zmian kolumn i kodów istniejących tras. Etykieta `risk-high` (dane konta, sesje, destrukcja danych), review drugiej osoby, QA bez self-QA.
- **Kopie zapasowe** (jeśli powstaną) zawierają usunięte dane — poza zakresem (D-22).
- **Prywatność:** `409` ujawnia tylko `gameId` własnej partii zalogowanego; w logach bez hasła i e-maila (`describeError`).

## 📝 Decisions in play

D-16, BR-17 (kasuje e-mail, hash, sesje; partie jako „Usunięty gracz”), BR-21 (blokada, komunikat), BR-24 (historia kont; gość bez historii), BR-29 / D-27 („{nick} (gość)”), BR-13 (slot), BR-18, BR-20, BR-22, BR-28 (reguła 14 dni), D-22; **nie nadpisuje żadnej aktywnej decyzji** i brief pozostaje bez zmian. Specyfikacje: #20 (H1, `requireSession`), zaproszeń (blokady, Q16/Q17/Q21), poddania (Q6), rewanżu, E02-S07/S08, sprzątania (#39), uproszczenia konta. Właściciel: Bartosz Wójcik.

## ❓ Open Questions (Resolved 2026-10-30)

Wszystkie rozstrzygnięte **2026-10-30 — decyzja właściciela** („zgoda na rekomendacje”). Kolumna „Rozstrzygnięcie” zastępuje dawną „Rekomendację”.

| # | Pytanie | Rozstrzygnięcie (Resolved, decyzja właściciela 2026-10-30) |
|---|---|---|
| O1 | Ścieżka endpointu: `POST /api/account/delete` czy `POST /api/auth/account/delete`? | **`POST /api/account/delete`** — zgodna z tekstem zatwierdzonym 24.10, pierwszy punkt wejścia dla przyszłych operacji na koncie. |
| O2 | Oferta rewanżu `pending` z udziałem usuwanego konta: `declined` czy „Przeciwnik usunął konto”? | **Zamykana jako `declined`** (bez zmiany `CHECK`) + guard `REMATCH_UNAVAILABLE`. UI przeciwnika: tylko „Rewanż niedostępny”; alertu „Zaproszenie do rewanżu odrzucone” **nie ma** — zaproszenie zamykamy po cichu. Osobny tekst „usunął konto” dopiero przy UI rewanżu. |
| O3 | Czy przed kodem UI potrzebny jest prototyp? | **Tak — zrobione**: rozszerzenie `prototypes/konta-i-role` (stany s05.10–s05.20, s04.14, s08) w PR #105; krok 6 nie czeka na prototyp. |
| O4 | Reguła 9.4 (14 dni, BR-28): ten sam PR czy osobne zgłoszenie? | **Ten sam PR jako odrębny krok 8** (osobny commit). Warunek: `NOT EXISTS (… game_players …)` nie usuwa konta z jakąkolwiek partią, także `cancelled`. |
| O5 | Hasło w panelu czy w dialogu? | **W panelu**; dialog ma tylko opis i (patrz decyzja 4) slot na komunikat błędu. |
| O6 | E-mail „Twoje konto zostało usunięte”? | **Nie** (Q8). Gdy właściciel zechce: osobna historia po #38, z cichym pominięciem przy braku dostawcy. |

### Decyzje właściciela z przeglądu prototypu (2026-10-30)

1. **Bez licznika prób.** Błędne hasło daje `400` bez `data.attemptsLeft` i komunikat „Nieprawidłowe hasło.”; po 10 błędach w 15 minutach `429` z czasem odczekania („Zbyt wiele prób — Spróbuj ponownie za {n} min.”). `attemptsLeft` NIE wchodzi do kontraktu API.
2. **Widok przeciwnika:** komunikat „Rewanż niedostępny” — TAK; „Zaproszenie do rewanżu odrzucone” — NIE (oferta `pending` zamykana po cichu).
3. **Blokada s05.12:** tekst wprost każe wybrać „Poddaj partię” na stronie partii i odświeżyć stronę „Konto”. Poddanie przed otwarciem partii jest możliwe (potwierdzone w kodzie: `GameMoveService.resign` dopuszcza poddanie w każdej partii `active`).
4. **Komponenty DS:** `Alert`; panel z obramowaniem `status-danger` jako „strefa niebezpieczna”; slot na komunikat w `ConfirmDialog` — mała zmiana DS w tym samym PR co implementacja #37 (luki DU1/DU2 zostają w prototypie jako `LUKA` z adnotacją „zatwierdzone do wdrożenia”). To zastępuje „Bez zmian w DS” z dawnej rekomendacji O5; dotyczy tylko slotu komunikatu, pole hasła zostaje w panelu.
5. **Mapa:** ekran s08 zostaje w mapie kont (`lekcja-07/mapa-ekranow.md`, sekcja 7), nie trafia do `mapa-ekranow-partia.md`.

## 📋 Phasing

Jedna faza, jeden PR (`Closes #37`). Zależności z `track-e02.md`: kroki 1–4 nie czekają na nic; krok 5 (test „po poddaniu usunięcie przechodzi”) wymaga endpointu poddania (5.3); kroki 6–7 wymagają UI poddania (5.4) i O3. Reszta zależności jest na `main`. Rewanż (#88) nie jest warunkiem: kolumny rewanżu są od fazy 1, a guard `REMATCH_UNAVAILABLE` dopisuje ten, kto wdraża drugi. Każdy krok zostawia działającą aplikację; funkcja jest niewidoczna dla gracza do kroku 6.

- **A (kroki 1–5):** core → db → `create` i serwis → testy PostgreSQL → API.
- **B (kroki 6–7):** UI (po O3), testy przeglądarkowe, dokumentacja.
- **C (krok 8, O4):** reguła 14 dni, osobny commit; w razie potrzeby wydzielany do osobnego PR bez zmian w A i B. Wymaga rozszerzenia unii `key` w `CleanupRule` i typu wyniku `cleanupExpired`, testu kolejności względem `waitingGames`/`cancelledGames` (konto traci ostatnią partię dopiero po ich sprzątnięciu — zgodne z BR-28, jeśli ta kolejność jest oczekiwana) i testu na PostgreSQL kwalifikacji `users.id` w podzapytaniu.

## 📋 Implementation Plan

1. **`core`:** `accountDeleteSchema` (`password` niepuste, `confirm: z.literal(true)`) + testy (100%).
2. **`db`:** migracja z indeksem `game_players_user_id_index` + `.index()` w encji `GamePlayer`; sprawdzenie **w górę i w dół na jednorazowym PostgreSQL** (osobny kontener; przed poleceniem wypisz `DATABASE_URL`, nigdy `down`/drop na bazie dev); aktualizacja `.snapshot-gomoku.json`.
3. **`GameService.create`:** blokada `users … for no key update` przed `#insertGame` (konto) + test jednostkowy i PostgreSQL (create ∥ delete). **`AccountService.delete`** + rejestracja w `container.ts` + testy jednostkowe na fałszywym `em`/`tx`: błędne hasło, brak użytkownika, `409` z `gameId`, usunięcie gier `waiting`, zamknięcie rewanżu, 0 wierszy `DELETE` → `INVALID_PASSWORD`, `settleFor`/`closeStaleSlotsOfUser` przed transakcją, zapisy tylko przez `tx`.
4. **Testy na prawdziwym PostgreSQL** (`tests/integration/account-delete-db.test.ts`): test-strażnik FK do `users`; kaskady po usunięciu (każda tabela); partie przeciwnika bez zmian; rollback przy `409` i przy błędzie w środku; dwa konta usunięte w jednej partii. **Współbieżność deterministycznie, nie `Promise.all`:** dwa połączenia `pg`, transakcja A wstrzymana na blokadzie (np. po wstawieniu uczestnika albo `FOR UPDATE` gry), B uruchamia usunięcie, asercja przez `pg_locks`/`pg_stat_activity`, że B czeka, commit A i sprawdzenie stanu końcowego; niskie `deadlock_timeout`/`lock_timeout`. Obowiązkowe scenariusze: create ∥ delete, join ∥ delete, delete ∥ delete tego samego konta (drugi → 401), delete ∥ zmiana hasła, delete ∥ poddanie/ruch. Inwariant po każdym: brak `game_players` z `kind='account' AND user_id IS NULL AND is_active`.
5. **Route `api/account/delete/route.ts`** (`POST`, `connection()`, `apiHandler`, `requireSessionWithId`, limit `hit`/`release`/`reset`, `clearSessionCookie`) + testy jednostkowe + HTTP w `tests/integration/account-delete-api.test.ts`: `200` (sesja przestaje działać, także w drugiej przeglądarce; logowanie `INVALID_CREDENTIALS`; ponowna rejestracja), `400`, `401`, `403`, `409` z `data.gameId` (prawdziwa partia `active`) i przejście po poddaniu, `429`, `waiting` usunięte, ciasteczko gościa nietknięte, partia zakończona widoczna u przeciwnika jako „Usunięty gracz” (`displayName: null`, `kind: "account"`).
6. **UI** (po O3): `delete-account-form.tsx` na `/account` (stany z tabeli), `notice=account-deleted` na `/`; testy komponentu (`@testing-library/react`: przycisk nieaktywny bez zaznaczenia, dialog, błąd hasła przy polu, `409` z linkiem, brak podwójnego wysłania — dwa `click()` w jednym `act`), strona `/account` ze stanem partii `active`; `npm run check:tokens` i `test:stories`, jeśli zmieniono DS.
7. **Testy przeglądarkowe** (`agent-browser`, `tests/integration/account-delete-pages.test.ts`): pełny przepływ, błędne hasło, blokada z klikalnym linkiem do partii, poddanie → ponowne usunięcie, sukces z komunikatem na `/`, oba motywy i 360 px. **Dokumentacja:** README (konto), `track.md` (Faza 10), lekcja, jeśli przegląd wykaże korektę.
8. **Reguła 9.4** (O4): wpis w `CLEANUP_RULES` (`key: "unverifiedUsers"`, `table: "users"`, `condition: "email_verified_at is null and created_at < ? and not exists (select 1 from game_players gp where gp.user_id = users.id)"`, `graceMs` 14 dni) + klucz wyniku w `cleanupExpired`; testy jednostkowe (granica 14 dni; konto z partią, także `cancelled`, zostaje) i na PostgreSQL (kaskada sesji i tokenów, `cleanup.test.ts`); `track.md` (9.4).

**Kryteria akceptacji (z #37 i nowe):** [ ] potwierdzenie hasłem usuwa konto, e-mail, hash, sesje, tokeny i wylogowuje; [ ] przeciwnik widzi „Usunięty gracz”; [ ] logowanie usuniętym kontem nie działa; [ ] aktywna partia → odrzucenie z linkiem do partii, po poddaniu usunięcie przechodzi; [ ] partia `waiting` konta znika razem z zaproszeniem; [ ] brak zakleszczeń w testach współbieżnych; [ ] migracja w górę i w dół na jednorazowej bazie; [ ] 100% pokrycia; [ ] testy integracyjne HTTP i przeglądarka; [ ] `npm run check`.

## 📝 Ustalenia z przesłuchania (grill-me, 2026-10-24)

Potwierdzone przez właściciela — Bartosza Wójcika.

- **Definicja „aktywnej partii” (BR-21):** blokuje tylko partia **w toku** (obaj gracze, zegar biegnie). Partia oczekująca na przeciwnika i wpis w lobby nie blokują — są usuwane razem z kontem. Dokładny status: `active` (to samo znaczenie co `GameParticipation.hasActiveGame`).
- **Limity per adres klienta** działają tylko przy wiarygodnie ustalonym adresie (spike #30); limit 10 prób na konto zostaje zawsze.

> **Adnotacja 2026-10-30 (BR-29 / D-27, E02-S07):** gość nie jest już „Zaproszony przez link”: przeciwnik zapisanej partii jest nazwany „{nick} (gość)” (nick jawny albo „Gracz {miejsce}”); „Usunięty gracz” dotyczy wyłącznie konta usuniętego. Wiersze z „Zaproszony przez link” w wersji z 24.10 czytaj jako „{nick} (gość)”.

## 🧪 Czego nie sprawdzono przy aktualizacji

Specyfikacja nie testowała kodu; wnioski o kolejności blokad, FK i braku indeksu pochodzą z lektury `invitation-service.ts`, `timeout-settler.ts`, `lazy-closing.ts`, `Migration20261029143711.ts` i encji. Zachowanie `DELETE FROM users` pod współbieżnością oraz zakres `ConfirmDialog` należy potwierdzić testami (kroki 4 i 6); kod poddania (UI) i rewanżu jeszcze nie istnieje.
