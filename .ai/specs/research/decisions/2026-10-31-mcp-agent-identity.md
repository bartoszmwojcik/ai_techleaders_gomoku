# Decyzje: tożsamość, token i limity klienta MCP (Q-09), 2026-10-31

- **Właściciel:** Bartosz Wójcik. **Charakter:** osąd właściciela, **nie wynik badania**; wartości limitów są początkowe i nie mają oparcia w danych (A-04, A-06).
- **Źródła:** specyfikacja decyzyjna `.ai/specs/implemented/2026-10-31-mcp-agent-identity.md` (PR #138, zgłoszenie #125), specyfikacja S01 `.ai/specs/implemented/2026-10-31-agent-joins-private-game.md` (PR #139, zgłoszenie #127), `research/decisions/2026-10-31-agent-opponent.md` (D-28, BR-30), odpowiedzi właściciela z 2026-10-31.
- **Decyzje w briefie:** D-29 (nowa), BR-31 (nadpisuje BR-30), Q-09 → closed.

## Pytania i odpowiedzi

| Pytanie | Rekomendacja szkicu | Odpowiedź właściciela |
|---|---|---|
| Q1. Tożsamość klienta MCP | Osobny rodzaj uczestnika `agent`, kolumna `agent_token_hash`, `join_channel = 'mcp'` | Potwierdzone |
| Q2. Skąd agent bierze token | Z odpowiedzi `join(kod)`, pokazany raz, 32 B CSPRNG, w bazie SHA-256; bez OAuth | Potwierdzone |
| Q3. Ważność, odwołanie, rotacja | Do końca partii + 1 h, bez rotacji i ponownego wydania | Potwierdzone; utrata odpowiedzi `join` bez ponowienia przyjęta (R11 w #139) |
| Q4. Transport | Zdalny Streamable HTTP `POST /api/mcp` w Next.js | Potwierdzone |
| Q5. Limity | Token 60/min, adres 300/min, dołączenia 10/h na adres, ciało ≤ 8 KB | Potwierdzone jako **wartości początkowe, konfigurowalne**; osobna pula błędnych kodów zaproszeń dla agenta (R3 z #139) |
| Q6. Długie odpytywanie | `waitSeconds` 0–25 | Potwierdzone (jako wartość początkowa) |
| Q7–Q9 | `get_state` bez nazw, brak rewanżu z agentem, brak `resign` w v1; uprawnienia tylko `join`, `get_state`, `play_move` | Potwierdzone |
| Q11. Zakres S01 | Jedna specyfikacja, jeden PR implementacji, fazy | Przyjęte |
| Q12. Pakiet MCP | `@modelcontextprotocol/server` 2.x | Warunkowo: spike sprawdza API, licencję i utrzymanie; przy porażce ręczna obsługa JSON-RPC bez SDK |
| Rezerwacja nazwy konta „Agent” | (R9 w #139: bez zmian w rejestracji) | **Zarezerwować** przy rejestracji (walidacja, bez rozróżniania wielkości liter i białych znaków wokół); krok z testami w zakresie #139/#126 |
| Wskazówka „Jak podłączyć agenta” w UI | Poza zakresem | Osobne zgłoszenie #140 |

## Nowe wymagania właściciela (2026-10-31)

1. **Deklarowana nazwa modelu.** Agent może przedstawić się nazwą swojego modelu LLM (np. „claude opus 5.5”) w opcjonalnym parametrze `agentName` narzędzia `join`. Jest to tekst niezweryfikowany. Wyświetlany człowiekowi jako „Agent · {nazwa} (deklarowane)”, zawsze jako zwykły tekst, nigdy zaufany w logach, nigdy nie wraca do agenta. Zmienia sformułowanie „brak nazw dla agenta” (Q7/BR-30) na „opcjonalna deklarowana nazwa modelu” dla kierunku agent → człowiek. Dopuszczalne pomocnicze zestawienie partii wg deklarowanej nazwy w liczniku (#129), nie jako dowód.
2. **Błąd `play_move`.** Jednolity kształt błędu MCP (`isError`, kod, bez danych wewnętrznych); błąd nie zmienia stanu partii ani zegarów.

## Rozważone i odrzucone alternatywy

- **Agent jako zwykły gość z ciasteczkiem:** ciasteczko i token MCP uwierzytelniałyby się wzajemnie; licznik nie rozróżniałby agenta. Odrzucone.
- **Agent z kontem technicznym:** łamie BR-30. Odrzucone.
- **Klucz agenta wystawiany przez człowieka w UI (`Authorization: Bearer`):** lepsza higiena sekretu, ale nowy stan i UI oraz niezgodność z D-28 (kod lub link). Możliwe później.
- **Pełny OAuth 2.1:** przerost; nie mamy kont agentów. Odrzucone.
- **Token wyprowadzany z kodu zaproszenia (ponowne wydanie):** każdy znający kod przejąłby miejsce. Odrzucone.
- **Lokalny stdio / CLI:** pakiety są prywatne, gracz musiałby klonować repozytorium; odłożone (E05).
- **Wspólna pula błędnych kodów z przeglądarką:** klient automatyczny mógłby wyczerpać pulę człowiekowi z tego samego adresu. Odrzucone na rzecz osobnej puli.
- **`agentName`: „obetnij do bezpiecznego” zamiast odrzucenia:** ciche czyszczenie zmienia znaczenie i ukrywa błąd przed agentem. Wybrano odrzucenie (kod zaproszenia nie jest wtedy zużywany); zmiana odwracalna.
- **Weryfikacja nazwy modelu:** niewykonalna po stronie serwera; dlatego oznaczenie „(deklarowane)”.

## Przyjęte ryzyka (właściciel: Bartosz Wójcik)

- Zgubiony token lub utracona odpowiedź `join` = utrata miejsca; zegar biegnie (R11).
- Token przechodzi przez kontekst LLM i logi klienta; zasięg ograniczony do jednej partii i do końca + 1 h.
- Wartości limitów są wymyślone bez danych; korekta po pierwszych partiach.
- Deklarowana nazwa modelu może być nieprawdziwa lub nieprzyjazna; środki: ścisła walidacja, oznaczenie „(deklarowane)”, brak powierzchni publicznej. Brak listy wulgaryzmów w v1.
- Funkcja opiera się na A-04 (brak dowodu popytu) i A-06 (zegar 10 min a czas modelu).
