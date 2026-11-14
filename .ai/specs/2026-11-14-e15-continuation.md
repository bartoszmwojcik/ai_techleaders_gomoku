# Kontynuacja epiku E15: plan wznowienia od Fazy 1 (C1) do Fazy 8 na bazie commitu `9f8bf78`

> Status: szkic wykonawczy (2026-11-14), tryb autonomiczny (zob. „Resolved assumptions”). **Projekt nie jest tu ponownie pisany.** Źródłem prawdy o zakresie, kontraktach, kolejności i kryteriach jest `.ai/specs/2026-11-13-e15-completion.md` (rewizja 4; dalej „spec domknięcia”), a nad nią zatwierdzona `.ai/specs/2026-11-10-i18n.md`. Ta specyfikacja robi trzy rzeczy: (1) zapisuje **zweryfikowany stan** po commicie `9f8bf78` (WIP, nie wypchnięty), (2) mówi, co z tego stanu zostaje, a co trzeba domknąć, (3) ustala zasady wznowienia i bramkę każdej fazy. Przy sprzeczności wygrywa spec domknięcia, potem `AGENTS.md`.

## 📝 TLDR

Aplikacja ma fundament i18n (S01), pokaz w PL/EN/FR (S02) oraz — z commitu `9f8bf78` — dwa małe kawałki epiku: `defaultNicknameSeat` + klucz `common.player.guestDefault` (część Fazy 1, krok 1) i kontrakt `fieldIssues` w `core/src/http` + `params.code` w `nicknameSchema` (część Fazy 5, krok 2). **Ekrany `play`, `lobby`, `games/[id]`, `account` i reszta `(frontend)` nadal mają polskie literały.** Po wdrożeniu tego planu (zachowanie przyszłe) wykonawca przechodzi fazy 1 → 7 po kolei (C1 → C2 → C3 → C4 → C5 → C6 → domknięcie), a Faza 8 (uruchomienie lokalne) robi na końcu; każda faza zostawia aplikację działającą i zieloną.

## Resolved assumptions (autonomous defaults)

| # | Pytanie | Przyjęte założenie | Dlaczego | |
|---|---|---|---|---|
| Q1 | Czy to nowy projekt, czy plan wznowienia? | **Plan wznowienia.** Nie kopiuje treści specyfikacji domknięcia; odsyła do jej kroków („Faza N krok M”) i dopisuje tylko stan, odchylenia i bramki | Duplikacja rozjechałaby dwa dokumenty; projekt jest zatwierdzony | odwracalne |
| Q2 | Czy fundament z `9f8bf78` jest przyjęty jako baza, czy przepisać od `main`? | **Przyjęty jako baza**, ale każdy jego element jest **weryfikowany testem przy pierwszym użyciu** (tabela „Stan wyjściowy”). Brak przepisywania, chyba że test wykaże defekt | Commit przeszedł własne testy; koszt ponownej pracy bez powodu jest zbędny | odwracalne |
| Q3 | Czy odchylenia od specyfikacji domknięcia znalezione w trakcie wolno naprawiać „po cichu”? | **Nie.** Odchylenie ≠ zmiana projektu: drobne (nazwa klucza, kolejność kroków wewnątrz fazy) idzie do logu `.ai/runs/2026-11-14-e15-continuation.md` z powodem; zmiana kontraktu lub zakresu paczki wymaga ⚠ potwierdzenia właściciela i aktualizacji specyfikacji domknięcia w tym samym PR | Specyfikacja domknięcia jest zatwierdzonym planem | ⚠ NEEDS HUMAN CONFIRMATION (tylko gdy pojawi się odchylenie kontraktowe) |
| Q4 | Jedna sesja wykonawcza na wszystkie fazy czy fazy osobno? | **Fazy w kolejności 1 → 7, każda kończy się zielonym `npm run lint && npm run typecheck && npm test` i punktem kontrolnym (lokalny WIP-commit; bez wypychania, PR i spłaszczania — te należą do konduktora).** Rozmiar (~70 plików) przekracza jedną sesję — wykonawca może zatrzymać się po dowolnej ukończonej fazie, zapisując stan w logu; kolejna sesja wznawia od następnej fazy. Podział na PR-y zostaje przy konduktorze (Q2 specyfikacji domknięcia: zalecenie PR na fazę) | Pamięć „fewer, bigger PRs”: jeden PR na funkcję = jedna paczka C | odwracalne |
| Q5 | Faza 8 wymaga Dockera i `.env.local`. Co, gdy sandbox odmawia? | Jak w Q9 specyfikacji domknięcia: **zatrzymać się i podać właścicielowi polecenia**; nie obchodzić blokady, nie dotykać `.env*` (pamięć: agenci headless nie mają dostępu do `.env*`). Fazy 1–7 nie zależą od fazy 8 | Zgodne z wcześniejszymi decyzjami właściciela | odwracalne |
| Q6 | Dwa znane niestabilne testy czasowe (`show-pages` 250 ms, `show-drive` „stalled”) | Bez zmian względem Q12 specyfikacji domknięcia: nie ruszać; zgłosić jako „znane niestabilne testy czasowe”, gdy padają tylko one | Zaakceptowane przez właściciela 2026-11-14 | odwracalne |
| Q7 | Recenzje natywne FR/DE, decyzja Q-26, e-maile/MCP | **Poza agentem**, bez zmian względem Q3–Q5 specyfikacji domknięcia (zadania E15-S10/S11 i notatka S09 w Fazie 7) | Statusu `reviewed` nie wolno fałszować (I17) | ⚠ NEEDS HUMAN CONFIRMATION |

## 📝 Problem Statement

Wznowienie pracy na `cez/51169d14` (baza: `9f8bf78`, który jest commitem roboczym „nie wypychać”) wymaga jednoznacznego rozróżnienia, co już jest zrobione, a co nie — inaczej kolejna sesja albo powtórzy zrobioną pracę (np. dopisze drugi `defaultNicknameSeat`), albo uzna Fazę 5 za gotową, bo „kontrakt jest”. Zmierzony stan (sprawdzony w kodzie, nie z opisu commitu):

## 📋 Stan wyjściowy (zweryfikowany w tym worktree)

| Element | Faza/krok | Stan | Co zostaje |
|---|---|---|---|
| `defaultNicknameSeat(name): Seat \| null` (`core/src/games/nickname.ts`) + test w `nickname.test.ts` | F1.1 | **Zrobione** | Użycie w UI: `invite-screen.tsx` (F1.4), `player-name.ts` (F2.3) |
| `common.player.guestDefault` — PL „Gracz {seat}”, EN, FR; DE „Spieler {seat}” w `de/common.ts` | F1.1 | **Zrobione** | Pozostałe klucze `player.*`/`bot.*` w F2.2 |
| `catalogs/index.test.ts`: asercja DE „= enCommon + guestDefault” | F1.1 | Tymczasowa (DE nadal `PartialTranslation`) | **F6.1 ją usuwa** — DE dołącza do pętli `complete: true`; nie utrwalać specjalnego przypadku |
| Przestrzenie `home`, `auth`, `game`, `chat`, `lobby`, `history`, `review`, `account`, `errors` | F1–F5 | **Brak** (`catalogs/{pl,en,fr,de}` mają tylko `common`, `header`, `show`) | Całość |
| `i18n/context.tsx` (`I18nProvider`, `useT`), `games/[gameId]/layout.tsx`, `lib/games/player-name.ts` | F2 | **Brak** | Całość |
| `FieldIssue`/`FieldIssues`, `ApiErrorBody.fieldIssues?`, `AppError`/podklasy z `fieldIssues` (`core/src/http/{api-result,errors}.ts`) | F5.2 | **Zrobione** (typy, konstruktory, serializacja w `toBody`) | Zweryfikować, że `server/http/api-handler.ts` faktycznie wysyła pole (test koperty — F5.2) |
| `toFieldIssues(zodError)` i użycie w `toValidationError` (`core/src/http/zod-error.ts`) + `zod-error.test.ts` | F5.2 | **Zrobione** (zamknięta lista kodów Zod, skalarne `params`) | Test całej tabeli kodów i wariantów `inclusive`/`exact` — sprawdzić pokrycie w istniejącym teście, dopisać brakujące |
| `params.code` w `nicknameSchema` (`NICKNAME_TOO_LONG` z `max`, `NICKNAME_INVALID`, `NICKNAME_RESERVED`) | F5.2 | **Zrobione** | Pozostałe reguły własne w `core/src/validators/**` i innych schematach z inwentarza |
| `error-inventory.ts` + `error-inventory.test.ts` | F5.1 | **Brak** | Całość |
| Serwisy: `fieldIssues` obok `fieldErrors` (`user-service`, `email-change-service`, `account-service`, `invitation-service`, `spectator-service`, `chat-service`) | F5.2 | **Brak** (żaden plik `server/**` nie zawiera `fieldIssues`) | Całość |
| `data.reason` dla kodów wielokomunikatowych (Q8) | F5.2 | **Brak** | Całość |
| `lib/api-error-text.ts`, przestrzeń `errors` | F5.3 | **Brak** | Całość |
| Wpis `BACKWARD_COMPATIBILITY.md` §2 dla `fieldIssues` | F5.2 | **Zrobione** (dopisany z kształtem kontraktu) | Dopisać tabelę kod → `reason` (F5.2) oraz wpisy `bot.tableMb`/`opponent.bot` (F2.3, F3.2) |
| Podniesione limity czasu w `core/src/bot/arena.test.ts` i `ui/src/game/paper-board.test.tsx` (30 s) | poza E15 | Zrobione (niezwiązane z logiką; dla wolnego sprzętu) | Nie cofać, nie rozszerzać |
| `ENFORCED_GROUPS` | F1–F4, F7 | Tylko S01/S02 (`no-ui-literals.test.ts:15-26`) | Globy per paczka, potem całość (F7.1) |

**Konsekwencja dla kolejności:** Faza 5 krok 2 jest częściowo wykonana, ale **Faza 5 jako całość nie ma żadnego scalonego kryterium** (brak inwentarza i testu kompletności). Zatwierdzona kolejność dopuszcza C5 przed C1–C4 (spec domknięcia, F5.4), lecz to zadanie nakazuje **kolejność 1 → 7**; zostaje więc ona, a luka „komunikaty pól z `core` po polsku do C5” (Edge Cases specyfikacji domknięcia) jest opisywana w PR C1 i C4 jak w oryginale.

## 📝 Proposed Solution

Wykonać specyfikację domknięcia bez zmian, w kolejności F1 → F7, F8 na końcu, z dodatkami wynikającymi ze stanu wyjściowego:

1. **F1 (C1)** zaczyna od kroku 1 w zredukowanej formie: przestrzenie `home` i `auth` (klucze baneru), rejestracja w `types.ts`/`index.ts`/`status.ts`; `guestDefault` i `defaultNicknameSeat` **już są** — krok kończy się dopisaniem testów parzystości nowych przestrzeni i sprawdzeniem, że istniejące testy `defaultNicknameSeat` pokrywają przypadki „Gracz 3”, „gracz 1”, „Gracz 1 ” (dopisać, jeśli brak). Kroki 2–5 bez zmian.
2. **F2–F4** bez zmian względem specyfikacji domknięcia.
3. **F5**: krok 1 (inwentarz jako kod) wykonać **pierwszy**, bo jego test wskaże, które reguły własne, serwisy i kody wielokomunikatowe nie zostały jeszcze dotknięte; krok 2 jest „dokończeniem” (nie powtórką) — start od uruchomienia `error-inventory.test.ts` i przejścia po jego czerwonych wpisach. Kroki 3–5 bez zmian.
4. **F6.1** usuwa tymczasową asercję DE z `catalogs/index.test.ts` (tabela wyżej).
5. **F7–F8** bez zmian; log przebiegu: `.ai/runs/2026-11-14-e15-continuation.md` (zamiast nazwy z Fazy 8 specyfikacji domknięcia, bo to przebieg kontynuacji; odchylenie nazwy własnej logu — drobne, Q3).

Odrzucone: przepisanie fundamentu od `main` (marnotrawstwo, Q2); zamknięcie F5 bez inwentarza „bo kontrakt jest” (to by pominęło kryterium kompletności błędów pól — 0 wyjątków na formularzach gracza).

## 📝 Architecture

Bez zmian względem „Architecture” specyfikacji domknięcia. Jedyne ustalenia wynikające ze stanu: (a) typy `FieldIssue`/`FieldIssues` żyją w `core/src/http/api-result.ts` i są jedynym źródłem kształtu — UI i `api-error-text.ts` importują je stamtąd, nie redefiniują; (b) `toFieldIssues` jest czystą funkcją w `core` (spec domknięcia: używaną także przez klienta przy walidacji lokalnej, F5.4); (c) kierunek zależności `core` ↛ `react`/`next`, `ui` bez słownika — bez zmian.

## 📝 Data Model

Bez zmian (brak migracji, brak nowych tabel). Nowe pola dotyczą wyłącznie kopert API i są addytywne (zob. niżej).

## 📝 API Contracts

Bez zmian względem specyfikacji domknięcia; poniżej tylko to, co ten plan przesuwa:

- `ApiErrorBody.fieldIssues?` — **typy i serializacja w `AppError` istnieją**; do zrobienia: wysyłka w trasach (`server/http/api-handler.ts` — sprawdzić, czy przechodzi przez `toBody`; jeśli buduje kopertę ręcznie, dopisać pole), `fieldIssues` w serwisach (F5.2), tabela kod → `reason` w `BACKWARD_COMPATIBILITY.md` §2.
- `bot.tableMb`, `HistoryEntry.opponent.bot?`, `GameReview.players[].bot?` — F2.3/F3.2, z wpisem §2 w tych samych PR-ach; `memoryMb` zostaje.
- Brak nowych publicznych kontraktów poza już zatwierdzonymi.

## 📝 UI/UX

Bez zmian względem specyfikacji domknięcia (wygląd bez zmian poza językiem; 320 px × PL/EN/FR/DE × dwa motywy; bez nowych komponentów DS). Nie ma zaakceptowanego prototypu graficznego — linii `Prototype:` brak.

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Zachowanie |
|---|---|
| Kolejna sesja nie widzi, co zrobiono | Źródłem jest tabela „Stan wyjściowy” + log `.ai/runs/2026-11-14-e15-continuation.md` (aktualizowany po każdej fazie: faza, kroki, wynik bramki, odchylenia) |
| Test fundamentu (np. `zod-error.test.ts`) czerwony po rebase/merge | Naprawić fundament (nie obchodzić); odchylenie kontraktowe → Q3 |
| `api-handler` nie przekazuje `fieldIssues` | Dopisać w F5.2 z testem koperty (polskie `fieldErrors` bez zmian) |
| Faza przerwana w połowie (limit sesji) | WIP-commit lokalny na zielonym stanie z ostatniego kroku; log wskazuje następny krok; nic nie jest wypychane |
| `?lang=de` w trakcie F1–F5 | Szkic DE z zapasem EN (jak dziś); przełącznik bez DE |
| Docker/`.env.local` niedostępne w F8 | Q5 |
| Padają tylko dwa znane testy czasowe | Q6 |

Pozostałe przypadki brzegowe (kody błędów bez wpisu, gość „Gracz 1”, `error.tsx` nad `page.tsx`, `too_small` z `inclusive`) — jak w specyfikacji domknięcia.

## 📝 Risks & Impact Review

- **Największe ryzyko: rozmiar i brak kryterium przerwania.** ~70 plików i 8 faz w jednym przebiegu przekracza zwykłą sesję; stąd Q4 (zatrzymanie po ukończonej fazie z logiem). Niedokończona faza nie jest zostawiana w stanie czerwonym.
- **Kontrakty:** wyłącznie addytywne; najtrudniejszy do odwrócenia jest kształt `fieldIssues` — **już wprowadzony** w `9f8bf78` i wpisany do `BACKWARD_COMPATIBILITY.md`; zmiana jego kształtu po publikacji = zmiana kontraktu (⚠ właściciel).
- **Commit roboczy „nie wypychać”:** historia zawiera WIP z oznaczeniem; wykonawca tworzy tylko lokalne WIP-commity punktów kontrolnych (zgodnie z Q4), nigdy nie wypycha zmian, nie otwiera PR i nie spłaszcza historii; spłaszczenie przed PR należy do konduktora, poza tą fazą.
- **Jakość tłumaczeń:** szkic LLM (`draft`); brak deklaracji jakości bez recenzji natywnej (I17).
- **Decyzje kierunkowe vs. defekty:** kierunkowe to wyłącznie Q3/Q4/Q5 specyfikacji domknięcia (⚠); pozostałe wynika ze stanu kodu.

## 📝 Decisions in play

D-38, A-25, BR-20, B6/B7, Q-26 (`product-brief.md`) — jak w specyfikacji domknięcia; niczego nie zastępuje. Q-26 zostaje `open` do przyjęcia rekomendacji S09 (właściciel: Bartosz Wójcik).

## 📋 Phasing

Kolejność narzucona zadaniem: **F1 → F2 → F3 → F4 → F5 → F6 → F7, na końcu F8.** Zależności bez zmian (F7.1 wymaga scalenia F1–F5; F5.4 migruje błędy tylko w ekranach już ukończonych (lokalnie) — przy kolejności 1 → 7 oznacza to, że **w F5 wszystkie ekrany C1–C4 przechodzą na `api-error-text` i `fieldIssues`**, co zamyka lukę z Edge Cases specyfikacji domknięcia).

## 📋 Implementation Plan

Treść kroków: `.ai/specs/2026-11-13-e15-completion.md`, sekcja „Implementation Plan”, Fazy 1–8. Tu tylko bramki i dodatki. **Bramka każdej fazy:** `npm run lint && npm run typecheck && npm test` zielone, — `npm test` to `vitest run --coverage`, a `vitest.config.ts` wymusza `thresholds: { 100: true, perFile: true }` (100 % linii/gałęzi/funkcji/instrukcji na każdy plik z `packages/*/src/**`; wyłączenia tylko te z `coverage.exclude`: testy, `*.d.ts`, migracje, komponenty shadcn). Nowy plik bez testu lub rozszerzenie `exclude` dla kodu własnego = bramka czerwona (nie ma osobnej komendy pokrycia), `npm run build`, scenariusz integracyjny `?lang=fr` (jeśli Docker; inaczej napisać wprost), wpis w logu, brak nowych wpisów w `i18n-allowlist.ts`.

### Krok 0 — wznowienie (przed Fazą 1)

1. Przeczytać specyfikację domknięcia, `.ai/lessons.md`, `packages/ui/docs/design-system.md`, `i18n/server.ts`, `lib/show/texts.ts`. Uruchomić `npm test` na bazie `9f8bf78` i odnotować wynik wyjściowy (w tym ewentualne znane testy czasowe, Q6) w logu — to punkt odniesienia dla regresji. Utworzyć `.ai/runs/2026-11-14-e15-continuation.md`.
2. Test: `git grep -n "defaultNicknameSeat\|fieldIssues" -- packages` pokrywa się z tabelą „Stan wyjściowy”; rozbieżność = poprawić tabelę (nie kod), dopisać wpis o rozbieżności w logu `.ai/runs/2026-11-14-e15-continuation.md` i sprawdzić, czy dotyczy kontraktu (`BACKWARD_COMPATIBILITY.md`, kształt `fieldIssues`) — jeśli tak, zatrzymać się i zgłosić jako Q3 (⚠ właściciel).

### Faza 1 — C1 (S03)

1. Specyfikacja domknięcia F1.1 w wersji zredukowanej (zob. „Proposed Solution” pkt 1): przestrzenie `home`/`auth`, brakujące przypadki testu `defaultNicknameSeat`.
2. F1.2 → F1.5 bez zmian (strona główna, `play/`, `join/`, `invite/[code]/`, `ENFORCED_GROUPS` C1, `tests/integration/i18n-entry.test.ts`, 320 px, Size Limit).

### Faza 2 — C2 (S04)

F2.1 → F2.6 bez zmian (`I18nProvider`, `player-name.ts`, `tableMb`, czat, `games/[gameId]/layout.tsx`, `error.tsx`, dokumentacja `docs/architektura.md` w tym PR).

### Faza 3 — C3 (S05)

F3.1 → F3.4 bez zmian (`opponent.bot?`, `GameReview.players[].bot?`, lobby, historia, przegląd).

### Faza 4 — C4 (S06)

F4.1 → F4.3 bez zmian (logowanie, rejestracja, konto, `components/forms|feedback`). Znana luka komunikatów pól z `core` zamykana w F5.

### Faza 5 — C5 (S07)

1. F5.1 — `error-inventory.ts` + `error-inventory.test.ts` **jako pierwszy krok**; wynik testu = lista pracy dla kroku 2.
2. F5.2 jako **dokończenie**: reguły własne we wszystkich schematach z `SCHEMA_SOURCES` (nickname już jest), `fieldIssues` w serwisach, `data.reason` dla kodów z `MULTI_MESSAGE_CODES` (nigdy dla `VALIDATION`), sprawdzenie wysyłki w `api-handler`, testy tabeli kodów Zod, MCP bez zmian, wpisy §2.
3. F5.3 → F5.5 bez zmian; **warunek wstępny F5.4/F5.5: F1–F4 ukończone na tej gałęzi (każda z zieloną bramką i wpisem w logu; „scalone” w specyfikacji domknięcia znaczy tu „ukończone i zacommitowane lokalnie”, bo ta faza nie scala PR). Jeśli któraś z F1–F4 jest niedokończona, F5.4 i F5.5 nie startują (F5.1–F5.3 mogą), a log wskazuje brakującą fazę. Przy spełnionym warunku F5.4 obejmuje wszystkie ekrany tych paczek** (10 miejsc `safeParse`), a kryterium kompletności F5.5 jest wymagane dla wszystkich z nich (nie „oczekujące”).

### Faza 6 — C6 (S08, część kodowa)

F6.1 (włącznie z usunięciem tymczasowej asercji DE z `catalogs/index.test.ts`), F6.2 (bramka przełącznika), F6.3 (eksport CSV) bez zmian.

### Faza 7 — domknięcie egzekwowania i S09

F7.1 (globy całości `(frontend)` + test pokrycia plików), F7.2 (notatka decyzyjna S09, zadania E15-S10/S11, adnotacje „stan wdrożenia”) bez zmian.

### Faza 8 — uruchomienie lokalne (na końcu)

Lista kontrolna z F8 specyfikacji domknięcia (`docker info` → `npm run setup` → `npm run check` → `npm run dev`, sprawdzenie `/api/health`, `/`, `/play`, `/lobby` w `?lang=pl|en|fr|de`, partia z botem po francusku, gość bez pseudonimu po angielsku, przełącznik bez DE). Przy odmowie sandboksa — Q5. Raport: adres, wyniki, czego nie zweryfikowano.

## 📝 Review limits

Stan wyjściowy sprawdzono narzędziami plikowymi i `git`: `git show HEAD`, odczyt `nickname.ts`, `zod-error.ts`/`errors.ts`/`api-result.ts` (eksporty i diff), `catalogs/*`, `no-ui-literals.test.ts`, `grep` `fieldIssues`/`defaultNicknameSeat`. **Nie uruchomiono** testów, `typecheck` ani `build` (faza specyfikacji, bez zmian w kodzie) — „Zrobione” w tabeli znaczy „kod obecny i zgodny ze specyfikacją domknięcia w diffie”, nie „zielone”; pierwszy krok 0 to potwierdza. Nie sprawdzono: czy `server/http/api-handler.ts` serializuje przez `toBody` (zob. Edge Cases), kompletności istniejącego `zod-error.test.ts` względem pełnej tabeli kodów, ani rzeczywistej liczby plików z literałami (~70 wg specyfikacji domknięcia). Specyfikacja nie przeszła recenzji spójności zakresu w świeżym kontekście (jednozadaniowa sesja, projekt zatwierdzony wcześniej); ryzyko spójności ogranicza to, że niczego nie przepisuje.
