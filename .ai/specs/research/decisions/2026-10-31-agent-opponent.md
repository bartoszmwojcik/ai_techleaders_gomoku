# Decyzje: gra z własnym agentem LLM (2026-10-31)

- **Właściciel:** Bartosz Wójcik. **Charakter:** osąd właściciela, **nie wynik badania**. Podstawą są wyłącznie jego wypowiedzi w sesji `om-discover --refresh` (tryb own); nie opisał własnego doświadczenia z agentem w grze, nie ma wywiadów z graczami ani danych użycia.
- **Źródła:** rozmowa z 2026-10-31; recenzja skeptyka (fresh context); `product-brief.md` (N-06, BR-22, BR-29, BR-04, D-05, D-27, A-01).

## Pomysł właściciela

„Jako user zalogowany, albo nie, chcę zagrać ze swoim agentem LLM. Agent musi mieć dostęp przez MCP albo CLI, potem dostaje zaproszenie przez link albo kod. Agent nie ma historii, jest jak gość.”

## Pytania i odpowiedzi

| Pytanie | Odpowiedź właściciela |
|---|---|
| Skąd pomysł (ostatni raz, gdy grałeś z agentem)? | Bez opowieści. Uzasadnienie: przeciwnik syntetyczny jest opcją do szybkiego poznania gry przez osoby, które jej nie znają. |
| Dla kogo funkcja? | Dla szerszej liczby graczy; przy małej społeczności to dobra opcja. |
| Interfejs agenta | Serwer MCP jako jedyny interfejs na start („ok” na rekomendację: narzędzia `join(kod)`, `get_state()`, `play_move(x,y)`). |
| Wariant (a) agent własnego gracza, (b) przeciwnik hostowany, (c) a teraz, b później | **1a** — agent własnego gracza. |
| Partie prywatne, agent jako gość oznaczony „Agent”? | Tak. |
| Jaki sygnał uznasz za „działa”? | Licznik rozegranych gier w ogóle: ilu graczy zalogowanych, ilu bez logowania, ile agentów. Próg nieustalony. |
| Po co funkcja, skoro prywatna partia nie uczy gry ani nie zwiększa puli partii (uwaga skeptyka)? | „Chcę zobaczyć, jak agent gra.” |
| Agent jako osobny typ uczestnika z własnym tokenem (a nie zwykły gość z ciasteczkiem)? | Tak. |
| Zegar 10 minut bez wyjątku, `get_state()` zwraca oba zegary i wynik? | Tak. |
| Potwierdzenie końcowego zestawu zmian w briefie | „potwierdzam”. |

## Decyzje

| ID | Decyzja | Nadpisuje |
|---|---|---|
| N-10 | Poza zakresem zostaje przeciwnik AI hostowany przez nas (bot lub silnik, koszt modelu po naszej stronie). Agent uruchamiany przez samego gracza nie podlega temu non-goalowi. | N-06 |
| D-28 | Gra człowieka (konto albo gość) z własnym agentem przez MCP; partie prywatne; agent dołącza kodem lub linkiem jako osobny typ uczestnika „Agent”; MCP jedynym interfejsem na start. | N-06 |
| BR-30 | Agent: osobny typ uczestnika z własnym tokenem, tylko partie prywatne utworzone przez człowieka, bez zaproszeń, lobby, historii i konta; etykieta „Agent” (wyjątek od zasady nazwy w BR-29); ten sam zegar 10 minut; „agent” w statystyce = dołączył przez MCP, nie dowód, że to LLM. | — (uzupełnia BR-29) |
| Licznik | Zakończone partie wg pary typów uczestników (konto, gość, agent); decyzja o pomiarze, nie wynik; próg „ma sens” nieustalony (Q-06). | — |
| A-04…A-06, Q-09 | Ryzykowne założenia i bloker specyfikacji MCP (tożsamość klienta, token, limity nadużyć). | — |

## Odrzucone lub odłożone alternatywy

- **Przeciwnik hostowany przez nas (b):** otwiera N-06; koszt modelu i kluczy po naszej stronie albo osobny silnik bez LLM. Odłożony do czasu zobaczenia licznika.
- **CLI zamiast lub obok MCP:** odłożone; MCP ma gotowe klienty agentów, a istniejące API wystarcza.
- **Agent w lobby, widoczny dla obcych:** odrzucone; partie wyłącznie prywatne.
- **Agent jako zwykły gość z ciasteczkiem (BR-29):** klient MCP nie ma przeglądarki; licznik musi go odróżniać.
- **Inny zegar dla agenta:** odrzucone; ten sam zegar, ryzyko przegranej na czasie przyjęte (A-06).
- **Nie budować nic:** funkcja opiera się tylko na ciekawości właściciela; zakres jest wąski (jedna ścieżka), więc koszt przyjęto.

## Przyjęte ryzyka (właściciel: Bartosz Wójcik)

- Funkcja może nie być używana przez nikogo poza właścicielem (A-04); wtedy zostaje demo.
- Wariant nie adresuje nauki gry przez początkujących (A-05); osoba bez znajomości gry zwykle nie ma własnego agenta z MCP.
- Wolny model może przegrać na czasie pod zegarem 10 minut (A-06); koszt tokenów po stronie gracza jest założeniem agenta, nie ustaleniem.
- Licznik „agent” mierzy kanał (MCP), nie to, czy po drugiej stronie jest LLM.

## Uwaga o procesie

Pierwsza wersja szkicu i recenzji skeptyka powstała z nieaktualnej lokalnej kopii briefu (21 commitów za `origin/main`); błędne wnioski o „nieaktualnym briefie” zostały skorygowane po sprawdzeniu `origin/main` (patrz lekcja `2026-10-31-fetch-before-reading-brief.md`).
