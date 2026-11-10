# Przełącznik zmieniający układ nie może zmieniać miejsca w drzewie

**Problem.** „Widok pod projektor” (E14-S01, `show-room.tsx`) przestawia układ: w trybie projektora plansza stoi po lewej, a nagłówek, przełącznik i zegary w kolumnie obok. Pierwsza wersja renderowała dwa różne drzewa (`projector ? <div>…</div> : <>…</>`), więc po naciśnięciu Spacji React odmontowywał pole wyboru i montował nowe. Fokus wracał na `body`, a drugie naciśnięcie Spacji nic nie robiło — użytkownik klawiatury nie mógł wyłączyć trybu. Wyłapał to test komponentu (`userEvent.keyboard(" ")` dwa razy), nie zrzut ekranu.

**Reguła.** Element, którym użytkownik zmienia układ (przełącznik, przycisk trybu), musi zostać w tym samym miejscu drzewa React w obu układach: zmieniaj klasy kontenerów, a przestawiaj tylko elementy, które nie mają fokusu (np. `{projector && board}` przed kolumną i `{!projector && board}` w kolumnie). Test klawiatury przełącza tam i z powrotem i sprawdza `document.activeElement`.

**Powiązane:** `.ai/specs/2026-11-09-show-mode.md` (P20, kryterium v), PR E14-S01 (#280).
