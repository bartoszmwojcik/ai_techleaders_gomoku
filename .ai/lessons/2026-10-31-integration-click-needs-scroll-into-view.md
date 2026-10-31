# Dodany element wypchnął przycisk poza viewport testów

- **Problem:** po dodaniu przycisku „Historia” na stronie głównej cztery testy przeglądarkowe (`create-game`) zaczęły przekraczać limit czasu, choć na `main` przechodziły; strona nie zgłaszała błędów, a kliknięcie JS-em (`el.click()`) działało.
- **Kontekst:** `agent-browser click` klika w środek elementu bez przewijania, a domyślny viewport to 1280×577. Dodatkowy wiersz przycisków przesunął „Utwórz zaproszenie” na krawędź (y = 576–624), więc środek leżał poza widoczną częścią.
- **Reguła:** gdy test po zmianie układu „nic nie robi” przy kliknięciu, sprawdź pozycję elementu względem `innerHeight` zanim zaczniesz szukać błędu w aplikacji. `Browser.click` przewija teraz element do widoku (`scrollintoview`) przed kliknięciem; nowe wywołania `agent-browser click` pisz przez ten helper.
- **Powiązane:** E04-S01 (#27), `.ai/specs/implemented/2026-10-31-game-history.md`.
