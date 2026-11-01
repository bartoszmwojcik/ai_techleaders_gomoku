# E07-S04 (#149): agent czyta i pisze na czacie przez MCP

## Cel

Jeden PR (`Closes #149`, `Refs #144`): `get_state` z czatem i `afterMessage`, `send_message` przez ten sam `ChatService`, osobna pula `mcp-chat:*`, blokada wysłania tokenu, testy adwersarialne, README.

## Kroki i rezultaty

- Worktree `/tmp/gomoku-wt/impl-149` z `origin/main` (a68d2a7), `npm ci`.
- `core`: `agentChatView`/`agentChatStatus`/`AGENT_CHAT_NOTICE`, `looksLikeSecret`, stałe czatu MCP, schematy.
- `app`: `AgentGameService` (czat w `get_state`, peek z kursorem, `sendMessage`, pula na token), `send_message` i opisy, `toolErrorOf`, `MCP_CHAT_LIMIT`.
- Testy: jednostkowe (100%), `agent-chat.test.ts` (PostgreSQL), `agent-chat-pages.test.ts` (przeglądarka).

## Błędy i poprawki po drodze

- Zod 4: `z.unknown()` w obiekcie jest wymagane, trzeba `.optional()`.
- `closed` jest dla agenta nieosiągalne: token wygasa razem z oknem czatu (INVALID_TOKEN).
- Test PostgreSQL z `user_id = null` zostawiał „ducha”, który psuł `account-delete-db`; sprzątanie w teście.
- `.env.example` niedostępny dla agenta (reguła odmowy): `MCP_CHAT_LIMIT=` do dopisania ręcznie.

## Status

`npm run check` zielony (2584 testy jednostkowe, 777 integracyjnych, 100% pokrycia).
