# Przegląd zakończonej partii publicznej po kodzie/linku (E09-S02, #204)

> Status: **wdrożona (2026-11-02; zgłoszenie #204)**. Specyfikacja zatwierdzona autonomicznie na mocy delegacji właściciela (zadanie dispatch `97b53201`); właściciel może ją nadpisać.
>
> Źródło: zgłoszenie #204 (E09-S02), epik #200, `.ai/specs/product-brief.md` (D-33, BR-40, BR-43, BR-44, BR-24, N-13), wdrożone: `implemented/2026-11-02-game-review.md` (ekran i `canReview`), `implemented/2026-11-02-public-game-flag.md` (`games.is_public`).

## 📝 TLDR

Każdy (także bez konta) z kodem lub linkiem zaproszenia do **zakończonej partii publicznej** przechodzi jej ruchy na istniejącym ekranie `/games/[gameId]/review`. `/invite/[code]` zakończonej partii publicznej przekierowuje na `/games/[gameId]/review?code=KOD`. Partia prywatna albo z `is_public = false` (po kill-switchu, E10-S05) daje to samo `404` co cudza partia. Czytelnik z kodem nie zostawia śladu (brak historii, brak zapisów), nie ma czatu. Bez zmian schematu.

## Decyzje (autonomiczne wartości domyślne)

| # | Pytanie | Decyzja | Dlaczego |
|---|---|---|---|
| Q1 | Jak kod trafia na adres przeglądu | Zaproszenie zakończonej partii publicznej (`/invite/[code]`) przekierowuje na `/games/[gameId]/review?code=KOD`. Strona przeglądu z `?code=` używa dostępu `code`. | Ekran i adres bez zmian (zgłoszenie); kod jest dowodem dostępu, więc samo `gameId` (znane uczestnikom) niczego nie otwiera. |
| Q2 | Wariant dostępu | `ReviewAccess = { kind: "account"; userId } \| { kind: "code"; code }`. `canReview(access, players, game)` — jedyne miejsce decyzji: `code` przechodzi, gdy `game.isPublic` **i** kod jest kodem zaproszenia tej partii. | Punkt rozszerzenia z S01. Kill-switch (E10-S05) tylko ustawia `is_public=false`, więc odczyt flagi wystarcza. |
| Q3 | Czytanie flagi | Przy każdym otwarciu z bazy (bez cache). | Zamknięcie publiczności działa od razu (BR-43). |
| Q4 | Odmowa | Ta sama co w S01: `open` zwraca `null`, strona `404` z jednym komunikatem (zły kod, zły `gameId`, partia prywatna, zamknięta, niezakończona, sprzątnięta). | Nie ujawniamy istnienia partii (N-05). |
| Q5 | Brak sesji | Dostęp `code` nie wymaga sesji ani cookie gościa i nie czyta ich. Bez `?code=` — bez zmian (przekierowanie do logowania). | Przegląd po kodzie ma działać bez konta. |
| Q6 | Ślad czytelnika | Brak zapisów: ani wiersza `game_players`, ani wpisu w historii. Perspektywa: `viewerSeat = null` (teksty „Wygrały czarne/białe” z S01). Także dla zalogowanego uczestnika, który wszedł z kodem. | N-13: widz nie ma historii. |
| Q7 | Wyciek kodu | Strona przeglądu ma `referrer: no-referrer` (jak `/invite/[code]`). Przycisk powrotu dla czytelnika z kodem prowadzi do `/`, bez kodu. | Kod jest w adresie. |
| Q8 | Zaproszenie niepubliczne / zakończone prywatnie | Bez zmian: „zaproszenie nieważne” (`invalid`). Uczestnik zakończonej partii nadal trafia na `/games/[id]`. | Prywatna partia nie daje przeglądu po kodzie (BR-44). |
| Q9 | Limit prób | `/invite/[code]` zużywa pulę prób jak dotąd; strona przeglądu nie ma własnej puli (potrzebuje `gameId` **i** kodu, `gameId` to UUID). | Brak nowej powierzchni do zgadywania kodu. |
| Q10 | Jak długo | Dopóki istnieje rekord partii i zaproszenia (`db:cleanup`, BR-44). | Propozycja ze zgłoszenia. |

## Model danych i API

Bez zmian schematu i bez nowych endpointów. `InvitationService.preview` zwraca nowy stan `reviewable` (+ `gameId`) dla zaproszenia zakończonej partii publicznej, gdy oglądający nie jest jej uczestnikiem; `InvitationView` ma wariant `review`. `GameReviewService.open` dla `code` czyta dodatkowo `Invitation` (`game`, `code` znormalizowany).

## Pliki

- `packages/app/src/server/services/games/game-review-service.ts` (+test)
- `packages/app/src/server/services/games/invitation-service.ts` (+test), `server/http/invitation-view.ts` (+test)
- `packages/app/src/app/(frontend)/invite/[code]/page.tsx` (+test)
- `packages/app/src/app/(frontend)/games/[gameId]/review/page.tsx` (+test)
- Test integracyjny `tests/integration/game-review-pages.test.ts`.

## Kryteria akceptacji

- [x] Zakończona partia publiczna i jej kod/link: ktokolwiek (także bez konta) przegląda ruchy.
- [x] Partia prywatna i jej kod po zakończeniu: odmowa (`404`/nieważne zaproszenie).
- [x] Publiczność zamknięta (`is_public=false`): kod nie otwiera przeglądu.
- [x] Osoba bez konta nie ma nic w historii; brak zapisów do bazy.
- [x] Brak czatu na ekranie.
- [x] 100% pokrycia nowego kodu; scenariusz integracyjny; `npm run check`.

## Poza zakresem

Widzowie na żywo (E09-S03+), kill-switch (E10-S05), lista partii (N-13), historia widza.

## Odstępstwa wdrożenia i dowody

- `canReview` dostało trzeci argument (`ReviewSubject`: `isPublic`, `codeMatches`). Strona 404 przeglądu nadal linkuje do `/history` (czytelnik z kodem ma przycisk powrotu do `/` tylko na ekranie przeglądu).
- Weryfikacja: `npm run lint` (0 błędów), `typecheck`, `npm test` (2901 testów, 100% pokrycia), `npm run build` (`LOW_MEMORY=1`), `npm run test:integration` (66 plików, 827 testów, w tym nowe scenariusze w `game-review-pages.test.ts`). Nie sprawdzono ręcznie w `npm run dev`.
