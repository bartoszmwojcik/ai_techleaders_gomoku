# Postęp: klikalny prototyp Epiku 01 (konta)

Stan: **etap 3 (uczciwość i sprawdzenie) gotowy; czeka na raport końcowy i uwagi.**

## Źródła

- Mapa ekranów (zatwierdzona): `lekcja-07/mapa-ekranow.md` (ID ekranów s01–s06, stanów sNN.M, scenariuszy P01–P14, kont A0–A7, luk L01–L26 i D01–D08 są stałe).
- Szary prototyp: `.ai/prototypes/discovery/account-registration/revision-001/` (najnowsza wersja, brak nowszych). Daje przepływ rejestracji i potwierdzenia, założenia A-01…A-10 i dane demo.
- Specyfikacja Epiku 01: wybrałem `.ai/specs/2026-10-24-account-registration.md` (#19), z `login-logout.md` (#20) i `email-verification.md` (#34). W katalogu nie ma pliku o nazwie podanej w poleceniu.
- Design system: `packages/ui/docs/design-system.md`, komponenty `@gomoku/ui/game/*`, tokeny `@gomoku/ui/game-tokens.css`.
- Silnik przeglądu: `lekcja-07/silnik-przegladu/` (nie edytować `prototype.js`).

## Miejsca

- Źródła prototypu: `prototypes/konta-i-role/` (ten katalog, w repozytorium).
- Wynik budowania: `packages/ui/.storybook/public/prototypes/konta-i-role/` (ignorowany przez git, nie commitować). Adres: `/prototypes/konta-i-role/index.html`.

## Etapy

- [x] Etap 0. Plan
- [x] Etap 1. Szkielet i ścieżka bez błędów
- [x] Etap 2. Stany, role i scenariusze
- [x] Etap 3. Uczciwość i sprawdzenie

## Etap 1: co jest zrobione

- Uruchomienie: `cd prototypes/konta-i-role && npx vite build`, wynik trafia do `packages/ui/.storybook/public/prototypes/konta-i-role/` (git ignoruje). Podgląd przez HTTP (Storybook, port 3000 lub `python3 -m http.server` w `packages/ui/.storybook/public`). Moduły z `file://` nie działają. Adres z `?fast` wyłącza symulowane opóźnienia.
- Decyzje właściciela (2026-10-25): L19 link „Nie pamiętasz hasła?” widoczny z dopiskiem, że nie działa (dialog „Poza tym prototypem”), bez paneli zmiany hasła i usunięcia konta; L24 niepotwierdzony nie ma Lobby i Historii w nagłówku; `prototypes/**` w `globalIgnores` w `eslint.config.mjs`.
- Silnik przeglądu skopiowany do `src/review/` (`prototype.js` bez zmian, `comments.js` z `prototypeId: konta-i-role`), `mostek.css` mapuje jego nazwy na tokeny design systemu, `host.css` dodaje style, których silnik oczekuje od hosta (tylko tokeny).
- Pasek przeglądu: oznaczenie „Prototyp”, stały „teraz”, bieżąca sesja, wybór ekranu s01–s06, przełącznik motywu, silnik (Clickable, Comment, hotspoty, Presentation, Threads, Back, eksport).
- Ekrany s01–s06 w komponentach `@gomoku/ui/game/*`. Symulowany serwer w `src/sim.ts` (konta, sesja 30 dni, skrzynka, tokeny 24 h, limity, scenariusze). Stany błędów i scenariusze są już w kodzie, ale kontrolki scenariuszy (pasek) dojdą w etapie 2.
- Sprawdzone w przeglądarce (agent-browser): rejestracja → baner → skrzynka → potwierdzenie → strona główna → konto → wylogowanie → logowanie jako Ala_7; tryb komentarzy otwiera panel; motyw jasny.
- Luki w kodzie oznaczone `LUKA`: D01 (brak szablonu e-mail, `s06-mailbox.tsx`), D02 (stany banera 503/409/401, `banner.tsx`).

## Etap 2: co jest zrobione

- Panel „Scenariusze” w pasku przeglądu (rozwijany, osobno od nawigacji produktu): konto demo A0–A6, dostawca poczty, limit prób, błąd serwera, brak sieci, „już zalogowany” (409), baza niedostępna, ładowanie stron (Szkielet), link bez tokenu, e-mail potwierdzony w innej karcie, sesja wygasła przy „Wyślij ponownie”, wygaszenie sesji, wylogowanie w innej karcie, zegar (+1 h, +24 h, +7 dni, +31 dni, powrót), szerokość podglądu 320/360/1440 px, Reset.
- Wszystkie stany z mapy są osiągalne kliknięciem albo kontrolką. Wpisane dane zostają po błędzie (e-mail, nazwa), hasło jest czyszczone; Reset czyści też wpisane wartości.
- Bramki: `/account` bez sesji odsyła na logowanie i wraca po zalogowaniu; zalogowany na `/register` i `/login` jest odsyłany dalej; gość z aktywną partią nie może się zalogować ani zarejestrować. „Strona wymaga innej roli”: lobby i historia są ukryte dla niepotwierdzonego (decyzja L06), więc nie ma osobnego ekranu.
- Poprawione przy sprawdzaniu: nieaktualne dane w obsłudze przejść między ekranami po Resecie; link i sesja wygasają dokładnie po 24 h i 30 dniach; otwarty panel scenariuszy nie przykrywa strony (pasek przestaje się przyklejać).
- Konto A5 (Ewa_B) zasiane jako utworzone 6 dni temu, żeby po „+7 dni” znikało (mapa podaje 2026-10-17, czyli starsze niż 7 dni już na starcie).
- Sprawdzenie w przeglądarce: `checks/etap2-walk.sh`, wynik `checks/etap2-log.txt` (89 sprawdzeń, 0 błędów). Skrypt wymaga serwera HTTP na porcie 8765 w `packages/ui/.storybook/public`.

## Etap 3: co jest zrobione

- Notatki przy każdym ekranie (historie, symulacja, czego nie rozstrzyga), widoczne także w trybie prezentacji.
- `README.md` prototypu: uruchomienie, konta demo, scenariusze, sekcja „Ograniczenia symulacji”.
- Testy nawigacji: `tests/navigation.test.tsx` (Vitest + jsdom), 10 testów, wszystkie przechodzą: `npx vitest run --config prototypes/konta-i-role/vitest.config.ts`.
- Sprawdzenie w przeglądarce: `checks/etap3-walk.sh`, wynik `checks/etap3-log.txt` (56 sprawdzeń, 0 błędów), zrzuty w `checks/etap3-evidence/`. Zakres: brak poziomego przewijania na wszystkich ekranach przy 320 i 1440 px w obu motywach, kontrolka szerokości, klawiatura (kolejność Tab, Enter, Escape, fokus w dialogach, widoczny obrys), każdy przycisk i link z uwag oraz kontrolki scenariuszy i silnika.
- Pasek przeglądu przy 320 px przestaje się przyklejać (zajmował cały ekran).
- `npm run lint` i `npm run typecheck` przechodzą.
