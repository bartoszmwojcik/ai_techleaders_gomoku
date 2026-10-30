# Postęp: klikalny prototyp Epiku 01 (konta)

Stan: **etapy 0–3 gotowe; zmiana z 2026-10-26 (PR 3 z 3) wprowadzona.**

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

## Zmiana 2026-10-26: uproszczony start konta (PR 3 z 3)

Zgodnie z `.ai/specs/2026-10-26-account-onboarding-simplification.md` (D-24…D-26, BR-26…BR-28; osąd właściciela, nie wynik badania):
- hasło co najmniej 8 znaków (błąd „Hasło musi mieć co najmniej 8 znaków.”, podpis „Co najmniej 8 znaków”);
- konto aktywne od razu: akcje gry, Lobby i Historia dostępne bez potwierdzenia e-maila; stan s01.12 wycofany;
- zamykalny baner „Potwierdź adres e-mail” z powodem (reset hasła tylko po potwierdzeniu); zamknięty wraca po 7 dniach (nowy stan s04.13);
- niepotwierdzone konto bez partii znika po 14 dniach (BR-28), konto z partią zostaje; usunięte konto traci sesję;
- nowy ekran s07 (`/invite/[code]`) ze stanami s07.1–s07.9, `?next` wraca na zaproszenie po rejestracji i logowaniu, gość po ostrzeżeniu dostaje partię i nie może się zalogować ani zarejestrować;
- kontrolki: stan zaproszenia, „Rozegraj partię”, zegar +14 dni;
- testy nawigacji: 15 (Vitest), sprawdzenia w przeglądarce: `checks/etap2-log.txt` (stany, s07, baner, 14 dni) i `checks/etap3-log.txt` (szerokości, motywy, klawiatura, przyciski).
Do zrobienia osobno: szary prototyp (`.ai/prototypes/discovery/account-registration/`) jako nowa rewizja.

## Rewizja 2026-10-30: usunięcie konta (E01-S06, #37)

Zlecenie: prototyp przed kodem ekranu (O3 specyfikacji `.ai/specs/2026-10-24-account-deletion.md`). Rozszerzenie tego prototypu zamiast nowego katalogu: ekran jest częścią s05, a konta demo, symulator i silnik przeglądu są wspólne.

- [x] Stany s05.10–s05.20, s04.14 i pomocniczy ekran s08 (s08.1–s08.4) w `src/screens/delete-account.tsx`, `s04-home.tsx`, `s08-opponent.tsx`; symulacja `deleteAccount` w `src/sim.ts` (kolejność kontroli z kontraktu API: sesja, limit 10 błędów w 15 min, hasło, partia `active`, usunięcie).
- [x] Konto demo A8 (Ola_W, oczekująca partia); A7 w mapie to nieistniejący operator, więc nowe konto dostało A8.
- [x] Scenariusze P15–P18 w panelu przeglądu.
- [x] Testy: `tests/usuniecie-konta.test.tsx` (13 testów), razem 29 z nawigacją.
- [x] Sprawdzenie w przeglądarce: `checks/usuniecie-konta-walk.sh` (wynik `checks/usuniecie-konta-log.txt`, zrzuty `checks/usuniecie-konta-evidence/`).
- [x] Mapa: dopisek (sekcja 7) w `lekcja-07/mapa-ekranow.md`, oznaczony „oczekuje na zatwierdzenie”; zatwierdzonych sekcji 1–6 nie zmieniano.
- [ ] Zatwierdzenie właściciela: treści i założenia A-D1…A-D13 z README, luki LU1–LU3 i DU1–DU2.

Poprawki znalezione przy przejściu: fokus nie wracał na przycisk po zamknięciu dialogu (przycisk jest teraz `trigger` komponentu `ConfirmDialog`, Radix zwraca na niego fokus); zrzuty całej strony ucinały formularz (zrzut jest teraz ramką ekranu, a przy dialogu całym widokiem).
