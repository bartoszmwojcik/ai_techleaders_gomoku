# SDK MCP waliduje wejście przed narzędziem i odpowiada własnym kształtem

- **Problem:** `McpServer.registerTool` z dokładnym schematem Zod odrzuca zły kształt wejścia (np. `code: 5` albo brak `code`) własnym tekstem „Input validation error…”, zanim dojdzie do naszego kodu — odpowiedź nie ma `structuredContent.error`, a klient dostaje dwa różne kształty błędu.
- **Reguła:** gdy kontrakt wymaga jednego kształtu błędu, rejestruj wejście jako luźne (`z.unknown().optional()`), a typy, limity i `required` wystaw dla klienta przez `.meta({ type, maxLength, … })` (na polu i na obiekcie: `.meta({ required: [...] })`) — JSON Schema w `tools/list` zostaje dokładny, a walidacja i błędy są w serwisie. Sprawdź to w teście `tools/list` i w wywołaniu bez argumentów.
- **Dodatkowo:** `createMcpHandler` z `responseMode: "json"` loguje ostrzeżenie przy każdym żądaniu; domyślny tryb daje ten sam JSON, gdy narzędzie nie wysyła powiadomień.
- **Powiązane:** E06-S01 (#127), `.ai/specs/implemented/2026-10-31-agent-joins-private-game.md`.
