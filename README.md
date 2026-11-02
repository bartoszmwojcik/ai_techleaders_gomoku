# Gomoku

Gomoku 1:1 online: dwóch graczy gra w przeglądarce w czasie rzeczywistym na planszy 15×15, według swobodnych zasad (pięć kamieni w linii wygrywa), z zegarem szachowym 10 minut na gracza. Przeciwnika znajdziesz przez zaproszenie albo w otwartym lobby; możesz też zagrać z własnym agentem AI. Projekt szkoleniowy rozwijany według specyfikacji (SDD) z udziałem agentów AI.

Pełne wymagania produktu: [`.ai/specs/product-brief.md`](.ai/specs/product-brief.md).

![Widok partii na telefonie](docs/img/partia-telefon.png)

## Wypróbuj

Działająca instancja: <https://gomoku.byst.re>. Zagraj jako gość, wchodząc w zaproszenie od znajomego, albo załóż konto i utwórz własną partię.

Żeby zagrać z agentem AI: utwórz partię prywatną, na ekranie partii wybierz swojego klienta (Claude Code, Codex, Gemini CLI, Copilot, Cursor), skopiuj pokazaną instrukcję podłączenia serwera MCP i poproś agenta o dołączenie kodem partii.

## Co potrafi aplikacja

**Konto i gra bez konta**

- Rejestracja (e-mail, nazwa gracza, hasło), logowanie, wylogowanie, potwierdzenie adresu e-mail linkiem i reset hasła.
- Zmiana hasła po zalogowaniu oraz usunięcie konta (partie zostają zanonimizowane; usunięcie jest niemożliwe w trakcie aktywnej partii).
- Gość bez konta może zagrać wyłącznie przez zaproszenie: podaje nick i tworzy albo przyjmuje partię.

**Znalezienie przeciwnika**

- Zaproszenie konkretnej osoby linkiem lub kodem.
- Otwarte lobby: oznaczasz się jako „szukam gry” (status wygasa po 5 minutach) i wybierasz przeciwnika z listy szukających.

**Rozgrywka**

- Plansza 15×15, swobodne gomoku (bez ograniczeń renju): wygrywa pięć w linii, pełna plansza to remis.
- Zegar 10 minut na gracza, działa jak zegar szachowy; partia kończy się też przekroczeniem czasu lub poddaniem.
- Po rozłączeniu możesz wrócić do partii, a zegar się nie zatrzymuje.
- Gra na komputerze i telefonie. Na telefonie kamień stawia się przyciskiem „Postaw kamień” po wybraniu pola.
- Jasny i ciemny motyw.

**Czat w partii**

- Wolny tekst dla konta, gościa i agenta (do 200 znaków, bez linków, z limitem częstotliwości).
- Każdy uczestnik może wyłączyć czat dla siebie. Wiadomości widzą tylko uczestnicy; są usuwane ok. godziny po zakończeniu partii.

**Agent AI jako przeciwnik**

- Tworzysz partię prywatną, a własny agent (np. Claude Code, Codex, Gemini CLI, Copilot, Cursor) dołącza do niej przez serwer MCP kodem lub linkiem. Instrukcje podłączenia pokazuje aplikacja.
- Agent czyta stan planszy i zegarów, wykonuje ruchy i pisze na czacie.

**Historia**

- Zalogowany gracz widzi na stronie „Historia” swoje zakończone partie: przeciwnika, wynik i sposób zakończenia.

## Struktura repozytorium

Monorepo (npm workspaces), kod w `packages/`:

- `app`: aplikacja Next.js (strony, API, serwer MCP),
- `core`: logika domenowa, w tym zasady gry,
- `db`: MikroORM, encje i migracje PostgreSQL,
- `ui`: komponenty interfejsu i design system graczy.

## Instalacja dla kontrybutora

Wymagania: Node.js ≥ 22.17 oraz Docker (PostgreSQL 17 uruchamiany przez `docker compose`; może być też własna instancja).

```bash
git clone https://github.com/bartoszmwojcik/ai_techleaders_gomoku.git
cd ai_techleaders_gomoku
npm run setup      # przygotowuje środowisko (można powtarzać)
npm run dev        # http://localhost:3000
```

`npm run setup` sprawdza wersję Node.js, instaluje zależności, tworzy `.env.local` z `.env.example`, uruchamia lokalny PostgreSQL w Dockerze, jeśli baza nie odpowiada, i stosuje migracje. Każdy krok pomija się, gdy jest już wykonany, a istniejący `.env.local` nigdy nie jest nadpisywany.

Przed zgłoszeniem zmian uruchom pełną kontrolę (wymaga Dockera; Chrome do testów integracyjnych doinstaluje `npm run setup -- --with-browser`):

```bash
npm run check      # lint, typecheck, testy jednostkowe (100% pokrycia), build, testy integracyjne
```

Zasady pracy (stack, granice pakietów, testy, proces PR) opisuje [`AGENTS.md`](AGENTS.md).

## Dokumentacja szczegółowa

- [Praca nad projektem](docs/rozwoj.md): instalacja ręczna, zmienne środowiskowe, komendy, testy i CI.
- [Architektura](docs/architektura.md): stack, pakiety, szczegóły działania aplikacji.
- [Wdrożenie i utrzymanie](docs/wdrozenie-i-utrzymanie.md): mikr.us, kopie zapasowe, sprzątanie rekordów.

## Licencja

[MIT](LICENSE), © 2026 Bartosz Wójcik.
