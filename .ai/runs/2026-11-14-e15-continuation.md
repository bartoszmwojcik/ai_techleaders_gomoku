# 2026-11-14 — E15: kontynuacja domknięcia epiku (fazy 1 → 8)

- **Cel:** wykonanie `.ai/specs/2026-11-13-e15-completion.md` według planu wznowienia `.ai/specs/2026-11-14-e15-continuation.md`, od Fazy 1 (C1) po kolei.
- **Tryb:** autonomiczny (cezar, faza `implement`, bez nadzoru), gałąź `cez/51169d14`, baza `9f8bf78` (WIP „nie wypychać”).
- **Granice tego przebiegu (nadrzędne nad Q4 planu):** zadanie zabrania tworzenia commitów — punkty kontrolne „lokalny WIP-commit” z Q4 **nie** są tworzone; cała praca zostaje jako niezacommitowana zmiana w worktree. Bez push/PR.

## Krok 0 — wznowienie

1. Wynik wyjściowy `npm test` (`vitest run --coverage`) na `9f8bf78`: **385 plików, 4173 testy — wszystkie zielone**; jedyne błędy progu pokrycia dotyczyły dwóch plików tego przebiegu, dodanych w trakcie biegu (`i18n/client.ts`, `catalogs/pl/home.ts`). Znane testy czasowe (Q6) nie należą do `npm test` (to integracja).
2. `git grep -n "defaultNicknameSeat\|fieldIssues" -- packages` — zgodne z tabelą „Stan wyjściowy” (core: `nickname.ts`, `http/{api-result,errors,zod-error}.ts` + testy; brak w `server/**`). Rozbieżności brak; test `defaultNicknameSeat` już obejmuje „Gracz 3”, „gracz 1”, „Gracz 1 ”.
3. **Docker:** `docker info` działa, ale `docker ps` → `permission denied … docker.sock` (sandbox). Testy integracyjne i Faza 8 **nie mogą** być uruchomione w tym przebiegu.

## Faza 1 — C1: wejście do gry (E15-S03) — ukończona

- **Przestrzenie** `home` (strona główna, `/play`, `/join`, `/invite/[code]`, wybór przeciwnika i ustawień) i `auth` (baner weryfikacji e-mail + odpowiedzi „wyślij ponownie”), PL/EN/FR kompletne, DE pełny szkic (typ nadal `PartialTranslation` do C6), `draft` w `status.ts`, rejestracja w `types.ts`/`index.ts`, eksport CSV (`cli/i18n-export-cli.ts`).
- **Nowe pomocnicze moduły:** `i18n/client.ts` (`textsOf(plFallback, { locale, dict })`, `TextsProps<N>`, `TranslatorOf<N>` — translator komponentu klienckiego z zapasem PL podanym statycznie przez wywołującego) i `i18n/rich.tsx` (`withNodes` — zdanie z linkiem w miejscu `{link}`, kolejność zależna od języka).
- **Ekrany:** `(frontend)/page.tsx`, `play/{page,guest-create-form}`, `join/{page,join-form}`, `invite/[code]/{page,invite-screen,join-actions,watch-actions}`, `components/games/{home-rules,create-game-button,opponent-picker,game-settings-picker}`, `components/auth/{verify-email-banner,resend-verification}`; `lib/games/{opponent,settings}` — funkcje z translatorem jako ostatnim parametrem z domyślnym PL (niezmigrowane wywołania lobby/historii dają dalej polski tekst); stałe `OPPONENT_OPTIONS`, `VARIANT_OPTIONS`, `VARIANT_NAME`… zostają (pochodne PL). `play` i `invite` → `generateMetadata`.
- **Q11:** `invite-screen.tsx` tłumaczy nazwę twórcy-gościa przez `defaultNicknameSeat` → `common.player.guestDefault` (brak nazwy = miejsce 1); konto „Gracz 1” bez zamiany (test).
- **`ENFORCED_GROUPS`** += globy C1 (`page.tsx`, `play/*`, `join/*`, `invite/**`, pięć komponentów `components/games`, dwa `components/auth`, `lib/games/{opponent,settings}.ts`); `i18n-allowlist.ts` bez wpisów.
- **Testy:** istniejące polskie asercje bez zmian (mechanicznie: `await` stron, które stały się `async`, `metadata` → `await generateMetadata()`, mock `next/headers`); nowe warianty `fr` w każdym pliku; `i18n/{client,rich}.test`, `resend-verification.test.tsx`. Integracja `tests/integration/i18n-entry.test.ts` napisana (strona główna, baner niezweryfikowanego konta, `/play`, `/join`, zaproszenie gościa bez pseudonimu „Joueur 1 (invité)…”, HTML PL bez katalogu FR) — **nieuruchomiona** (Docker niedostępny).
- **Bramka:** `npm run lint` (0 błędów), `npm run typecheck` (zielony), `npm test` — **388 plików, 4228 testów, próg 100 % na plik zielony**. `npm run build`, 320 px × 4 języki i Size Limit — nieuruchomione w tej fazie (patrz niżej).

### Odchylenia (drobne, Q3 planu)

- `components/games/{public-flag,public-game-qr}` przypisane w F1.2 do C1, ale renderuje je wyłącznie pokój gry (`play-field.tsx`, `spectator-room.tsx`) — zgodnie z zasadą Q7 („po ekranie, który renderuje”) przeniesione do C2.
- `components/games/dismissible-notice.tsx` nie ma własnych tekstów (wszystko przez propsy) — tylko objęty globem.
- Baner weryfikacji na `/account` dostanie `dict` w C4 razem z resztą strony konta (dziś cała strona jest polska; francuski baner nad polską stroną nie poprawia spójności).
- Teksty błędów `components/feedback/rate-limited-error.ts` (szczegół „spróbuj za N min” po limicie tworzenia) zostają polskie do C4 (zatwierdzone przypisanie `feedback/*` → C4).
- Komunikaty pól ze schematów `core` (`nicknameSchema` w kliencie i na serwerze) są polskie do C5 — znana luka z Edge Cases specyfikacji domknięcia.
- **Build (F1):** `npm run build` zielony.

## Faza 2 — C2: pokój gry i czat (E15-S04) — ukończona

- **Kontekst:** `i18n/context.tsx` — `I18nProvider` (łączy przestrzenie z rodzicem: `{ ...parent, ...own }`, wewnętrzny wygrywa, bez importu katalogów) i `useT(ns, plFallback)`; `i18n/server.ts` — `providerI18n(...)` (dla PL `{}`, więc ładunek RSC polskiej strony bez katalogu) i pole `namespace` w `I18n`. Testy: bez providera = PL, provider bez przestrzeni = PL, zagnieżdżenie, provider pusty pod francuskim.
- **Segment `games/[gameId]`:** nowy serwerowy `layout.tsx` (`common` dla granicy `error.tsx`, renderowanej nad stroną), `page.tsx` (`generateMetadata`, provider z `game` + `chat`, `home` dla przycisku „Utwórz zaproszenie” po anulowanym zaproszeniu), `error.tsx` na `useT("common")` (`common.connectionError.*`), `not-found.tsx` serwerowy przez `getI18n("game")`.
- **Przestrzenie** `game`, `chat` (PL/EN/FR kompletne; DE: `chat` pełny szkic, `game` częściowy — zapas EN do C6) i klucze `common.player.*`, `common.bot.*`, `common.connectionError.*` (PL/EN/FR; DE `common` bez zmian, bo tymczasowa asercja `index.test.ts` znika dopiero w F6.1).
- **Kontrakt (§2):** `GameView.players[].bot.tableMb` addytywnie (`botViewOf` w `core/bot/profile.ts`, `memoryMb` bez zmian), wpis w `BACKWARD_COMPATIBILITY.md`; MCP pola nie serializuje.
- **Helpery:** `lib/games/player-name.ts` (`playerNameOf`/`playerName`/`agentNameOf`/`botNameOf` z translatorem `common`; bot z `level`/`tableMb`, gość „Gracz N” → `player.guestDefault` tylko dla miejsca gościa, konto/bot/agent „Gracz 1” bez zamiany; widok bez `tableMb` → `displayName`), `play.ts` (`sideWords`, `cellLabelOf`, `cellName`, `opponentMoveText`, `outcomeOf` z translatorem `game`, domyślnie PL; `DECLARED_LABEL`/`AGENT_LABEL` usunięte, `BOT_LABEL` zostaje dla `history.ts` do C3), `paper.ts` (`paperLabelsOf`, `refusalText`), `agent-clients.ts` (`agentClientCopyOf`), `lib/format-date-time.ts` (`locale` z domyślnym `pl`; `game-room` przekazuje język).
- **Czat:** `use-chat` zwraca `code` (odmowa) i `reason` (`data.reason` błędu pola); `chat-composer` tłumaczy odmowę lokalną i `field` po `chat.rejection.{reason}`, `refused` po `chat.refused.{code}`, zapas — zdanie serwera; liczniki i „nowe wiadomości” z liczbą mnogą katalogu. Nieużywane już `pluralChars`/`pluralNew` usunięte z `lib/chat/chat.ts`; ich tabele testów przeniesione na formy katalogu PL (te same liczby i słowa).
- **Komponenty:** `play-field`, `rematch-panel`, `bot-replay`, `close-audience`, `chat-panel`, `chat-message-list`, `spectator-chat`, `game-room`, `spectator-room` — `useT`; liście (`player-label`, `public-flag`, `public-game-qr`, `game-gate`, `audience-closed`) — opcjonalny prop `t` z domyślnym PL (działają też w drzewie serwerowym).
- **`ENFORCED_GROUPS`** += C2 (`app/(frontend)/games/*/*.tsx`, dziesięć komponentów `components/games`, `components/chat/*`, `lib/games/{play,player-name,rematch,spectate,agent-clients,paper}.ts`, `lib/chat/chat.ts`, `lib/format-date-time.ts`).
- **Testy:** polskie asercje bez zmian (mechaniczne: `await` stron async, mock `next/headers`, fixtury bota z nowym polem `tableMb`, oczekiwany wynik `send` z addytywnym `code`); nowe: `i18n/context.test.tsx`, `layout.test.tsx`, `lib/games/player-name.test.ts`, `components/games/room-texts.test.tsx`, `components/chat/chat-texts.test.tsx`, warianty FR w `page`/`error`/`states`/`format-date-time`/`use-chat`. Integracja `tests/integration/i18n-room.test.ts` (dwóch gości bez pseudonimów „Joueur 2 (invité)”, 404 po francusku, polski HTML bez katalogu FR) — **nieuruchomiona** (Docker).
- **Bramka:** `lint` 0 błędów, `typecheck` zielony, `npm test` — 393 pliki, 4295 testów zielone; jedyna luka pokrycia (`use-chat.ts`, gałąź `reason`) uzupełniona testem i sprawdzona osobno (100 %).

### Odchylenia (drobne)

- Wynik partii widziany przez widza (`neutralOutcomeOf` z `lib/games/review.ts`) zostaje polski do C3 (moduł przypisany do C3).
- Sufiks `rate-limited-error` w `bot-replay` — polski do C4 (jak w C1).
- `I18nProvider` używany tylko w pokoju gry; liście dostają translator propsem (zamiast hooka), żeby `GameGate`/`AudienceClosedScreen` działały też z komponentów serwerowych (`not-found.tsx`, `page.tsx`).
- **Build (F2):** `npm run build` zielony.

## Faza 3 — C3: lobby, historia, przegląd (E15-S05) — ukończona

- **Kontrakt (§2):** `HistoryEntry.opponent.bot?` (`game-history-service.ts:toEntry`) i `GameReview.players[].bot?` (`game-review-service.ts`) — `BotView` `{ level, memoryMb, tableMb }` tylko dla bota; `name`/`displayName` bez zmian. Testy kontraktu rozszerzone o nowe pole (dawne wartości bez zmian, brak `bot` u człowieka), wpis w `BACKWARD_COMPATIBILITY.md`.
- **Przestrzenie** `lobby`, `history`, `review` (PL/EN/FR kompletne, DE częściowe — zapas EN do C6) i `game.outcome.neutral.*` (wynik dla widza i czytelnika z kodem).
- **Helpery:** `lib/games/lobby.ts` (`sinceLabel(ms, t)`), `history.ts` (`resultLabel`, `reasonLabel`, `opponentNameOf` przez wspólny `playerNameOf` — bot z `opponent.bot`, gość „Gracz N” tłumaczony; `historyDetailOf(entry, t, home)`; stałe `RESULT_LABEL`/`REASON_LABEL` jako PL), `review.ts` (`stepStatus`, `reviewOutcomeOf`, `neutralOutcomeOf` z translatorami). Usunięte `BOT_LABEL` (`play.ts`) i `DELETED_PLAYER_LABEL` (`history.ts`) — zastępuje je `player-name.ts`.
- **Ekrany:** `lobby/{page,lobby-panel}` (`generateMetadata`; panel dostaje `lobby` i `home` propsami), `history/{page,history-view,loading}` (`generateMetadata`; `loading.tsx` serwerowy przez `getI18n`; widok dostaje `history`, `common`, `home`; daty przez `formatFinishedAt(…, locale)`), `games/[gameId]/review/{page,review-view,not-found}` (`generateMetadata`; `I18nProvider` z `review`/`game`/`history` pod providerem segmentu z `common`). Wynik partii u widza (`spectator-room`) po francusku (zaległość z C2 domknięta).
- **Polski bez zmian:** licznik „Dodano N starszych partii.” zostaje w tej samej formie dla każdej liczby (asercja istniejącego testu i integracji), mimo kategorii liczby mnogiej w katalogu.
- **`ENFORCED_GROUPS`** += `app/(frontend)/{lobby,history}/*.tsx`, `app/(frontend)/games/*/review/*.tsx`, `lib/games/{lobby,history,review}.ts`.
- **Testy:** mechaniczne zmiany stron (`generateMetadata`, mock `next/headers`, `await` serwerowego `loading`/`not-found`); nowe `app/(frontend)/c3-texts.test.tsx` (helpery i trzy ekrany po francusku), przypadek bota poziomu 1 bez pamięci w przeglądzie. Integracja `tests/integration/i18n-lists.test.ts` (lobby EN, pusta historia i 404 przeglądu FR) — **nieuruchomiona** (Docker).
- **Bramka:** `lint` 0 błędów, `typecheck` zielony, `npm test` — 394 pliki, 4330 testów zielone; luka pokrycia `game-review-service.ts` (`?? null`) uzupełniona testem i sprawdzona (100 %).
- **Build (F3):** `npm run build` zielony.

## Faza 4 — C4: konto i logowanie (E15-S06) — ukończona

- **Przestrzenie:** `auth` rozszerzona (`fields`, `shared`, `login`, `register`, `forgot`, `reset`, `verify`, `emailChange`), nowa `account` (strona konta i cztery formularze), `common.rateLimited` (wspólny komunikat limitu). PL/EN/FR kompletne; DE częściowe (zapas EN do C6).
- **`components/feedback/rate-limited-error.ts`:** translator `common` jako drugi parametr (domyślnie PL); trzy lokalne kopie tej funkcji w formularzach (`login`, `register`, `change-password`) i odmiany w `change-display-name`/`change-email`/`delete-account` zastąpione wspólną. `bot-replay` przekazuje już `common`.
- **Ekrany:** `login`, `register`, `forgot-password`, `reset-password`, `verify-email`, `confirm-email-change` (strony serwerowe przez `getI18n("auth")`, formularze klienckie z `auth` + `common` propsami; zdania z linkiem przez `withNodes`), `account/page.tsx` (+ `dict` dla `LogoutButton` — dług z S01 — i `auth` dla baneru weryfikacji), `account/{change-display-name,change-email,change-password,delete-account}-form.tsx` (data blokady zmiany nazwy przez `formatValidUntil(…, locale)`).
- **`ENFORCED_GROUPS`** += `app/(frontend)/{login,register,forgot-password,reset-password,verify-email,confirm-email-change,account}/*.tsx`, `components/forms/*.tsx`, `components/feedback/*.{ts,tsx}`; `i18n-allowlist.ts` dalej pusty.
- **Znana luka (Edge Cases specyfikacji domknięcia):** komunikaty pól ze schematów `core` (walidacja lokalna `safeParse` i `fieldErrors` z serwera) są polskie do C5 (krok 4 przenosi wszystkie 10 miejsc na `fieldIssues` + `api-error-text`).
- **Testy:** mechaniczne (mock `next/headers` w testach stron); nowe `app/(frontend)/c4-texts.test.tsx` (wszystkie formularze po francusku, odmowy po `code`, limit). Integracja `tests/integration/i18n-account.test.ts` — **nieuruchomiona** (Docker).
- **Bramka:** `lint` 0 błędów (poprawka: `Date.now()` w `change-display-name-form.tsx` przeniesione do helpera modułu — reguła kompilatora Reacta), `typecheck` zielony, `npm test` — **395 plików, 4364 testy, próg 100 % na plik zielony**, `npm run build` zielony.

## Faza 5 — C5: błędy API i walidatory (E15-S07) — ukończona (runda poprawek 4)

- **Inwentarz jako kod (F5.1):** `packages/app/src/i18n/error-inventory.ts` — `SCHEMA_SOURCES` (25 schematów ze ścieżki gracza: trasy `app/api` poza MCP oraz `(frontend)`/`components`; na schemat próbki niepoprawnych danych, reguły i wyjątki parametrów, których gracz nie wpisuje, z powodem), `CLIENT_PARSE_SITES` (10 lokalnych `safeParse`) + `ROUTE_PARSE_SITES` (2 identyfikatory w adresie), `SERVICE_FIELD_ERRORS` (13 rzutów), `MULTI_MESSAGE_CODES` (10 kodów), `NOT_FOR_USER_CODES` (API agenta, CLI). `error-inventory.test.ts` sam przeszukuje źródła (importy schematów, `.refine`/`addIssue` bez `code`, `safeParse`, `fieldErrors` w serwisach, każdy `new …Error(` w `server/**` i `core/src` z rozwiązaniem stałej komunikatu) i porównuje z listami; sprawdzony mutacją (usunięcie `reason` → test czerwony).
- **Kontrakt (F5.2):** `params.code` we wszystkich regułach własnych (`PASSWORD_TOO_SHORT`/`PASSWORD_TOO_LONG`, `PASSWORD_UNCHANGED`, `DISPLAY_NAME_RESERVED`, `NICKNAME_GUEST_ONLY`, `GUEST_WARNING_REQUIRED`, `TIME_CONTROL_CLASSIC`, `BOT_*`, `HISTORY_CURSOR_INVALID`); `fieldIssues` obok niezmienionych `fieldErrors` w `user-service`, `email-change-service`, `account-service`, `admin-account-service`, `invitation-service`, `spectator-service`, `chat-service` (`CHAT_REJECTED` z `params.reason`); `data.reason` dla `CONFLICT`, `FORBIDDEN`, `GAME_NOT_ACTIVE`, `ILLEGAL_MOVE`, `INVALID_INPUT`, `NOT_YOUR_TURN`, `OWN_WAITING_GAME`, `RATE_LIMITED`, `REMATCH_UNAVAILABLE`, `UNAUTHORIZED` (`VALIDATION` bez nowych — tylko istniejące czatu). Komunikat dzielony wyrażeniem warunkowym rozbity na osobne `new` (`paper-move-service`, `agent-game-service`, `rematch-service`), żeby każdy komunikat miał swój `reason`. `api-handler` wysyła `fieldIssues` przez `toBody` (było). MCP bez zmian (test: `INVALID_INPUT` z tym samym `message`, bez `fieldIssues` i nowego `reason`). Tabela kod → `reason` w `BACKWARD_COMPATIBILITY.md` §2.
- **Teksty (F5.3):** przestrzeń `errors` (PL/EN/FR/DE): `zod.{code}[.{origin}[.{wariant}]]`, `field.{pole}.{kod}`, `api.{kod}[.{reason}]`; `lib/api-error-text.ts` (`fieldIssueText`, `fieldMessages`, `localFieldMessages`, `localValueMessage`, `apiErrorText`). Skaner kodów: każdy rzucany kod ma `errors.api.{code}` w PL/EN/FR (poza `NOT_FOR_USER_CODES`), każda wartość `reason` — swój wpis.
- **Migracja (F5.4):** 10 formularzy (`login`, `register`, `forgot-password`, `reset-password`, trzy formularze konta, `play/guest-create-form`, `invite/[code]/{join,watch}-actions`) oraz `delete-account-form` biorą tekst pól z `fieldIssues` (lokalnie i z serwera), polskie `fieldErrors` jako zapas; strony przekazują `errorTexts` (`clientI18n(await getI18n("errors"))`, dla PL nic).
- **Kryterium kompletności (F5.5):** `error-inventory.test.ts` — każda reguła z próbek ma kod (nigdy goły `custom`/`unknown` na polu gracza) i tekst PL/EN/FR; **polski tekst każdej reguły jest identyczny z komunikatem schematu** (polskie ekrany bez zmian; wyjątek: domyślne angielskie komunikaty Zod dla pól logicznych, które nie miały polskiej treści); `c5-texts.test.tsx` renderuje każde miejsce z `CLIENT_PARSE_SITES` po francusku z niepoprawnym polem (lista z inwentarza), odmowy serwera po kodzie i zapas polski dla serwera bez kodów. Wyjątków na formularzach gracza: 0.
- **Integracja:** `tests/integration/i18n-errors.test.ts` (koperta rejestracji: `fieldErrors` PL + `fieldIssues`; za długi pseudonim gościa; `FORBIDDEN` z `data.reason`) — **nieuruchomiona** (Docker).

### Odchylenia (drobne, Q3)

- Poziom kluczy pola: zamiast `errors.fields.{formularz}.{pole}.{kod}` teksty są wspólne dla pola (`errors.field.{pole}.{kod}`), bo te same pola mają te same teksty we wszystkich formularzach; poziom formularza zostaje w kolejności wyszukiwania (`fields.{form}…`) na wypadek różnic. W grupie klucz `_` to jej własny tekst (`zod.too_small._`, `api.UNAUTHORIZED._`).
- Teksty `field.*` w PL to dokładnie komunikaty schematów (z `{count}`), bez form liczby mnogiej — pierwsza wersja z liczbą mnogą zmieniała polskie zdania („24 znaki” zamiast dotychczasowego „24 znaków”), co łamało zasadę „polskie testy bez zmian”.
- Odmowa czatu (`CHAT_REJECTED`) ma tekst w `chat.rejection.{reason}` (C2), nie w `errors` (`FIELD_CODES_TRANSLATED_ELSEWHERE`).
- Domknięcie schematów przez importy w `core` zastąpione próbkami schematu nadrzędnego (reguły `emailSchema`, `newPasswordSchema`, `nicknameSchema` wychodzą w próbkach schematów, które je osadzają) plus skanem `.refine`/`addIssue` w całym `core/src/validators`, `games/nickname.ts`, `games/history.ts`.

## Faza 6 — C6: niemiecki jako pełny szkic (E15-S08) — ukończona

- Wszystkie `de/*.ts` (12 przestrzeni z `errors`) mają 100 % kluczy, typ `Translation`, status `draft`; forma „du” jak w istniejących szkicach. `catalogs.test.ts`: DE w pętli `complete: true`; `index.test.ts`: tymczasowa asercja DE usunięta, test zapasu i ostrzeżeń przepięty na podstawiony katalog z lukami.
- Bramka przełącznika: `catalogs/status.test.ts` — język spoza `pl`/`en`/`fr` w `SWITCHER_LOCALES` tylko przy `reviewed` wszystkich przestrzeni (DE dziś poza przełącznikiem), `pl`/`en`/`fr` niezależnie od statusów (stała z odwołaniem do zatwierdzonej specyfikacji), `?lang=de` bez zapasu EN dla każdej przestrzeni.
- Eksport CSV: `.ai/qa/2026-11-13-i18n-all.csv` (1041 tekstów, wszystkie przestrzenie, PL/EN/FR/DE) — uruchomiony `node --import tsx src/cli/i18n-export-cli.ts --out …` (`tsx` jako CLI nie może otworzyć potoku IPC w sandboksie).

## Faza 7 — domknięcie egzekwowania i S09 — ukończona

- `ENFORCED_GROUPS` = `app/(frontend)/**/*.{ts,tsx}`, `components/**/*.{ts,tsx}`, `lib/**/*.{ts,tsx}`; nowy test: każdy plik `.ts`/`.tsx` (poza testami i `*.stories.*`) tych katalogów jest skanowany; `i18n-allowlist.ts` dalej pusty; skan zielony bez zmian w kodzie ekranów.
- Notatka S09: `.ai/specs/research/decisions/2026-11-13-e15-s09-recommendations.md` (e-maile i MCP po polsku, strona danych nieuruchomiona, treść zadań E15-S10/S11); Q-26 bez zmiany statusu. Adnotacje „stan wdrożenia fazy C” w `.ai/specs/2026-11-10-i18n.md` i „Stan E15 (2026-11-14)” z tabelą zamknięcia w `.ai/specs/backlog.md`. Dokumentacja `docs/architektura.md` („Błędy API i pól”, globy całości, bramka przełącznika).

## Runda poprawek 4 — sprzątanie w testach integracyjnych pokazu

- Uwaga przeglądu: `settleEngine` (`show-pages.test.ts`) i krok 3 `show-drive.test.ts` anulowały **każdą** aktywną partię z botem na wspólnym serwerze. Teraz anulują tylko partie utworzone **przed startem pliku** (`created_at < now()` bazy z `beforeAll`): `vitest.integration.config.ts` uruchamia pliki po kolei, więc to wyłącznie pozostałości plików już zakończonych; partie tego pliku i późniejszych nie są dotykane. Same zmiany tych plików (z rund 2–3) zostały, bo bramka konduktora uruchamia integrację — odstępstwo od Q12 planu domknięcia („nie zmieniać tych plików”) zapisane tu; progi czasu (250 ms, `SHOW_*`) bez zmian.

## Bramka (runda poprawek 4)

- `npm run lint`: 0 błędów (3 ostrzeżenia sprzed zmiany, w plikach spoza zakresu). `npm run typecheck`: zielony. `npm test` (z progiem 100 % na plik): **399 plików, 4587 testów — zielone**. `npm run build`: zielony.
- **Nieuruchomione:** `npm run test:integration` (sandbox: `docker ps` → `permission denied … docker.sock`), przegląd 320 px × 4 języki × 2 motywy, Size Limit, Faza 8.

## Stan na koniec przebiegu i następny krok

- **Ukończone lokalnie (niezacommitowane — zadanie zabrania commitów):** Fazy 1–7 (C1–C6 i domknięcie). Warunek wstępny F5.4/F5.5 spełniony (F1–F4 ukończone z zieloną bramką), z zastrzeżeniem, że punkty kontrolne nie są commitami.
- **Nie wykonane:** Faza 8 (uruchomienie lokalne) — sandbox odmawia dostępu do `docker.sock`, więc `npm run setup` nie wystartuje PostgreSQL (Q5). Polecenia dla właściciela, w tym worktree: `npm run setup` → `npm run check` → `npm run dev` (port zajęty: `PORT=3001 npm run dev`), potem `/api/health`, `/`, `/play`, `/lobby` z `?lang=pl|en|fr|de`, partia z botem po francusku, gość bez pseudonimu po angielsku, przełącznik bez DE.
- **Nieuruchomione w tym przebiegu:** `npm run test:integration` (nowe scenariusze `i18n-entry`, `i18n-room`, `i18n-lists`, `i18n-account`, `i18n-errors` + istniejące), przegląd 320 px × 4 języki × 2 motywy, pomiar Size Limit, `npm run check:tokens`/`test:stories` (pakiet `ui` nie był zmieniany).
- **Poza agentem (⚠ właściciel):** recenzje natywne FR i DE (E15-S10/S11), przyjęcie rekomendacji S09 (Q-26).
