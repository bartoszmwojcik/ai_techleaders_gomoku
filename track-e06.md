# Śledzenie implementacji Epiku 06 (gra z własnym agentem LLM przez MCP)

- Start: 2026-10-31. Źródła: zgłoszenia #124 (epik), #125, #126, #127 (E06-S01); specyfikacje: `.ai/specs/implemented/2026-10-31-agent-joins-private-game.md` (S01) i `.ai/specs/implemented/2026-10-31-mcp-agent-identity.md` (decyzja D-29, BR-31). Eksperyment właściciela (D-28), bez dowodu popytu (A-04, A-06).
- Zasady pracy: jedna funkcja = jeden PR (kod + testy 100% + scenariusz integracyjny + dokumentacja). Legenda: `[ ]` do zrobienia, `[x]` wykonane.

## Faza 1 — Agent dołącza do partii prywatnej (E06-S01, #127; #125 i #126)

- [x] 1.1 Decyzja Q-09 (D-29, BR-31) zatwierdzona przez właściciela (#138) i specyfikacja S01 (#139)
- [x] 1.2 Krok 0: nazwa konta „Agent” zastrzeżona (`RESERVED_DISPLAY_NAMES`)
- [x] 1.3 `core`: rodzaj `agent`, `PARTICIPANT_JOIN_CHANNELS`, `CreatorKind`, `extractInvitationCode`, `normalizeAgentName`, stałe limitów MCP
- [x] 1.4 Migracja #126 (`agent_token_hash`, `join_channel`, `agent_name`, CHECK-i; `down` odmawia przy wierszach agenta), testy CHECK-ów na PostgreSQL
- [x] 1.5 `db:cleanup`: partie gość–agent jak gość–gość, reguła `agentTokens`
- [x] 1.6 `PARTICIPANT_TOKEN_VALID_SQL`, `findParticipant` po `agentTokenHash`, `players[].agentName` w stanie partii, wspólny rdzeń dołączenia (`join-core.ts`)
- [x] 1.7 `AgentSeatService.join` (kolejność walidacji, pule `agent-lookup:*` i `mcp-join:*`), wyścigi i rollback na PostgreSQL
- [x] 1.8 Rewanż z agentem: `REMATCH_UNAVAILABLE` i podpowiedź w panelu
- [x] 1.9 Spike SDK `@modelcontextprotocol/server` 2.4.0 (werdykt: przyjęta), `POST /api/mcp` (`Origin` 403, 8 KB 413, `GET`/`DELETE` 405, limit adresu), narzędzie `join`, konfiguracja `MCP_*`
- [x] 1.10 Etykieta „Agent” / „Agent · {nazwa} (deklarowane)” w partii, wyniku i historii; stories i MDX (`PartiaPrzeciwnikAgent*`, `PartiaKoniecZAgentem`, `HistoriaZAgentem`)
- [x] 1.11 Testy integracyjne: serwis (PostgreSQL), MCP po HTTP, przeglądarka (1280/360/320 px, oba motywy), sprzątanie, schemat
- [x] 1.12 README, specyfikacje przeniesione do `implemented/` z sekcją „Odstępstwa wdrożenia i dowody”, lekcje

## Faza 2 — Gra do końca przez MCP (E06-S02, #128)

- [ ] 2.1 `get_state` (+ `waitSeconds`, `retryAfterMs`), `play_move` (jednolity błąd, `moveNumber`), limit `mcp-token:*`
- [ ] 2.2 Scenariusz integracyjny pełnej partii przez klienta MCP; test obciążeniowy puli połączeń

## Faza 3 — Licznik wg pary typów (E06-S03, #129) i wskazówka „Jak podłączyć agenta” (E06-S04, #140)

- [ ] 3.1 Licznik zakończonych partii wg pary typów (uwaga: partie gość–agent znikają po 1 h, R10)
- [ ] 3.2 Wskazówka w UI: adres MCP, komenda `claude mcp add --transport http`, kod zaproszenia

## Decyzje i znane ograniczenia po S01

- Limity (`MCP_*`) to wartości początkowe bez danych; do korekty po pierwszych partiach (A-04, A-06).
- Istniejące konto o nazwie „Agent” na produkcji: nie sprawdzono (dev: 0); domyślnie zostaje, rezerwacja działa od teraz.
- `agentName`: odrzucenie niepoprawnej nazwy (nie obcinanie), alfabet łaciński, bez listy wulgaryzmów — odwracalne.
- Utracona odpowiedź `join` = nowa partia z nowym kodem (bez ponowienia).
