# Design system: ukryty element siatki przesuwa komórki, a scalanie klas gubi własne tokeny

**Problem.** (1) Plansza w `packages/ui` miała kolumnę współrzędnych ukrytą na telefonie przez `display: none`. W CSS Grid ukryty element znika z układu, więc w każdym wierszu wszystkie komórki przesunęły się o jedną kolumnę, a plansza na 320 px wyglądała na zepsutą. Testy jednostkowe i dostępności przeszły; zauważyłem to dopiero na zrzucie ekranu. (2) `cn` (scalanie klas Tailwinda) po cichu usuwało `text-body`, gdy obok stał kolor tekstu (`text-action-primary-text`): nie znało nazw własnych tokenów rozmiaru.

**Kontekst.** Vitest w trybie przeglądarkowym z dodatkiem Storybooka ma stałą szerokość okna (1200 px); opcja `browser.viewport` i `page.viewport()` nie zmieniły szerokości iframe'a stories. Test „na telefonie” oparty o rozmiar okna nic więc nie sprawdzał.

**Reguła.**
- Element siatki, którego kolumna ma zostać, ukrywaj wymiarami (`w-0 h-0 overflow-hidden`), nie `display: none`.
- Układ responsywny komponentów rób zapytaniami o kontener (`@container`, `@md:`), a nie o okno. Wtedy wąska ramka w story (`Narrow`, 320 px) naprawdę wymusza układ telefonu i można go sprawdzić w `play` (pozycje komórek, kwadratowość).
- Nowy test układu najpierw uruchom na zepsutej wersji (musi się wywrócić), potem na poprawnej.
- Komponenty z własnymi klasami tokenów scalaj przez `src/game/cn.ts` (zna nazwy rozmiarów, wag, promieni i cieni), nie przez gołe `cn`.
- Zrzut ekranu każdego nowego komponentu przy 320 px jest częścią weryfikacji; zielone testy go nie zastępują.

Powiązane: `packages/ui/POSTEP.md` (etap 2 i 3).
