# Nick uczestnika partii (E02-S07)

> Status: **wdrożona (2026-10-31; zgłoszenie #94 domknięte, dowody w sekcji „Odstępstwa wdrożenia i dowody”)**; wcześniej: **zatwierdzona do implementacji** po prototypie (`om-spec-writing`, tryb interaktywny, 2026-10-30; przegląd fresh-context: werdykt „revise”, poprawki naniesione; właściciel zatwierdził 2026-10-30). Źródło: żądanie właściciela z 2026-10-30 („przed wejściem do partii podaje swój nick albo zatwierdza propozycję”); decyzje Q1–Q8 poniżej („1 c; 2 ok; 3 ok; 4 tak; 5 ok; 6 ok; 7 ok; 8 b”). Pierwsza z dwóch specyfikacji: ta jest wdrażalna **sama** (dotyczy gości, którzy dziś dołączają do zaproszenia); druga: `2026-10-30-guest-creates-game.md` (gość tworzy partię) zależy od tej. Zmienia: klauzulę „nie ma nazwy” z BR-22 i BR-24 z `.ai/specs/product-brief.md` (zastępowane przez BR-29 / D-27), adnotację L14 w #21 (etykieta gościa), #21 (kontrakt `accept`, widok partii), #88 (rewanż gościa).

## Resolved decisions

| # | Pytanie | Decyzja (właściciel, 2026-10-30) |
|---|---|---|
| Q1 | Co znaczą „Gracz białymi/czarnymi” przy losowanych kolorach | Domyślna nazwa to **„Gracz 1” / „Gracz 2”** (numer miejsca: twórca = 1, dołączający = 2), **wyliczana przy odczycie z miejsca**, nie zapisywana; kolory zostają losowane przy dołączeniu (#22). Nazwa nie zależy od koloru, więc nie może kłamać. |
| Q2 | Reguły nicku | 1–24 znaków: litery, cyfry, spacje, `_` i `-`; przycinanie, bez unikalności, bez filtra wulgaryzmów. Puste pole = zatwierdzenie domyślnej nazwy. |
| Q3 | Jak widać gościa | „{nick} (gość)” w partii i w historii kont (E04); dla konta sama nazwa konta. |
| Q8 | Podział | Dwie specyfikacje: ta (nick) i `guest-creates-game`. |

## 📝 TLDR

Dziś gość (osoba bez konta, która dołączyła do partii z kodu) nie ma nazwy: przeciwnik widzi bezosobowe „Gość” (`displayName = null`), a w historii „Zaproszony przez link” (BR-24, L14). Po wdrożeniu (zachowanie przyszłe) gość przed wejściem do partii **podaje nick albo zatwierdza domyślne „Gracz 1” / „Gracz 2”**, a przeciwnik widzi go jako „{nick} (gość)”. Nick żyje tylko w ramach jednej partii, nie jest kontem ani tożsamością.

## 📝 Problem Statement

Gra ze znajomym jest przyjemniejsza, gdy przeciwnik ma imię, a nie „Gość”. Dziś brak nazwy utrudnia też rozróżnienie dwóch graczy bez kont (patrz `guest-creates-game`). Dowód popytu: brak (A-01, decyzja właściciela); benchmarki PlayOK i papergames.io pokazują nazwę także gościom `[BENCHMARK]`.

## 📝 Proposed Solution
- Nowa kolumna `game_players.nickname` (varchar 24, **NULL**). Zapisujemy **tylko nick wpisany przez gościa**; pusty wpis zostawia `NULL`, a **domyślną nazwę „Gracz {seat}” wyznacza odczyt** (`defaultNickname(seat)` w `core`). Dla `kind = account` zawsze `NULL` (nazwa z `users.display_name`). Zmiana jest czysto rozszerzająca (expand-only): bez backfillu i bez okna wdrożeniowego, w którym stary kod wstawiłby gościa bez nicku.
- Walidator `nicknameSchema` w `core` (wspólny dla API i UI): (1) NFC; (2) znaki `\p{Cc}` (tab, nowa linia) zamieniane na spację, formatujące `\p{Cf}` (bidi, zero-width) usuwane, **z wyjątkiem ZWNJ/ZWJ** (U+200C/U+200D, potrzebne w pismach niełacińskich); (3) wszystkie `\p{Zs}` (także NBSP) zwijane do jednej spacji; (4) przycięcie; (5) długość liczona w **punktach kodowych** (`Array.from(s).length`, nie `.length`), 1–24; (6) wzorzec `^[\p{L}\p{M}\p{N}\u200C\u200D _-]+$` z flagą `u` (ZWNJ/ZWJ należą do `\p{Cf}`, więc muszą być dozwolone jawnie, skoro normalizacja je zachowuje; korekta po implementacji, test z pismem dewanagari). Pusty wynik = brak nicku (domyślna nazwa).
- Widok (`GameState.players[].displayName`) zwraca nick gościa albo `Gracz {seat}`; **sufiks „(gość)” dodaje warstwa UI** z `kind` (komponenty bez wbudowanych tekstów, AGENTS.md).
- **Alternatywy odrzucone:** nick w ciasteczku (zmienia się po stronie klienta, brak spójności dla przeciwnika); unikalność nicku (to nie konto); nazwa domyślna od koloru „Gracz białymi/czarnymi” (kolor jest losowany później, nazwa mogłaby kłamać — Q1); zapis rozstrzygniętej nazwy domyślnej (wymaga backfillu i `CHECK NOT NULL` → okno wdrożeniowe i błędna nazwa po zamianie miejsc w rewanżu).

## 📝 Architecture
- **`core`** (`validators/games/`, `games/`): `nicknameSchema`, `defaultNickname(seat)`, stała `NICKNAME_MAX_LENGTH = 24`.
- **`db`**: kolumna `nickname varchar(24) NULL`; `CHECK (nickname IS NULL OR char_length(nickname) >= 1)` (górny limit niesie `varchar(24)`); `CHECK (kind = 'guest' OR nickname IS NULL)` (konto nie ma nicku). Istniejące wiersze mają `NULL`, więc oba `CHECK`-i są spełnione bez migracji danych; `down` usuwa kolumnę i `CHECK`-i.
- **`InvitationService.accept(as = guest)`**: przyjmuje opcjonalne `nickname` i zapisuje je w tej samej instrukcji, która tworzy wiersz gościa (`INSERT_GUEST_SQL`), bez okna z częściowym wierszem.
- **`GameService.stateOf`** i **`preview`**: `displayName` gościa = `nickname ?? defaultNickname(seat)`; dla konta bez zmian.
- **Rewanż (#88):** nick gościa jest kopiowany do nowego wiersza uczestnika (nowy token); gdy rewanż zamienia miejsca, nick jawny zostaje, a nazwa domyślna podąża za nowym miejscem (brak „Gracz 2” na miejscu 1).

## 📝 Data Model
| Kolumna | Typ | Zasada |
|---|---|---|
| `game_players.nickname` | `varchar(24)` NULL | tylko jawny nick gościa; `NULL` = domyślna „Gracz {seat}”; dla konta zawsze `NULL`; po zapisie niezmienny |

Dane osobowe: nick to wolny tekst podany przez gościa, widoczny tylko dla uczestników partii; brak e-maila i identyfikatora osoby. Przechowywany tak długo jak wiersz uczestnika (sprzątanie #39); nie trafia do logów.

## 📝 API Contracts

`POST /api/invitations/{code}/accept` — `{ "as": "guest", "acknowledgedGuestWarning": true, "nickname"?: string }`:

| Wynik | Status | Treść |
|---|---|---|
| Przyjęto | `200` | bez zmian: `{ data: { gameId } }` |
| `nickname` niepoprawny (znaki, długość po normalizacji) | `400` | `VALIDATION`, `fieldErrors.nickname` |
| `nickname` przy `as = user` | `400` | `VALIDATION`, `fieldErrors.nickname` („Nick podaje tylko gość.”) |

`GET /api/games/{id}`: `players[].displayName` = nick gościa (zamiast `null`).

## 📝 UI/UX

- Strona zaproszenia (s07, opcja gościa): pole „Twój nick (opcjonalnie)” z podpowiedzią „Zostaw puste, a będziesz „Gracz 2””, **przed** przyciskiem „Rozumiem, graj jako gość” i pod ostrzeżeniem o zmianie przeglądarki (Q11 z #21). Błędy pola w linii (`aria-describedby`), wpisana wartość zostaje po błędzie. Bez dodatkowego kroku: jeden ekran, jedno kliknięcie.
- Przeciwnik i wynik: „{nick} (gość)”; w nagłówku zaproszenia „{nazwa twórcy} zaprasza Cię do partii” bez zmian dla konta.
- Prototyp: do zaktualizowania (stan s07.2 z polem nicku, p03/p05 z nazwą gościa). Kod ekranów po zatwierdzeniu prototypu (D3).

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Zachowanie |
|---|---|
| Dwaj gracze z tym samym nickiem | Dozwolone (brak unikalności); rozróżnia miejsce i sufiks „(gość)”. |
| Nick równy nazwie istniejącego konta | Dozwolone; sufiks „(gość)” zapobiega podszywaniu się. |
| Znaki sterujące, zero-width, RTL override | Usuwane przy normalizacji; wynik pusty → domyślna nazwa. |
| Same spacje | Po przycięciu pusty → domyślna nazwa. |
| Nick agresywny/obraźliwy | Ryzyko przyjęte (Q2: bez filtra); widoczny tylko dla jednego przeciwnika; zgłaszanie nadużyć poza zakresem. |
| Wyścig dwóch gości o to samo miejsce | Bez zmian względem #21 (warunkowy UPDATE); nick zapisany w tej samej instrukcji co wiersz. |
| Wstrzyknięcie HTML/skryptu w nick | Odrzucone regułą znaków; dodatkowo renderowane wyłącznie jako tekst. |

## 📝 Risks & Impact Review
- **Migracja:** wyłącznie rozszerzająca (nullable kolumna + `CHECK`-i spełnione przez istniejące wiersze); wdrożenie kolejnością „migracja, potem restart” jest bezpieczne, a stary kod (bez nicku) nadal działa. `BACKWARD_COMPATIBILITY.md` §4 (nowe ograniczenie) spełniony, bo `CHECK`-i nie mogą odrzucić danych istniejących; zgłoszenie z etykietą `risk-high` (schemat).
- **Kontrakt `displayName`:** dla gościa z `null` na tekst. UI nie może zakładać `null` ⇒ gość (rozróżnia po `kind`). Brak innych konsumentów przed E04.
- **Wolny tekst bez filtra** to decyzja produktowa (Q2), nie naruszenie reguł repozytorium; podszywanie ogranicza sufiks „(gość)”.
- **Znaki z wielu pism:** `\p{M}` dozwolone, ZWNJ/ZWJ zachowane; pozostałe znaki formatujące (bidi override) usuwane.

## 📝 Decisions in play
- **Zastępuje:** klauzulę „nie ma nazwy” z BR-22 i etykietę gościa z BR-24 / adnotacji L14 w #21 (etykieta „{nick} (gość)”, Q3); realizuje nową regułę BR-29 i decyzję D-27 (dodane do briefu razem z tą specyfikacją); zatwierdził właściciel 2026-10-30. Do przeredagowania w dokumentach: `product-brief.md` (BR-22, BR-24), #21, `.ai/specs/2026-10-24-account-deletion.md` (dwa miejsca z „Zaproszony przez link”), #87, #88.
- **Opiera się na:** BR-11, BR-13, #21 Q10/Q11.

## 📋 Phasing

Jedna faza, jeden PR (zgłoszenie E02-S07), niezależny od `guest-creates-game`.

## 📋 Implementation Plan
1. `core`: `nicknameSchema` (normalizacja z punktu kodowego, `\p{M}`, ZWNJ/ZWJ, `Zs`, limit w punktach kodowych), `defaultNickname`, stała; testy 100% (w tym znak spoza BMP, CJK ext. B, tab, NBSP, bidi override, same spacje, kompilacja wzorca z flagą `u`).
2. `db`: kolumna i `CHECK`-i (expand-only); up/down/up na jednorazowej bazie (nie dev); test integracyjny, że `CHECK` odrzuca nick konta i pusty nick.
3. `InvitationService.accept` + `stateOf`/`preview`: zapis jawnego nicku w `INSERT_GUEST_SQL`, odczyt z domyślną z miejsca; testy na PostgreSQL (domyślna wg miejsca, jawny nick niezmienny, `400` dla niepoprawnego i dla `as = user`, gość bez nicku z poprzedniej wersji kodu = „Gracz {seat}”).
4. UI po zatwierdzeniu zaktualizowanego prototypu: pole nicku w s07, „{nick} (gość)” w partii i wyniku, testy komponentów i przeglądarki (360/1280 px, oba motywy).
5. Dokumentacja i adnotacje (spec #21, account-deletion, #87, #88, mapa ekranów), zgłoszenie E02-S07.

## 📝 Odstępstwa wdrożenia i dowody (2026-10-31)

Osobnej adnotacji o odstępstwach nie zapisano — status „zatwierdzona do implementacji po prototypie” zastąpiony wdrożeniem; nick gościa przy rewanżu (kopiowany do nowego wiersza uczestnika) opisuje adnotacja w `2026-10-29-game-rematch.md`. Kryteria 1–3 testują ścieżkę `accept`; dla gościa-twórcy zob. `2026-10-30-guest-creates-game.md`. Dowody kryteriów zgłoszenia #94:

| Kryterium #94 | Dowód |
| --- | --- |
| Given gość przyjmujący zaproszenie, poprawny nick → zapisany i widoczny dla przeciwnika jako „{nick} (gość)” | `tests/integration/game-invitations-api.test.ts` — „takes a guest's nickname from the body and shows it to the opponent” (normalizacja NBSP i tabulatorów, `displayName` u obu stron); strona: `game-guest-nickname-pages.test.ts` — „shows the nickname as '{nick} (gość)' to the opponent on the board and after the result”, „keeps a long nickname on one line at 360 px, with '(gość)' visible and nothing scrolling sideways”; jednostkowo: `packages/app/src/server/services/games/invitation-service.test.ts` — „writes the explicit nickname in the very statement that creates the guest's row”; `packages/app/src/components/games/player-label.test.tsx` |
| Given gość z pustym polem → „Gracz {miejsce}” (wyliczane przy odczycie, niezapisywane) | `game-guest-nickname-pages.test.ts` — „calls a guest without a nickname 'Gracz 2 (gość)'”; `guest-create.test.ts` — „names a guest creator without a nickname by the default”; jednostkowo: `packages/core/src/games/nickname.test.ts` (m.in. „treats an empty result as no nickname”) |
| Given nick z niedozwolonymi znakami lub >24 punkty kodowe → `400 VALIDATION` z `fieldErrors.nickname`; nick przy `as = user` też `400` | `game-invitations-api.test.ts` — „takes a guest's nickname from the body and shows it to the opponent” (`<b>x</b>` → 400 z `fieldErrors.nickname`, partia nadal `waiting`) i „refuses a nickname from a signed-in user”; `packages/core/src/games/nickname.test.ts` — „accepts exactly 24 characters and rejects 25”, „counts code points, not UTF-16 units (astral letters)”; `invitation-service.test.ts` — „refuses a nickname from a signed-in user on that field, before any lookup”; strona: „refuses an invalid nickname in the field's line and keeps the value” |
| Given istniejący goście sprzed zmiany → migracja rozszerzająca (kolumna NULL, bez backfillu) | Tylko kod i test schematu: `packages/db/src/migrations/Migration20261030133534_nickname.ts` (`add "nickname" varchar(24) null`, `CHECK`-i dla gościa i niepustego nicku, brak `UPDATE`); `tests/integration/game-schema.test.ts` — „allows a nickname only for a guest and never an empty one”. Brak osobnego testu „wiersz sprzed migracji pozostaje poprawny”; migracja up/down nie była ponownie uruchamiana przy tym domknięciu |

Sprawdzenie wykonane 2026-10-31 na `origin/main` przez czytanie testów i kodu; testy nie były uruchamiane w ramach tego domknięcia (zmiana dokumentacyjna).
