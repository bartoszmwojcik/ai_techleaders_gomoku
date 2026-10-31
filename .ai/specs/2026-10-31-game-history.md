# Historia zakończonych partii (E04-S01, #27)

> Status: **szkic do zatwierdzenia** (2026-10-31, szkic autonomiczny `om-auto-write-spec`; stan kodu: `origin/main` @ `4aa72d4`). Źródło: zgłoszenie #27 (E04-S01), epik #18, `.ai/specs/product-brief.md` (BR-17, BR-18, BR-24, BR-29, BR-30, D-04, D-28, A-04), specyfikacje wdrożone: `implemented/2026-10-24-game-invitations.md` (#21: `game_players`, `is_active`), `implemented/2026-10-26-game-clock.md` (lazy timeout), `implemented/2026-10-29-game-rematch.md` (`origin = 'rematch'`), `implemented/2026-10-30-participant-nickname.md` (nick gościa), `implemented/2026-10-24-account-deletion.md` (BR-17), `implemented/2026-10-30-guest-only-games-cleanup.md`, prototyp w Storybooku (`packages/ui/docs/screens/historia.stories.tsx`, `docs/epics/historia.mdx`).
>
> Zależność E02-S03 (#23, zegar) jest wdrożona: `finished_at`, `end_reason`, `winner_seat` istnieją i są zapisywane przy każdym zakończeniu (ruch, czas, poddanie).

## 📝 TLDR

Dziś zalogowany użytkownik nie ma jak wrócić do swoich rozegranych partii: dane są w bazie (`games`, `game_players`), ale żaden widok ich nie pokazuje. Po wdrożeniu (zachowanie przyszłe) strona `/history` pokazuje **tylko własne, zakończone partie** konta, od najnowszej: przeciwnik, wynik z jego punktu widzenia (wygrana/porażka/remis), data zakończenia i sposób zakończenia (5 w linii, koniec czasu, poddanie, plansza pełna). Lista ładuje się po 20 wierszy z paginacją kluczem (`finished_at`, `id`); przeciwnik-gość to „{nick} (gość)”, usunięte konto — „Usunięty gracz”, a typ „Agent” (D-28) jest przewidziany w kontrakcie, choć jeszcze niewdrożony. Bez nowej tabeli i bez migracji: to model odczytu nad istniejącymi danymi (`.ai/docs/…engineering-standards.md`: „History is a read model over finished games”).

## Resolved assumptions (autonomous defaults)

| # | Pytanie | Zastosowane założenie | Dlaczego | Potwierdzenie |
|---|---|---|---|---|
| Q1 | Co jest „historią”? Czy `cancelled` wchodzi? | Tylko `games.status = 'finished'`. `cancelled`, `waiting`, `active` — nie (kryterium: „trwająca partia nie jest na liście”; anulowana nigdy się nie zaczęła i jest sprzątana po 24 h). | Zgodne z kryteriami #27 i z regułą `cancelledGames` w sprzątaniu. | odwracalne |
| Q2 | Kolejność i paginacja | `finished_at desc, id desc`; paginacja kluczem (kursor), strona 20 wierszy, przycisk „Pokaż starsze”; brak całkowitej liczby i brak filtrów/wyszukiwania. | Kursor jest stabilny wobec nowych partii (offset „przeskakuje”); najmniejsza powierzchnia; brak filtrów = YAGNI. | odwracalne |
| Q3 | Migracja / nowy indeks | Brak. Zapytanie startuje od `game_players_user_id_index` (komentarz w encji przewiduje je dla #27); liczba partii jednego konta jest mała, sortowanie po wybranych wierszach jest tanie. Krok planu sprawdza `EXPLAIN` na PostgreSQL z ~10 000 partii; indeks częściowy dodawany dopiero, gdy plan go wymaga. | Zmiany schematu są kosztowne i nieodwracalne w praktyce (migracje); brak dowodu potrzeby. | odwracalne |
| Q4 | Wynik i sposób zakończenia w wierszu | Wynik liczony po stronie serwera względem miejsca widza (`winner_seat` vs `seat`): `win` / `loss` / `draw`; sposób zakończenia neutralny: „5 w linii”, „Koniec czasu”, „Poddanie”, „Plansza pełna” (teksty z prototypu; po polsku w UI, kody `five_in_row`/`timeout`/`resignation`/`draw` w API). | Zgodne z istniejącym `HistoryRow` (przeciwnik, wynik, data, powód); kierunek poddania/czasu wynika ze znacznika wyniku. | odwracalne |
| Q5 | Nazwa przeciwnika | API zwraca `{ kind: 'account' \| 'guest' \| 'agent', name: string \| null }`; etykietę buduje warstwa UI w jednym miejscu: konto → nazwa; konto usunięte (`kind = 'account'`, `user_id` NULL) → „Usunięty gracz” (BR-17); gość → „{nick} (gość)” (BR-24, BR-29; nick lub domyślny „Gracz {miejsce}”); agent → „Agent” (BR-30). `agent` to wartość przyszła: dziś żadna partia jej nie ma, ale mapowanie jest wyczerpujące (kompilator wskaże brak przy dodaniu typu). | Kryterium #27 mówiło „Zaproszony przez link”, ale BR-24 i BR-29 (2026-10-30) to zmieniły na „{nick} (gość)” — prototyp i kryterium są nieaktualne (patrz Pytania). | ⚠ NEEDS HUMAN CONFIRMATION (nadpisanie treści kryterium #27 zgodnie z aktualnym briefem) |
| Q6 | Czy wiersz prowadzi do partii? | Nie. W MVP wiersz nie jest linkiem (odtwarzanie ruch po ruchu poza zakresem; strona zakończonej partii służy rewanżowi, a ten ma okno 5 min). | Najmniejszy zakres; `HistoryRow` nie ma wariantu linku. | odwracalne |
| Q7 | Rewanż | Każda partia (także `origin = 'rematch'`) to osobny wiersz; bez oznaczenia pochodzenia w UI. DTO nie zawiera `origin`. | YAGNI; dodanie pola jest addytywne. | odwracalne |
| Q8 | Rozliczenie przegranych na czas przed odczytem | Odczyt historii woła `timeoutSettler.settleFor(userId)` (jak `GameService.create`/`currentGame`), więc partia, której czas upłynął, ale nikt jej nie otworzył, jest widoczna jako zakończona. | Bez tego „porażka na czas” pojawia się dopiero po wejściu na stronę partii (leniwe zamykanie, BR-05/BR-07). Skutek uboczny: data takiej partii to moment rozliczenia, nie upływu zegara (ograniczenie, patrz Ryzyka). | odwracalne |
| Q9 | Strefa i format daty | Wyświetlana jest `finished_at`, format `pl-PL` w stałej strefie `Europe/Warsaw`, z tym samym skrótem strefy (CET/CEST) co „Ważne do” — wspólny helper wydzielony z `game-room.tsx`; serwer i przeglądarka drukują identyczny tekst. API zwraca ISO 8601 UTC. | Lekcja o czasie serwera i decyzja z #85 (strefa stała); uniknięcie rozjazdu hydracji. | odwracalne |
| Q10 | Gość i niezalogowany | `/history` bez sesji konta → przekierowanie `/login?next=%2Fhistory` (jak `/lobby`); `GET /api/history` → `401`. Gość nie ma historii (BR-24) i nie widzi linku; osobnej zachęty „załóż konto” na ekranie wyniku gościa nie dodajemy. | BR-24/BR-29; zachęta to osobna decyzja produktowa. | odwracalne |
| Q11 | Punkt wejścia | Przycisk „Historia” obok „Lobby” i „Konto” na stronie głównej dla zalogowanego. Bez zmian w nagłówku (nie ma globalnej nawigacji). | Wzorzec strony głównej; najmniejsza zmiana. | odwracalne |
| Q12 | Retencja | Bez zmian: partie zostają dopóki konto istnieje (BR-18); żadnej nowej reguły sprzątania. | BR-18. | odwracalne |

## 📝 Problem Statement

- **Kto:** zalogowany użytkownik, który chce wrócić do swoich rozgrywek (D-04). Grupa docelowa i popyt nie mają dowodu (zgłoszenie #27; A-01/A-02), więc zakres jest celowo minimalny.
- **Dziś:** po zakończeniu partii jedyny ślad to strona `/games/{id}` otwarta z linku; nie ma listy. Dane istnieją od #21–#23.
- **Kryteria #27 (BR-08→BR-24):** (1) zakończona partia widoczna u obu kont z przeciwnikiem, wynikiem, datą i sposobem zakończenia; (2) użytkownik nie widzi cudzych partii; (3) trwająca partia nie jest na liście; (4) przeciwnik z usuniętym kontem → „Usunięty gracz” (BR-17); (5) partia z gościem → etykieta przeciwnika-gościa (kryterium mówi „Zaproszony przez link”, aktualna reguła to „{nick} (gość)”, Q5); gość nie ma historii.
- **Poza zakresem:** rankingi i ratingi (brief), odtwarzanie ruch po ruchu (brief wymaga przechowania danych, nie widoku), statystyki zbiorcze, filtry, eksport, usuwanie wpisów historii przez użytkownika.

## 📝 Proposed Solution

Model odczytu: jedna metoda serwisu, jeden endpoint, jedna strona.

1. `GameHistoryService.list(userId, { cursor? })` (serwis na `em` z `withRequestScope`, w `app/src/server/services/games/`): `settleFor(userId)` (Q8), potem jedno zapytanie surowym SQL (`?`, daty jako tekst — lekcje `em.execute`):

```sql
select g.id, g.finished_at::text as finished_at, g.end_reason, g.winner_seat,
       me.seat as my_seat,
       op.kind as opponent_kind, op.seat as opponent_seat, op.nickname as opponent_nickname,
       u.display_name as opponent_name
from game_players me
join games g on g.id = me.game_id and g.status = 'finished'
join game_players op on op.game_id = g.id and op.seat <> me.seat
left join users u on u.id = op.user_id
where me.user_id = ?
  and (? is null or (g.finished_at, g.id) < (?::timestamptz, ?::uuid))
order by g.finished_at desc, g.id desc
limit 21
```

   (21 wierszy = 20 + sygnał „są starsze”.) Wiersz bez drugiego uczestnika nie istnieje dla `finished` (partia kończy się dopiero z dwoma graczami; `join`, nie `left join`).
2. Czysta funkcja w `core` (`games/history.ts`): `historyResultOf(winnerSeat, mySeat)` → `win|loss|draw`, kursor `encodeHistoryCursor`/`decodeHistoryCursor` (base64url z `finished_at` tekstowo + `id`; niepoprawny kursor → `ValidationError`), stałe `HISTORY_PAGE_SIZE = 20`, typ `HistoryEntry`/`OpponentKind`.
3. `GET /api/history?cursor=` (koperta `api-result`, `requireSession`) zwraca `{ entries, nextCursor }`.
4. Strona `/history` (server component, `await connection()`) renderuje pierwszą stronę przez serwis; komponent kliencki „Pokaż starsze” woła `apiCall` z kursorem i dokleja wiersze. Stany z prototypu: ładowanie (`loading.tsx` jest dozwolone, bo strona nie zwraca 404 — lekcja 2026-10-29), pusto, błąd z ponowieniem, dużo danych.

**Odrzucone:** offset/limit (niestabilny przy nowych partiach i drogi przy głębokich stronach); osobna tabela `game_history` (duplikacja stanu, sprzeczna ze standardem „read model”); materializowany widok (brak potrzeby, brak dowodu wydajnościowego); liczenie „wygrane/porażki” (statystyki poza zakresem); nowy indeks `games(finished_at desc, id desc) where status = 'finished'` (nie pomaga w zapytaniu per konto).

## 📝 Architecture

- **Reużywane:** `GamePlayer`/`Game`/`User` (bez zmian), `game_players_user_id_index`, `timeoutSettler`, `apiHandler`, `requireSession`/`getCurrentUserWith`, `apiCall`, `Clock`, komponenty DS `HistoryList`/`HistoryRow`/`Panel`/`EmptyState`/`ErrorState`/`Skeleton`/`Button`/`PageHeader`.
- **Nowe:** `core/src/games/history.ts` (czyste), `GameHistoryService` + wpis `gameHistoryService` w `container.ts`, `app/api/history/route.ts`, `app/(frontend)/history/{page,loading,history-list-view}.tsx`, helper formatu daty współdzielony z `game-room.tsx` (`lib/format-date-time.ts`; refaktor bez zmiany zachowania).
- **Zależności:** czyta wyłącznie dane zapisywane przez ruch/zegar/poddanie; zmiana semantyki `finished_at` lub `end_reason` (np. nowy powód) musi dopisać etykietę — mapowanie `EndReason → tekst` jest wyczerpujące (`switch` bez `default`), więc nowy powód nie skompiluje się bez etykiety.
- **Typ „Agent” (BR-30):** `PARTICIPANT_KINDS` w `core` dziś ma `account|guest`. Wdrożenie MCP doda `agent`; historia przewiduje go przez wyczerpujące mapowanie `OpponentKind` i test typu. Do czasu D-28 nie powstaje żadna partia z agentem, więc ścieżka jest nietestowalna na danych — pokrywa ją test jednostkowy mapowania, nie integracyjny. Historia agenta nie istnieje (BR-30: agent nie ma konta ani historii); człowiek, który z nim grał, ma partię jak każdą (partia prywatna).
- Brak zmian kierunku zależności pakietów (`app → core, db, ui`); `db` bez zmian.

## 📝 Data Model

Brak zmian schematu i migracji. Wykorzystane kolumny: `games.status/finished_at/end_reason/winner_seat`, `game_players.game_id/user_id/seat/kind/nickname`, `users.display_name`. Dane wrażliwe: e-mail i hash nigdy nie są selektowane (SQL wybiera tylko `display_name`); identyfikator konta przeciwnika (`user_id`) nie opuszcza serwera — odpowiedź zawiera `gameId` partii, nazwę/nick i `kind`. Zmiana nazwy konta (jeśli kiedyś dozwolona) wpłynęłaby na starą historię, bo nazwa jest czytana na żywo — dziś nazwa jest niezmienna po rejestracji (do potwierdzenia przy ewentualnej zmianie nazwy).

## 📝 API Contracts

| Metoda i ścieżka | Wejście | Sukces | Błędy |
|---|---|---|---|
| `GET /api/history` | opcjonalny `cursor` (string ≤ 200 znaków) | `200` `{ entries: HistoryEntry[], nextCursor: string \| null }` | `401` brak sesji konta (gość też); `400 VALIDATION_ERROR` niepoprawny kursor; `500` błąd bazy (bez szczegółów) |

`HistoryEntry`: `{ gameId, finishedAt: ISO, result: 'win'|'loss'|'draw', reason: 'five_in_row'|'timeout'|'resignation'|'draw', opponent: { kind: 'account'|'guest'|'agent', name: string|null } }`. Dla gościa `name` to nick lub „Gracz {miejsce przeciwnika}” (wypełnia serwer, jak `displayName` w `GameView`); dla usuniętego konta `kind = 'account'` i `name = null`; sufiks „(gość)” i tekst „Usunięty gracz” dodaje UI (`playerNameOf` ma tę samą granicę). Endpoint tylko do odczytu (bez CSRF-nagłówka dla `GET`, jak `GET /api/lobby`), `Cache-Control: no-store`. Ścieżka jest addytywna (`BACKWARD_COMPATIBILITY.md`).

## 📝 UI/UX

Prototyp (stories, obejrzeć w Storybooku — `npm run storybook -w @gomoku/ui`): `packages/ui/docs/screens/historia.stories.tsx` (Ekrany/Historia: z partiami, dużo partii, ładowanie, pusta, błąd) i `packages/ui/docs/epics/historia.mdx`. Środowisko przeglądarkowe do renderowania makiet w tym przebiegu nie było użyte; PR wskazuje istniejące stories.

- `/history`: nagłówek „Historia partii”, panel „Zakończone partie”, `HistoryList` z `HistoryRow` (przeciwnik, data + sposób, znacznik wyniku: „Wygrana”/„Porażka”/„Remis”). Pod listą, gdy `nextCursor`, przycisk „Pokaż starsze” (stan ładowania, błąd w `Alert`, kolejne wiersze doklejane z `aria-live="polite"` zapowiadającym liczbę dodanych).
- Pusto: „Nie rozegrałeś jeszcze żadnej partii” + „Utwórz zaproszenie” (istniejący `EmptyState`). Błąd: `ErrorState` z „Spróbuj ponownie” (ponawia ten sam kursor).
- Teksty, które trzeba poprawić w prototypie: „Zaproszony przez link” → „{nick} (gość)” (stories + `historia.mdx` + `history-list.tsx` komentarz propsa); dodać wiersz z gościem o 24-znakowym nicku (`PlayerLabel`-podobne obcięcie z widocznym „(gość)”, L30; **luka DS**: wiersz historii nie ma reguły obcięcia — `wrap-anywhere` łamie, nie obcina; do rozstrzygnięcia czy łamanie wystarcza).
- Dostępność: lista jako `ul` z nazwą; wynik nie tylko kolorem (słowo w znaczniku); 320 px bez poziomego przewijania; oba motywy; wartości tylko z tokenów (`check:tokens`).
- **Brak funkcji w DS:** paginacja/„Pokaż starsze” nie ma osobnego wzorca; używamy `Button` wariant `secondary` zgodnie z tabelą „Kiedy użyć”; wpis do „Czego brakuje”.

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Skutek |
|---|---|
| Brak partii | `entries: []`, `nextCursor: null`; pusty stan. |
| Użytkownik A | Zapytanie ma `me.user_id = A`; nie ma ścieżki, przez którą pojawi się cudza partia; test z dwoma kontami i wspólną partią (u obu widoczna, u trzeciego nie). |
| Partia `active`/`waiting`/`cancelled` | Wykluczona przez `status = 'finished'`. Partia aktywna z upłyniętym zegarem jest najpierw rozliczana (`settleFor`) i wtedy wchodzi jako „Koniec czasu”. |
| Przeciwnik usunął konto | `game_players.user_id` = NULL, `kind = 'account'` → „Usunięty gracz”; wiersz widoczny (BR-17). Gdy usunięte są oba konta, partii nikt nie zobaczy (nie ma właściciela) — patrz Ryzyka. |
| Przeciwnik-gość | „{nick} (gość)”; bez nicku „Gracz {miejsce}”. Token gościa po 1 h jest czyszczony, nick zostaje. Partia gości-only jest kasowana po godzinie (BR-24) i nie dotyczy konta. |
| Partia z rewanżem | Dwie niezależne partie, dwa wiersze; kolejność po `finished_at`. |
| Remis | `reason = draw`, `winner_seat` NULL → `result = draw`. |
| Poddanie / czas | `result` z `winner_seat` względem `my_seat`; powód „Poddanie” / „Koniec czasu”. |
| Dwie partie z tym samym `finished_at` | Rozstrzyga `id` — brak duplikatów i luk między stronami. |
| Nowa partia zakończona w trakcie przeglądania | Pojawi się po odświeżeniu; kursor starszych stron pozostaje poprawny. |
| Niepoprawny/zmanipulowany kursor | `400`; nie trafia do SQL (dekoder waliduje `finished_at` jako ISO i `id` jako uuid; tekst i tak jest wiązany parametrem `?`). |
| Sesja wygasła przy „Pokaż starsze” | `401` → UI kieruje do `/login?next=%2Fhistory`. |
| Baza niedostępna | `500` → `ErrorState` z ponowieniem; odczyt nic nie zapisuje poza ewentualnym rozliczeniem przegranej na czas (Q8), które jest idempotentne i ma własną transakcję. |
| Sprzątanie usuwa partię między stronami | Wiersz mógł zniknąć między stronami — kursor porównuje wartości, nie pozycję, więc brak błędu (lekcja o `failHandler` nie dotyczy: brak `findOneOrFail`). |
| Rozjazd stref | `finishedAt` w UTC, formatowany w stałej `Europe/Warsaw` na serwerze i w przeglądarce; test dla CET i CEST oraz dla północy. |
| Wyciek e-maila | SQL nie czyta `users.email`; test sprawdza, że serializowana odpowiedź nie zawiera `@` ani pól `email`/`userId`. |

## 📝 Risks & Impact Review

`risk-medium` (jak etykieta zgłoszenia): odczyt, bez migracji, ale wiersz widoczny dla użytkownika pokazuje dane innych osób.

- **Prywatność przeciwnika:** nazwa konta jest publiczna (brief: „nazwa gracza (publiczna)”), e-mail nie. Ryzyko pojawi się, jeśli ktoś doda pola do zapytania — stąd test na brak `email`/`user_id` w odpowiedzi.
- **Data rozliczenia na czas:** przy leniwym rozliczeniu `finished_at` to moment wykrycia, nie upływu zegara (`timeout-settler.ts`: `finished_at = now`). Użytkownik, który wraca po godzinach, zobaczy późniejszą datę niż faktyczny koniec. Nie zmieniamy rozliczania (to zmiana zachowania wdrożonego zegara); ograniczenie opisane, propozycja: zapisywać moment upływu zegara jako `finished_at` (osobna zmiana zegara, Pytanie 3).
- **Wydajność:** zapytanie opiera się o `game_players_user_id_index`; dla konta z tysiącami partii sortuje się je w pamięci. Weryfikacja `EXPLAIN` (Q3) i test czasu na ~10 000 partii jednego konta; w razie potrzeby indeks `(game_id)` na `game_players` istnieje przez unikalność `game_id, seat`, a częściowy `games(finished_at, id) where status='finished'` byłby osobną migracją.
- **Partie osierocone:** gdy usunięte są oba konta, wiersz `games` zostaje bez właściciela (BR-18 nie przewiduje sprzątania; reguły `guestOnly*` dotyczą wyłącznie partii gości). Nie wpływa na historię; to pytanie o retencję danych (CP-2), poza zakresem.
- **Zależność od przyszłego typu `agent`:** zmiana `PARTICIPANT_KINDS` łamie kompilację mapowania — zamierzone; przy wdrożeniu D-28 należy sprawdzić też `CHECK` `game_players_kind_check` (migracja po stronie tamtej specyfikacji).
- **Odwracalność:** brak migracji; revert PR-a usuwa stronę, endpoint i przycisk, dane nietknięte.
- **Rozjazd prototypu z regułami:** stories wciąż używają „Zaproszony przez link” — poprawka w tym samym PR-ze, żeby nie utrwalić nieaktualnej reguły.

## 📝 Decisions in play

BR-24 (historia kont uczestników, gość bez historii, „{nick} (gość)”), BR-29 (nick gościa), BR-17 (Usunięty gracz), BR-18 (retencja bez limitu), BR-30 (agent bez historii, etykieta „Agent”), D-04, D-16, D-28; ryzyko A-04 (popyt na grę z agentem) — historia nie zależy od niego. BR-08 jest nadpisane przez BR-24; kryterium #27 odwołujące się do „Zaproszony przez link” wymaga potwierdzenia aktualizacji (Q5). Właściciel: Bartosz Wójcik. Brak propozycji nadpisania decyzji.

## 📋 Phasing

Jedna faza, jeden PR implementacyjny (zgodnie z regułą „mało, ale pełnych PR-ów”; refaktor helpera daty i poprawki prototypu są małe i dotyczą tej samej funkcji) (kod + testy + dokumentacja; `Refs #27`, zamknięcie przez właściciela po akceptacji): „Strona historii z paginacją”. Spec zatwierdzany osobno (ten PR).

## 📋 Implementation Plan

1. **`core`:** `games/history.ts` (stałe, `historyResultOf`, kursor, typy `HistoryEntry`/`OpponentKind`, etykieta powodu przez wyczerpujący `switch`); testy 100% (win/loss/draw, oba miejsca, kursor poprawny/uszkodzony/z niepoprawnym uuid/datą).
2. **`GameHistoryService`** + rejestracja w `container.ts`: `settleFor` → SQL → mapowanie (konto, usunięte konto, gość z nickiem/bez, `agent`); testy na fałszywym `em` (gałęzie: pusto, dokładnie 20, 21 → `nextCursor`, kursor przekazany do SQL); testy `container.test.ts`.
3. **Zapytanie na prawdziwym PostgreSQL** (lekcje `?`/daty jako tekst): test integracyjny w `tests/integration/game-history-api.test.ts`: dwa konta, partie `five_in_row`/`timeout`/`resignation`/`draw`, rewanż, gość (z nickiem i bez), usunięte konto przeciwnika, `active`/`waiting`/`cancelled` (nie ma), partia cudza (nie ma), partia z identycznym `finished_at` na granicy strony, ~10 000 partii jednego konta + `EXPLAIN` (kryterium: plan zawiera `game_players_user_id_index`, a zapytanie trwa < 200 ms; przy skanie sekwencyjnym krok kończy się dodaniem migracji z indeksem częściowym i powtórzeniem testu), brak `email`/`userId` w JSON, przegrana na czas rozliczona przez odczyt.
4. **Route handler** `GET /api/history` przez `apiHandler` (`401` gość i brak sesji, `400` kursor, `200`, `no-store`); testy jednostkowe.
5. **Helper daty:** wydzielić `formatValidUntil`-owy formatter do `lib/format-date-time.ts` (`formatFinishedAt`), `game-room.tsx` importuje go bez zmiany zachowania; testy (CET, CEST, północ).
6. **Strona `/history`** + `loading.tsx` + komponent kliencki „Pokaż starsze” (`@testing-library/react`, `userEvent.setup({ delay: null })`; podwójne kliknięcie nie wysyła dwóch żądań — `useRef`); stany: pusto, błąd, błąd kolejnej strony, 401, 21+ wierszy; przekierowanie gościa.
7. **Punkt wejścia:** przycisk „Historia” na stronie głównej (test `page.test.tsx`: zalogowany tak, gość i wizytor nie).
8. **DS i dokumentacja:** poprawić stories/`historia.mdx` (etykieta gościa, wiersz z długim nickiem, „Pokaż starsze”), wpis do „Czego brakuje”, `npm run test:stories -w @gomoku/ui`, `npm run check:tokens -w @gomoku/ui`; przenieść spec do `implemented/`, dopisać `track-e04.md` (Faza historii) z odhaczonymi krokami.
9. **Scenariusz przeglądarkowy** (`game-history-pages.test.ts`, `agent-browser`): rozegrana partia → `/history` pokazuje przeciwnika, wynik, datę, powód; gość-przeciwnik „(gość)”; paginacja „Pokaż starsze”; wizytor przekierowany do logowania; zrzuty w obu motywach przy 320/1280 px.
10. **Weryfikacja:** `npm run check` (z Dockerem), `npm run build` przed `test:integration`, ręcznie `npm run dev` (restart po zmianie serwisu, lekcja 2026-10-28): lista, pusto, „Pokaż starsze”, gość jako przeciwnik, 320 px.

## 📝 Acceptance criteria (mapowanie)

- [ ] Zakończona partia jest na liście obu kont z przeciwnikiem, wynikiem, datą i sposobem zakończenia.
- [ ] Użytkownik A nie widzi partii, w których nie grał.
- [ ] Trwająca (i oczekująca, anulowana) partia nie jest na liście.
- [ ] Przeciwnik z usuniętym kontem → „Usunięty gracz” (BR-17).
- [ ] Przeciwnik-gość → „{nick} (gość)” (BR-24/BR-29); gość nie ma historii ani linku do niej.
- [ ] Gość z 24-znakowym nickiem: nick obcięty lub złamany, „(gość)” widoczne przy 320 px bez poziomego przewijania.
- [ ] Paginacja kluczem bez duplikatów i luk; plan zapytania używa `game_players_user_id_index`.
- [ ] Brak e-maila i identyfikatora konta przeciwnika w odpowiedzi.
- [ ] 100% pokrycia per plik, `npm run check` zielone, zrzuty w obu motywach przy 320 px.

## ⚠️ Pytania do człowieka

1. Q5: potwierdzić, że etykieta gościa to „{nick} (gość)” (BR-24, BR-29), a nie „Zaproszony przez link” z treści #27 — i zaktualizować kryterium w zgłoszeniu.
2. Q6: czy wiersz historii ma w przyszłości prowadzić do podglądu zakończonej partii (dziś poza zakresem)?
3. Czy data partii przegranej na czas ma być momentem upływu zegara (rekomendacja: tak, jako osobna zmiana rozliczania w zegarze) czy wystarczy moment rozliczenia (założenie Q8)?
4. Czy partie z `origin = 'rematch'` mają być oznaczone w historii (Q7)?
