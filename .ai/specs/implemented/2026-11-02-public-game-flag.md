# Flaga „partia publiczna” przy zaproszeniu (E10-S01, #202; E10-S01-T01, #205)

> Status: **wdrożona 2026-11-02 (PR implementacyjny `Closes #202`, `Closes #205`)**. Specyfikacja zatwierdzona autonomicznie na mocy delegacji właściciela (2026-11-02); właściciel może ją nadpisać. Źródło: zgłoszenia #202 i #205, epik #201, `.ai/specs/product-brief.md` (D-33, BR-39…BR-45, N-13, A-14, Q-17/Q-18).
>
> Zakres: **tylko zapis i pokazanie flagi** (kolumna, tworzenie zaproszenia, ekran dołączania). Oglądanie na żywo (E10-S02), czat widza (S03), licznik widzów (S04), kill-switch (S05), agent (S06) i przegląd historii (E09) — poza zakresem.

## 📝 TLDR

Dziś każda partia jest prywatna. Po wdrożeniu twórca zaproszenia (konto lub gość) może zaznaczyć pole **„Partia publiczna”**; flaga trafia do nowej kolumny `games.is_public` (domyślnie `false`) i jest czytana razem z zaproszeniem, dzięki czemu ekran dołączania pokazuje **„Partia publiczna: może ją oglądać każdy z kodem”** przed dołączeniem (BR-45). Partie z lobby i rewanże zawsze są prywatne (BR-40), a partia publiczna nie trafia na żadną listę (N-13). Samego oglądania jeszcze nie ma — flaga jest przygotowaniem pod E10-S02.

## Resolved assumptions (autonomous defaults)

1. **Kolumna na `games`, nie na `invitations`.** Publiczność jest własnością partii (widz i historia czytają partię), a zaproszenie jest jednorazowe. `games.is_public boolean not null default false` — istniejące partie pozostają prywatne.
2. **Brak CHECK-a „tylko origin = invite”.** BR-40 egzekwuje kod (lobby i rewanż wstawiają wiersz bez kolumny → `false`); CHECK blokowałby późniejsze, jeszcze nieustalone ścieżki. Scenariusz integracyjny pilnuje domyślnej wartości.
3. **Brak migracji danych i brak zmian w `down`** poza `drop column` (komentarz ostrzegawczy w pliku).
4. **API: `isPublic?: boolean` w ciele `POST /api/games`.** Gość: dodatkowe pole obok `acknowledgedGuestWarning`. Konto: ciało było dotąd puste — teraz jest **opcjonalne** (`readOptionalJsonBody`: brak lub puste ciało = `{}`); ciało obecne, ale niepoprawne (nie-JSON, `isPublic` nie-boolean) → `400`. Do tej pory ciało konta było ignorowane w całości; nikt go nie wysyłał.
5. **Etykieta i miejsce:** pole wyboru „Partia publiczna” (komponent DS `Checkbox`) z podpowiedzią „Po rozpoczęciu partii każdy z kodem lub linkiem będzie mógł ją oglądać.”, nad przyciskiem tworzenia — w `CreateGameButton` (konto) i `GuestCreateForm` (gość). Domyślnie odznaczone. Lobby nie ma tej opcji (nie ma tam formularza zaproszenia).
6. **Ekran dołączania:** `Alert` `info` z tekstem „Partia publiczna: może ją oglądać każdy z kodem” pod nagłówkiem, w każdym stanie otwartego zaproszenia (`joinable`, `has-*`). Dla partii prywatnej, zaproszenia nieważnego i limitu — nic.
7. **MCP bez zmian:** agent dołącza kodem jak dotąd; flaga nie jest wystawiona narzędziom (ani `join`, ani `get_state`) w tej historii — E10-S06.
8. **Przekazanie dalej:** `READ_INVITATION_SQL` czyta `g.is_public`; `InvitationRow.is_public`, `InvitationPreview.isPublic` i `InvitationView.isPublic` niosą flagę, by następne historie mogły ją czytać bez kolejnego zapytania. `CreatedGame` jej nie zwraca (twórca zna własny wybór).

## 📝 Data Model

`games.is_public boolean not null default false` — migracja `Migration20261102191800_public_games` (`npm run db:migration:create`; wygenerowany plik oczyszczony z hałasu nieaktualnego snapshotu, wg lekcji 2026-10-31). Encja `Game`: `isPublic: p.boolean().default(false)`.

## 📝 API Contracts

`POST /api/games`
- konto: ciało opcjonalne `{ isPublic?: boolean }`;
- gość: `{ acknowledgedGuestWarning: true, nickname?, cancelOwnWaitingGame?, isPublic? }`;
- odpowiedź `201` bez zmian (`{ gameId, invitation }`).

`GameService.create({ kind, …, isPublic? })` → `games.is_public`. `InvitationService.preview` zwraca dodatkowo `isPublic`.

## 📝 UI/UX

Strona główna / historia / pokój partii (`CreateGameButton`) oraz `/play` (gość): pole „Partia publiczna” przed przyciskiem. `/invite/[code]`: `Alert` `info` (ikona + słowo — nie sam kolor). Teksty po polsku, komponenty z `@gomoku/ui/game/*`, bez nowych tokenów.

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Zachowanie |
| --- | --- |
| Konto wysyła `POST /api/games` bez ciała | prywatna partia (jak dotąd) |
| `isPublic: "tak"` / nie-JSON | `400`, nic nie powstaje |
| Partia z lobby, rewanż | `is_public = false` (domyślna wartość kolumny) |
| Zaproszenie nieważne / limit prób | ekran bez wzmianki o publiczności |
| Twórca otwiera własne zaproszenie | przekierowanie do partii jak dotąd |
| Migracja `down` | usuwa kolumnę; partie zostają |

## 📝 Risks & Impact Review

Niskie: dodatkowa kolumna z domyślną wartością, jedno pole w SQL odczytu zaproszenia. Ryzyko A-14/Q-17 (nadużycia widzów, prywatność) dotyczy dopiero oglądania — ta historia niczego nie ujawnia, tylko informuje przeciwnika. Zmiana kontraktu ciała dla konta jest wstecznie zgodna (puste ciało nadal działa).

## 📝 Decisions in play

D-33, BR-40 (flaga tylko przy zaproszeniu), BR-45 (przeciwnik informowany przed dołączeniem), BR-29, N-13.

## 📋 Implementation Plan

1. Migracja i encja (#205); `up`/`down` na prawdziwym PostgreSQL.
2. `core`: `createGuestGameSchema.isPublic`, `createAccountGameSchema`.
3. `app`: `readOptionalJsonBody`, trasa, `GameService`, `READ_INVITATION_SQL`, `InvitationService.preview`, `loadInvitationView`, `InviteScreen`, pola wyboru.
4. Testy jednostkowe (100%) i integracyjne: `game-public-flag-migration.test.ts`, `game-public-flag-api.test.ts`.

## Acceptance criteria

- [x] Migracja i encja dodają flagę (domyślnie prywatna); `up`/`down` sprawdzone na PostgreSQL; istniejące partie prywatne (#205).
- [x] Twórca (konto lub gość) zaznacza „partia publiczna” → partia publiczna; bez zaznaczenia prywatna (#202).
- [x] Partia z lobby jest prywatna, opcji nie ma (BR-40).
- [x] Ekran dołączania pokazuje „Partia publiczna: może ją oglądać każdy z kodem” przed dołączeniem (BR-45).
- [x] Partia publiczna nie trafia na żadną listę (N-13).
- [x] Partia prywatna — zachowanie bez zmian (regresja).
- [x] Flaga dostępna w `InvitationRow` / `InvitationPreview` / `InvitationView`.

## Adnotacje po wdrożeniu (2026-11-02)

- Wszystko zgodnie ze specyfikacją; migracja sprawdzona w górę/w dół/w górę na PostgreSQL (baza tymczasowa) oraz w `game-public-flag-migration.test.ts`.
- `npm run check`: lint, typecheck, test (100% pokrycia), build — zielone; integracja 819/821 w pełnym biegu: `invitations.test.ts` (oczekiwanie bez `isPublic`) poprawiony i zielony, `game-play-pages.test.ts` (limit 30 s) padł pod obciążeniem w pełnym biegu i przeszedł osobno (flaky, niezwiązany z flagą).
- Uruchamiając integrację z worktree cezara ustaw `TMPDIR=/tmp` — inaczej Chrome kończy się „Socket path too long”.
