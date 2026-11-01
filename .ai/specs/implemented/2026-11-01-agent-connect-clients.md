# Instrukcje podłączenia agenta dla Codex, Gemini CLI, GitHub Copilot i Cursor (E07-S05, #168)

> Status: **wdrożona** (E07-S05, #168; PR implementacji `feat/agent-connect-clients`; kroki 1–7, 9 i 10 wykonane, kryteria #168 spełnione). Odstępstwa: patrz „Adnotacje wdrożenia” na końcu. Pierwotnie: szkic autonomiczny (`om-auto-write-spec`); właściciel zatwierdza specyfikacje z góry (zlecenie 2026-11-01). Epik E07 #144. Rozszerza wdrożoną `implemented/2026-11-01-agent-connect-hint.md` (E06-S04, #140) i **zastępuje jej założenie R4** („bez osobnych poleceń dla Cursora, Codexa itd.”) na życzenie właściciela. Autorytet wymagań: `.ai/specs/product-brief.md` (D-28, BR-31, D-29), zgłoszenie #168. Składnia klientów zweryfikowana w oficjalnej dokumentacji 2026-11-01 (źródła w sekcji „Składnia klientów”).

## 📝 TLDR

Panel „Jak podłączyć agenta” pokazuje dziś jedno polecenie: `claude mcp add --transport http gomoku <adres>`. Gracz używający Codex, Gemini CLI, GitHub Copilot lub Cursor nie wie, co zrobić. **Zachowanie przyszłe:** w panelu jest lista wyboru klienta (domyślnie Claude Code, wybór tylko w stanie ekranu, bez zapamiętywania), a pod nią instrukcja wyłącznie dla wybranego klienta: polecenie albo fragment pliku konfiguracji, przycisk kopiowania, krótki sposób sprawdzenia połączenia. Ekran pozostaje czysty: jedna instrukcja naraz. Przy okazji dwie poprawki wyglądu bloku z poleceniem: dwa myślniki `--transport` wyświetlają się jak dwa (ligatury wyłączone), a polecenie łamie się na spacjach, nie w środku opcji (`break-words` zamiast `break-all`; skopiowany tekst bez zmian). Zakres: jeden nowy mały komponent DS (`Select`, natywny `<select>`), rozbudowa `AgentConnectCard`, czysta funkcja w `core` składająca instrukcje, teksty po polsku w aplikacji. Bez zmian serwera, bez migracji, bez nowych zależności.

## Resolved assumptions (autonomous defaults)

Zgłoszenie #168 rozstrzyga cel, kryteria i zakres (lista wyboru, brak zapamiętywania, domyślnie Claude Code, adres `{APP_ORIGIN}/api/mcp`). Poniżej to, czego nie rozstrzyga. Żaden wiersz nie wymaga `⚠ NEEDS HUMAN CONFIRMATION`: wszystkie są odwracalne (tekst, układ, jeden komponent), a składnię sprawdzono w dokumentacji. Jedyne, czego nie dało się sprawdzić bez klientów, to zachowanie rzeczywistych programów wobec naszego serwera; dlatego plan zawiera ręczny test z każdym klientem (krok 8), a nie tylko zgodność składni.

| # | Pytanie | Zastosowane założenie | Dlaczego | Potwierdzenie |
|---|---|---|---|---|
| R1 | Jaki element listy? Design system nie ma select ani radio. | **Nowy komponent DS `Select`** (`@gomoku/ui/game/select`): natywny `<select>` w `Field`, stylowany tokenami jak `TextInput`, opcje i etykieta przez propsy. Zgoda właściciela na ten jeden komponent jest zawarta w zatwierdzeniu specyfikacji (jak R8 w E06-S04). | Natywny select daje klawiaturę (strzałki, Tab, pisanie liter), czytnik ekranu i systemowe okno wyboru na telefonie bez kodu; zajmuje jeden wiersz niezależnie od liczby klientów. Odrzucone: grupa radio (6 wierszy spycha instrukcję, sprzeczne z „czysty ekran”), zakładki (brak w DS, 6 zakładek nie mieści się w 320 px), Radix Select (własne okno wyboru, gorsze na telefonach, więcej kodu do testów dostępności). | odwracalne |
| R2 | Czy GitHub Copilot to jedna pozycja? | **Dwie pozycje: „GitHub Copilot CLI” i „GitHub Copilot (VS Code)”**, razem sześć opcji. | Mają różną składnię i różny format pliku (`mcpServers` w `~/.copilot/mcp-config.json` kontra `servers` + `type` w `.vscode/mcp.json`); jedna pozycja wymusiłaby dwie instrukcje naraz, czyli bałagan, któremu ma zapobiec lista. | odwracalne |
| R3 | Polecenie czy plik konfiguracji? | **Polecenie CLI tam, gdzie dokumentacja je podaje** (Claude Code, Codex, Gemini CLI, Copilot CLI), **fragment pliku** dla klientów bez CLI do dodawania serwerów (VS Code, Cursor). Przycisk kopiuje dokładnie wyświetlony tekst. | Polecenie to jeden krok do wklejenia; plik jest wyjątkiem. Cursor ma też instalację przez „Add to Cursor” (deeplink), ale deeplink koduje konfigurację w base64 i jest sposobem dla katalogów serwerów; nie wprowadzamy go (nowa powierzchnia, nic ponad plik). | odwracalne |
| R4 | Nazwa wpisu u klientów | Stała `gomoku` (`MCP_SERVER_NAME_FOR_CLIENT`) dla wszystkich klientów. | Spójność z Claude Code i `README.md`. | odwracalne |
| R5 | Uwierzytelnienie i token w URL | **Bez zmian (D-29):** adres to goły `{APP_ORIGIN}/api/mcp`, bez tokenu, bez nagłówków, bez `--header`, bez zmiennych środowiskowych. Karta pokazuje wyłącznie adres, kod zaproszenia (już widoczny na karcie obok) i stałą nazwę. Token agenta powstaje dopiero w odpowiedzi `join` i nigdy nie trafia do przeglądarki człowieka ani do adresu. | Sprawdzone w kodzie: `agentMcpUrl` zwraca origin + `/api/mcp`, `invitation.mcpUrl` nie zawiera tokenu. Dlatego ta zmiana nie dodaje powierzchni na sekrety; test jednostkowy pilnuje, że żadna instrukcja nie zawiera `token`, `Authorization`, `Bearer` ani `--header`. Logi: nic nowego nie jest logowane (zmiana tylko po stronie klienta, kopiowanie lokalne). | odwracalne |
| R6 | Domyślny wybór i pamiętanie | **Claude Code** przy każdym otwarciu ekranu; wybór wyłącznie w `useState` strony (bez `localStorage`, bez konta, bez ciasteczka), zgodnie z „poza zakresem” zgłoszenia. Zmiana klienta czyści stan „Skopiowano”. | Wymaganie wprost. | odwracalne |
| R7 | Gdzie mieszkają składnie | `packages/core/src/games/agent-connect.ts`: `AGENT_CLIENTS`, `agentClientSetup(client, mcpUrl)` zwraca `{ kind: "command" \| "config", text }` (czyste, bez tekstów interfejsu). Polskie etykiety, wstępy i kroki sprawdzenia w aplikacji (`packages/app/src/lib/games/agent-clients.ts`). Komponent DS nie ma wbudowanych tekstów. Istniejące `agentAddCommand` zostaje (używa go `agentClientSetup`). | Zasady repozytorium: logika bez UI w `core`, teksty UI po polsku w aplikacji, DS bez tekstów. | odwracalne |
| R8 | Ligatury | Nowe narzędzie w `game-tokens.css`: `@utility no-ligatures { font-variant-ligatures: none; }` (obok `focus-ring`, `motion-fast`); używane w bloku z poleceniem. Tailwind nie ma takiej klasy, a wartość arbitralna łamie `check:tokens`. Jeśli w przeglądarce `none` nie wystarczy dla używanej czcionki, dodajemy `font-feature-settings: "calt" 0` w tym samym narzędziu. Krój monospace jako nowy token odrzucony: zmienia charakter DS i wymaga decyzji właściciela. | Kryterium: dwa osobne myślniki w obu motywach. | odwracalne |
| R9 | Łamanie wiersza | `break-all` → `break-words` w bloku z poleceniem i w adresie serwera. Dodatkowo słowa zaczynające się od `-` (opcje) są owinięte w `<span class="whitespace-nowrap">`, bo reguły łamania wierszy (UAX #14) dopuszczają przerwę po myślniku, czyli między `--` a `transport`. Treść tekstowa (a więc kopiowanie, `select-all`) pozostaje identyczna. Długi adres URL łamie się dopiero, gdy sam nie mieści się w wierszu (`break-words`). | Kryterium: „nie łamie się w środku opcji”. Sprawdzamy w przeglądarce (krok 7), nie zakładamy. | odwracalne |
| R10 | Sprawdzenie połączenia | Dla każdego klienta jedno zdanie: Claude Code `/mcp`; Codex `codex mcp list`; Gemini CLI `/mcp` w sesji lub `gemini mcp list`; Copilot CLI lista serwerów w `/mcp`; VS Code przycisk „Start” nad wpisem w pliku, potem narzędzia w trybie Agent; Cursor lista MCP w ustawieniach (Customize). Te z dokumentacji potwierdzonej dosłownie: Claude Code, Codex, VS Code. Pozostałe sformułować ostrożnie („sprawdź na liście serwerów MCP w kliencie”), jeśli komenda nie zostanie potwierdzona w kroku 8. | Nie obiecujemy komendy, której nie zweryfikowano. | odwracalne |
| R11 | Treść wspólna | Krok „Powiedz agentowi: Dołącz do partii gomoku narzędziem join z kodem …”, kod z przyciskiem, adres serwera i uwaga o czacie zostają bez zmian dla wszystkich klientów. Zdanie „Inny klient MCP? Podaj mu adres serwera (Streamable HTTP, bez uwierzytelniania)” zostaje w uwadze. | Różni się tylko krok 1 i 2. | odwracalne |
| R12 | Zakres zmiany `AgentConnectCard` | Zmiana łamiąca API komponentu jest dozwolona (jedyny użytkownik: `game-room.tsx`; stories i testy aktualizowane w tym samym PR): `command` → `snippet`, `copied: "command"` → `"snippet"`, `data-copy="command"` → `"snippet"`, dochodzą propsy listy wyboru. | Komponent wdrożony wczoraj, jedno miejsce użycia; nazwa „command” przestaje być prawdą dla plików konfiguracji. | odwracalne |

## 📝 Problem Statement

- **Kto:** właściciel instancji i gracze (konto lub gość), którzy utworzyli partię prywatną z własnym agentem LLM (D-28, BR-31).
- **Dziś:** `AgentConnectCard` pokazuje tylko `claude mcp add --transport http gomoku <adres>` i krok „w Claude Code wpisz /mcp”. Inne klienty dostają zdanie „Podaj mu adres serwera”. Blok polecenia ma `break-all`, więc zdarza się `--transpor|t`, a czcionka łączy `--` w jeden długi myślnik, przez co polecenie wygląda na niepoprawne (i ktoś może je przepisać ręcznie błędnie).
- **Kryteria #168:** (1) lista wyboru klienta, domyślnie Claude Code, instrukcja tylko wybranego, z kopiowaniem; (2) składnia zgodna z dokumentacją (źródła i data w specyfikacji), adres `{APP_ORIGIN}/api/mcp`; (3) dwa myślniki, brak łamania w środku opcji, skopiowany tekst bez zmian; (4) klawiatura, czytnik ekranu, focus, 320 px bez poziomego scrolla, oba motywy; (5) `check:tokens`, `test:stories`, `npm run check` ze 100% pokryciem.
- **Poza zakresem:** zapamiętywanie wyboru, tokeny i uwierzytelnianie (D-29), zmiany serwera MCP, deeplinki instalacyjne, automatyczne wykrywanie klienta, instrukcje dla innych klientów (Windsurf, Zed itd.).

## Składnia klientów (zweryfikowana 2026-11-01)

Adres we wszystkich przykładach: `{URL}` = `invitation.mcpUrl` (np. `https://gomoku.example/api/mcp`), nazwa wpisu `gomoku`. Wszystkie połączenia bez uwierzytelniania: serwer nie odpowiada `401`, więc klient nie powinien uruchamiać OAuth (do potwierdzenia w kroku 8).

| Klient | Wyświetlany tekst (kopiowany) | Źródło i ustalenia |
|---|---|---|
| Claude Code | `claude mcp add --transport http gomoku {URL}` | https://code.claude.com/docs/en/mcp: `claude mcp add --transport http <name> <url>`; domyślny zakres lokalny; `add` nie weryfikuje połączenia; status w `/mcp`, `claude mcp list`. |
| Codex | `codex mcp add gomoku --url {URL}` | https://learn.chatgpt.com/docs/extend/mcp (dawniej developers.openai.com/codex/mcp): `codex mcp add example --url https://mcp.example.com`; tabela `[mcp_servers.<nazwa>]` z kluczem `url` w `~/.codex/config.toml` (równoważny zapis ręczny); `auth` domyślnie `oauth` (patrz ostrożność wyżej); lista: `codex mcp list`. Dokumentacja nie wymaga flag funkcji dla Streamable HTTP. |
| Gemini CLI | `gemini mcp add --transport http gomoku {URL}` | https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md: `gemini mcp add --transport http http-server https://api.example.com/mcp/`; opcja `-s, --scope` `user` lub `project`, **domyślnie `project`** (zapis do `.gemini/settings.json` bieżącego katalogu); w `settings.json` adres Streamable HTTP to klucz `httpUrl` (klucz `url` oznacza SSE). Dokumentacja nie pokazuje, co dokładnie zapisuje `add`; sprawdzić w kroku 8. Uwaga w panelu: „Polecenie zapisuje serwer dla bieżącego katalogu; dodaj `--scope user`, aby działał wszędzie.” |
| GitHub Copilot CLI | `copilot mcp add --transport http gomoku {URL}` | https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers: „Specify the transport as `http`, because the default is `stdio`”; zapis do `~/.copilot/mcp-config.json`; alternatywa interaktywna `/mcp add` (typ HTTP, URL, narzędzia `*`). |
| GitHub Copilot (VS Code) | plik `.vscode/mcp.json`: `{ "servers": { "gomoku": { "type": "http", "url": "{URL}" } } }` (wielowierszowy, wcięty dwiema spacjami) | https://code.visualstudio.com/docs/agents/reference/mcp-configuration: format VS Code używa `servers`, `type: "http"`, `url`; pliki: `.vscode/mcp.json` (obszar roboczy) lub `mcp.json` profilu; po zapisaniu w pliku pojawia się „Start” (https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/extend-copilot-chat-with-mcp). Uwaga: format przenośny Copilota używa `mcpServers` w `.mcp.json`; **nie mieszamy** formatów. |
| Cursor | plik `~/.cursor/mcp.json` lub `.cursor/mcp.json`: `{ "mcpServers": { "gomoku": { "url": "{URL}" } } }` (wielowierszowy) | https://cursor.com/docs/mcp: lokalizacje plików, przykład zdalnego serwera z kluczem `url` („MCP server using HTTP or SSE”), `headers` opcjonalne. Cursor wykrywa transport sam; osobnego `type` nie wymaga. |

Wnioski uczciwe wobec użytkownika: wszyscy pięciu klienci obsługują zdalny serwer HTTP bez dodatkowych kroków instalacyjnych. Dwa zastrzeżenia, które zostają w panelu jako krótkie uwagi: zakres `project` w Gemini CLI (powyżej) oraz fakt, że VS Code i Cursor wymagają ręcznego edytowania pliku (brak polecenia `add` w dokumentacji). Wariant `code --add-mcp '{...}'` w VS Code nie jest udokumentowany dla serwerów HTTP, więc go nie podajemy.

## 📝 Proposed Solution

1. **core** (`packages/core/src/games/agent-connect.ts`): `AGENT_CLIENTS = ["claude-code", "codex", "gemini-cli", "copilot-cli", "copilot-vscode", "cursor"] as const`, `type AgentClient`, `DEFAULT_AGENT_CLIENT = "claude-code"`, `agentClientSetup(client, mcpUrl): { kind: "command" | "config"; text: string }`. `agentAddCommand` zostaje. Konfiguracje budowane przez `JSON.stringify(obiekt, null, 2)`, więc adres jest zawsze poprawnie cytowany; adres pochodzi z `agentMcpUrl` (walidowany goły origin).
2. **ui, `Select`** (`packages/ui/src/game/select.tsx`): `<select>` z klasami jak `TextInput` (`min-h-target`, `border-border-control`, `bg-surface-page`, `rounded-base`, `focus-visible:focus-ring`), ikona `ChevronDown` (`pointer-events-none`, `aria-hidden`), `options: { value: string; label: ReactNode }[]` i reszta atrybutów przez `ComponentProps<"select">`; używany wewnątrz `Field` (otrzymuje `id`, `aria-describedby` itd.). Elementy `<option>` dostają `bg-surface-page text-text-primary`, żeby lista systemowa była czytelna w obu motywach. Bez wbudowanych tekstów.
3. **ui, `AgentConnectCard`**: nowe propsy `clientLabel` (etykieta pola), `clients` (opcje), `client` (wartość), `onClientChange`; nad krokiem 1 wiersz z `Field` + `Select`. `command` → `snippet`, `copyCommandLabel` → `copySnippetLabel`, `copied: "snippet" | "code"`. Blok `snippet` renderuje tekst linia po linii, opcje (`-…`) w `whitespace-nowrap`, klasy `break-words no-ligatures whitespace-pre-wrap`; wielowierszowy plik zachowuje wcięcia. `serverUrl`: `break-words`. Opcjonalny `snippetHint` (np. ścieżka pliku) nad blokiem to po prostu część `commandIntro`.
4. **app** (`packages/app/src/lib/games/agent-clients.ts`): mapa `AgentClient` → `{ label, intro, check, note? }` po polsku; `game-room.tsx` trzyma `useState<AgentClient>(DEFAULT_AGENT_CLIENT)`, składa propsy karty z `agentClientSetup(client, invitation.mcpUrl)` i mapy; zmiana klienta ustawia `copy` na `idle`. `onCopyAgentText("snippet", text)` kopiuje `setup.text`.
5. **Dokumentacja DS:** `design-system.md` (wiersz `Select`, usunięcie „select” z listy braków), `czego-brakuje.mdx` (usunięcie „select” z braków, liczniki), `komponenty.mdx`, `text-input.mdx` i `checkbox.mdx` (odsyłacze „jeszcze nie ma” → `Select`), strona MDX i stories `Select` w `packages/ui/docs/components/`, aktualizacja MDX i stories karty (`packages/ui/docs/product/`), `POSTEP.md`.

**Odrzucone alternatywy:** wszystkie instrukcje naraz w zwijanych sekcjach (bałagan, sprzeczne z celem); zakładki (R1); jedna pozycja Copilot (R2); detekcja klienta po `User-Agent` (człowiek w przeglądarce, nie klient MCP, więc nic nie mówi); generowanie pliku do pobrania (nowa powierzchnia, brak dowodu popytu, A-04).

## 📝 Architecture

```
core: agent-connect.ts   [zmiana: + AGENT_CLIENTS, agentClientSetup (czyste, bez tekstów UI)]
app:  lib/games/agent-clients.ts  [NOWY: polskie etykiety, wstępy, kroki sprawdzenia]
app:  game-room.tsx      [zmiana: useState klienta, składanie propsów]
  -> ui: agent-connect-card.tsx  [zmiana: lista wyboru, snippet, break-words, no-ligatures]
       -> ui: select.tsx, field.tsx  [Select NOWY; Field bez zmian]
ui:   styles/game-tokens.css  [zmiana: + @utility no-ligatures]
```

Kierunki zależności bez zmian (`app → core, ui`; `ui` nie importuje `core`). Brak zmian serwera, API i bazy.

## 📝 Data Model

Brak zmian.

## 📝 API Contracts

Brak zmian: `invitation.mcpUrl` bez zmian, `POST /api/mcp` bez zmian. Zmiana API komponentu `AgentConnectCard` (R12) jest wewnętrzna dla monorepo.

## 📝 UI/UX

Mockup (statyczny, ilustracyjny): `../assets/agent-connect-clients/mockup-01-client-select.html` (Claude Code, Cursor i 320 px). Szkic tekstowy rozwiniętego panelu:

```
[ Jak podłączyć agenta                         v ]
  Klient
  [ Claude Code                                v ]   <- Select, 44 px, focus-ring
  1. W terminalu agenta uruchom polecenie:
     claude mcp add --transport http gomoku
     https://gomoku.example/api/mcp
     [Kopiuj polecenie]
  2. Sprawdź połączenie: w Claude Code wpisz /mcp.
  3. Powiedz agentowi: „Dołącz do partii gomoku narzędziem join z kodem ABCD-EFGH”.
     ABCD-EFGH                                  [Kopiuj kod]
  Adres serwera: https://gomoku.example/api/mcp
  Inny klient MCP? Podaj mu adres serwera (Streamable HTTP, bez uwierzytelniania). …
```

Po wyborze „Cursor”: krok 1 „Dodaj do pliku `~/.cursor/mcp.json` (albo `.cursor/mcp.json` w projekcie):”, blok wielowierszowy z JSON, przycisk „Kopiuj konfigurację”, krok 2 „Włącz serwer na liście MCP w ustawieniach Cursora.” Przycisk w stanie kopiowania: ikona `Check` + „Skopiowano”.

- **Stany:** zwinięty (domyślny, bez zmian), rozwinięty z domyślnym klientem, rozwinięty po zmianie klienta (instrukcja podmieniona, „Skopiowano” wyczyszczone), skopiowano. Błąd schowka obsługuje strona jak dotąd (zaznaczenie bloku `[data-copy="snippet"]`).
- **Dostępność:** natywny `<select>` z `<label for>` z `Field`: strzałki zmieniają wartość, Tab/Shift+Tab nawigują, nazwa dostępna „Klient”; widoczny `focus-ring`; cel dotyku 44 px. Zmiana wartości nie przenosi fokusu i nie ogłasza całego bloku (`aria-live` na instrukcji byłby szumem: czytnik czyta nową treść przy nawigacji); ogłaszanie „Skopiowano” zostaje w istniejącym `role="status"`.
- **320 px:** `Select` ma `w-full min-w-0`; blok kodu `break-words`, wielowierszowy JSON nie jest szerszy niż kontener (najdłuższy wiersz to wiersz z adresem URL, łamany `break-words`); przyciski w istniejącym układzie. Weryfikacja: `scrollWidth <= clientWidth` w stories (`Narrow`) i w teście integracyjnym dla każdego z sześciu klientów.
- **Motywy:** wyłącznie tokeny; kontrast sprawdza `test:stories` (axe) w obu motywach; lista `<option>` czytelna w ciemnym motywie (klasy na `<option>`; ręczna kontrola w Chromium i Firefox).

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Zachowanie |
|---|---|
| Bardzo długi origin | `break-words` łamie URL tylko gdy nie mieści się w wierszu; opcje nie są łamane. |
| JS wyłączony / przed hydratacją | panel (i `<select>`) działa natywnie, ale zmiana klienta wymaga JS (stan Reacta); przed hydratacją widać Claude Code. Spójne z przyciskami kopiowania. |
| Zmiana klienta po skopiowaniu | `copy` wraca do `idle`; przycisk pokazuje etykietę kopiowania nowego bloku. |
| Odmowa schowka | zaznaczenie bloku i komunikat strony (bez zmian). |
| Nieznana wartość `select` (np. wstrzyknięta przez rozszerzenie) | `onClientChange` przyjmuje tylko wartości z `AGENT_CLIENTS` (guard typu); inna wartość jest ignorowana. |
| Adres z nieprawidłowym originem | `agentMcpUrl` rzuca błąd jak dotąd (konfiguracja); `JSON.stringify` dodatkowo gwarantuje poprawny JSON. |
| Odświeżenie strony | wybór wraca do Claude Code (R6). |

## 📝 Risks & Impact Review

| Ryzyko | Waga | Mitygacja |
|---|---|---|
| Składnia klienta się zmieni lub nieco odbiega od dokumentacji | średnia | Jedna czysta funkcja z testem dokładnych łańcuchów; źródła i data w specyfikacji; ręczny test z klientami w kroku 8; uwaga w PR, co nie było sprawdzone. |
| Klient mimo braku `401` zażąda OAuth (Codex `auth = oauth`) | niska–średnia | Serwer nie wystawia metadanych OAuth; w razie problemu dopisujemy klientowi jawną wartość (np. `auth` w config.toml) zamiast zmieniać serwer; sprawdzane w kroku 8. |
| Wyciek sekretu | niska | R5: karta nie ma sekretów; test jednostkowy zakazuje `token`, `Authorization`, `Bearer`, `--header` w instrukcjach. |
| Nowy komponent poza tokenami | niska | `check:tokens` w CI; `no-ligatures` jest narzędziem w pliku tokenów. |
| Ligatury nadal widoczne w niektórych czcionkach/przeglądarkach | niska | Sprawdzenie zrzutem w Chromium i Firefox w obu motywach; fallback `calt` (R8). |
| Rozbudowa karty spycha akcje na wąskim ekranie | niska | Panel domyślnie zwinięty (E06-S04 R6); lista to jeden wiersz. |
| Zmiana API komponentu zepsuje inne użycie | niska | Jedyne użycie to `game-room.tsx`; `typecheck` w CI. |

## 📝 Decisions in play

D-28 (gra z własnym agentem, MCP), BR-31, D-29 (bez uwierzytelniania transportu). Brak nowych decyzji produktowych poza R1–R12; R1 (nowy komponent `Select`) i R2 (sześć opcji) to decyzje projektowe do odwrócenia w przeglądzie.

## 📋 Phasing

Jedna historyjka, **jeden PR implementacji** (lekcja „Mało, ale pełnych PR-ów”), wewnętrznie w krokach poniżej.

## 📋 Implementation Plan

1. **core:** `agent-connect.ts` (`AGENT_CLIENTS`, `AgentClient`, `DEFAULT_AGENT_CLIENT`, `agentClientSetup`) + `agent-connect.test.ts` (100%: dokładny łańcuch dla każdego klienta, JSON parsowalny i zawiera adres, brak `token`/`Authorization`/`Bearer`/`--header`, `agentAddCommand` bez zmian); eksport w indeksie wg konwencji pakietu.
2. **ui, tokeny i `Select`:** `@utility no-ligatures` w `game-tokens.css`; `select.tsx` + `select.test.tsx` (`renderToStaticMarkup`: opcje, wartość, powiązanie z `Field`, `aria-*`, brak wbudowanych tekstów); `npm run check:tokens -w @gomoku/ui`.
3. **ui, karta:** zmiany z „Proposed Solution” pkt 3; `agent-connect-card.test.tsx` (wybór klienta, `snippet` wielowierszowy zachowuje tekst, opcje w `whitespace-nowrap` bez zmiany tekstu, brak `break-all`, obecność `no-ligatures`, zakaz słów `token`).
4. **ui, dokumentacja:** `Select` (stories w obu motywach i `Narrow`, MDX), karta (stories: Claude Code, Cursor wielowierszowy, 320 px, zmiana klienta z `play`; długi adres), `design-system.md`, `czego-brakuje.mdx`, `komponenty.mdx`, odsyłacze w `text-input.mdx`/`checkbox.mdx`, `POSTEP.md`. `npm run test:stories -w @gomoku/ui`.
5. **app:** `lib/games/agent-clients.ts` + test; `game-room.tsx` (stan klienta, reset `copy`, propsy) + `game-room.test.tsx` (domyślnie Claude Code, zmiana na każdego z sześciu klientów podmienia blok, kopiowanie kopiuje dokładnie wyświetlony tekst, reset „Skopiowano”, ignorowanie nieznanej wartości).
6. **integracja** (`tests/integration/game-agent-hint-pages.test.ts`; w razie potrzeby pomocnik `select` w `tests/integration/browser.ts`): rozwiń panel, dla każdego klienta wybierz opcję (klawiatura: strzałki na fokusowanym `select`), sprawdź tekst bloku i brak poziomego scrolla przy 320 px w obu motywach; `--transport` renderuje się w jednym wierszu (zakres `Range.getClientRects` obejmujący całe słowo ma jedną linię) i nie jest łamany; `getComputedStyle(blok).fontVariantLigatures === "none"`; kopiowany tekst równa się `textContent` bloku.
7. **zrzuty:** ręcznie `npm run dev`: obie przeglądarki (Chromium, Firefox), oba motywy, 320 px; dwa myślniki widoczne; lista `<option>` czytelna.
8. **ręczny test z klientami (jeśli dostępne na maszynie):** wykonać wyświetlone polecenie/plik i sprawdzić połączenie oraz `join` kodem; wynik opisać w PR (co sprawdzono, czego nie). Do rozstrzygnięcia tu: OAuth w Codex, zapis `add` w Gemini CLI, komendy sprawdzenia z R10.
9. **docs:** `README.md` (akapit przy wskazówce: lista klientów), adnotacja „wdrożona” w tej specyfikacji, przeniesienie do `implemented/`, adnotacja w `implemented/2026-11-01-agent-connect-hint.md` przy R4.
10. **weryfikacja:** `npm run check` (lint → typecheck → test 100% → build → integracja), `npm run check:tokens -w @gomoku/ui`, `npm run test:stories -w @gomoku/ui`.

### Kryteria akceptacji #168 → kroki

- Lista wyboru, domyślnie Claude Code, instrukcja tylko wybranego z kopiowaniem → kroki 1–5, 6.
- Składnia zgodna z dokumentacją, adres `{APP_ORIGIN}/api/mcp` → tabela „Składnia klientów”, kroki 1, 8.
- Dwa myślniki, brak łamania opcji, kopiowany tekst bez zmian → kroki 2–3, 6, 7.
- Klawiatura, czytnik ekranu, focus, 320 px, oba motywy → kroki 2, 4, 6, 7.
- `check:tokens`, `test:stories`, `npm run check` ze 100% pokryciem → kroki 2, 4, 10.

## Adnotacje wdrożenia

- Krok 8 (ręczny test z prawdziwymi klientami) **nie został wykonany**: na maszynie wdrożeniowej nie ma Codexa, Gemini CLI, Copilota ani Cursora. Składnia pochodzi z dokumentacji (tabela „Składnia klientów”); do potwierdzenia: czy Codex nie zażąda OAuth, co dokładnie zapisuje `gemini mcp add`, i komendy sprawdzenia z R10. W panelu sformułowano je ostrożnie dla Gemini CLI, Copilot CLI i Cursora.
- `AgentClientSetup` i strażnik typu `isAgentClient` są w `core` (`agent-connect.ts`); `onClientChange` komponentu przyjmuje `string`, a strona odrzuca nieznane wartości.
- Komunikat po skopiowaniu zależy od rodzaju instrukcji: „Skopiowano polecenie do schowka.” albo „Skopiowano konfigurację do schowka.”.
- Lista wyboru w Storybooku: tytuł „Prymitywy/Lista wyboru”; liczniki komponentów na stronie „Czego brakuje” były już nieaktualne i nie zostały zmienione.
