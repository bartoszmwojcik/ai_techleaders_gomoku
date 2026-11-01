# Wskazówka „Jak podłączyć agenta” na ekranie oczekiwania prywatnej partii (E06-S04, #140)

> Status: **wdrożona** (E06-S04; PR implementacji `feat/agent-connect-hint`; kroki 1–7 wykonane, kryteria #140 spełnione). Odstępstwa: komponent ma stały układ trzech kroków (props `commandIntro`/`checkText`/`codeIntro` zamiast listy `steps`), a stories i MDX leżą w `packages/ui/docs/product/`. Wcześniejszy status: **szkic autonomiczny** (`om-auto-write-spec`); właściciel zatwierdził specyfikację z góry (zlecenie 2026-11-01), więc po przeglądzie można implementować. Epik E06 #124. Autorytet wymagań: `.ai/specs/product-brief.md` (D-28, BR-30/BR-31, D-29), zgłoszenie #140. Zależności (wdrożone): `implemented/2026-10-31-agent-joins-private-game.md` (S01, #127: `POST /api/mcp`, narzędzie `join`), `implemented/2026-10-31-agent-plays-game-mcp.md` (S02, #128: `get_state`, `play_move`), `implemented/2026-10-31-mcp-agent-identity.md` (D-29). Specyfikacje S01/S02 zostawiły tę wskazówkę poza zakresem jako decyzję produktową.

## 📝 TLDR

Dziś człowiek, który utworzył partię prywatną i chce zagrać z własnym agentem LLM, widzi na ekranie oczekiwania tylko kartę „Zaproś znajomego” (link i kod). Nie wie, że agent dołącza przez MCP, jaki jest adres serwera ani jak go dodać do klienta. **Zachowanie przyszłe:** pod kartą zaproszenia pojawia się zwijany panel „Jak podłączyć agenta” z: adresem serwera MCP (`{APP_ORIGIN}/api/mcp`), gotowym poleceniem `claude mcp add --transport http gomoku {adres}`, kodem zaproszenia z przyciskiem kopiowania i krótką instrukcją, co zrobić dalej. Panel nie zawiera żadnych sekretów (token agenta powstaje dopiero przy `join` i nigdy nie trafia do przeglądarki człowieka). Zmiana to jeden nowy komponent projektu graczy (`@gomoku/ui/game/agent-connect-card`), jedno dodatkowe, addytywne pole `invitation.mcpUrl` w widoku oczekującej partii i podpięcie w `game-room.tsx`. Bez migracji, bez nowych zależności, bez shadcn.

## Resolved assumptions (autonomous defaults)

Brief (D-28, BR-31) i zgłoszenie rozstrzygają cel i kryteria. Poniżej to, czego nie rozstrzygają. Żaden wiersz nie wymaga `⚠ NEEDS HUMAN CONFIRMATION`: wszystkie są odwracalne (tekst, układ), a polecenie zweryfikowano w dokumentacji Claude Code.

| # | Pytanie | Zastosowane założenie | Dlaczego | Potwierdzenie |
|---|---|---|---|---|
| R1 | Gdzie pokazać wskazówkę? Issue: „ekran oczekiwania (oraz ewentualnie stopka nawigacji)”. | **Tylko ekran oczekiwania** (`game.status === "waiting"`, widok twórcy), pod kartą zaproszenia. Bez stopki i bez strony pomocy. | Wskazówka ma sens, gdy człowiek ma już kod; w stopce nie byłoby kodu, a stopka dotyczyłaby też gości bez partii. Kryteria akceptacji dotyczą wyłącznie partii oczekującej. | odwracalne |
| R2 | Skąd adres MCP? | **Z serwera**: `GameService` dopisuje do `invitation` pole `mcpUrl = {appOrigin ?? DEV_ORIGIN}/api/mcp`, tym samym `#origin()` co `invitation.url`. Przeglądarka nie składa adresu z `window.location`. | Wymaganie: „z `APP_ORIGIN`”. Za reverse proxy `window.location` może mylić, a `APP_ORIGIN` jest już walidowanym, gołym originem (`parseAppOrigin`), więc w poleceniu nie ma znaków specjalnych powłoki. | odwracalne |
| R3 | Składnia polecenia | `claude mcp add --transport http gomoku {mcpUrl}` — kolejność ustalona: `--transport http`, nazwa, adres (zweryfikowano w dokumentacji Claude Code, strona MCP, 2026-11-01; ta sama składnia jest już w `README.md`). Zakres domyślny (`local`); bez `--header` i bez tokenu, bo serwer nie wymaga uwierzytelnienia przy `join` (D-29). Nazwa serwera `gomoku` stała. | Najkrótsza poprawna forma; dokumentacja zaznacza, że `add` nie sprawdza połączenia, więc panel mówi: „Uruchom `/mcp` w Claude Code, aby sprawdzić połączenie”. | odwracalne |
| R4 | Inne klienty MCP niż Claude Code | Jedno zdanie: „Inny klient MCP? Podaj mu adres serwera (transport Streamable HTTP, bez uwierzytelniania).” Bez osobnych poleceń dla Cursora, Codexa itd. | Nie utrzymujemy cudzych składni; adres wystarcza dla każdego klienta HTTP. | odwracalne |
| R5 | Co dokładnie jest kopiowalne | Dwa przyciski: **polecenie** („Kopiuj polecenie”) i **kod zaproszenia** („Kopiuj kod”). Adres serwera jest tekstem do zaznaczenia (`select-all`), bez osobnego przycisku (jest w poleceniu). Link zaproszenia zostaje na karcie obok (kopiuje go istniejące „Kopiuj”). | Kryterium: „komenda … i kod zaproszenia z przyciskiem kopiowania”. Mniej przycisków = mniej szumu. | odwracalne |
| R6 | Stan początkowy panelu | **Zwinięty** (`<details>` bez `open`); rozwija się klawiszem Enter/Spacja lub kliknięciem. Stan nie jest zapamiętywany. | Większość graczy zaprasza człowieka; panel nie może spychać karty zaproszenia i przycisku „Anuluj zaproszenie” poza ekran 320 px. Kryterium akceptacji mówi o panelu „rozwiniętym”. | odwracalne |
| R7 | Mechanizm zwijania | **Natywny `<details>`/`<summary>`** w nowym komponencie `AgentConnectCard`, bez Radixa i bez nowej zależności. Strzałka to ikona `ChevronDown` z `lucide-react` (już używana w `ui`), obracana `rotate-180` dla `open`. | Design system nie ma jeszcze komponentu rozwijanego („Czego brakuje” zawiera zakładki/popover, nie zwijanie); zwijanie z `<details>` ma wbudowaną dostępność i działa bez JS. Wpis o luce zostaje w `design-system.md` (R12). | odwracalne |
| R8 | Nowy komponent czy złożenie z `Panel` + `Button` w aplikacji | **Nowy komponent w `@gomoku/ui/game`**: wymaga tego kryterium „Given zmiana w `@gomoku/ui` … `check:tokens` i `test:stories`”, a wzorzec (kod + polecenie + kopiowanie) powtórzy się (np. ekran końca z „zagraj z agentem jeszcze raz”). Zgoda właściciela na ten jeden komponent jest zawarta w zatwierdzeniu specyfikacji. | Zasada nr 1 design systemu: stron graczy nie składa się z surowych elementów. | odwracalne |
| R9 | Widoczność dla gościa | Tak, tak samo jak dla konta: ten sam ekran oczekiwania. Gość nie dostaje innego tekstu. | BR-29/BR-30: gość też tworzy partię prywatną; ekran jest wspólny. | odwracalne |
| R10 | Co się dzieje po dołączeniu agenta | Nic nowego: ekran przechodzi w „Przeciwnik dołączył” / partię (S01), panel znika razem z ekranem oczekiwania. Wskazówki nie ma w trakcie partii ani po jej końcu. | Cel to podłączenie, nie pomoc w trakcie gry; „zagraj z agentem jeszcze raz” to osobna sprawa (rewanż z agentem jest niedozwolony, R7 w S01). | odwracalne |
| R11 | Treść dla agenta (prompt) | Panel podaje człowiekowi jedno zdanie do wklejenia agentowi, np. „Dołącz do partii gomoku narzędziem `join` z kodem ABCD-EFGH.” — jako zwykły tekst w instrukcji kroków, **bez osobnego przycisku**. Serwer nie wysyła agentowi żadnej instrukcji (S01: odpowiedzi tylko z danymi gry). | Człowiek musi wiedzieć, co powiedzieć agentowi; kopiowalny jest sam kod (R5). | odwracalne |
| R12 | Dokumentacja design systemu | `packages/ui/docs/design-system.md`: nowy wiersz w tabeli komponentów oraz wpis o braku ogólnego komponentu „rozwijany panel” (`AgentConnectCard` używa natywnego `<details>`). Strona MDX + stories w `packages/ui/docs/components/`. | Reguły repozytorium: komponent bez wpisu w dokumentacji nie przechodzi review. | odwracalne |

## 📝 Problem Statement

- **Kto:** człowiek (konto albo gość), który utworzył partię prywatną i chce zagrać z własnym agentem LLM (D-28).
- **Dziś:** `game-room.tsx` w stanie `waiting` pokazuje „Zaproś znajomego” (`InviteCodeCard`: link, kod, ważność, „Kopiuj”, „Udostępnij”, „Anuluj zaproszenie”). Nic nie mówi o MCP. Instrukcja jest tylko w `README.md` (sekcja o E06-S01), której gracz nie zobaczy.
- **Kryteria #140:** (1) partia prywatna oczekująca, panel „Jak podłączyć agenta”: adres `/api/mcp` z `APP_ORIGIN`, komenda dodania serwera, kod z przyciskiem kopiowania; (2) 320 px i oba motywy, panel rozwinięty: brak poziomego scrolla, kontrast i focus zgodne z design systemem; (3) `check:tokens` i `test:stories` przechodzą.
- **Poza zakresem:** zmiany w serwerze MCP, narzędziach i limitach; instrukcje dla klientów innych niż Claude Code (R4); wskazówka w trakcie partii, na ekranie końca i w stopce (R1, R10); generowanie lub pokazywanie tokenu agenta; strona pomocy; telemetria kliknięć.

## 📝 Proposed Solution

1. **Dane:** `GameService` (`create` i `getState`) zwraca `invitation.mcpUrl` obok `url`. Pole jest addytywne (JSON `GET /api/games/:id`, `POST /api/games`); istniejący klienci go ignorują.
2. **Komponent** `AgentConnectCard` w `packages/ui/src/game/agent-connect-card.tsx`, bez wbudowanych tekstów, z propsami: `summary` (nagłówek zwijanego panelu), `intro?`, `steps` (lista kroków jako `ReactNode[]`), `serverLabel`/`serverUrl`, `commandLabel`/`command`/`copyCommandLabel`, `codeLabel`/`code`/`copyCodeLabel`, `copiedLabel`, `copied?: "command" | "code" | null`, `onCopyCommand`, `onCopyCode`, `note?`, `className`. Wnętrze: `<details>` z `<summary>` (cel dotyku 44 px, `focus-ring`), a w środku Panel-podobna sekcja `bg-surface-raised`, `border-border-default`. Polecenie i adres w `<code>` z `break-all`/`whitespace-pre-wrap` (zawijanie, nigdy poziomy scroll), kod w `text-subsection font-strong tracking-widest`. Wspólny `role="status"` `sr-only` ogłasza „Skopiowano”.
3. **Strona** `game-room.tsx` (stan `waiting`): pod `InviteCodeCard` renderuje `AgentConnectCard`. Kopiowanie przez `navigator.clipboard.writeText`, awaryjnie zaznaczenie tekstu (jak istniejący `onCopy`, p03.3); komunikaty w istniejącym `COPY_FEEDBACK`-owym wierszu statusu (rozszerzone o „Skopiowano polecenie.” / „Skopiowano kod.”). Wszystkie teksty po polsku w stronie (komponent ich nie ma).
4. **Treść panelu (propozycja, finalne brzmienie w implementacji):** nagłówek „Jak podłączyć agenta”; kroki: (1) „W terminalu agenta uruchom polecenie” + polecenie; (2) „Sprawdź połączenie: w Claude Code wpisz `/mcp`”; (3) „Powiedz agentowi: Dołącz do partii gomoku narzędziem join z kodem {kod}”; uwaga: „Inny klient MCP? Podaj mu adres serwera (Streamable HTTP, bez uwierzytelniania).” Pod spodem: „Agent dołączy jako „Agent”. Nie podawaj mu hasła ani tokenów — nie są potrzebne.”

**Odrzucone alternatywy:** adres z `window.location` (R2); osobna strona `/help/agent` (kryterium mówi o ekranie oczekiwania); generowanie `.mcp.json` do pobrania (więcej powierzchni, brak dowodu popytu, A-04); wskazówka w `Alert` (to nie komunikat o stanie, zająłby miejsce stale); modal (zakrywa kod, który człowiek ma przepisać).

## 📝 Architecture

```
GameService (create / getState)          [zmiana: + invitation.mcpUrl]
  -> loadGameView / GET /api/games/:id   [bez zmian poza polem]
    -> game-room.tsx (waiting)           [zmiana: + <AgentConnectCard/>]
        -> @gomoku/ui/game/agent-connect-card  [NOWY: <details>, Button, lucide]
```

- Kierunki zależności zachowane: `ui` nie importuje nic z `app`/`db`; `core` bez zmian. Czysta funkcja składająca adres i polecenie: `agentMcpUrl(origin)` i `agentAddCommand(url)` w `@gomoku/core` (`packages/core/src/games/agent-connect.ts`, bez zależności), żeby 100% pokrycia nie zależało od komponentu klienckiego. `GameService` używa pierwszej, strona drugiej.
- Stała `MCP_SERVER_NAME_FOR_CLIENT = "gomoku"` (nazwa wpisu u klienta; **nie** `MCP_SERVER_NAME` z serwera MCP, który identyfikuje serwer w protokole).
- Wzorzec stanu kopiowania: ten sam co `game-room.tsx` (`Copy` typ rozszerzony), bez nowego hooka.

## 📝 Data Model

Brak zmian. Bez migracji; adres wynika z konfiguracji (`APP_ORIGIN`), kod z istniejącej tabeli zaproszeń.

## 📝 API Contracts

- `GET /api/games/:id` i `POST /api/games` (odpowiedzi z `invitation`): **nowe pole** `invitation.mcpUrl: string` (absolutny `https://…/api/mcp`; poza produkcją bez `APP_ORIGIN` — `http://localhost:3000/api/mcp`). Zmiana addytywna, zgodna wstecz (`BACKWARD_COMPATIBILITY.md`: pole dodane, nic usunięte). Pole występuje tylko tam, gdzie dziś występuje `invitation` (twórca, partia `waiting`), więc nie ujawnia niczego nowego uczestnikowi, który zaproszenia nie widzi.
- `POST /api/mcp`: bez zmian.

## 📝 UI/UX

Układ ekranu oczekiwania (od góry): nagłówek „Partia czeka na przeciwnika” → status tury → karta „Zaproś znajomego” → **panel „Jak podłączyć agenta” (zwinięty)** → komunikat o kopiowaniu → (gość) ostrzeżenie o przeglądarce.

```
[ Jak podłączyć agenta                   v ]   <- summary, 44 px, focus-ring
  1. W terminalu agenta uruchom polecenie:
     claude mcp add --transport http gomoku
     https://gomoku.example/api/mcp
     [Kopiuj polecenie]
  2. Sprawdź połączenie: wpisz /mcp w Claude Code.
  3. Powiedz agentowi, że ma dołączyć narzędziem
     join z kodem:
     ABCD-EFGH           [Kopiuj kod]
  Adres serwera: https://gomoku.example/api/mcp
  Inny klient MCP? Podaj mu adres (Streamable HTTP).
```

- **Stany:** zwinięty (domyślny), rozwinięty, skopiowano (przycisk: ikona `Check` + „Skopiowano”, tak jak karta zaproszenia; znaczenie nie tylko kolorem), błąd schowka (zaznaczenie tekstu + komunikat „Nie można skopiować automatycznie. Tekst jest zaznaczony — skopiuj go ręcznie (Ctrl+C).”). Ładowanie i pusty stan nie występują: panel renderuje się z danymi, które ekran już ma. Brak `mcpUrl` (starszy zbuforowany JSON) → panel się nie renderuje (komponent nie jest wymagany do działania ekranu).
- **A11y:** `<summary>` jest fokusowalny i obsługuje Enter/Spację natywnie; kolejność tabulatora: karta zaproszenia → summary → przyciski w panelu; `role="status"` ogłasza kopiowanie; ikony `aria-hidden`; tekst poleceń zaznaczalny (`select-all`); `lang` bez zmian; nagłówek panelu to treść `summary` (nie dodatkowy `h*`, aby nie zaburzać hierarchii z `h1` ekranu); cel dotyku ≥ 44 px (`min-h-target`).
- **320 px:** polecenie i adres zawijają się (`break-all`), przyciski w `flex-wrap`, kod `tracking-widest` mieści się (8 znaków + myślnik); weryfikacja: `scrollWidth === clientWidth` dokumentu w teście integracyjnym i w story „320 px”.
- **Motywy:** wyłącznie tokeny (`surface-raised`, `border-default`, `text-*`, `focus-ring`); kontrast tekstu 4,5:1, elementów 3:1 sprawdza `test:stories` (axe) w obu motywach. Bez pomarańczu poza przyciskami, bez emoji, cieni i gradientów (zasady 2 i 5).
- **Mockupy:** nie dołączono (tekstowy szkic powyżej); wygląd weryfikuje Storybook (stories w obu motywach i 320 px) w PR implementacji.

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Zachowanie |
|---|---|
| `APP_ORIGIN` nieustawiony (dev) | adres `http://localhost:3000/api/mcp` (jak w `invitation.url`). W produkcji `APP_ORIGIN` jest wymagany (`config.ts`), więc adres jest zawsze publiczny. |
| `APP_ORIGIN` z portem/`http://` (kompozycja lokalna) | adres wiernie z konfiguracji. |
| Brak Clipboard API / odmowa uprawnień | zaznaczenie tekstu elementu + komunikat ręcznego kopiowania (wzorzec p03.3). |
| Kod wygasa/zaproszenie anulowane | cały ekran oczekiwania znika (S01/#21); panel razem z nim. |
| Bardzo długi origin (subdomena) | `break-all`, bez poziomego scrolla. |
| JS wyłączony / przed hydratacją | `<details>` działa natywnie; przyciski kopiowania wymagają JS (jak „Kopiuj” na karcie). |
| Gracz-gość | patrz R9; ostrzeżenie o przeglądarce pozostaje pod panelem. |
| Rate limit MCP (`join` 10 / h na adres) | poza zakresem; agent zobaczy `RATE_LIMITED` w odpowiedzi narzędzia (S01). |

## 📝 Risks & Impact Review

| Ryzyko | Waga | Mitygacja |
|---|---|---|
| Wyciek sekretu przez panel | niska | Panel pokazuje wyłącznie adres, stałą nazwę i kod, który już jest na karcie. Test: markup nie zawiera tokenu ani `agent_token`; token agenta nie przechodzi przez żadną odpowiedź widoku człowieka (S01, R6). |
| Składnia `claude mcp add` zmieni się | niska | Polecenie składa jedna czysta funkcja w `core` (test z dokładnym łańcuchem), więc zmiana to jedna linia; w tekście zaznaczone, że dotyczy Claude Code. |
| Wstrzyknięcie przez `APP_ORIGIN` do polecenia powłoki | niska | `parseAppOrigin` dopuszcza goły origin (bez ścieżki, zapytania i spacji); `agentMcpUrl` dodatkowo rzuca błąd dla originu spoza wzorca `^https?://[A-Za-z0-9.:\[\]-]+$`, co pokrywa test jednostkowy. |
| Panel spycha kluczowe akcje na wąskim ekranie | średnia | Zwinięty domyślnie (R6); test 320 px. |
| Nowy komponent poza zakresem tokenów | niska | `check:tokens` w CI (job `tokens`). |
| Kryterium „panel rozwinięty” a stan domyślny zwinięty | niska | Testy i story przełączają `open`; dokumentacja opisuje stan. |

## Kontrakty dla kolejnych historyjek

- Komponent przyjmuje teksty przez propsy, więc ten sam panel można użyć na ekranie końca partii z agentem (poza zakresem tutaj).
- `invitation.mcpUrl` jest stabilnym polem widoku oczekującej partii; kolejne historyjki E06/E07 mogą na nim polegać.

## 📝 Decisions in play

D-28 (gra z własnym agentem, MCP), BR-30/BR-31 (agent dołącza kodem/linkiem do partii prywatnej), D-29 (transport `POST /api/mcp`, token jednej partii wydawany przez `join`, bez uwierzytelnienia przy dołączaniu). Ta specyfikacja nie wprowadza nowych decyzji produktowych poza R1–R12.

## 📋 Phasing

Jedna historyjka, jeden PR implementacji (lekcja „Mało, ale pełnych PR-ów”), wewnętrznie w krokach poniżej.

## 📋 Implementation Plan

1. **core:** `packages/core/src/games/agent-connect.ts` (`agentMcpUrl(origin)`, `agentAddCommand(url)`, stała nazwy wpisu) + `agent-connect.test.ts` (100%, dokładne łańcuchy, origin z końcowym `/`), eksport w `package.json`/indeksie wg konwencji pakietu.
2. **app (serwer):** `GameService.create`/`getState` dopisują `invitation.mcpUrl`; typ `invitation` w `game-service.ts`; testy `game-service.test.ts` (z i bez `appOrigin`), `game-view`/trasy (`route.test.ts`) — pole przechodzi w JSON.
3. **ui:** `agent-connect-card.tsx` + `agent-connect-card.test.tsx` (`renderToStaticMarkup`: zwinięty/rozwinięty, kopiowanie, brak wbudowanych tekstów, `copied`), `packages/ui/docs/components/agent-connect-card.stories.tsx` + `.mdx` (zwinięty, rozwinięty, skopiowano, długi origin, 320 px; oba motywy), wiersz w `docs/design-system.md` (R12), wpis w `POSTEP.md`.
4. **app (strona):** `game-room.tsx` — render panelu w `waiting`, `onCopyCommand`/`onCopyCode`, rozszerzenie `COPY_FEEDBACK`; testy `game-room.test.tsx` (panel jest, brak panelu bez `mcpUrl`, kopiowanie, błąd schowka).
5. **integracja:** scenariusz w `tests/integration/game-invitation-pages.test.ts` (lub nowy `game-agent-hint-pages.test.ts`): twórca na `/games/:id` rozwija panel, widzi adres `…/api/mcp` i polecenie, kopiuje kod (komunikat), 320 px bez poziomego scrolla, oba motywy (`data-theme`), brak panelu po dołączeniu agenta (`join` przez `POST /api/mcp`).
6. **docs:** `README.md` (akapit przy E06-S01: gdzie jest wskazówka, `invitation.mcpUrl`), adnotacja „wdrożona” w tej specyfikacji, przeniesienie do `implemented/`.
7. **weryfikacja:** `npm run check`, `npm run check:tokens -w @gomoku/ui`, `npm run test:stories -w @gomoku/ui`, ręcznie `npm run dev` (oba motywy, 320 px, klawiatura).

### Kryteria akceptacji #140 → kroki

- Panel z adresem `/api/mcp` (z `APP_ORIGIN`), komendą i kodem z kopiowaniem → kroki 1–5.
- 320 px, oba motywy, brak poziomego scrolla, kontrast i focus → kroki 3, 5, 7.
- `check:tokens` i `test:stories` przechodzą → kroki 3, 7.
