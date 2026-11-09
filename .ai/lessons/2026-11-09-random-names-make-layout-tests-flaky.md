# Losowe nazwy w teście układu dają niestabilny wynik

**Problem.** `tests/integration/game-paper-ui.test.ts` padał na `main` w około 40% przebiegów: przycisk „Postaw …” przy 320 px wychodził 55 px poza okno zamiast ~34 px (#249).

**Przyczyna.** Nazwa przeciwnika `Paper_${Date.now().toString(36)}${n}` ma stałą liczbę znaków, ale litery są losowe, a czcionka proporcjonalna. Szerokie litery (`m`, `w`, `q`, `g`, `x`) zawijały wiersz zegara przeciwnika („· punkty: 0” w drugiej linii, +21 px), wąskie — nie. Pomiar nie zależał od CI, tylko od czasu rejestracji.

**Jak ustalono.** Zrzut pozycji i wysokości elementów `main` w przebiegu czerwonym i zielonym: jedyna różnica to wysokość `score-theirs` (37 vs 16 px).

**Reguła.** Test mierzący układ (pozycja, wysokość, zawijanie) używa stałych tekstów — nazwy, liczby, daty — a unikalność danych zapewnia polem, które nie jest wyświetlane (e-mail). Przy niestabilnym pomiarze układu porównaj zrzut wymiarów elementów z obu wyników, zanim ruszysz próg.

Powiązane: #249, [Dodany element wypchnął przycisk poza viewport testów](2026-10-31-integration-click-needs-scroll-into-view.md).
