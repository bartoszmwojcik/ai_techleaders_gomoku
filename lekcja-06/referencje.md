# Referencje: Gomoku 1:1 online

Data: 2026-10-25. Referencje wybrał: Bartosz Wójcik (właściciel produktu). Obserwacje i propozycje: agent; propozycje przyjęte przez właściciela 2026-10-25.

**Słowa charakteru (potwierdzone):** oszczędny, czytelny, ciepły (drewniany), spokojny, rzeczowy.

**Antycharakter (potwierdzony):** pstrokaty, niskokontrastowy, retro-pikselowy, techniczny (dokumentacyjny), generyczny.

Produkt i użytkownicy: gra w gomoku 1:1 online, gracze (znajomi właściciela i, w planach, gracze zewnętrzni), komputer i telefon (BR-20). Brief: `.ai/specs/product-brief.md`. Brief nie zawiera badań z graczami, więc uzasadnienia „dlaczego pasuje” opierają się na briefie i słowach właściciela.

## Referencje

Obserwacje powstały ze zrzutów w sekcji „Obrazy”. Wartości kolorów i rozmiarów przy R01 zmierzone w przeglądarce; przy R02 i A01 opisane na oko ze zrzutu (bez pomiaru).

| # | Referencja | Źródło | Kto wybrał | Obserwacja | Bierzemy | Nie bierzemy | Robimy zamiast tego | Dlaczego pasuje do produktu | Rodzina | Waga | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R01.1 | Obecna strona główna | http://localhost:3000/ | Bartosz Wójcik | Jednolite, ciepłe, prawie czarne tło (`#1c1917`) na całym ekranie | Ciemne tło | — | — | Gra planszowa na ciemnym tle skupia wzrok na planszy; wybór właściciela. Brak badań graczy. | kolor | mocno przekonany | przyjęte |
| R01.2 | j.w. | j.w. | j.w. | Duży (48 px) biały tytuł „Gomoku”, dwa zdania opisu (18 px, jasnoszary), jedna linia meta (14 px, ciemniejsza szarość); trzy poziomy tekstu, brak ozdobników | Oszczędność: tytuł plus krótki opis, nic więcej (wzór: „skandynawska oszczędność”) | — | — | Pasuje do charakteru „oszczędny”; brief nie opisuje gęstości ekranów, więc to wybór właściciela, nie badań. | kompozycja i gęstość | mocno przekonany | przyjęte |
| R01.3 | j.w. | j.w. | j.w. | Plansza 15×15 po prawej, kwadrat, siatka cienkich linii, sześć kamieni (trzy czarne, trzy białe) w środku | Plansza z przykładowym początkiem partii jako element rozpoznawczy | — | Podpis „przykładowa pozycja” i opis dla czytnika ekranu, żeby nie wyglądała na prawdziwą partię (propozycja z audytu, przyjęta) | „Pokazuje, o jaką grę chodzi” (słowa właściciela). | komponenty | mocno przekonany | przyjęte |
| R01.4 | j.w. | j.w. | j.w. | Jednolity kolor planszy `#dcb35c`, linie `#6b4a1b` | Drewniany kolor planszy | — | — | Skojarzenie z drewnianą planszą do gomoku. | kolor | mocno przekonany | przyjęte |
| R01.5 | j.w. | j.w. | j.w. | Plansza bez żadnej faktury, płaski kolor | — | Płaski kolor planszy bez tekstury drewna | Wyraźna, ale nie przesadna tekstura słojów, rysowana w kodzie (bez obrazu). Interpretacja słów „tak jak jest łatwiej i lepiej wygląda” — do potwierdzenia | Plansza ma wyglądać na drewnianą, nie tylko być żółta. | kolor | mocno przekonany | przyjęte (z uwagą w Lukach) |
| R01.6 | j.w. | j.w. | j.w. | Strona nie mówi, że to gra online; opis wspomina tylko znajomego i lobby | — | Brak wyraźnej informacji, że to gra online | Napisać wprost, że to gra online 1:1 (propozycja, przyjęta) | Brief: gra w czasie rzeczywistym dla dwóch osób; strona ma to mówić od razu. | ton wypowiedzi | mocno przekonany | przyjęte |
| R01.7 | j.w. | j.w. | j.w. | Krój bezszeryfowy, proporcje wąsko-średnie (obecnie domyślny stos systemowy Tailwinda, nie świadomie wybrana rodzina) | Bezszeryfowy, szerokość na skali wąski–szeroki: wąsko-średnia; obecny wygląd pasuje właścicielowi | — | — | Wybór właściciela; czytelność tekstu na telefonie i komputerze (BR-20). | typografia | mocno przekonany | przyjęte |
| R01.8 | j.w. | j.w. | j.w. | Linia meta ma kontrast 3,65:1 (próg 4,5:1), białe kamienie na planszy 1,89:1 (próg 3:1) | — | Zbyt niski kontrast tekstu pomocniczego i białych kamieni | Tekst ≥ 4,5:1, elementy graficzne (kamienie, linie) ≥ 3:1, przy zachowaniu oszczędnej kompozycji (propozycja z audytu `lekcja-06/audyt.md`, przyjęta) | Właściciel oczekuje „odpowiedniego kontrastu”; antycharakter „niskokontrastowy”. | kolor | mocno przekonany | przyjęte |
| R02.1 | Gestalt, system projektowy Pinteresta | https://gestalt.pinterest.systems/ | Bartosz Wójcik | Wyraźny, pełny przycisk „Login” w prawym górnym rogu nagłówka, obok drugi, szary | Wyraźny przycisk logowania w nagłówku | — | — | Brief wymaga konta przed grą (BR-23); logowanie ma być łatwe do znalezienia. | komponenty | inspiracja | przyjęte |
| R02.2 | j.w. | j.w. | j.w. | Biała strona, czarny nagłówek ok. 70 px wyśrodkowany, krótki opis ok. 18 px, duży kontrast tekstu do tła | Czytelność: duży kontrast tytułu i krótki opis | — | — | „Czytelność pasuje” (słowa właściciela). | typografia | inspiracja | przyjęte |
| R02.3 | j.w. | j.w. | j.w. | Przycisk logowania czerwony; na stronie też niebieski przycisk i niebieski przełącznik | — | Różowy i czerwony jako kolor akcji; niebieski jako kolor akcji | Pomarańcz jako kolor akcji, w wersji ciemnej lub brązowawej, z kontrastem zgodnym z progami (słowa właściciela). Konkretny odcień nie jest ustalony | Pomarańcz łączy się z drewnem planszy; odcień do wyboru w kroku tokenów. | kolor | inspiracja | przyjęte |
| R02.4 | j.w. | j.w. | j.w. | Cztery kolorowe zdjęcia z dużymi zaokrągleniami wokół tytułu, szare kafle z ikonami | — | Kolorowe zdjęcia i pstrokaty układ | Brak zdjęć; kolor tylko z planszy, kamieni i jednego koloru akcji | Antycharakter „pstrokaty”; gracz ma patrzeć na planszę. | kompozycja i gęstość | inspiracja | przyjęte |

## Antyreferencje

| # | Wygląd | Dlaczego nie | Podpis do uniknięcia | Źródło (gust / badania / propozycja) |
|---|---|---|---|---|
| A01.1 | Datastar: menu górne i lewe o niskim kontraście (https://data-star.dev/guide/getting_started) | Słowa właściciela: „kolor za mały kontrast” | Niebieski tekst nawigacji na granatowym tle; elementy nawigacji o kontraście poniżej 4,5:1 | gust (właściciel) |
| A01.2 | Datastar: niebieski jako kolor tekstu | „Niebieski jako kolor fontów” | Tekst linków i menu w odcieniu niebieskim; niebieski jako domyślny kolor tekstu | gust (właściciel) |
| A01.3 | Datastar: font imitujący niską rozdzielczość | „Font imitujący niską rozdzielczość” | Krój pikselowy w nagłówkach i nawigacji, nawigacja wielkimi literami w tym kroju | gust (właściciel) |
| A01.4 | Datastar: panele z kodem źródłowym | Właściciel nie widzi zastosowania w gomoku | Bloki kodu, czcionka monospace, układ dokumentacji technicznej (menu boczne plus kolumna tekstu) | gust (właściciel); wpisane w „Podoba mi się”, ale bez zastosowania, więc nie jest cechą do przeniesienia |
| A02 | Generyczny wygląd AI | Wybory bez uzasadnienia w produkcie (definicja z `audyt.md`); antycharakter „generyczny” | Indygo lub fiolet jako kolor akcji, gradient w tekście i tle, pigułki i duże zaokrąglenia na większości elementów, para przycisków „Zacznij za darmo” i „Zobacz demo”, rząd wielkich liczb, trzy identyczne karty z ikoną, iskierki, wymyślone liczby i opinie, domyślna paleta biblioteki użyta bez wyboru | propozycja (agent), przyjęta |
| A03 | Pstrokaty układ ze zdjęciami (Gestalt) | „Zbyt pstrokato”, różowy kolor | Wiele kolorowych zdjęć, więcej niż jeden nasycony kolor naraz, różowy lub czerwony jako akcja | gust (właściciel) |
| A04 | Rankingi, odznaki i inne elementy grywalizacji | Brief: rankingi i rating poza zakresem (N-02) | Tabela rankingowa, ELO, odznaki, poziomy, paski postępu, certyfikaty | badania (brief N-02), propozycja agenta, przyjęta |
| A05 | Ukryte czekanie w lobby | Brief: gracz rezygnuje, gdy szukanie trwa długo (A-02); status wygasa po 5 minutach (BR-12) | Spinner lub komunikat „szukamy…” bez licznika wygaśnięcia i bez informacji, co robić dalej | badania (brief A-02, BR-12; przypuszczenie właściciela, nie dane graczy), propozycja agenta, przyjęta |
| A06 | Czat i feed społecznościowy | Brief: czat poza zakresem (N-04) | Okno czatu, pole wiadomości, strumień aktywności, awatary | badania (brief N-04), propozycja agenta, przyjęta |

## Konflikty i rozstrzygnięcia

| Konflikt | Referencje | Rozstrzygnięcie | Kto zdecydował |
|---|---|---|---|
| Ciemne tło czy jasne | R01.1 (ciemne), R02.2 (jasne, czytelność) | Oba motywy, ciemny domyślny; R02 daje tylko widoczność przycisku logowania i czytelność, nie tło | Bartosz Wójcik („oba”) plus propozycja przyjęta |
| Tekstura planszy: subtelna czy wyraźna | propozycja agenta (subtelna) vs R01.5 | Wyraźna, ale bez przesady, rysowana w kodzie | Bartosz Wójcik |
| Krój „jak jest” a wniosek audytu o domyślnych wartościach | R01.7, A02 | Zostaje obecny wygląd kroju (bezszeryfowy, wąsko-średni); w kroku tokenów trzeba go nazwać wprost (obecnie to domyślny stos systemowy, nie wybrana rodzina) | Bartosz Wójcik |
| Pomarańcz jako akcja a pomarańczowe nagłówki i logo w Datastar | R02.3, A01 | Propozycja: pomarańcz tylko na elementach interaktywnych, nie na nagłówkach | **Nikt jeszcze** (propozycja agenta, do zatwierdzenia w kroku tokenów) |
| Ciemny lub brązowawy pomarańcz a kontrast na ciemnym tle | R02.3, R01.1, R01.8 | Kontrast ma być mierzony: wypełnienie przycisku ≥ 3:1 względem tła, tekst na nim ≥ 4,5:1; odcień dobrać pomiarem | **Nikt jeszcze** (do kroku tokenów) |

## Luki

Rodziny bez referencji:
- **Ruch i reakcja:** żadna referencja nie mówi nic o animacjach, stanach najechania, reakcji na ruch przeciwnika. Brak propozycji, wymaga odpowiedzi.
- **Ton wypowiedzi:** poza R01.6 (informacja, że to gra online) brak wskazówek: forma zwrotu do gracza, długość komunikatów, komunikaty błędów.
- **Komponenty gry:** zegar, lobby, historia partii, formularze konta (brief BR-20 wymaga ich na telefonie): brak referencji.
- **Gęstość ekranów z danymi:** referencje dotyczą strony tytułowej. Brak wzorca dla tabel lobby i historii.

Pytania bez odpowiedzi:
- Konkretny odcień pomarańczu (ciemny lub brązowawy) dla trybu ciemnego i jasnego; nie podano wartości.
- Wygląd trybu jasnego: poza R02.2 (biała strona) brak referencji kolorystycznej.
- Czy „tak jak jest łatwiej i lepiej wygląda” przy teksturze (R01.5) znaczy „rysować w kodzie, bez obrazu”? Tak przyjęto, do potwierdzenia.
- Pomiar kontrastu dla R02 i A01 nie był wykonany (obserwacje na oko ze zrzutów).

## Obrazy

Pliki obok tego dokumentu:

- `R01-ciemna-strona-z-plansza.png` — obecna strona główna, 1440 px
- `R02-gestalt-login.png` — Gestalt, strona główna, 1440 px
- `A01-datastar-pikselowy-font.png` — Datastar, Getting Started, 1440 px

Nic w tym pliku nie jest jeszcze regułą. Zasady i tokeny powstają w następnym kroku, z tego pliku, i każdą z nich zatwierdza właściciel osobno.
