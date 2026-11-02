# Oglądanie partii publicznej na żywo jako widz (E10-S02, #207; E10-S02-T01, #206; E10-S02-T02, #208)

> Status: **projekt — do zatwierdzenia przed kodem.** Specyfikację napisano autonomicznie na mocy delegacji właściciela (2026-11-02); właściciel może ją nadpisać. Część „Decyzja i pomiar” (T01, #206) jest **wykonana**; implementacja widza (S02) i migracja (T02) czekają na zatwierdzenie.
>
> Źródło: zgłoszenia #207, #206, #208, epik #201, `.ai/specs/product-brief.md` (D-33, BR-39, BR-41, BR-42, BR-45, N-13, A-14, Q-17), `.ai/specs/implemented/2026-11-02-public-game-flag.md` (flaga `games.is_public`), lekcja `2026-10-30-server-time-and-bounded-polling.md`.
>
> Zakres: **oglądanie na żywo** (wejście widza, odczyt stanu, limit, odświeżanie). Poza zakresem: czat widza (S03), licznik w oznaczeniu „Partia publiczna” (S04), kill-switch (S05), agent MCP (S06), przegląd zakończonej partii (E09).

## 📝 TLDR

Po zajęciu obu miejsc graczy kolejna osoba z kodem partii publicznej widzi planszę, ruchy, oba zegary i wynik na żywo, nie mogąc nic zmienić. **Mechanizm odświeżania widza: polling co 2 s** — ten sam co u graczy (`PLAY_POLL_INTERVAL_MS`), z tymi samymi zasadami wstrzymywania, zwalniania i końca (lekcja 2026-10-30). Push (SSE) odrzucony: na zmierzonym obciążeniu nie daje nic, czego polling nie ma (20 widzów +≈15 MB RSS i +≈13 p.p. jednego rdzenia, ruchy graczy bez pogorszenia), a dokłada drugi mechanizm transportu, pub/sub między warstwami Next i zależność od proxy. **Limit 20 widzów (BR-42) zostaje**; dodajemy wniosek o globalnym pułapie (propozycja, sekcja „BR-42”). **Pomiaru na docelowym hoście (Mikrus) nie wykonano** — patrz „Czego nie zmierzono”; wynik A-14 jest więc częściowy.

## Odpowiedź na Q-17 (do zatwierdzenia przez właściciela)

**Polling.** Widz czyta `GET /api/games/:id/spectate?after=<moveCount>` co **2 s** (jak gracz w partii w toku). Zasady z lekcji 2026-10-30 obowiązują bez zmian: tempo spada przy bezczynności (po 60 s bez nowego ruchu 5 s, do wznowienia po ruchu), ukryta karta nie odpytuje, powrót na kartę czyta stan od razu, odliczanie zegarów względem `clock.now` z odpowiedzi + `performance.now()`, koniec odpytywania wraz z końcem dostępu widza lub zakończeniem partii (wynik przychodzi w ostatniej odpowiedzi), szum offline cichy.

Dlaczego nie push (SSE):

| Kryterium | Polling co 2 s | SSE |
| --- | --- | --- |
| Zmierzone (20 widzów) | RSS +≈16 MB, CPU +≈13 p.p. rdzenia, widz widzi ruch po p50 1,0 s / p95 1,9 s, ruchy graczy bez zmiany (POST p95 39 ms) | Nie zmierzono w aplikacji (nie ma endpointu). Goły serwer Node: ≈130 KB na połączenie, ruch u 20 widzów po p95 1,7 ms — dolna granica transportu, **bez Next, bazy i autoryzacji** |
| Opóźnienie widza | do 2 s (średnio 1 s) | ≈ natychmiast |
| Złożoność | zero nowego kodu transportu: ten sam wzorzec co `game-room.tsx` | pub/sub „ruch → połączenia” w jednym procesie, a strony i route'y mają osobne kopie modułów (lekcja 2026-10-27: singleton na `globalThis`), albo SSE z odpytywaniem bazy po stronie serwera, czyli ten sam koszt co polling |
| Odporność | każde żądanie jest samodzielne, proces/odświeżenie/rozłączenie nie wymagają wznowienia | wznowienie po zerwaniu z uzupełnieniem luki, limity czasu proxy (Mikrus/Cytrus), bufory proxy |
| Licznik widzów (BR-45) | obecność wynika z odpytywania (patrz „Licznik”) | obecność = otwarte połączenie |

Opóźnienie do 2 s dla widza jest akceptowalne: widz nie gra, a BR-39 wymaga „na żywo”, nie „natychmiast”. Jeśli użycie pokaże, że liczy się opóźnienie, SSE można dodać później bez zmiany kontraktu odczytu (ten sam JSON): polling pozostaje ścieżką awaryjną.

## Pomiar obciążenia (T01, A-14)

**Skrypt:** `sh .ai/scripts/load-spectators.sh [opcje]` (sterownik: `.ai/scripts/load-spectators.mjs`). Odtwarza: jednorazowy PostgreSQL 17 w Dockerze, migracje, `next start` z buildu produkcyjnego, dwóch graczy (konta) grających po HTTP 40 ruchów co 1,5 s oraz N „widzów” odpytujących stan co zadany interwał; każdy klient ma własny adres. Raportuje: opóźnienie `POST /moves`, opóźnienie odczytu, po jakim czasie widz widzi ruch, RSS i CPU procesu serwera (z `/proc`, wraz z potomnymi), pamięć kontenera PostgreSQL. Odmawia startu przy zajętości RAM ≥ 90 %. Opcja `--sse-reference` mierzy goły serwer SSE (patrz wyżej).

**Uwaga o wiarygodności:** endpointu widza jeszcze nie ma, więc widz jest emulowany odczytem `GET /api/games/:id?after=N` z sesją gracza — to to samo zapytanie o stan, które wykonuje własne odpytywanie graczy. Prawdziwy odczyt widza (rozpoznanie widza zamiast uczestnika) powinien kosztować tyle samo; pierwszy pomiar po wdrożeniu S02 należy powtórzyć skryptem na prawdziwym endpointcie.

**Środowisko pomiaru (nie docelowe):** Intel i7-8665U 1,9 GHz, 8 wątków, Node 22, PostgreSQL 17 w Dockerze na tej samej maszynie, brak limitów pamięci i CPU. Pomiar z 2026-11-02, jedno uruchomienie na scenariusz (40 ruchów), poprzedzone nieraportowaną partią rozgrzewkową.

| Widzowie | Interwał | POST ruchu p50 / p95 [ms] | Widz widzi ruch po p50 / p95 [ms] | GET widza p50 / p95 [ms] | Żądań/s | RSS serwera śr. / maks. [MB] | CPU [% rdzenia] | CPU ms / żądanie |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | — | 35,2 / 59,0 | — | — | 1,0 | 173,9 / 184,5 | 3,4 | 33,8 |
| 20 | 5 s | 32,8 / 46,0 | 2553 / 4795 | 25,6 / 41,4 | 5,1 | 185,6 / 188,9 | 8,7 | 17,0 |
| 20 | 3 s | 32,6 / 39,5 | 1525 / 2898 | 27,5 / 36,7 | 7,8 | 187,6 / 191,4 | 12,7 | 16,4 |
| **20** | **2 s** | 32,5 / 38,5 | **1008 / 1937** | 26,9 / 36,5 | 11,1 | **189,6 / 193,1** | **16,3** | 14,8 |
| 20 | 1 s | 31,4 / 48,7 | 514 / 994 | 30,3 / 55,0 | 20,8 | 192,2 / 195,3 | 27,7 | 13,3 |
| 40 | 2 s | 29,1 / 40,7 | 1023 / 1916 | 24,2 / 48,0 | 21,2 | 194,9 / 198,3 | 27,2 | 12,8 |

Kontener PostgreSQL: 30–45 MB. Wszystkie odczyty widzów: `200` (brak `429`/`5xx`).

Wnioski z pomiaru:
1. **Ruchy graczy nie zwalniają** w żadnym scenariuszu (POST p95 29–59 ms; wiersz bazowy z 0 widzów jest najwolniejszy przez ciepły start, nie przez widzów). W zakresie 0–40 widzów @ 2 s opóźnienie ruchu nie zależy od widowni.
2. **Pamięć rośnie około 0,5–1 MB na widza** (≈ 190 MB przy 20 widzach wobec ≈ 174 MB bez; całość sterowana pulą połączeń i buforami, nie liczbą klientów). Przy 2 GB RAM nie jest to ograniczenie.
3. **CPU jest zasobem, który się kończy.** Koszt ≈ 13–17 ms CPU na żądanie (stały narzut: routing Next, sesja, zapytanie; mało zależny od interwału). 20 widzów @ 2 s to ≈ 16 % jednego rdzenia tej maszyny. Rdzeń Mikrusa jest wolniejszy i współdzielony — przyjmujemy ostrożnie 3–5× gorszą przepustowość, czyli **50–80 % jednego rdzenia na jedną partię z 20 widzami**; to jest uzasadnienie pułapu globalnego niżej.
4. Interwał 1 s podwaja koszt, a poprawia opóźnienie tylko z 1,9 do 1,0 s (p95): nieopłacalne. 3 s i 5 s oszczędzają CPU, ale p95 3–5 s odbiera wrażenie „na żywo”; wybieramy 2 s, a przy bezczynności zwalniamy do 5 s.

### Czego nie zmierzono (jawnie)

- **Docelowy host (Mikrus): brak pomiaru.** Zadanie przewidywało odczyt wyłącznie do odczytu przez narzędzia MCP Mikrusa (wolny RAM, pamięć działającej aplikacji, obciążenie CPU), ale wywołanie `mcp__mikrus__servers` zostało w tej sesji **odrzucone przez tryb uprawnień** (`don't ask mode`); nie obchodzono odmowy. Nic nie wdrożono i nie zmieniono na serwerze. A-14 pozostaje więc **częściowo niezweryfikowane**: pamięć i opóźnienie ruchu są zmierzone lokalnie, ale bez limitów hosta, a CPU tylko jako koszt na żądanie.
- Brak pomiaru z prawdziwym endpointem widza (nie istnieje) i z zapisem obecności (heartbeat, patrz „Licznik”).
- Brak pomiaru SSE w aplikacji (tylko goły serwer Node jako dolna granica transportu).
- Jedno uruchomienie na scenariusz; rozrzut między uruchomieniami nie jest oszacowany (różnice p95 POST rzędu 10 ms są szumem).
- Obciążenie wielu partii publicznych naraz (np. 5 × 20 widzów); jest ekstrapolowane liniowo z kosztu na żądanie.
- Zachowanie przez reverse proxy Mikrusa (opóźnienia sieci, limity połączeń).

**Do wykonania przez właściciela albo agenta z dostępem do Mikrusa (przed wdrożeniem S02):** `free -m` i `ps -o rss,cmd` aplikacji (tylko odczyt) oraz, po wdrożeniu S02 na hoście, sterownik pomiarowy (`BASE_URL=… SERVER_PID=… node .ai/scripts/load-spectators.mjs --scenarios=20@2000`) przeciw instancji testowej — nigdy na produkcyjnej partii graczy. Brak progu liczbowego w A-14, więc **proponowany próg akceptacji:** przy 20 widzach @ 2 s POST ruchu p95 ≤ 2× wartość bez widzów i ≤ 500 ms, a RSS aplikacji + PostgreSQL ≤ 70 % RAM hosta.

## BR-42 — limit widzów: propozycja

- **Limit 20 na partię zostaje** (decyzja właściciela; zmierzone dane go nie podważają: 40 widzów @ 2 s też nie spowalnia ruchów).
- **Propozycja (niezatwierdzona): pułap globalny** `SPECTATORS_MAX_TOTAL` (domyślnie 60, konfigurowalny jak limity D-29) — zliczane aktywne rekordy widzów w całej instalacji; po przekroczeniu nowy widz widzi ten sam komunikat „Partia ma komplet widzów”. Powód: limit per partia nie ogranicza liczby partii publicznych, a koszt CPU rośnie liniowo z liczbą pollerów (≈ 15 ms CPU na żądanie). Bez pułapu pięć publicznych partii z 20 widzami to ≈ 100 pollerów ≈ 80 % rdzenia dev, więcej niż rdzeń Mikrusa. 60 widzów ≈ 30 żądań/s ≈ ≤ 50 % rdzenia dev. Wartość do potwierdzenia pomiarem na Mikrusie. Jeśli właściciel odrzuci pułap, ryzyko zostaje opisane w A-14.
- Brak zmiany wartości 20; zmiana następowałaby tylko po pomiarze na hoście (patrz próg wyżej).

## Resolved assumptions (autonomous defaults)

Zatwierdzone: D-33, BR-39…BR-42, BR-45, N-13. Poniżej luki, które zostawia zgłoszenie. Brak wierszy wymagających blokady: każde założenie jest odwracalne.

| # | Pytanie | Zastosowane założenie | Potwierdzenie |
| --- | --- | --- | --- |
| S2-1 | Kto zostaje widzem? | Osoba otwierająca kod (`/invite/[code]`) partii **publicznej**, w której oba miejsca graczy są zajęte (`status` `active`; po zakończeniu patrz S2-8). Dopóki miejsce przeciwnika jest wolne, pierwsza osoba zostaje przeciwnikiem (BR-39, bez zmian). Partia prywatna albo flaga zdjęta → kod nie daje oglądania (`404`/ekran „zaproszenie nieważne” jak dziś). | z BR-39/BR-40 |
| S2-2 | Tożsamość widza | Konto: nazwa konta (BR-14). Gość: **nick opcjonalny, 1–24 znaki** (BR-29, BR-41); bez nicka i bez konta ogląda anonimowo (tylko czyta). Tożsamość jest potrzebna w S03 (czat); S02 zapisuje ją w rekordzie widza. | z BR-41 |
| S2-3 | Czy oglądanie liczy się do BR-13 (jedna aktywna partia)? | **Nie.** Widz nie ma miejsca gracza, więc nie blokuje tworzenia ani dołączania do partii. | propozycja agenta z backlogu — **⚠ do potwierdzenia przez właściciela**, odwracalne |
| S2-4 | Czas dostępu widza | Jak token gościa (BR-29): **1 h od ostatniej aktywności** (przesuwany z każdym odczytem), kasowany przez `db:cleanup` razem z partią; zalogowane konto ogląda, dopóki sesja i partia istnieją. Dostęp widza kończy się też z zakończeniem partii: ostatnia odpowiedź niesie wynik, odpytywanie się zatrzymuje (przegląd po zakończeniu to E09). | propozycja agenta z backlogu — **⚠ do potwierdzenia**, odwracalne |
| S2-5 | Jak widz identyfikuje się przy kolejnych odczytach | Anonim/gość: ciasteczko `HttpOnly` z losowym tokenem widza (osobne od tokenu gościa-gracza, w bazie tylko skrót — jak token gościa). Konto: sesja. Token widza nie daje dostępu do żadnej trasy gracza (`resolveParticipant` go nie zna), więc próba ruchu/rezygnacji/czatu gracza to `404`/`403`. | decyzja techniczna |
| S2-6 | Widok widza a dane graczy | Widz dostaje: `status`, planszę (`moves`, `blackSeat`, `turnSeat`, `moveCount`, `result`), zegary (`clock`), nazwy graczy (konto = nazwa, gość = „{nick} (gość)”, agent = podpis BR-31). **Nie dostaje:** adresów e-mail, `gameId` do czegokolwiek poza oglądaniem, kodu zaproszenia, tokenu agenta, ustawień czatu, danych sesji. | z BR-39, BR-31 |
| S2-7 | Jak widz otwiera partię | `/invite/[code]` zamiast dołączania pokazuje formularz „Oglądaj partię” (pole nicka opcjonalne, przycisk „Oglądaj”); po zatwierdzeniu `POST /api/invitations/:code/spectate` zakłada rekord widza, ustawia ciasteczko i przekierowuje do `/games/:id`. Strona partii dla widza to tryb tylko do odczytu tego samego `GameRoom` (bez pól ruchu/rezygnacji). Konto: bez formularza, od razu przekierowanie. | decyzja UX |
| S2-8 | Widz otwierający kod po zakończeniu partii | Poza S02: przegląd zakończonej partii to E09-S02. Do tego czasu kod zakończonej partii publicznej działa jak dziś (zaproszenie nieważne). | zakres |
| S2-9 | Licznik widzów | Źródłem jest tabela widzów: **obecni = widzowie z `last_seen_at` w ciągu ostatnich 15 s**. `last_seen_at` zapisujemy najwyżej raz na 10 s na widza (nie przy każdym odczycie), więc zapis to ≤ 2 `UPDATE`/s przy 20 widzach. Licznik jest więc wykonalny przy pollingu (BR-45: „jeśli da się wiarygodnie utrzymać”); wyświetla go S04. S02 tylko utrzymuje dane. | wniosek z Q-17 |
| S2-10 | Limit | `SPECTATORS_MAX` = 20 (BR-42) liczone jako obecni + świeżo dołączeni w 15-s oknie; sprawdzenie i zapis w jednej transakcji z blokadą doradczą partii (jak `send` czatu), aby 21. nie wszedł wyścigiem. Przekroczenie → `409 SPECTATORS_FULL`, ekran „Partia ma komplet widzów”. Powrót tego samego widza (ma token) nie jest liczony podwójnie. | z BR-42 |
| S2-11 | Brak ruchu widza | Trasy ruchu, rezygnacji, rewanżu, czatu graczy rozpoznają wyłącznie uczestnika-gracza; widz dostaje `404` (jak obcy). Test negatywny w integracji. | z #207 |

## 📝 Problem Statement

- **Kto:** osoba z kodem partii publicznej (gość z nickiem lub konto); właściciel obserwujący partię z agentem (D-28).
- **Dziś:** E10-S01 zapisuje flagę publiczności i informuje przeciwnika, ale nic z niej nie wynika — kolejna osoba z kodem widzi „zaproszenie nieważne”.
- **Skutek braku:** funkcja D-33 pkt (2) nie istnieje; bez wyboru mechanizmu i pomiaru (Q-17, A-14) nie wiadomo, czy host unosi widownię.

## 📝 Proposed Solution

1. **T02 (#208):** tabela `game_spectators` (migracja `npm run db:migration:create`): `id`, `game_id` (FK, `on delete cascade`), `user_id` (nullable FK do kont, `on delete cascade`), `nickname` (nullable, 1–24), `token_hash` (nullable, unikalny), `created_at`, `last_seen_at`, `expires_at`. CHECK: dokładnie jedno z `user_id` / `token_hash` (konto albo anonim/gość); `nickname` tylko z `token_hash`. Bez kolumny miejsca gracza, **bez zapisu do `game_players`/historii** (BR-24, BR-39). Unikalność `(game_id, user_id)`. Indeks `(game_id, last_seen_at)`. `db:cleanup` usuwa po `expires_at`.
2. **S02:** `SpectatorService` (`packages/app/src/server/services/games/`): `join(code, identity)`, `readState(spectator, gameId, after)`, `touch` (przesuwanie `expires_at`, ≤ 1 zapis/10 s), `resolveSpectator(gameId)` w `server/http/`. Odczyt stanu **ponownie używa** budowania widoku z `GameService.getState` (wydzielony wspólny konstruktor widoku bez pól prywatnych gracza; bez duplikowania SQL).
3. **Trasy:** `POST /api/invitations/:code/spectate`, `GET /api/games/:id/spectate?after=N`. Kontrakt odczytu to podzbiór `GET /api/games/:id` (S2-6) — dzięki temu SSE można dodać później bez zmiany klienta.
4. **UI:** `/invite/[code]` (formularz „Oglądaj partię”, `Alert` info o limicie i komunikat „Partia ma komplet widzów”), `/games/[gameId]` w trybie widza (`GameRoom` z `role="spectator"`: ta sama plansza, zegary i wynik, brak pól ruchu/rezygnacji/czatu — czat to S03). Odpytywanie jak w tabeli „Odpowiedź na Q-17”; interwał jako stała obok `PLAY_POLL_INTERVAL_MS`.

## 📝 API Contracts

`POST /api/invitations/:code/spectate` — ciało `{ nickname?: string }` (gość; 1–24 znaki po przycięciu i NFKC jak BR-29); konto bez ciała. `200 { gameId }` + ciasteczko widza (gość). Błędy: `404` (kod nieważny, partia prywatna, flaga zdjęta, partia nie `active`), `409 SPECTATORS_FULL` (limit per partia lub globalny), `400` (nick niepoprawny), `403` (CSRF jak pozostałe `POST`).

`GET /api/games/:id/spectate?after=N` — `200 { data }` w kształcie odpowiedzi stanu bez pól prywatnych (S2-6), `clock.now` obecne; `404` dla nie-widza; `after` poza partią → `400` (jak `GET /api/games/:id`). `Cache-Control: no-store`. Odświeża `expires_at` i `last_seen_at` (S2-4, S2-9).

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Zachowanie |
| --- | --- |
| Pierwsza osoba z kodem, miejsce przeciwnika wolne | zostaje przeciwnikiem (BR-39), nie widzem |
| Partia prywatna / flaga zdjęta (S05) | `404`, kod nie daje oglądania |
| 21. widz | `409 SPECTATORS_FULL`, „Partia ma komplet widzów” |
| Ten sam widz wraca z tokenem, a partia jest pełna | wpuszczony (nie liczy się podwójnie) |
| Widz próbuje ruchu / rezygnacji / rewanżu / czatu gracza | `404` jak obcy; stan partii bez zmian (test negatywny) |
| Widz z sesją konta, który jest też graczem tej partii | traktowany jako gracz (nie widz) |
| Partia kończy się podczas oglądania | ostatnia odpowiedź niesie wynik; odpytywanie się zatrzymuje; baner offline cichy |
| Wygasły token widza | `404`, UI pokazuje „Oglądanie wygasło” z linkiem do kodu |
| Zegar urządzenia widza ±6 min | zegary liczone względem `clock.now` (test obowiązkowy, lekcja 2026-10-30) |
| Ukryta karta | brak odpytywania; powrót czyta od razu |
| Usunięcie konta widza / partii | kaskada FK; `db:cleanup` sprząta wygasłe |
| Wyścig dwóch dołączeń na ostatnie miejsce | blokada doradcza partii → dokładnie jeden wygrywa (test na PostgreSQL) |

## 📝 Risks & Impact Review

- **Wydajność (A-14):** CPU rośnie liniowo z liczbą pollerów; pomiar lokalny ok., host niezmierzony (sekcja „Czego nie zmierzono”). Łagodzenie: interwał 2 s → 5 s w bezczynności, pułap globalny (propozycja), lekki odczyt (jedno zapytanie), zapis obecności ≤ 1 / 10 s.
- **Prywatność:** widz widzi nazwy graczy; S2-6 wyklucza e-mail, kod, token agenta. Flaga publiczności jest informowana przed dołączeniem (BR-45, E10-S01).
- **Nadużycia:** brak moderacji (N-13, Q-10); w S02 widz nie pisze (czat to S03), więc powierzchnia nękania jest zerowa do S03.
- **Zgodność wsteczna:** nowa tabela i dwie nowe trasy, bez zmian istniejących kontraktów (`GET /api/games/:id` bez zmian).

## 📝 Decisions in play

D-33, BR-39 (widz), BR-41 (tożsamość), BR-42 (limit), BR-45 (licznik wykonalny przy pollingu), N-13, A-14 (częściowo zmierzone), Q-17 (rozstrzygnięte: polling).

## 📋 Phasing / Implementation Plan

1. **T01 (#206) — wykonane w tej specyfikacji:** skrypt pomiarowy `.ai/scripts/load-spectators.{sh,mjs}`, decyzja Q-17, wynik A-14 (częściowy).
2. **T02 (#208):** migracja `game_spectators` + encja w `packages/db/src/entities/index.ts`; `up`/`down` na prawdziwym PostgreSQL; sprzątanie w `db:cleanup`.
3. **S02 (#207):** `SpectatorService`, trasy, `resolveSpectator`, strony `/invite/[code]` i `/games/[gameId]` w trybie widza; testy jednostkowe 100 %; scenariusze integracyjne (`game-spectate-api.test.ts`, `game-spectate-pages.test.ts`: wejście widza, odczyt na żywo, 21. widz, brak ruchu, partia prywatna, widz nie liczy się do BR-13).
4. **Po wdrożeniu S02 na instancji testowej:** powtórzyć pomiar skryptem na prawdziwym endpoincie i na Mikrusie (próg wyżej).

## 📝 Acceptance criteria (mapowanie na #207, #206)

- [x] (#206) Wybór pollingu jest uzasadniony pomiarem, wynik zapisany w specyfikacji, odpowiedź na Q-17 wpisana do zatwierdzenia przez właściciela. **Uwaga:** pomiar nie na docelowym hoście (odmowa narzędzia Mikrus) — luka opisana jawnie.
- [x] (#206) Ewentualna korekta BR-42: limit 20 bez zmian + propozycja pułapu globalnego.
- [ ] (#207) Partia publiczna z zajętymi dwoma miejscami: kolejna osoba z kodem widzi planszę, ruchy, oba zegary i wynik na żywo.
- [ ] (#207) Widz nie może wykonać ruchu ani zmienić stanu lub zegarów (przypadek negatywny).
- [ ] (#207) 21. widz widzi „Partia ma komplet widzów” (BR-42).
- [ ] (#207) Widz nie liczy się do „jednej aktywnej partii” (BR-13) — po potwierdzeniu S2-3.
- [ ] (#207) Widz nie jest uczestnikiem MCP i nie widzi tokenu agenta.
- [ ] (#207) Partia prywatna lub z zamkniętą publicznością: kod nie daje oglądania (przypadek negatywny).
- [ ] (#208) Migracja i encja widza (nick lub konto, tymczasowy, bez miejsca gracza), `up`/`down` na PostgreSQL, widz poza historią (BR-24, BR-39).

## ⚠️ Pytania do właściciela

1. **Q-17 — polling co 2 s** (zamiast SSE): zatwierdzasz? (rekomendacja: tak.)
2. **Pułap globalny widzów** (`SPECTATORS_MAX_TOTAL` = 60): wprowadzić? (rekomendacja: tak, do kalibracji pomiarem na Mikrusie.)
3. **S2-3:** oglądanie nie liczy się do BR-13 (rekomendacja: tak).
4. **S2-4:** dostęp widza 1 h od ostatniej aktywności, jak token gościa (rekomendacja: tak).
5. **Pomiar na Mikrusie:** kto wykona odczyt (`free -m`, RSS aplikacji) — ta sesja nie miała do niego uprawnień.
