# Partia z agentem (MCP) też może być publiczna (E10-S06, #212)

> Status: **wdrożona 2026-11-02** (specyfikacja zatwierdzona autonomicznie na mocy delegacji właściciela; właściciel może ją nadpisać). Źródło: zgłoszenie #212, epik #201, `.ai/specs/product-brief.md` (D-33, D-28, BR-39…BR-41, BR-40).

## 📝 TLDR

Twórca partii z agentem używa tego samego zaproszenia co przy człowieku: zaznacza „Partia publiczna” (E10-S01), przekazuje kod agentowi, a agent dołącza narzędziem `join`. Po zajęciu drugiego miejsca partia jest oglądalna jak każda publiczna (E10-S02…S04). Ta historia **nie zmienia kodu produkcyjnego** — potwierdza i zamyka to testami: nic w ścieżce agenta (`join`, `get_state`, `play_move`, `send_message`) nie blokuje publiczności, a widz nie dostaje tokenu agenta i nie jest uczestnikiem MCP.

## Resolved assumptions (autonomous defaults)

1. **Brak osobnego pola formularza.** Zgłoszenie „twórca zaznacza publiczność przy tworzeniu partii z agentem” jest spełnione przez istniejące pole „Partia publiczna” zaproszenia — partia z agentem to zaproszenie, do którego dołącza agent (BR-30), nie osobny rodzaj tworzenia.
2. **Narzędzia MCP bez zmian** (poza zakresem zgłoszenia). `get_state` **nie** dostaje pola `public` ani licznika widzów: agent nie ma z nich pożytku, a każde nowe pole to kontrakt do utrzymania. Test pilnuje, że stan agenta nie zawiera słów „public”/„spectator”.
3. **Wiadomości widzów** trafiają do pola `chat` agenta już jako `from: "spectator"`, `untrusted: true` (E10-S03) — test integracyjny to utrwala.
4. **Widz nie ma drogi do MCP:** jego ciasteczko to nie token agenta (`INVALID_TOKEN`); w `game_players` zostają dokładnie dwa wiersze.
5. **Widok widza** zawiera deklarowaną nazwę modelu agenta (jak w partii człowiek–agent dla gracza), nigdy tokenu ani kodu zaproszenia.

## 📝 API / Data Model

Bez zmian (kolumna `games.is_public` z E10-S01, trasy widza z E10-S02/S03).

## 📝 Edge Cases

| Sytuacja | Zachowanie |
| --- | --- |
| Partia z agentem bez zaznaczenia | prywatna, kod nie wpuszcza widza (`410`) |
| Agent gra, widz ogląda | ruchy agenta widoczne dla widza, zegar jak dotąd |
| Widz próbuje własnym ciasteczkiem/tokenem MCP | `INVALID_TOKEN` |
| Kill-switch (E10-S05) | działa jak w każdej partii; token agenta niezależny |

## 📝 Risks

Niskie: brak zmian w kodzie. Ryzyko A-13/A-14 (nękanie, prywatność) dotyczy czatu widzów — agent traktuje jego treść jak dane niezaufane (`untrusted`).

## Acceptance criteria

- [x] Twórca zaznacza publiczność przy partii, do której dołącza agent → partia publiczna (BR-40).
- [x] `join`, `get_state`, `play_move` działają jak w partii prywatnej; agent gra, gdy widz ogląda.
- [x] Widz nie widzi tokenu agenta i nie jest uczestnikiem MCP (przypadek negatywny).
- [x] Partia z agentem bez zaznaczenia pozostaje prywatna (regresja).

## Adnotacje po wdrożeniu

- Dodany `tests/integration/agent-public-game.test.ts`; brak zmian w kodzie produkcyjnym, więc próg pokrycia bez zmian.
