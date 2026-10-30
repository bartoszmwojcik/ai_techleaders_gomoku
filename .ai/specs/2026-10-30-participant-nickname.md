# Nick uczestnika partii (E02-S07)

> Status: **do przeglądu** (`om-spec-writing`, tryb interaktywny, 2026-10-30). Źródło: żądanie właściciela z 2026-10-30 („przed wejściem do partii podaje swój nick albo zatwierdza propozycję”); decyzje Q1–Q8 poniżej („1 c; 2 ok; 3 ok; 4 tak; 5 ok; 6 ok; 7 ok; 8 b”). Pierwsza z dwóch specyfikacji: ta jest wdrażalna **sama** (dotyczy gości, którzy dziś dołączają do zaproszenia); druga: `2026-10-30-guest-creates-game.md` (gość tworzy partię) zależy od tej. Zmienia: BR-24 i L14 (etykieta gościa), #21 (kontrakt `accept`, widok partii), #88 (rewanż gościa).

## Resolved decisions

| # | Pytanie | Decyzja (właściciel, 2026-10-30) |
|---|---|---|
| Q1 | Co znaczą „Gracz białymi/czarnymi” przy losowanych kolorach | Domyślna nazwa to **„Gracz 1” / „Gracz 2”** (numer miejsca: twórca = 1, dołączający = 2); kolory zostają losowane przy dołączeniu (#22). Nazwa nie zależy od koloru, więc nie może kłamać. |
| Q2 | Reguły nicku | 1–24 znaków: litery, cyfry, spacje, `_` i `-`; przycinanie, bez unikalności, bez filtra wulgaryzmów. Puste pole = zatwierdzenie domyślnej nazwy. |
| Q3 | Jak widać gościa | „{nick} (gość)” w partii i w historii kont (E04); dla konta sama nazwa konta. |
| Q8 | Podział | Dwie specyfikacje: ta (nick) i `guest-creates-game`. |

## 📝 TLDR

Dziś gość (osoba bez konta, która dołączyła do partii z kodu) nie ma nazwy: przeciwnik widzi bezosobowe „Gość” (`displayName = null`), a w historii „Zaproszony przez link” (BR-24, L14). Po wdrożeniu (zachowanie przyszłe) gość przed wejściem do partii **podaje nick albo zatwierdza domyślne „Gracz 1” / „Gracz 2”**, a przeciwnik widzi go jako „{nick} (gość)”. Nick żyje tylko w ramach jednej partii, nie jest kontem ani tożsamością.

## 📝 Problem Statement

Gra ze znajomym jest przyjemniejsza, gdy przeciwnik ma imię, a nie „Gość”. Dziś brak nazwy utrudnia też rozróżnienie dwóch graczy bez kont (patrz `guest-creates-game`). Dowód popytu: brak (A-01, decyzja właściciela); benchmarki PlayOK i papergames.io pokazują nazwę także gościom `[BENCHMARK]`.

## 📝 Proposed Solution

- Nowa kolumna `game_players.nickname` (varchar 24). Dla `kind = guest` **wymagana** (zawsze zapisujemy rozstrzygniętą nazwę, także domyślną, żeby nie zmieniała się w trakcie partii); dla `kind = account` NULL (nazwa z `users.display_name`).
- Walidator `nicknameSchema` w `core` (wspólny dla API i UI): normalizacja NFC, usunięcie znaków sterujących i formatujących (`\p{C}`), zwinięcie wielokrotnych spacji, przycięcie, 1–24 znaki z `^[\p{L}\p{N} _-]+$`; pusty wynik = domyślna nazwa.
- Domyślna nazwa: `Gracz {seat}` wyznaczana po stronie serwera przy dodaniu uczestnika (miejsce znane z wiersza), nie przez klienta.
- Widok (`GameState.players[].displayName`) zwraca nick gościa; **sufiks „(gość)” dodaje warstwa UI** z `kind` (komponenty bez wbudowanych tekstów, AGENTS.md), więc API nie miesza treści z prezentacją.
- Alternatywy odrzucone: nick w ciasteczku (zmienia się po stronie klienta, brak spójności dla przeciwnika), unikalność nicku w obrębie systemu (to nie konto), domyślna nazwa od koloru „Gracz białymi/czarnymi” (kolor jest losowany później, nazwa mogłaby kłamać — Q1).

## 📝 Architecture

- **`core`** (`validators/games/` i `games/`): `nicknameSchema`, `defaultNickname(seat)`, stała `NICKNAME_MAX_LENGTH = 24`.
- **`db`**: kolumna `nickname`, `CHECK (kind = 'guest') = (nickname IS NOT NULL)`, `CHECK (char_length(nickname) BETWEEN 1 AND 24)`; migracja uzupełnia istniejących gości wartością `Gracz {seat}` przed dodaniem `CHECK` (up/down/up na jednorazowej bazie).
- **`InvitationService.accept(as = guest)`**: przyjmuje opcjonalne `nickname`, rozstrzyga domyślną nazwę i zapisuje razem z wierszem uczestnika w tej samej instrukcji, w której powstaje wiersz (bez okna z `NULL`).
- **`GameService.stateOf`** i **widok zaproszenia** (`preview`): `displayName` gościa = `nickname`; dla konta bez zmian.
- **Rewanż (#88):** gość proponujący/przyjmujący rewanż zachowuje nick w nowej partii (nowy token, ten sam nick; nie pytamy ponownie).

## 📝 Data Model

| Kolumna | Typ | Zasada |
|---|---|---|
| `game_players.nickname` | `varchar(24)` NULL | NOT NULL ⇔ `kind = 'guest'`; po zapisie niezmienny |

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

- Migracja z `CHECK` na istniejących wierszach (backfill „Gracz {seat}” w tej samej migracji); `down` usuwa kolumnę i `CHECK`-i.
- Kontrakt `displayName` zmienia się z `null` na tekst dla gości: konsumenci muszą nie zakładać `null` ⇒ gość (UI używa `kind`). Brak innych konsumentów przed E04.
- Wolny tekst bez filtra to decyzja produktowa (Q2), nie naruszenie reguł repozytorium.

## 📝 Decisions in play

- **Zastępuje:** BR-24 (etykieta „Zaproszony przez link”) i L14 („Gość”) — etykietą jest „{nick} (gość)” (Q3); właściciel zatwierdził 2026-10-30.
- **Opiera się na:** BR-22 (gość bez konta i historii), BR-11, BR-13, #21 Q10/Q11.

## 📋 Phasing

Jedna faza, jeden PR (zgłoszenie E02-S07), niezależny od `guest-creates-game`.

## 📋 Implementation Plan

1. `core`: `nicknameSchema`, `defaultNickname`, stała, testy 100% (normalizacja, granice, znaki).
2. `db`: kolumna, `CHECK`-i, backfill; up/down/up na jednorazowej bazie (nie dev).
3. `InvitationService.accept` + `stateOf`/`preview`: zapis i odczyt nicku, testy na PostgreSQL (domyślna nazwa wg miejsca, nick niezmienny, `400` dla niepoprawnego i dla `as = user`).
4. UI po zatwierdzeniu zaktualizowanego prototypu: pole nicku w s07, „{nick} (gość)” w partii i wyniku, testy komponentów i przeglądarki (360/1280 px, oba motywy).
5. Dokumentacja, aktualizacja briefu (BR-24, L14), mapy ekranów i #88 (rewanż zachowuje nick).
