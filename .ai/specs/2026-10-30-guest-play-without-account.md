# Gra bez rejestracji i logowania: gość tworzy i przyjmuje zaproszenie, podaje nick

> Status: **szkic — czeka na odpowiedzi na Open Questions** (`om-spec-writing`, tryb interaktywny, 2026-10-30). Źródło: żądanie właściciela z 2026-10-30. Zmienia (po zatwierdzeniu): BR-22, BR-24, L14 z `.ai/specs/product-brief.md`; #21 (`.ai/specs/2026-10-24-game-invitations.md`, Q7, Q10, Q11, Q19, `POST /api/games` wymaga sesji), #88 (rewanż gościa), #87 (poddanie gościa).

## 📝 TLDR

Dziś partię tworzy tylko zalogowany użytkownik, a gość (bez konta) może wyłącznie przyjąć zaproszenie; nie ma nazwy, dla przeciwnika jest „Gość” / „Zaproszony przez link”. Po wdrożeniu (zachowanie przyszłe) osoba niezalogowana może **sama utworzyć zaproszenie** (kod/link) oraz **przyjąć** cudze, i w obu przypadkach przed wejściem do partii **podaje nick albo zatwierdza proponowaną nazwę** („Gracz białymi” / „Gracz czarnymi”). Nadal wyłącznie przez zaproszenie kodem lub linkiem: gość nie wchodzi do lobby i nie ma konta ani historii.

## 📝 Problem Statement

Konto (e-mail, nazwa, hasło) to próg wejścia dla osoby, która chce tylko zagrać ze znajomym; zaproszony znajomy już dziś gra bez konta (BR-22), ale **zapraszający musi mieć konto**. Gracz bez konta nie zagra więc ze znajomym, który też konta nie ma, a gość nie ma imienia, więc przeciwnik widzi bezosobowe „Gość”. Dowód popytu: brak (A-01, decyzja właściciela, nie badanie); benchmarki: papergames.io i PlayOK oferują grę jako gość `[BENCHMARK]`.

## 📝 Proposed Solution (kierunek, do potwierdzenia pytaniami niżej)

- **Gość tworzy zaproszenie:** `POST /api/games` przyjmuje też gościa; tożsamość to token jednej przeglądarki (jak dziś u dołączającego gościa, #21 Q10), hash w `game_players.guest_token_hash`.
- **Nick:** nowe pole nazwy uczestnika (dla gościa podane przy wejściu, dla konta — nazwa konta); domyślna propozycja, którą gość zatwierdza jednym kliknięciem, albo własny nick.
- **Zachowane:** gra wyłącznie z kodu/linku (jeden link = jedna partia, BR-11), brak lobby i historii dla gościa, BR-13 (jedna aktywna partia), ostrzeżenie „nie zmieniaj przeglądarki w trakcie partii”.
- **Alternatywy odrzucone na wstępie:** konto-widmo w `users` dla gościa (zanieczyszcza unikalne indeksy, #21 „odrzucone”), sesja gościa w tabeli `sessions` (inny cykl życia).

## ❓ Open Questions (blokują projekt; odpowiedz „zgoda na rekomendacje” albo podaj numery)

- **Q1.** „Gracz białymi” / „Gracz czarnymi”: kolory są **losowane przy dołączeniu drugiego gracza** (#22), więc w chwili podawania nicku nie wiadomo, kto jaki ma kolor. Co znaczą te propozycje? (a) zwykłe domyślne nazwy po kolejności wejścia (pierwszy: „Gracz białymi”, drugi: „Gracz czarnymi”) niezależnie od faktycznego koloru — **ryzyko: nazwa może kłamać**; (b) twórca zaproszenia **wybiera swój kolor** (zamiast losowania), a domyślna nazwa wynika z wyboru; (c) domyślne „Gracz 1” / „Gracz 2”, a kolory zostają losowane. **Rekomendacja: (c)** albo (b), jeśli chcesz wybór koloru (to zmiana #22 Q-losowanie).
- **Q2.** Reguły nicku: długość i znaki, unikalność? **Rekomendacja:** 1–24 znaki (litery, cyfry, spacje, `_` `-`), przycinanie białych znaków, **bez unikalności** (to nie konto), bez filtra wulgaryzmów; puste = zatwierdzenie propozycji.
- **Q3.** Jak widzi gościa przeciwnik i historia konta? Dziś „Gość” / „Zaproszony przez link” (L14, BR-24). **Rekomendacja:** „{nick} (gość)” w partii i w historii konta (E04), żeby gość nie udawał konta o tej samej nazwie.
- **Q4.** Czy dwie osoby **bez kont** mogą zagrać ze sobą (twórca-gość + dołączający-gość)? Dziś jeden z graczy musi mieć konto. **Rekomendacja: tak** (to sens zmiany); partia nie trafia do żadnej historii (BR-24).
- **Q5.** Ochrona przed nadużyciem tworzenia partii przez niezalogowanych (dziś limit 10/godz. dla konta, #21 Q-limit): ile dla gościa? **Rekomendacja:** limit na **adres klienta** (np. 10/godz., jak dla konta) i na **token przeglądarki** (np. 3 oczekujące naraz zredukowane przez Q7), bez CAPTCHA w MVP.
- **Q6.** Ważność ciasteczka twórcy-gościa przy oczekującej partii: zaproszenie żyje 24 h, a ciasteczko gościa ma dziś 2 h (odświeżane przy odczycie). **Rekomendacja:** ciasteczko twórcy ważne do wygaśnięcia zaproszenia (24 h), potem jak u dołączającego (do końca partii + 1 h); utrata ciasteczka = utrata partii (ostrzeżenie przed utworzeniem).
- **Q7.** Jedna aktywna lub oczekująca partia na **przeglądarkę** (BR-13 dla gości przez token): twórca-gość z oczekującą partią nie utworzy drugiej ani nie dołączy do innej bez anulowania. **Rekomendacja: tak**, jak dla kont (#21 Q7, `cancelOwnWaitingGame`).
- **Q8.** Zakres i podział: (a) **jedna specyfikacja** (gość tworzy + nick + przepływy), (b) dwie: najpierw „nick uczestnika” (dotyczy też dzisiejszych gości dołączających), potem „gość tworzy partię”. **Rekomendacja: (b)** — nick jest wdrażalny sam i ułatwia przegląd; ale to dwa PR-y zamiast jednego.

## 📝 Wpływ na istniejące decyzje (do zatwierdzenia przez właściciela)

- **BR-22** (gość nie tworzy zaproszeń, nie ma nazwy) — **zastępowana**; **BR-24 / L14** („Zaproszony przez link”, „Gość”) — zastępowane przez Q3.
- **Bez zmian:** BR-11 (jeden link = jedna partia), BR-13, BR-17/BR-21 (usunięcie konta), E01 (gość z aktywną partią nie zaloguje się ani nie zarejestruje), brak przejęcia partii gościa przez założone później konto.
- Dotknięte specyfikacje i artefakty: #21, #88 (rewanż gościa z nickiem), #87, mapa ekranów `lekcja-07/mapa-ekranow-partia.md` (p01, p02, s07 + nowy krok „nick”), prototyp `prototypes/partia-z-zaproszenia`, `track-e02.md`, zgłoszenia #21/#87/#88.

## 📋 Dalsze sekcje

Architektura, model danych (kolumna nazwy uczestnika, migracja), kontrakty API, UI/UX, przypadki brzegowe, ryzyka, fazowanie i plan implementacji powstaną **po odpowiedziach** (krok 4 workflow).
