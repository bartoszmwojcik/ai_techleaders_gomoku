# Mapa ścieżki użytkownika (stan obecny): gracz szuka partnera do gry

- **Data:** 2026-10-20
- **Autor:** Bartosz Wójcik
- **Aktor:** gracz
- **Scenariusz:** szukam partnera do gry
- **Rodzaj dokumentu:** mapa założeń, opisuje dzisiejsze zachowanie gracza bez aplikacji Gomoku 1:1 online.
- **Źródło:** sesja `om-discover` z Bartoszem Wójcikiem, 2026-10-20. Planowaną ścieżkę w aplikacji opisuje `.ai/specs/product-brief.md`; ten dokument jej nie zmienia. Powiązane: `2026-10-20-stakeholders.md`.

## Etykiety

- **z rozmowy:** relacja z rozmowy z graczem. Brak takich wpisów.
- **z danych:** pomiar lub dane o użyciu. Brak takich wpisów.
- **założenie (właściciel):** przypuszczenie Bartosza Wójcika, niezweryfikowane.
- **?:** nie wiadomo, nie uzupełniono.

Właściciel nie pamiętał konkretnej sytuacji szukania partnera. Szkielet faz zaproponował więc agent, a właściciel go przyjął 2026-10-20, łącznie z decyzją o połączeniu fazy „umawiam się na grę” z fazą F2. Fazy są zatem **założeniem**, nie obserwacją.

## Mapa

| | F1 Mam ochotę zagrać | F2 Szukam i dobieram partnera | F3 Gra startuje albo do niej nie dochodzi |
|---|---|---|---|
| **Działania** | Bierze telefon albo wchodzi na stronę *(założenie)*. Jaką stronę lub aplikację: **?** | Wchodzi na serwis z grami albo na serwis tej gry *(założenie)*⁽¹⁾. Który serwis: **?** | Gra albo szuka dalej *(założenie)*. Gdzie szuka dalej: **?** |
| **Myśli i pytania** | Raczej niewiele rozważań *(założenie)* | Jaki adres lub aplikacja? Jak się zalogować? Gdzie kliknąć? *(założenie)* | **?** |
| **Emocje** | Chce pograć albo sprawdzić, czy jest lepszy od kogoś *(założenie)*. Od kogo: **?** | Musi być płynnie i szybko, inaczej zrezygnuje *(założenie)*. Po jakim czasie rezygnuje: **?** | Radość albo rozczarowanie *(założenie)* |

⁽¹⁾ „Serwis z grami” agent podał jako przykład w pytaniu. Odpowiedź mogła więc zostać przez niego podsunięta.

## Pytania do rozmów z użytkownikami

Pytania wynikają ze znaków **?** i ze szkieletu faz. Dotyczą konkretnych, ostatnich sytuacji, bez podsuwania odpowiedzi. Zadawać je należy obu grupom z mapy interesariuszy: znajomym (S2) i graczom zewnętrznym (S3).

1. Opowiedz o ostatnim razie, gdy chciałeś zagrać w gomoku lub podobną grę online. Co się działo po kolei, od chęci do startu partii? *(weryfikuje szkielet faz F1–F3)*
2. Co wtedy otworzyłeś najpierw? *(F1: strona lub aplikacja)*
3. Gdzie wtedy znalazłeś przeciwnika? *(F2: który serwis)*
4. Z kim chciałeś wtedy zagrać i dlaczego właśnie z tą osobą? *(F1: od kogo „lepszy”)*
5. Czy zdarzyło Ci się zrezygnować z gry, zanim się zaczęła? Ile to trwało i co się stało? *(F2: próg rezygnacji)*
6. Co sobie myślałeś, kiedy partia ruszyła albo kiedy nie było z kim zagrać? *(F3: myśli)*
7. Kiedy nie było przeciwnika, co zrobiłeś potem? *(F3: gdzie szuka dalej)*

## Ryzyka i ograniczenia

- **Brak dowodów.** Mapa w całości opiera się na przypuszczeniach jednej osoby, która jest jednocześnie właścicielem produktu. Nie potwierdza żadnej potrzeby ani zachowania graczy.
- **Najważniejsze założenie do sprawdzenia:** „musi być płynnie i szybko, inaczej zrezygnuje” (F2). Wpływa bezpośrednio na lobby z BR-12 w `product-brief.md` (wygasanie statusu „szukający gry” po 5 minutach). Sprawdza je pytanie 5.
- **Nieustalona grupa.** Nie ustalono, czy mapa opisuje znajomych (S2), graczy zewnętrznych (S3), czy obie grupy.

## Przegląd

Agent sprawdził szkic sam (inline), bez niezależnego przeglądu przez osobnego subagenta.
