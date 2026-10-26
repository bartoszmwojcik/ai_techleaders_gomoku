# Zegar partii: 10 minut na gracza liczone przez serwer i przegrana na czas (E02-S03, #23)

> Status: **szkielet — czeka na odpowiedzi właściciela** (`om-spec-writing`, tryb interaktywny, 2026-10-26). Źródło: zgłoszenie #23, `.ai/specs/product-brief.md` (BR-04, BR-05, BR-06, BR-07, D-03), #21 (`seen_at`, Q20, Q21, `timeoutSettler.settleFor`), #22 (model `games`, `moves`, `moveNumber`, Q8, Q9), mapa ekranów `lekcja-07/mapa-ekranow-partia.md`.

## 📝 TLDR

Po #22 partia ma ruchy, ale nie ma czasu: można ją trzymać bez końca (BR-13 blokuje wtedy obu graczy). Po wdrożeniu (zachowanie przyszłe) każdy gracz ma 10:00, zegar maleje tylko graczowi na ruchu, a wyczerpanie czasu kończy partię jego przegraną (`endReason = timeout`). Serwer jest jedynym źródłem czasu: klient dostaje pozostały czas i tylko go odlicza do wyświetlenia. Wygaśnięcie jest rozstrzygane leniwie, przy najbliższym odczycie lub ruchu, bez zadania w tle.

## Open Questions

- **Q1 — „Mało czasu” (L07).** Od jakiej wartości zegar przechodzi w stan „mało czasu” i czy jest inny sygnał niż kolor i tekst? Propozycja: poniżej 60 s, bez dźwięku, tekst „Mało czasu” dla czytników ekranu (`role="timer"`, bez ogłaszania co sekundę), poniżej 10 s ułamki sekundy nie są pokazywane.
- **Q2 — Opóźnienie sieci i odpytywanie.** Zegar gracza rusza w chwili przyjęcia ruchu przeciwnika przez serwer, a jego ekran dowiaduje się o ruchu do 2 s później (odpytywanie, #22 Q5). Opcje: (a) bez rekompensaty (prosto, kosztuje do 2 s z 600 s), (b) stała rekompensata 2 s na ruch (łamie „10 minut bez przyrostu”, D-03), (c) zegar rusza po pierwszym odczycie przez gracza (podatne na nadużycie). Rekomendacja: (a), z ponownym przeglądem po spike #30 (transport czasu rzeczywistego).
- **Q3 — Rozstrzyganie bez zadania w tle.** Czy akceptujesz, że przegrana na czas jest zapisywana dopiero przy najbliższym odczycie lub ruchu któregokolwiek gracza albo przy `settleFor` (BR-13), a czas zakończenia w historii to moment upływu czasu, nie wykrycia? Alternatywa: zadanie cykliczne (nowa infrastruktura, której repozytorium nie ma). Rekomendacja: tylko leniwie.
- **Q4 — Zakres.** Specyfikacja obejmuje zegar, przegraną na czas i implementację portu `timeoutSettler`. Powrót po rozłączeniu (#24), poddanie i rewanż to osobne specyfikacje. Zgoda?

Rozstrzygnięte wcześniej, nie pytam: zegar pierwszego gracza rusza, gdy obaj mają `seen_at` (#21 Q20, 2026-10-26); czas biegnie przy rozłączeniu (BR-06); limit 10 minut jest stały (D-03); wygrana piątką w tym samym ruchu, w którym czas by się skończył, ma pierwszeństwo (ruch przyjęty przed terminem).

## 📝 Problem Statement

Bez zegara partia nie ma presji (BR-04, BR-05) i nie da się jej zakończyć, gdy gracz odejdzie: oba konta zostają zajęte (BR-13), a rywal nie ma jak wygrać. Zegar musi być odporny na manipulację po stronie klienta (kryterium 4 w #23) i nie może wymagać procesu w tle.

## 📝 Proposed Solution

Do uzupełnienia po odpowiedziach. Kierunek (do weryfikacji w kolejnych krokach): w wierszu `games` przechowywać `clockBlackMs`, `clockWhiteMs` (pozostały czas po ostatnim ruchu) i `turnStartedAt`; pozostały czas gracza na ruchu to `clock − (now − turnStartedAt)`, liczony wyłącznie wstrzykiwanym `clock`. Ruch odejmuje zużyty czas w tej samej transakcji, co zapis planszy z #22.
