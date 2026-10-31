# Benchmark: czat w partii w grach online (2026-10-31)

- **Data sprawdzenia:** 2026-10-31
- **Autor:** Bartosz Wójcik (sesja `om-discover --refresh`), rozeznanie przygotował agent
- **Pytanie:** czy i jak inne serwisy dają czat między graczami, jak go ograniczają (wyłączenie, poziomy, moderacja, emotki) i jakie ryzyka dotyczą czatu z agentem LLM.
- **Metoda:** przegląd stron i dokumentów w sieci; bez testu w przeglądarce. Wiele źródeł jest słabych (fora, wiki społecznościowe, prasa). „Nie potwierdzono” znaczy, że nie znaleziono wiarygodnego źródła.
- **Zastrzeżenie:** notatka opisuje cudze rozwiązania. Nie wynika z niej, że gracze Gomoku 1:1 online chcą czatu (A-07). Dla pozycji oznaczonych „URL do uzupełnienia” raport rozeznania podawał źródło bez pełnego adresu; przed użyciem jako cytatu trzeba je odtworzyć.

## Źródła

| Serwis / źródło | Co potwierdza | Link | Sprawdzone | Jakość |
|---|---|---|---|---|
| Lichess, Terms of Service | zasady zachowania w czacie; konsekwencje naruszeń | https://lichess.org/terms-of-service | 2026-10-31 | dobra (oficjalne), nie opisuje szczegółów implementacji |
| Lichess, kod `ChatApi.scala` (repozytorium `lichess-org/lila`) | czat jako moduł serwera; limity i filtry w kodzie | repozytorium `lichess-org/lila`, plik `ChatApi.scala` (URL do uzupełnienia) | 2026-10-31 | średnia; wartości limitów **nie potwierdzono** |
| Lichess, wątki forum | ograniczenie czatu anonimów po falach spamu | forum lichess.org (URL do uzupełnienia) | 2026-10-31 | **słabe** (wypowiedzi użytkowników) |
| Chess.com, centrum pomocy | czat w partii z możliwością wyłączenia; poziomy (wszyscy / za prośbą / znajomi / wyłączony) | support.chess.com, artykuły 8609218 i 8614033 (pełny URL do uzupełnienia) | 2026-10-31 | dobra (oficjalne) |
| Board Game Arena, Moderation and grades | moderacja przez wolontariuszy i stopnie | https://en.doc.boardgamearena.com/Moderation_and_grades | 2026-10-31 | średnia; dokument oznaczony jako **deprecated** |
| Colonist | prośby graczy o funkcje czatu | https://colonist.featureupvote.com | 2026-10-31 | **słabe** (głosy użytkowników) |
| PlayOK, Papergames, RenjuNet, Gomocup | brak danych o czacie albo tylko wzmianki (PlayOK: „private messaging” na stronie gomoku, benchmark 2026-10-20) | patrz `research/2026-10-20-benchmark-playok.md`, `…-papergames.md` | 2026-10-31 | **nie potwierdzono** szczegółów |
| Hearthstone (wiki, forum Blizzarda) | komunikacja ograniczona do gotowych emotek | wiki i forum Blizzarda (URL do uzupełnienia) | 2026-10-31 | **słabe** (wiki, forum) |
| Clash Royale, TouchArcade (2016) | emotki zamiast wolnego tekstu | TouchArcade, 2016 (URL do uzupełnienia) | 2026-10-31 | **słabe** (prasa, 2016, nieaktualne) |
| RFC 6202 | wzorce długiego odpytywania / strumieni dla aplikacji czasu rzeczywistego | https://www.rfc-editor.org/rfc/rfc6202 | 2026-10-31 | dobra (norma), dotyczy transportu, nie produktu |
| WHATWG, Server-Sent Events | alternatywa transportu jednokierunkowego | https://html.spec.whatwg.org/multipage/server-sent-events.html | 2026-10-31 | dobra (norma) |
| OWASP LLM01: Prompt Injection | ryzyko wstrzyknięcia poleceń do modelu przez niezaufany tekst; brak metody eliminującej ryzyko w pełni | https://genai.owasp.org/llmrisk/llm01-prompt-injection/ | 2026-10-31 | dobra (ogólne wytyczne), nie o grach |
| Rozporządzenie o usługach cyfrowych (DSA), art. 19 | wyłączenia dla mikro- i małych przedsiębiorstw w obowiązkach platform; wskazówka do sprawdzenia, nie wykładnia | EUR-Lex, rozporządzenie (UE) 2022/2065 (URL do uzupełnienia) | 2026-10-31 | dobra (akt prawny); **nie jest to porada prawna** |

## Wnioski ostrożne (obserwacje cudzych produktów)

- Lichess i Chess.com oferują czat wolnym tekstem z możliwością wyłączenia; Chess.com ma poziomy dostępności. `[BENCHMARK]`
- Hearthstone i Clash Royale ograniczają się do emotek (źródła słabe). `[BENCHMARK]`
- Lichess ograniczał czat anonimów po falach spamu (forum, źródło słabe). `[BENCHMARK]`
- BGA opiera moderację na wolontariuszach (dokument deprecated). `[BENCHMARK]`

## Czego NIE potwierdzono

- Wartości limitów Lichess (długość, częstotliwość).
- Istnienia i działania „quick chat” (gotowych fraz) w tych serwisach.
- Domyślnych ustawień czatu (włączony / wyłączony) w poszczególnych serwisach.
- Polityki retencji czatu (Lichess i inne).
- Źródła z gotowymi frazami w grze planszowej.
- Czy czat jest używany i czy brak czatu odstrasza graczy (żadne źródło tego nie mierzy).
- Danych o czacie w PlayOK, Papergames, RenjuNet i Gomocup poza wzmianką z benchmarku PlayOK.

## Przegląd

Agent sprawdził notatkę sam, bez niezależnego przeglądu; recenzję skeptyka przeszedł szkic zmian w briefie, nie ta notatka.
