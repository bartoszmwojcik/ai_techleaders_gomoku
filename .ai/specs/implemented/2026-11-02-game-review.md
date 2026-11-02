# Przegląd zakończonej partii z historii (E09-S01, #203)

> Status: **wdrożona (2026-11-02; zgłoszenie #203)**. Specyfikacja zatwierdzona autonomicznie na mocy delegacji właściciela (zadanie dispatch `97b53201`); właściciel może ją nadpisać.
>
> Źródło: zgłoszenie #203 (E09-S01), epik #200, `.ai/specs/product-brief.md` (D-33, BR-44, BR-24, BR-34, N-13, A-14, Q-17), wdrożone: `implemented/2026-10-31-game-history.md` (lista `/history`), `implemented/2026-10-25-game-moves-win-detection.md` (zapis ruchów, linia wygrywająca), `implemented/2026-10-30-guest-only-games-cleanup.md` (sprzątanie). Następna historia **E09-S02 (#204)** doda dostęp po kodzie/linku do partii publicznych i użyje tego samego ekranu i tej samej funkcji dostępu.

## 📝 TLDR

Z listy `/history` uczestnik z kontem otwiera zakończoną własną partię na stronie `/games/[gameId]/review` i przechodzi ją ruch po ruchu (początek / poprzedni / następny / koniec); widzi wynik i sposób zakończenia. Cudza partia prywatna, nieistniejąca, niezakończona i sprzątnięta dają **tę samą** odpowiedź `404` z jednym komunikatem — strona nie ujawnia, że partia istnieje. Bez zmian schematu: ruchy są już w `games.moves`. Brak czatu w przeglądzie (BR-34). Nic nie jest zapisywane (odczyt).

## Decyzje (autonomiczne wartości domyślne)

| # | Pytanie | Decyzja | Dlaczego |
|---|---|---|---|
| Q1 | Adres | `/games/[gameId]/review` (strona frontendowa, `connection()`, `noindex`). | Ten sam identyfikator co `/games/[gameId]`; E09-S02 wchodzi w ten adres kodem/linkiem bez zmiany ekranu. |
| Q2 | Gdzie sprawdzamy dostęp | Jedna metoda `GameReviewService.open(access, gameId)`; decyzję podejmuje wyłącznie funkcja `canReview(access, game, players)` w tym samym pliku. | Punkt rozszerzenia: S02 dodaje wariant `ReviewAccess` (kod/link, flaga publiczności z BR-40, kill-switch BR-43) i gałąź w `canReview`; ekran, strona i serwis się nie zmieniają. |
| Q3 | Kto może otworzyć (S01) | `ReviewAccess = { kind: "account"; userId }` i partia `finished`, w której to konto ma miejsce (`game_players.user_id`). Gość i agent nie mają historii (BR-24, BR-31). | BR-44 w części „partia prywatna: tylko uczestnicy z kontem”. |
| Q4 | Odpowiedź przy braku dostępu | Serwis zwraca `null` (nie rzuca), strona woła `notFound()`. Ta sama odpowiedź dla: złego formatu id, braku partii, cudzej partii, partii niezakończonej (`waiting`/`active`/`cancelled`). | Nie ujawniamy istnienia (kryterium 3). Wyjątek z serwisu w `getCurrentUserWith` zostałby zamieniony na „brak sesji” i przekierowanie do logowania. |
| Q5 | Partia sprzątnięta | Rekord zniknął, więc nie da się odróżnić jej od cudzej: jedna strona `404` z komunikatem „Ta partia nie istnieje, została usunięta po okresie przechowywania albo nie masz do niej dostępu” + link do `/history`. | Czytelny komunikat (kryterium 4) bez ujawniania istnienia (kryterium 3); rozróżnienie wymagałoby wiedzy, czyja była usunięta partia. |
| Q6 | Brak sesji | Przekierowanie do `/login?next=/games/<id>/review` (jak `/history`). Dopiero po zalogowaniu działa reguła Q4. | Spójnie z `/history`. |
| Q7 | Pozycja startowa | Przegląd otwiera się na **końcu** (ostatni ruch, linia wygrywająca, wynik widoczny od razu); „Początek” cofa do pustej planszy. | Wynik i sposób zakończenia są od razu na ekranie; przechodzenie wstecz jest naturalne. |
| Q8 | Sterowanie | Cztery przyciski „Początek”, „Poprzedni”, „Następny”, „Koniec” (wyłączone na krańcach) i licznik „Ruch N z M”. Klawiatura: Tab/Enter na przyciskach; strzałki zostają planszy (nawigacja po polach). Bez skrótów globalnych i bez suwaka. | Zgłoszenie zostawia sterowanie specyfikacji; skróty kolidowałyby ze strzałkami `Board`. |
| Q9 | Linia wygrywająca | Pokazana tylko na ostatnim kroku partii zakończonej `five_in_row`. | Wcześniej linia jeszcze nie istnieje. |
| Q10 | Perspektywa | `viewerSeat` (miejsce czytającego albo `null`). Z miejscem: teksty jak na ekranie partii („Wygrałeś”, „Przegrałeś”, „Remis”, powód). Bez miejsca (S02): „Wygrały czarne/białe” z nazwą gracza. Wariant bez miejsca jest zaimplementowany i przetestowany jednostkowo, ale w S01 nieosiągalny ze strony. | Komponent jest wielokrotnego użytku (S02) bez zmiany typów. |
| Q11 | Zegary | Nie pokazujemy (zapisane są tylko końcowe wartości, nie przebieg). | Brak danych; nie wymyślamy. |
| Q12 | Lista `/history` | Wiersz dostaje link „Przejrzyj partię” (nowy opcjonalny slot `action` w `HistoryRow`). | Wiersz nie był linkiem „bo przegląd był poza zakresem”; teraz jest w zakresie. |
| Q13 | Odświeżanie/obciążenie | Brak odpytywania: partia zakończona jest niezmienna, dane przychodzą jednym renderem serwera (Q-17/A-14 dotyczą widzów na żywo, nie tego). | Zero obciążenia ponad jeden odczyt. |

## Model danych i API

Bez zmian schematu i bez nowych endpointów (strona serwerowa czyta przez serwis). Dwa zapytania: `Game` po id ze statusem `finished`, potem `GamePlayer` z kontem.

Typ w `@gomoku/core` (`games/review.ts`):

```ts
type GameReview = {
  gameId: string;
  finishedAt: string; // ISO 8601, UTC
  blackSeat: Seat;
  moves: number[]; // komórki ruchów 1..N
  result: { winnerSeat: Seat | null; reason: EndReason; winLine: number[] | null };
  players: { seat: Seat; kind: ParticipantKind; displayName: string | null; agentName?: string | null }[];
  viewerSeat: Seat | null;
};
```

Nigdy: e-maile, identyfikatory kont, tokeny, czat. Pomocnicze funkcje czyste: `clampReviewStep` w `core`; `stonesAt`, `lastMoveAt`, `winLineAt`, `stepStatus`, `reviewOutcomeOf` w `app/src/lib/games/review.ts`.

## Pliki

- `packages/core/src/games/review.ts` (+test): typ, `clampReviewStep`, `reviewStonesAt`.
- `packages/app/src/server/services/games/game-review-service.ts` (+test), rejestracja w `container.ts`.
- `packages/app/src/app/(frontend)/games/[gameId]/review/{page,review-view,not-found,loading?}.tsx` (+testy).
- `packages/app/src/lib/games/review.ts` (+test): teksty wyniku/kroku.
- `packages/ui/src/game/history-list.tsx`: slot `action`.
- Test integracyjny `tests/integration/game-review-pages.test.ts`.

## Kryteria akceptacji

- [x] Zalogowany uczestnik otwiera zakończoną własną partię z `/history` (link w wierszu) i przechodzi ruch po ruchu: początek / poprzedni / następny / koniec.
- [x] Widzi wynik i sposób zakończenia (pięć w linii, czas, poddanie, remis).
- [x] Cudza partia prywatna → `404` bez ujawnienia, że istnieje (ten sam status i treść co dla nieistniejącej).
- [x] Partia sprzątnięta przez `db:cleanup` → `404` z czytelnym komunikatem.
- [x] Brak czatu na ekranie przeglądu (BR-34); brak zapisów do bazy.
- [x] Dostęp rozstrzyga jedna funkcja (`canReview`) — punkt rozszerzenia dla E09-S02.
- [x] 100% pokrycia nowego kodu; scenariusz integracyjny; `npm run check`.

## Poza zakresem

Przegląd po kodzie/linku i flaga publiczności (E09-S02), widzowie na żywo (E09-S03+), zegary w przebiegu, eksport partii (PGN), analiza ruchów, przegląd partii niezakończonych.

## Odstępstwa wdrożenia i dowody

- Brak `loading.tsx` dla przeglądu (lekcja 2026-10-29: ukrywa status 404). `outcomeOf`/`playerNameOf` w `lib/games/play.ts` przyjmują węższe typy, żeby użyć ich też poza `GameView`; `displayNameOf` wyeksportowano z `game-service.ts`.
- Weryfikacja: `npm run lint` (0 błędów), `typecheck`, `npm test` (2879 testów, 100% pokrycia), `npm run build` (`LOW_MEMORY=1`), `npm run test:integration` (63/64 plików przy pierwszym biegu; jedyna porażka to asercja `innerText` w nowym teście, poprawiona i powtórzona: `game-review-pages.test.ts` 4/4). Lokalnie integracja wymaga `TMPDIR=/tmp` (gniazdo Chrome ma limit długości ścieżki).
- Nie sprawdzono w `npm run dev` ręcznie; ekran obejrzany tylko przez test przeglądarkowy przy 320 px (bez przewijania w bok).
