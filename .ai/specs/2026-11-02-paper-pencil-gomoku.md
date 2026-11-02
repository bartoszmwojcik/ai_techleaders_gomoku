# Gomoku „papier i ołówek”: wariant z punktami za piątki i zegarem na gracza

> Status: **szkielet — czeka na odpowiedzi na Open Questions** (`om-spec-writing`, tryb interaktywny, 2026-11-02). Właściciel: Bartosz Wójcik. Źródło: prośba właściciela z 2026-11-02 oraz odpowiedzi na cztery pytania wstępne (poniżej). Brief: `.ai/specs/product-brief.md` (kolizje: N-08, BR-10, D-08, BR-04, BR-07, D-03).

## 📝 TLDR

Dziś jest jeden wariant: swobodne gomoku 15×15, piątka kończy partię wygraną, zegar 10 minut na gracza. Po wdrożeniu (zachowanie przyszłe) twórca partii wybierze wariant „papier i ołówek”: bardzo duża plansza, kamień wolno położyć najwyżej 3 pola od istniejącego kamienia, piątka **nie** kończy partii, tylko daje punkt, a partia kończy się upływem czasu jednego z graczy (1, 2, **3 — domyślnie**, 5 minut na gracza); wygrywa wyższy wynik, przy równym jest remis. Klasyczny wariant zostaje bez zmian.

## Rozstrzygnięte wstępnie (właściciel, 2026-11-02)

| # | Pytanie | Decyzja |
|---|---|---|
| R1 | Ograniczenie stawiania | Kamień wolno położyć tylko w odległości **≤ 3 pól** (Chebyshev, także po skosie) od dowolnego istniejącego kamienia. „Przynajmniej 3 pola” rozumiemy jako „co najwyżej 3”. |
| R2 | Gra na czas | **Zegar na gracza** (jak w szachach), czas maleje graczowi na ruchu. |
| R3 | Równy wynik po czasie | **Remis.** |
| R4 | „Nieskończona” plansza | **Duża plansza skończona**, start pośrodku, widok przesuwalny. |

## 📝 Problem Statement

Partia klasyczna kończy się na pierwszej piątce, więc o wyniku często decyduje jedna pomyłka. Wariant „papier i ołówek” (znany z gry w kratkę) nagradza ciągłe tworzenie piątek i grę na czas, a partia ma z góry znaną długość. Brief nie zawiera popytu na ten wariant (A-01: brak danych poza właścicielem); to osąd właściciela, nie wynik badania.

## 📝 Proposed Solution (kierunek, do dopracowania po odpowiedziach)

Wariant jest **atrybutem partii** (`variant`, `timeControlMs`), wybieranym przy tworzeniu i niezmiennym; reguły są osobnym czystym modułem w `core` obok klasycznych. Ruchy wariantu przechowujemy jako listę współrzędnych (nie `bit(225)` ani bajt na ruch), a punkty wylicza się z ruchów i zapisuje na partii. Wynik po czasie rozstrzyga porównanie punktów, nie przegrana właściciela zegara.

Reguły punktacji (do potwierdzenia w Q3–Q5):
- **Piątka** = dokładnie pięć kolejnych kamieni jednego gracza w jednej linii (poziomo, pionowo, 2 przekątne), domykana postawieniem ostatniego kamienia; punkt dostaje gracz, który ją domknął.
- Kamień może należeć do **najwyżej 2 policzonych piątek**, w **różnych kierunkach**.
- Dwie policzone piątki w **tej samej linii** nie mogą dzielić kamienia (nachodzenie „jedna za drugą” jest zabronione) — linia dziesięciu kamieni to 2 punkty, sześciu to 1.

## 📝 Decisions in play

Wariant **koliduje z aktywnymi wpisami briefu**; właścicielem wszystkich jest Bartosz Wójcik, więc to jego decyzja, ale musi zostać zapisana w briefie **przed kodem** (lekcja `2026-10-26-policy-change-starts-with-decision`), z odrzuconymi alternatywami i ryzykami:

| Wpis | Treść | Propozycja |
|---|---|---|
| N-08 | warianty inne niż swobodne gomoku 15×15 poza zakresem | uchylić dla „papier i ołówek” (Renju zostaje poza zakresem) |
| BR-10 / D-08 | swobodne gomoku, wygrana przy 5, plansza 15×15 | zawęzić do wariantu klasycznego |
| BR-04 / D-03 | 10 minut na gracza | zawęzić do wariantu klasycznego; wariant nowy ma 1/2/3/5 |
| BR-07 | wyczerpanie czasu = przegrana właściciela zegara | zawęzić do klasycznego; w nowym wygrywa wyższy wynik |

Zmiana pliku `product-brief.md` wymaga wyraźnej zgody (AGENTS.md) — patrz Q1.

## ⚠️ Open Questions (twarda bramka — spec nie idzie dalej bez odpowiedzi)

- **Q1.** Czy mam zaktualizować `product-brief.md` (uchylić N-08, zawęzić BR-10/D-08/BR-04/BR-07/D-03 do klasyka) w tym samym PR co spec? *(rekomendacja: tak, w PR-ze ze specyfikacją, zatwierdzanym przed kodem)*
- **Q2.** Czy koniec partii następuje **natychmiast, gdy czas któregokolwiek gracza dojdzie do zera**, czy drugi gracz gra dalej do wyczerpania swojego czasu? *(rekomendacja: natychmiast — prosty koniec i brak „dogrywania” bez przeciwnika; minus: czarny ma przewagę pierwszego ruchu, więc przy równym czasie to granica uczciwości)*
- **Q3.** Jak liczyć piątkę, gdy jeden ruch tworzy sześć lub więcej kamieni w linii (okna po 5 nachodzą na siebie)? *(rekomendacja: zawsze maksymalna liczba rozłącznych piątek w tej linii, z oknem najdalej od już policzonych; reguła deterministyczna, bez wyboru gracza)*
- **Q4.** Czy punkt przysługuje graczowi, który **domknął** piątkę, nawet jeśli kamień „wspólny” policzono wcześniej przeciwnikowi? Piątki są jednokolorowe, więc kamienie przeciwnika nie występują — potwierdź, że licznik „2 piątki na kamień” dotyczy tylko własnych kamieni. *(rekomendacja: tak)*
- **Q5.** Pierwszy kamień: czarny stawia **w środku planszy** (wymuszone), a ograniczenie ≤3 pola liczy się od drugiego ruchu? *(rekomendacja: tak)*
- **Q6.** Rozmiar planszy: **101×101** (start w (50,50))? Mieści się w `int16`, ale 10 201 przycisków w siatce wymaga wirtualizacji widoku. *(rekomendacja: 101×101 z widokiem okienkowym ~21×21 przesuwanym; alternatywa: 51×51)*
- **Q7.** Gdzie wybierać wariant i czas: tworzenie przez konto, gość, **lobby** (kto szuka, ten ustawia parametry?), **zaproszenie** (twórca), **rewanż** (kopiuje ustawienia), **agent MCP** (dołącza do partii o zadanych ustawieniach, tools tylko opisują)? *(rekomendacja: twórca zaproszenia wybiera; w lobby szukający deklaruje wariant i czas, a wybierający go akceptuje; rewanż kopiuje; MCP bez zmian kontraktu, tylko szersze opisy i współrzędne)*
- **Q8.** Czy czas 1/2/3/5 minut dotyczy **tylko** nowego wariantu, a klasyk zostaje na stałe 10 minut? *(rekomendacja: tak — D-03 zostaje dla klasyka)*
- **Q9.** Podział na specyfikacje (test „czy każda działa bez drugiej”): (a) silnik wariantu + zapis + ekran partii, (b) wybór wariantu/czasu w lobby, zaproszeniu i rewanżu, (c) MCP. Czy dzielić na fazy w jednym PR-ze funkcji (zgodnie z AGENTS.md, pkt 11), czy wydzielić (c)? *(rekomendacja: jedna funkcja, fazy a→b→c w jednym PR; wydzielić tylko MCP, jeśli rośnie)*
- **Q10.** Historia i statystyki: czy w historii pokazywać wynik punktowy i oznaczać wariant (osobna kolumna/etykieta), a liczniki par (`finished-stats`) rozdzielić po wariancie czy liczyć razem? *(rekomendacja: wynik i etykieta w historii; liczniki razem w v1)*
