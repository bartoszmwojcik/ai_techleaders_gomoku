# Czat znika po grze: kasowanie wiadomości, konto, tokeny, kopie zapasowe (E07-S03, #148)

> Status: **specyfikacja do implementacji** (jeden PR implementacji, `Closes #148`). Właściciel zatwierdził specyfikację z góry; założenia z tabeli „Resolved assumptions” są odwracalne i nie blokują scalenia.
>
> Źródło: zgłoszenie #148 (E07-S03), epik #144; `.ai/specs/product-brief.md` na `origin/main`: D-30, BR-34, BR-18, BR-24, BR-17, Q-11, Q-12 (zamknięte: cron zainstalowany 2026-10-31); `.ai/specs/research/decisions/2026-10-31-chat.md`; specyfikacja S01 `2026-10-31-game-chat.md` (sekcja „Kontrakty dla S02, S03, S04”: **ten dokument ją uszczegóławia**, w jednym miejscu zmieniając postać warunku, patrz „Odstępstwa od kontraktu S01”); kod: `packages/db/src/cleanup/{rules,cleanup-expired,run-cleanup}.ts`, `AccountService.delete`, `ChatService` (`CONTEXT_SQL`), README (Sprzątanie, Usunięcie konta, Wdrożenie na mikr.us).

## 📝 TLDR

Tabela `chat_messages` istnieje (S01), a wyłączanie czatu (S02) jest wdrożone, ale **nic jej nie czyści**: do tej pory ukrywał ją tylko odczyt po 1 h od końca partii (R9). S03 domyka obietnicę BR-34 po stronie bazy:

1. nowa reguła `chatMessages` w `CLEANUP_RULES` (graceMs = 1 h, **przed** regułami usuwającymi partie) kasuje wiadomości partii zakończonych, anulowanych i martwych (zegar wygasł) — także partii z kontami, które zostają jako historia;
2. `AccountService.delete` kasuje w tej samej transakcji cały czat partii, w których uczestniczyło konto;
3. wygaśnięcie tokenu gościa lub agenta (1 h po końcu) pokrywa ta sama reguła, bo ma ten sam próg (`GUEST_TOKEN_GRACE_MS`);
4. kopie `pg_dump` pomijają **dane** `chat_messages`; README dostaje procedurę kopii, a operator — listę kroków do wykonania na Mikrusie (poza kodem);
5. testy: jednostkowe (reguła, strażnik, budżet, konto), integracyjne na PostgreSQL (progi, partie z kontem, konto, tokeny, partie, dump).

Wdrożenie na produkcję dopiero po tym PR-ze **i** po aktualizacji kopii (R1, „Warunki wdrożenia” niżej); wdrożenie jest zbiorcze na koniec epiku E07, nie per PR.

## 📝 Problem Statement

BR-34: wiadomości nie wchodzą do historii, `db:cleanup` usuwa je ok. 1 h po zakończeniu partii (faktycznie w ciągu ok. 2 h przy cronie co godzinę), usunięcie konta oraz wygaśnięcie tokenu gościa/agenta także kasują czat, a kopie `pg_dump` nie niosą treści. Dziś: brak reguły, brak kasowania przy usunięciu konta (`AccountService.delete` usuwa partie `waiting`, ale partie `finished` konta zostają jako historia razem z czatem), brak jakiejkolwiek procedury kopii w repozytorium (README zna tylko „kopie zapasowe, jeśli powstaną”).

Dlaczego to nie jest zwykła reguła „wygasłe rekordy”: reguły partii (`guestOnlyFinishedGames`, `cancelledGames`) usuwają tylko partie bez konta, a partie z kontem żyją wiecznie jako historia (BR-24). Czat tych partii nie ma własnego `expires_at` ani własnego rodzica, który zniknie — reguła musi go wskazać przez partię, **także gdy partia zostaje**.

## 📝 Proposed Solution

### 1. Reguła `chatMessages`

```ts
{
  // BR-34: czat znika ok. 1 h po końcu partii, także gdy partia zostaje jako historia konta.
  key: "chatMessages",
  table: "chat_messages",
  primaryKey: "id",
  condition: `exists (select 1 from games g where g.id = chat_messages.game_id and (
      (g.status = 'finished' and g.finished_at < ?)
      or (g.status = 'cancelled' and g.created_at < ?)
      or (g.status = 'active' and ${GAME_DEADLINE_SQL} < ?)))`,
  graceMs: CHAT_RETENTION_MS, // = GUEST_TOKEN_GRACE_MS = 1 h (stała z S01)
}
```

- **Miejsce w tablicy:** zaraz po `lobbySeekers`, **przed** `waitingGames` (czyli przed wszystkimi regułami usuwającymi z `games`). Powód: czat kasują krótkie partie po 1000 wierszy, zamiast ciężkiej kaskady wewnątrz paczki usuwającej partie (budżet 15 s na regułę), i licznik `chatMessages` pokazuje faktycznie skasowane wiadomości także partii, które ta sama pętla zaraz usunie.
- **Trzy gałęzie, trzy `?`** (silnik wiąże jedno odcięcie na każdy `?`; to samo odcięcie `now - graceMs`):
  - `finished`: `finished_at < ?` — główny przypadek, także partie z kontem;
  - `cancelled`: czat w `cancelled` jest `unavailable` (R9), ale wiadomości mogły powstać w `active` przed anulowaniem (zegar nie ruszył, 15 min); `created_at` jest tu siatką bezpieczeństwa (partia anulowana ma `created_at` starsze niż 1 h niemal zawsze, więc wiadomości znikają w najbliższym przebiegu);
  - `active` z wygasłym zegarem: partia z kontem bez rozliczenia zostaje `active`, dopóki ktoś jej nie otworzy (leniwe rozliczenie), a wiadomości nie mogą wisieć w nieskończoność (ta sama definicja martwej partii co `guestOnlyActiveGames`, ten sam `GAME_DEADLINE_SQL`, bez nowej kopii wzoru).
- **Postać `exists` zamiast `game_id in (select id from games where …)`** (patrz „Odstępstwa od kontraktu S01”): przebieg skanuje małą, tymczasową tabelę `chat_messages` (godziny ruchu) i sprawdza partię po kluczu głównym, zamiast przeglądać rosnącą historię `games` (brak indeksu po `finished_at`). Nazwy kolumn w `GAME_DEADLINE_SQL` są bez kwalifikatora i rozwiązują się do `g` (jedynego źródła w podzapytaniu); `chat_messages` nie ma takich kolumn. Test na PostgreSQL pilnuje tego dosłownie.
- **Zasady `CLEANUP_RULES` bez zmian:** statyczny tekst, `for update skip locked`, paczki, budżet 15 s, brak `optional` (brak tabeli = błąd, jak w innych regułach), wiersz dokładnie na progu zostaje.
- **Wynik:** `CleanupResult.chatMessages: number | null` (komentarz „wiadomości czatu partii zakończonych/anulowanych/martwych starszych niż 1 h”); linia JSON `run-cleanup` zyskuje klucz.

### 2. Usunięcie konta (wyjątek od BR-18/BR-24)

W `AccountService.delete`, w istniejącej transakcji, **po** sprawdzeniu `ACTIVE_GAME` i usunięciu partii `waiting`, **przed** `DELETE_USER_SQL`:

```sql
delete from chat_messages
 where game_id in (select game_id from game_players where user_id = ?)
```

- Kasuje **cały czat** partii konta (także wiadomości przeciwnika, patrz Q3). Partie `waiting` i tak znikają kaskadą; `active` blokuje usunięcie, więc w praktyce chodzi o partie `finished` w oknie ≤ 1 h (starsze czyści reguła) i ewentualne `cancelled`.
- Kolejność blokad bez zmian (`users → games → zapis`); nowa instrukcja bierze tylko blokady wierszy `chat_messages`, więc nie tworzy cyklu z `ChatService` (ten: advisory lock gry → wstawienie). Zapis wyłącznie przez `tx` (reguła z `AGENTS.md`); błąd na dowolnym kroku cofa i konto, i kasowanie (test na PostgreSQL).
- **Domknięcie po usunięciu:** po usunięciu konta przeciwnik nadal mógłby pisać w oknie 1 h, a `seq` zaczynałby się od 1 (kursor klienta „po `seq`” pomijałby nowe wiadomości). Dlatego `ChatService` traktuje partię, w której któreś miejsce ma `kind = 'account'` i `user_id IS NULL` (usunięty gracz), jako czat `unavailable` (odczyt bez treści, wysyłka `CHAT_UNAVAILABLE`) — mała zmiana `CONTEXT_SQL` i testów S01/S02, bez nowej kolumny. Rozmowa z nieistniejącą osobą nie ma sensu, a obietnica „czat znika wraz z kontem” staje się spójna także dla pozostającego gracza.

### 3. Wygaśnięcie tokenu gościa lub agenta

Brak osobnej logiki: `guestTokens` i `agentTokens` zerują skrót 1 h po `finished_at`, a `chatMessages` ma ten sam próg, więc **w tym samym przebiegu** znikają i dostęp, i treść. Test strażnik wymusza równość `chatMessages.graceMs === guestTokens.graceMs === agentTokens.graceMs === GUEST_TOKEN_GRACE_MS` (jedna godzina to jedna stała, rozjazd łamie CI). Gość w partii z kontem: skrót zniknie, czat znika, wiersz `game_players` zostaje (historia).

### 4. Kopie zapasowe

- **Repozytorium:** w README, w „Wdrożenie na mikr.us”, nowa podsekcja „Kopie zapasowe bazy” z poleceniem `pg_dump -Fc --exclude-table-data=chat_messages` (struktura tabeli w kopii zostaje, dane nie), rotacją 5 ostatnich kopii (`ls -1t … | tail -n +6 | xargs -r rm --`), przykładowym wpisem cron i **weryfikacją** (`pg_restore -l` pokazuje tabelę, a `pg_restore -a -t chat_messages` nie zwraca wierszy). README jednocześnie zmienia dopisek „kopie zapasowe (jeśli powstaną) zawierają usunięte dane” w „Usunięciu konta”: kopie zawierają dane usuniętego konta poza czatem, a rotacja ogranicza je do 5 ostatnich.
- **Poza repozytorium (operator, nie wykonywać w ramach PR-a):** kroki w „Warunkach wdrożenia”.
- Nie dodajemy skryptu `.sh` do repozytorium (nie jest objęty progiem pokrycia ani CI); procedura żyje w README, a test integracyjny sprawdza **to samo polecenie** na PostgreSQL (niżej), więc flaga nie może zgnić niezauważona.

### 5. Brak treści w innych kanałach (kryterium #148)

Bez zmian kodu poza testami: wiadomości nie wchodzą do historii (#27; zapytania historii nie czytają `chat_messages`), a treść nie trafia do logów aplikacji (R13 z S01: `DATABASE_DEBUG=true` odrzucone w produkcji, trasy nie logują ciała). S03 dokłada test integracyjny, że po przebiegu `db:cleanup` i usunięciu konta `server.log` nie zawiera znacznika z wiadomości.

## 📝 Spójność z BR-34 i R9 (ocena ryzyka)

| Warstwa | Zachowanie | Zgodność z BR-34 |
|---|---|---|
| Odczyt (R9) | `closed`, bez treści, gdy `finished_at <= now() - 1 h` (zegar bazy), dla każdego rodzaju uczestnika | spełnia „znika po ok. 1 h” **od strony użytkownika**, niezależnie od crona |
| Token gościa/agenta | działa 1 h po końcu | ta sama godzina, więc po godzinie nikt spoza bazy nie przeczyta czatu |
| `db:cleanup` | odcięcie `now(Node) - 1 h`, przebieg co godzinę | treść fizycznie w bazie od 1 h do ok. 2 h od końca (przebieg zaczyna się najpóźniej godzinę po progu; reguła stoi pierwsza wśród kasujących, więc jej paczki kończą się w sekundy, nie w budżecie 195 s całego przebiegu) |
| Awaria crona | odczyt dalej ukrywa treść (R9), baza trzyma ją dłużej niż obiecuje BR-34 | **jedyna luka**: obietnica „w ciągu ok. 2 h” dotyczy bazy i wymaga działającego crona; wykrywa ją linia `exit=` w `/var/log/gomoku-cleanup.log` (krok operatora), a przy `flock` zajętym przebieg po prostu przepada do następnego |
| Konto usunięte | czat kasowany natychmiast, w transakcji | silniejsze niż BR-34 (nie czeka na godzinę) |
| Kopie | dane `chat_messages` nie trafiają do `pg_dump` | zgodne; kopie hostingu i logi infrastruktury są poza obietnicą (BR-34) |

Wniosek: **R9 (ukrycie po 1 h) i kasowanie (1 h do ok. 2 h) są spójne** — to dwie warstwy jednego progu, a nie dwa różne terminy. Ukrycie jest ostrą granicą widoczną dla gracza, kasowanie jest „najpóźniej do następnego przebiegu”. Różnica między nimi (do godziny) to uczciwie opisany czas, w którym treść jest w bazie, ale niedostępna dla aplikacji. Rozjazd zegarów Node i bazy może usunąć wiadomość o sekundy przed końcem okna odczytu (niegroźne, a po usunięciu konta i tak zamykamy czat, patrz wyżej) albo o sekundy później (niewidoczne).

Pozostałe ryzyka:

- **Partie z kontem „wiecznie `active`”** (nikt nie wraca): trzecia gałąź reguły kasuje czat ok. 1 h po wygaśnięciu zegara; gdy gracz wróci, leniwe rozliczenie kończy partię, a okno R9 liczy się od `finished_at` (jeśli rozliczenie ustawia ją na chwilę rozliczenia, gracz zobaczy pusty czat otwarty na godzinę; do sprawdzenia testem w kroku 4).
- **Awaria jednej reguły** nie przerywa pozostałych (`errors` w wyniku, kod wyjścia 1); `chatMessages` stoi wcześnie, więc błąd wcześniejszej reguły (np. `sessions`) go nie blokuje, a jego własny błąd nie blokuje usuwania partii (kaskada i tak skasuje wiersze partii, które znikają).
- **Obciążenie:** reguła skanuje `chat_messages` (do 500 wiadomości na partię × partie z ostatnich godzin) — bez nowego indeksu; wynik `0` w nocy kosztuje jedno szybkie przejście. Nowy indeks `chat_messages(created_at)` nie jest potrzebny, bo reguła nie filtruje po tej kolumnie.
- **Budżet czasu:** po dodaniu reguły jest 13 reguł (12 dziś), najgorszy przebieg 13 × 15 s = **195 s** wobec godzinnego odstępu crona; README, komentarz przy `DEFAULT_RULE_TIME_LIMIT_MS` i test (niżej) mówią to samo. Liczba reguł w komentarzach i testach nie jest zaszyta na stałe: test wylicza ją z `CLEANUP_RULES.length`.
- **Backup bez flagi** (błąd operatora) przechowuje treść do 5 kopii wstecz; dlatego krok weryfikacji (`pg_restore -a -t chat_messages` puste) jest częścią warunków wdrożenia.

## 📝 Architecture

- `packages/db/src/cleanup/rules.ts`: reguła `chatMessages`, klucz w typie `CleanupRule["key"]`, komentarz. Stała retencji z `@gomoku/core` (`CHAT_RETENTION_MS`, w S01 równa `GUEST_TOKEN_GRACE_MS`); jeśli S01 jej nie eksportuje, użyć `GUEST_TOKEN_GRACE_MS` bezpośrednio, jak reguły gościnne.
- `packages/db/src/cleanup/cleanup-expired.ts`: `CleanupResult.chatMessages`, wartość początkowa `0`, komentarz o liczbie reguł (bez zaszytej liczby), bez zmian w pętli.
- `packages/db/src/cleanup/run-cleanup.ts`: bez zmian logiki (wynik już serializuje obiekt); test aktualizuje liczbę reguł.
- `packages/app/src/server/services/auth/account-service.ts`: stała `DELETE_CHAT_SQL`, wywołanie w transakcji.
- `packages/app/src/server/services/chat/chat-service.ts`: `unavailable`, gdy któreś miejsce partii to usunięte konto (`CONTEXT_SQL` zwraca flagę).
- `tests/integration/global-setup.ts`: udostępnia identyfikator kontenera PostgreSQL (`project.provide("postgresContainerId", …)`, typ w `ProvidedContext`), żeby test mógł uruchomić `pg_dump` wewnątrz kontenera (`container.exec` przez `docker exec`).
- `README.md`: tabela „Co usuwa” (wiersz `chat_messages`), budżet (13 × 15 s = 195 s), „Skutki dla danych” w Usunięciu konta, „Wdrożenie (R1)” w sekcji czatu (bramka zdjęta po wdrożeniu S03 + kroki operatora), nowa podsekcja „Kopie zapasowe bazy”.

## 📝 Data Model

Bez zmian schematu i bez migracji. Reguła i kasowanie używają istniejących kolumn (`chat_messages.game_id`, `games.status/finished_at/created_at`, zegar gry, `game_players.user_id`). Indeksy: `chat_messages_game_id_seq_unique` obsługuje kasowanie po `game_id`.

## 📝 API Contracts

Bez nowych tras i pól. Zmiana zachowania: odczyt/wysyłka czatu w partii z usuniętym kontem zwraca stan `unavailable` (istniejący kod i komunikat `CHAT_UNAVAILABLE_MESSAGE`); `db:cleanup` zwraca dodatkowy klucz `chatMessages` w linii JSON (zmiana addytywna, `BACKWARD_COMPATIBILITY.md`: wyjście komendy nie jest kontraktem zewnętrznym; do potwierdzenia w kroku 9).

## 📝 UI/UX

Brak nowych ekranów. Jedyna widoczna zmiana: w partii z usuniętym przeciwnikiem panel czatu pokazuje istniejący stan „Czat jest teraz niedostępny w tej partii.” Nie robimy mockupów (spec nie wprowadza nowej powierzchni UI).

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Zachowanie |
|---|---|
| Wiadomość dokładnie na progu (`finished_at = now - 1 h`) | zostaje (warunek `<`, jak w innych regułach); znika w następnym przebiegu |
| Partia `finished`, konta obu graczy | wiadomości znikają, partia, ruchy i wiersze graczy zostają (historia); skrót tokenu (jeśli był) zerowany tym samym przebiegiem |
| Partia gość–gość `finished` | reguła `chatMessages` kasuje wiadomości, potem `guestOnlyFinishedGames` usuwa partię; `chatMessages` liczy te wiadomości, kaskada niczego już nie kasuje |
| Partia `cancelled` z wiadomościami z fazy `active` | kasowane w najbliższym przebiegu |
| Partia `active`, zegar wygasł > 1 h temu, konta | wiadomości kasowane; partia czeka na leniwe rozliczenie |
| Partia `active`, zegar żyje | nic nie jest kasowane, niezależnie od wieku wiadomości |
| Usunięcie konta, partia `finished` w oknie 1 h | cały czat tej partii znika w transakcji; przeciwnik widzi czat `unavailable` |
| Usunięcie konta z partią `active` | `409 ACTIVE_GAME`, nic nie kasowane (czat bez zmian) |
| Usunięcie konta: błąd hasła lub współbieżna zmiana hasła | transakcja cofa, czat nietknięty |
| Równoległe dwa przebiegi `db:cleanup` | bezpieczne (`skip locked`), drugi usuwa resztę lub nic |
| Przebieg przerwany budżetem (`truncated`) | reszta w następnym przebiegu; wynik prawdziwy dla usuniętych |
| Wysyłka wiadomości w trakcie kasowania | wstawienie po kasowaniu zostaje do następnego przebiegu (partia nadal spełnia warunek), nigdy nie psuje kaskady (FK `on delete cascade`) |
| Dump bez flagi | wykrywa go test integracyjny polecenia z README i krok weryfikacji operatora |

## 📝 Risks & Impact Review

Ryzyko wysokie (retencja danych, usuwanie, kopie): reguła kasująca z błędnym warunkiem usunęłaby wiadomości w toczącej się partii albo, przeciwnie, zostawiła je w bazie. Łagodzenie: warunek wyliczony z tych samych definicji co istniejące reguły partii (nowa kopia wzoru zakazana), testy na PostgreSQL na progach ±1 s dla każdej gałęzi, test „partia w toku nie traci wiadomości”, strażnik kolejności. Błąd operatora (cron/dump) opisany wyżej; jego wykrycie to kroki weryfikacji, nie kod.

### Odstępstwa od kontraktu S01

1. **Postać warunku** reguły: `exists` po `chat_messages` zamiast `game_id in (select id from games where …)`. Semantyka identyczna, plan zapytania nie rośnie z historią gier. Zastępuje zapis z sekcji „Kontrakty” S01 (po wdrożeniu kontrakt S01 dostaje adnotację).
2. **Zmiana `ChatService`** (`unavailable` przy usuniętym koncie) nie była w kontrakcie S01/S03; jest konieczna do spójności kasowania przy usunięciu konta (kursor `seq`).
3. **Liczba reguł** wynika ze stanu faktycznego (13 po tym PR-ze), nie z liczby „11/12” z kontraktu.

## 📝 Decisions in play

D-30, BR-34 (R1, R9), BR-18 i BR-24 (świadomy wyjątek: czat nie jest historią), BR-17 (usunięcie konta bez karencji), Q-12 (zamknięte, cron działa), Q-11 (otwarte, nieblokujące dla znajomych). **Żadna decyzja nie jest nadpisywana.** Uzupełnienia agenta (w tabeli niżej): zakres kasowania całego czatu przy usunięciu konta (Q3), zamknięcie czatu partii z usuniętym kontem (Q4), `exists` zamiast `in` (Q2).

## Resolved assumptions (autonomous defaults)

| # | Pytanie | Przyjęta odpowiedź | Uzasadnienie | Potwierdzić? |
|---|---|---|---|---|
| Q1 | Które partie obejmuje reguła | `finished`, `cancelled`, `active` z wygasłym zegarem; **także partie z kontem** | kontrakt S01 i BR-34; reguły partii nie ruszają partii z kontem, więc czat musi mieć własną | odwracalne |
| Q2 | Postać warunku | `exists` po `chat_messages` | skan małej tabeli zamiast historii `games` | odwracalne |
| Q3 | Usunięcie konta kasuje czat czy tylko wiadomości usuwanego | Cały czat partii (obie strony) | BR-34 mówi „czat”; wiadomości usuwającego są w rozmowie, której druga strona i tak traci rozmówcę; wiadomości przeciwnika to jego odpowiedzi do usuniętej osoby | odwracalne (zmiana warunku `sender_id`) |
| Q4 | Co z czatem pozostającego gracza po usunięciu konta | `unavailable` | bez tego `seq` restartuje od 1 i kursor klienta gubi wiadomości; rozmowa z nieistniejącą osobą nie ma sensu | odwracalne |
| Q5 | Skrypt kopii w repozytorium | Nie; procedura w README + test polecenia | brak istniejącego skryptu, skrypt `.sh` poza progiem pokrycia; operator ma własny mechanizm na serwerze | odwracalne |
| Q6 | Rotacja kopii | 5 ostatnich (BR-34) | decyzja właściciela | zatwierdzone |
| Q7 | Wdrożenie | Zbiorczo na koniec E07, po S04 i po krokach operatora | notatka właściciela „deploy per epic”; S03 sam nie wymaga osobnego wdrożenia | zatwierdzone |
| Q8 | Wzorzec `db:cleanup` w CI | Bez zmian (job `integration` już uruchamia `cleanup.test.ts`) | nie dokładamy jobów | odwracalne |

Brak założeń z `⚠ NEEDS HUMAN CONFIRMATION`: specyfikację zatwierdził właściciel z góry, a każdy punkt jest odwracalny przed wdrożeniem. **Kroki operatora (niżej) nie są wykonywane w tym PR-ze ani przez agenta.**

## 📋 Warunki wdrożenia (R1) — kroki dla operatora (nie wykonywać z agenta)

Wykonać na Mikrusie po scaleniu implementacji S03, **przed** wdrożeniem zawierającym czat (E07):

1. Znaleźć istniejący mechanizm kopii: `ls /etc/cron.d`, `crontab -l`, `grep -rl pg_dump /etc/cron.* /usr/local/bin /root 2>/dev/null`. Jeśli kopie nie są wykonywane, wprowadzić procedurę z README.
2. Dodać `--exclude-table-data=chat_messages` do **każdego** wywołania `pg_dump` (zalecane `-Fc`). Przykład (nazwa kontenera wg `docker ps`): `docker exec gomoku_prod-postgres-1 pg_dump -U gomoku -Fc --exclude-table-data=chat_messages gomoku > /var/backups/gomoku/gomoku-$(date +%F-%H%M).dump`.
3. Rotacja: zostawić 5 ostatnich kopii (`ls -1t /var/backups/gomoku/*.dump | tail -n +6 | xargs -r rm --`). **Usunąć kopie sprzed zmiany flagi**, jeśli powstały po pierwszym wdrożeniu tabeli czatu (przed wdrożeniem E07 taka tabela nie istnieje na produkcji, więc zwykle nie ma czego usuwać).
4. Zweryfikować kopię: `pg_restore -l <plik> | grep chat_messages` (struktura jest) i `pg_restore -a -t chat_messages <plik> | grep -c .` bez wierszy z danymi (poza nagłówkami).
5. Zweryfikować cron `db:cleanup`: `ls /etc/cron.d/gomoku-cleanup`, `tail -n 5 /var/log/gomoku-cleanup.log` (linia `exit=0` z ostatniej godziny); po pierwszej partii z czatem po ≥ 2 h: `docker exec gomoku_prod-postgres-1 psql -U gomoku gomoku -c "select count(*) from chat_messages m join games g on g.id = m.game_id where g.status = 'finished' and g.finished_at < now() - interval '2 hours'"` zwraca `0`.
6. Przy każdej awarii crona (brak `exit=0` przez > 2 h) traktować obietnicę BR-34 jako niespełnioną do czasu naprawy.

## 📋 Phasing

Jeden PR implementacji (`Refs #148` w specyfikacji, `Closes #148` w PR-ze implementacji). Fazy jako osobne commity, po każdej aplikacja działa:

- **Faza 1: reguła i budżet** (`rules.ts`, `cleanup-expired.ts`, testy jednostkowe, strażniki).
- **Faza 2: usunięcie konta i `ChatService`** (`AccountService.delete`, `unavailable` dla usuniętego konta, testy jednostkowe).
- **Faza 3: testy integracyjne i dokumentacja** (PostgreSQL, `pg_dump`, README, adnotacje w specyfikacji S01, lekcja, jeśli będzie korekta).

## 📋 Implementation Plan

1. `rules.ts`: klucz `chatMessages` w unii, reguła po `lobbySeekers`; komentarz „mniej niż liczba reguł w README” bez zaszytej liczby. `cleanup-expired.ts`: pole wyniku, wartość `0`, komentarz budżetu (13 × 15 s = 195 s, wylicz z długości tablicy w komentarzu testu).
2. Testy jednostkowe `cleanup-expired.test.ts`: (a) reguła istnieje, tabela `chat_messages`, klucz `chatMessages`, `graceMs` = `GUEST_TOKEN_GRACE_MS` = `guestTokens.graceMs` = `agentTokens.graceMs`; (b) **strażnik kolejności**: indeks `chatMessages` mniejszy niż indeks każdej reguły z `table === "games"` (dodana kolejna reguła kasująca partie przed czatem łamie CI); (c) liczba `?` w warunku równa 3 i warunek zawiera trzy statusy oraz `GAME_DEADLINE_SQL` (bez drugiej kopii wzoru: dosłowny podciąg jak w istniejącym teście); (d) **strażnik budżetu**: `CLEANUP_RULES.length * DEFAULT_RULE_TIME_LIMIT_MS < 60 min` (zapas na godzinny odstęp crona); (e) istniejący test `keys.slice(-5)` bez zmian, test „guard” tabel (`only references registered tables`) obejmuje `chat_messages` automatycznie; (f) `run-cleanup.test.ts`: 13 błędów zamiast 12 (lub `CLEANUP_RULES.length`).
3. `AccountService.delete`: `DELETE_CHAT_SQL`, wywołanie po sprawdzeniu `active` i usunięciu `waiting`, przed `DELETE_USER_SQL`; testy z fałszywym `em`: kolejność instrukcji, wartości powiązane (`userId`), brak wywołania przy `ACTIVE_GAME` i `INVALID_PASSWORD`.
4. `ChatService`: flaga „któreś miejsce to usunięte konto” w `CONTEXT_SQL`, stan `unavailable` w odczycie i wysyłce; testy gałęzi (fałszywy `em`). Test (PostgreSQL, krok 7): okno R9 po leniwym rozliczeniu partii `active` z wygasłym zegarem (ile wynosi `finished_at`), wynik opisać w adnotacji.
5. `tests/integration/global-setup.ts`: `postgresContainerId` w `ProvidedContext` i `project.provide`.
6. README: tabela „Co usuwa”, budżet (195 s), „Skutki dla danych” (czat), podsekcja „Kopie zapasowe bazy”, „Wdrożenie (R1)” w sekcji czatu, przypis w „Ograniczeniach” usunięcia konta.
7. `tests/integration/chat-cleanup.test.ts` (Testcontainers, nowy plik, bo `cleanup.test.ts` jest duży; wspólne helpery do wstawiania partii z `cleanup.test.ts`, w razie potrzeby wyciągnięte do `tests/integration/helpers`):
   - **progi na PostgreSQL**: `finished_at` = `now - 1 h - 1 s` kasuje, `now - 1 h` (próg) zostaje, `now - 59 min` zostaje; to samo dla `cancelled` (`created_at`) i `active` z wygasłym zegarem (zegar wygasł 1 h + 1 s temu kasuje, 59 min zostaje, zegar żywy zostaje bez względu na wiek wiadomości);
   - **partie z kontem**: po przebiegu partia, ruchy i wiersze graczy stoją, wiadomości zniknęły; partia gość–gość: wiadomości policzone w `chatMessages`, partia usunięta, drugi przebieg zwraca 0;
   - **tokeny**: dla partii gość–konto i agent–konto po przebiegu `guest_token_hash`/`agent_token_hash` są `NULL` **wtedy i tylko wtedy**, gdy wiadomości zniknęły (własność sprawdzana na zestawie partii o różnym wieku);
   - **paczki i budżet**: `batchSize = 2` przy 5 wiadomościach kasuje wszystkie, `ruleTimeLimitMs` bliski 0 daje `truncated: true` bez błędu, następny przebieg kończy; dwa przebiegi równolegle (`Promise.all`) nie dają błędu ani nadmiarowego kasowania;
   - **konto**: `AccountService.delete` przez prawdziwy PostgreSQL: czat partii `finished` w oknie znika, czat innej partii (inne konta) zostaje, `409 ACTIVE_GAME` zostawia czat, wymuszony błąd w transakcji (np. zmiana hasła w trakcie) cofa kasowanie; po usunięciu konta `GET`/`POST` czatu przeciwnika zwraca stan `unavailable`;
   - **spójność odczytu z kasowaniem (R9 vs BR-34)**: `GET /api/games/[id]/chat` partii `finished` 1 h + 1 s po końcu zwraca `closed` bez treści **przed** przebiegiem i po nim (treść jest w bazie, aplikacja jej nie oddaje);
   - **logi**: znacznik z treści wiadomości nie występuje w `tests/integration/server.log` po przebiegu i usunięciu konta;
   - **`pg_dump`**: polecenie z README (przez `docker exec` na `postgresContainerId`) na bazie z wiadomością: dump zawiera `CREATE TABLE public.chat_messages` i nie zawiera znacznika treści; ten sam znacznik jest widoczny w dumpie bez flagi (kontrola pozytywna, żeby test nie przechodził próżno).
8. `cleanup.test.ts`: wynik zawiera klucz `chatMessages`; reszta bez zmian.
9. Dokumentacja i adnotacje: README (j.w.), adnotacja w `2026-10-31-game-chat.md` (S03 zaimplementowane, zmiana postaci warunku, `unavailable`), sprawdzenie `BACKWARD_COMPATIBILITY.md` (wyjście `db:cleanup` — dodanie klucza), `npm run check` (lint, typecheck, testy 100% pokrycia, build, integracja z Dockerem); weryfikacja ręczna w `npm run dev`: dwie przeglądarki, partia, wiadomość, koniec partii, przesunięcie `finished_at` w bazie deweloperskiej o 1 h i `npm run db:cleanup` **tylko po sprawdzeniu `DATABASE_URL`** (komenda kasuje dane).
10. Po wdrożeniu implementacji przenieść tę specyfikację do `.ai/specs/implemented/`; specyfikacja S01 zostaje aktywna do S04.

### Kryteria akceptacji #148 → kroki

| Kryterium | Kroki | Dowód |
|---|---|---|
| Zakończona partia, po ok. 1 h `db:cleanup` usuwa wiadomości (≤ ok. 2 h przy cronie co godzinę) | 1, 2, 7 | testy progów ±1 s na PostgreSQL; ocena spójności z R9/BR-34 w tej specyfikacji; krok 5 operatora |
| Usunięcie konta lub wygaśnięcie tokenu gościa/agenta kasuje czat | 3, 4, 7 | test konta (transakcja, cofnięcie), test tokenów (jeden próg, ta sama chwila) |
| Wiadomości nie wchodzą do historii (#27) i logów; `pg_dump` wyklucza dane, 5 kopii | 6, 7, kroki operatora | test logów, test polecenia `pg_dump` z kontrolą pozytywną, README + lista operatora |
| Nowa reguła ma test integracyjny i aktualizację budżetu czasu | 1, 2, 6, 7 | test integracyjny, strażniki (kolejność, budżet, `graceMs`), README (195 s) |

## 📝 Odstępstwa wdrożenia i dowody

(wypełnić przy implementacji)
