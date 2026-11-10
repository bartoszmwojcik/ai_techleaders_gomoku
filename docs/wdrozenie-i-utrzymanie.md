# Wdrożenie i utrzymanie

Przeniesione z README: wdrożenie na mikr.us, kopie zapasowe, motyw, licznik partii, sprzątanie rekordów.

## Wdrożenie na mikr.us

Aplikacja działa w kontenerach Docker na VPS mikr.us (plan z Dockerem, ≥ 2.1), a ruch HTTPS idzie przez darmową subdomenę mikr.us, bez własnej domeny (decyzja G1 w `.ai/specs/implemented/2026-10-24-account-registration.md`). Pliki: `Dockerfile`, `compose.prod.yaml`, `.env.production.example`.

```bash
git clone https://github.com/bartoszmwojcik/ai_techleaders_gomoku.git && cd ai_techleaders_gomoku
cp .env.production.example .env.production      # ustaw POSTGRES_PASSWORD (openssl rand -hex 24) i APP_ORIGIN
docker compose --env-file .env.production -f compose.prod.yaml up -d --build
domena gomoku.byst.re 3000                       # subdomena na porcie aplikacji (HTTPS automatycznie)
curl https://gomoku.byst.re/api/health           # {"status":"ok",...}
```

- **Mały RAM (`LOW_MEMORY=1`):** `docker compose ... up -d --build` na VPS z 2 GB RAM i jednym rdzeniem może paść w `next build` z komunikatem „Failed to type check.” (bez treści) albo `Next.js build worker exited ... SIGTERM`: Next uruchamia tylu workerów, ile procesorów widzi host, i kończy się pamięć. Ustaw w `.env.production` `LOW_MEMORY=1`: obraz buduje się wtedy z jednym workerem, a typy sprawdza osobny `tsc` przed buildem (nie są pomijane). Build trwa ok. minuty, a eksport obrazu (~2,5 GB) kolejne kilka minut; w tym czasie stara wersja działa. Nowa wersja zastępuje starą dopiero po udanym buildzie. Wycofanie: przed wdrożeniem `docker tag gomoku-app:latest gomoku-app:prev`, po awarii `docker tag gomoku-app:prev gomoku-app:latest && docker compose --env-file .env.production -f compose.prod.yaml up -d --no-build`.
- **Stos:** PostgreSQL 17 (nieopublikowany na zewnątrz, dane w woluminie `postgres-data`), jednorazowa migracja (`npm run db:migration:up`) i aplikacja. Aplikacja startuje dopiero po migracji i gotowej bazie; healthcheck wywołuje `/api/health`, który zwraca `503`, gdy baza nie odpowiada.
- **Sekrety:** `.env.production` leży tylko na serwerze (jest ignorowany przez git). Hasło bazy generuj poleceniem `openssl rand -hex 24` (heks jest bezpieczny w adresie `DATABASE_URL`).
- **IPv6:** subdomeny mikr.us wymagają, żeby usługa odpowiadała na IPv6. Aplikacja słucha w kontenerze na IPv4, a Docker publikuje port także na adresie IPv6 hosta; komenda `domena` sprawdza, czy port odpowiada, zanim utworzy subdomenę.
- **Aktualizacja:** `git pull`, potem to samo polecenie `docker compose … up -d --build` (migracje wykonują się przy każdym starcie).
- **Logi i stan:** `docker compose -f compose.prod.yaml logs -f app`, `docker compose -f compose.prod.yaml ps`.
- **Konta (`APP_ORIGIN`, `TRUST_PROXY_HOPS`, `CLIENT_IP_HEADER`):** `compose.prod.yaml` wymaga `APP_ORIGIN` i `TRUST_PROXY_HOPS` z `.env.production` (bez nich `docker compose` odmawia startu). Aplikacja w produkcji bez poprawnych wartości działa tylko częściowo: `/api/health` odpowiada, ale route'y domenowe (`/api/auth/*`) zwracają `500` (fail closed), a `/` pokazuje widok gościa. `APP_ORIGIN` to dokładny adres subdomeny z `https://` (np. `https://gomoku.byst.re`). `TRUST_PROXY_HOPS` to liczba proxy, które dopisują adres klienta do `CLIENT_IP_HEADER`; zła wartość pozwala podszyć się pod adres (za duża) albo wrzuca wszystkich pod adres proxy (za mała), więc po wdrożeniu sprawdź na serwerze, jaki adres trafia do nagłówka. Wynik pomiaru na produkcji (#112, 2026-11-04) jest w sekcji „Adres klienta za proxy” poniżej: przez domenę proxy mikr.us dopisuje adres klienta, a `TRUST_PROXY_HOPS=1` jest właściwe. Gdyby proxy kiedyś przestało go przekazywać, rejestracja zwróci `500` do czasu przejścia na Cloudflare (wtedy `CLIENT_IP_HEADER=cf-connecting-ip`). `SESSION_COOKIE_SECURE` w produkcji zostaw nieustawione.
- **Nasłuch na IPv6:** subdomena wymaga odpowiedzi na IPv6. Aplikacja w kontenerze słucha na `0.0.0.0` (IPv4), a Docker publikuje port także na adresie IPv6 hosta; jeśli publikacja IPv6 nie działa, uruchom aplikację z `-H ::` (nasłuch na obu stosach) albo włącz IPv6 w demonie Docker. Zawsze sprawdź `curl -6 https://<subdomena>/api/health`.
- **Kolejne zmienne:** `SMTP_*` (poczta, #38) dojdą z tą funkcją; produkcyjny start bez nich ma przerywać, zgodnie ze specyfikacją.
- **Czyszczenie wygasłych rekordów** (#39, BR-18): wpis `cron` na serwerze, opis w sekcji [Sprzątanie wygasłych rekordów](#sprzątanie-wygasłych-rekordów).
- **Kopie zapasowe:** procedura w podsekcji [Kopie zapasowe bazy](#kopie-zapasowe-bazy) poniżej (czat nie trafia do kopii).

### Kopie zapasowe bazy

Czat jest tymczasowy (BR-34), więc `pg_dump` pomija **dane** tabeli `chat_messages` (jej struktura w kopii zostaje, żeby odtworzenie bazy działało). Flaga `--exclude-table-data=chat_messages` musi być w **każdym** wywołaniu `pg_dump`; kopia bez niej trzyma treść rozmów do 5 kopii wstecz. Repozytorium nie zawiera skryptu kopii (to konfiguracja serwera), ale to samo polecenie sprawdza test integracyjny na PostgreSQL (`tests/integration/chat-cleanup.test.ts`, razem z kontrolą pozytywną: ten sam zrzut bez flagi zawiera wiadomość).

```bash
# Kopia (format własny, skompresowany); nazwę kontenera sprawdź przez `docker compose -f compose.prod.yaml ps`.
mkdir -p /var/backups/gomoku
docker exec gomoku_prod-postgres-1 pg_dump -U gomoku -Fc --exclude-table-data=chat_messages gomoku \
  > /var/backups/gomoku/gomoku-$(date +%F-%H%M).dump
# Rotacja: zostaje 5 ostatnich kopii.
ls -1t /var/backups/gomoku/*.dump | tail -n +6 | xargs -r rm --
```

Przykładowy wpis `cron` (`/etc/cron.d/gomoku-backup`, raz na dobę):

```cron
30 3 * * * root docker exec gomoku_prod-postgres-1 pg_dump -U gomoku -Fc --exclude-table-data=chat_messages gomoku > /var/backups/gomoku/gomoku-$(date +\%F-\%H\%M).dump && ls -1t /var/backups/gomoku/*.dump | tail -n +6 | xargs -r rm --
```

**Weryfikacja kopii** (po każdej zmianie polecenia): `pg_restore -l <plik> | grep chat_messages` pokazuje tabelę (struktura jest), a `pg_restore -a -t chat_messages -f - <plik> | grep -c '^COPY'` zwraca `0` (brak bloku z danymi; bez flagi byłby tu blok `COPY public.chat_messages` z treścią). Kopie sprzed dodania flagi, jeśli powstały po pierwszym wdrożeniu tabeli czatu, usuń. Kopie zapasowe hostingu i logi infrastruktury leżą poza obietnicą BR-34. Usunięte konto zostaje w starszych kopiach (poza czatem) do czasu rotacji.


## Bot (gra z botem)

Gra z botem (specyfikacja `.ai/specs/2026-11-05-hosted-bot.md`) liczy ruchy bota na serwerze: w osobnym wątku roboczym (`worker_threads`) tworzonym na jeden ruch, jedno obliczenie naraz w procesie. Funkcja jest **domyślnie wyłączona** i włącza się ją dopiero po zakończeniu epiku E13 i zaakceptowanym pomiarze na serwerze (R19).

- **Włączanie i wyłączanie:** `BOT_ENABLED=true` w `.env.production`, potem `docker compose --env-file .env.production -f compose.prod.yaml up -d --no-build`. Wyłączenie (`BOT_ENABLED=` albo `false`) odmawia tylko nowych partii (`503 BOT_UNAVAILABLE` z `Retry-After: 60`); trwające partie z botem kończą się normalnie. Nieznana wartość zatrzymuje start (fail closed).
- **RAM i siła:** przy tworzeniu partii aplikacja czyta dostępną pamięć: `BOT_FIXED_MEMORY_MB` (gdy ustawione) → `process.availableMemory()` (uwzględnia limit cgroup kontenera) → `os.freemem()`. Odczyt wybiera rozmiar tablicy transpozycji i limit głębokości poziomu 2 (256–767 MB → 8 MB, głębokość 6; 768–1535 → 16 MB, 8; 1536–3071 → 32 MB, 10; od 3072 → 64 MB, 12) i jest zamrażany w partii (nazwa bota pokazuje siłę, np. `Bot · poziom 2 · 16 MB`). Poniżej `BOT_MIN_AVAILABLE_MB` (domyślnie 256) nowa partia z botem jest odrzucana. Pamięć nie wydłuża czasu ruchu: ten ograniczają zawsze cel i pułap. Lokalnie w kontenerze `--memory=2g` `process.availableMemory()` zwraca ok. 1,9 GB (próg 32 MB), a `os.freemem()` — pamięć hosta; na mikr.us (LXC) nie sprawdzono — jeśli odczyt jest nierealny, ustaw `BOT_FIXED_MEMORY_MB`.
- **Czas ruchu:** `BOT_L1_SOFT_MS`/`BOT_L1_CEILING_MS` (domyślnie 50/250 ms) i `BOT_L2_SOFT_MS`/`BOT_L2_CEILING_MS` (1500/3000 ms). Po celu wątek dostaje flagę stopu (najwcześniej po pierwszej ukończonej iteracji), po pułapie jest ubijany (`terminate()`), a bot gra ruch z ostatniej ukończonej iteracji; następne obliczenie startuje dopiero po zakończeniu ubitego wątku. Oba są dodatkowo przycinane zegarem bota (1/30 i 1/10 pozostałego czasu; poniżej 1 s gra poziom 1). Pułap nie może być mniejszy od celu.
- **Współbieżność:** `BOT_MAX_ACTIVE_GAMES` (domyślnie 3) aktywnych partii z botem naraz (porzucone, z przekroczonym terminem zegara, się nie liczą); obliczenia idą po kolei (bramka FIFO), więc najgorsze opóźnienie ruchu to ok. 2 × pułap plus do 500 ms (`BOT_TERMINATE_WAIT_MS`) na zakończenie ubitego wątku. Wątek ma limit sterty 64 MB (+16 MB młodej generacji); tablica transpozycji jest poza stertą.
- **Logi (JSON, bez treści pozycji):** `bot_move` (każdy policzony ruch: poziom, głębokość, węzły, czas), `bot_ceiling` (ruch przerwany pułapem), `bot_engine_error` (awaria wątku; po 3 awariach w partii bot gra do końca poziomem 1 w głównym wątku), `bot.turn_failed` (zapis ruchu się nie udał, z `code` błędu aplikacji), `bot.refused` (odmowa partii: `memory` albo `busy`). Podgląd: `docker compose -f compose.prod.yaml logs app | grep '"event":"bot'`.
- **Pomiar przed włączeniem (A-21/A-22, R18):** `docker exec <kontener aplikacji> npm run -s bot:bench -- --positions 200 --probe-url http://127.0.0.1:3000/api/health` — przy działającym stosie i **bez równoległego builda** (build zabija aplikację). Wynik to JSON z czasami ruchu (p50/p95/max), głębokością, węzłami/s, przyrostem RSS, opóźnieniem pętli zdarzeń (p50/p99/max) i werdyktem `accepted` wg progów R18 (p95 ≤ 1,2 × cel, max ≤ pułap + 250 ms, p99 pętli ≤ 50 ms, RSS ≤ 100 MB, odczyt innej partii ≤ 2 × bez obliczeń); kod wyjścia 1 = odrzucone. Bench uruchamia wątek przez `tsx`, więc rozruch wątku i RSS są w nim wyższe niż w zbudowanej aplikacji (spike E13-S04-T01: rozruch 40–85 ms, +17…34 MB RSS). Przy odrzuceniu obniż cele/pułapy (konfiguracja, nie kod) i powtórz; wynik zapisz w `.ai/runs/`. Pomiar na mikr.us wymaga zgody właściciela.

- **Historia, licznik i sprzątanie:** partia konto–bot zostaje w historii konta; partię gość–bot `db:cleanup` usuwa 1 h po końcu albo, gdy porzucona, 1 h po terminie zegara (jak gość–gość). Licznik `stats:games` i panel `/backend` mają pary `account-bot` i `bot-guest` oraz źródło „z botem”.

### Checklista włączenia `BOT_ENABLED`

Flaga zostaje wyłączona, dopóki nie są spełnione **wszystkie** warunki (R19; wdrożenie zbiorczo po epiku E13, decyzja właściciela):

1. Historie E13-S02…S05 są scalone do `main` i wdrożone na serwer razem z migracją `…_bot_participant` (`npm run db:migration:up` w kontenerze; `db:status` bez oczekujących migracji).
2. `.env.example` zawiera wszystkie zmienne `BOT_*` (`BOT_ENABLED`, `BOT_MAX_ACTIVE_GAMES`, `BOT_MIN_AVAILABLE_MB`, `BOT_L1_SOFT_MS`, `BOT_L1_CEILING_MS`, `BOT_L2_SOFT_MS`, `BOT_L2_CEILING_MS`, `BOT_FIXED_MEMORY_MB`) — uzupełnia go właściciel (sesje agentów nie mają dostępu do tego pliku).
3. Pomiar R18 na serwerze docelowym wykonany (`bot:bench` jak wyżej, bez równoległego builda), wynik zapisany w `.ai/runs/` i **zaakceptowany przez właściciela** w #264 (A-21/A-22 w briefie zaktualizowane). Przy odrzuceniu: obniżone cele/pułapy w `.env.production` i ponowny pomiar.
4. Odczyt pamięci na serwerze sprawdzony: `bot.refused` z `memory` nie pojawia się przy wolnej pamięci; jeśli `process.availableMemory()` w LXC jest nierealne, ustawione `BOT_FIXED_MEMORY_MB`.
5. Cron `db:cleanup` działa (linia `exit=0` w `/var/log/gomoku-cleanup.log` z ostatniej godziny) — inaczej partie gość–bot nie znikają.
6. Włączenie: `BOT_ENABLED=true` w `.env.production` i `docker compose --env-file .env.production -f compose.prod.yaml up -d --no-build`; potem jedna partia z botem na produkcji (konto, poziom 2), ruch bota w logu `bot_move`, partia w historii, para „konto – bot” w `/backend`.
7. Wycofanie: `BOT_ENABLED=` (albo `false`) i ten sam `up -d --no-build` — nowe partie dostają `503 BOT_UNAVAILABLE`, trwające kończą się normalnie; migracji nie cofa się (`down` odmawia przy istniejących partiach z botem).

## Motyw jasny/ciemny

Strony gracza (`(frontend)`) mają przełącznik motywu w prawym górnym rogu (wiersz nad treścią strony, na każdej stronie). Wybór zapisuje ciasteczko `gomoku_theme` (`dark` lub `light`, `Path=/`, `SameSite=Lax`, rok); serwer czyta je przy renderowaniu i ustawia `data-theme` na `<html>`. Bez poprawnego ciasteczka obowiązuje ustawienie systemu (`prefers-color-scheme`), a gdy system nie ma preferencji — motyw ciemny; mały skrypt w `<head>` ustawia motyw przed pierwszym malowaniem, więc strona nie migocze. Niepoprawna wartość ciasteczka jest ignorowana. Panel `/backend` ma własny motyw shadcn.

Ręczne sprawdzenie w dev: `npm run dev`, otwórz `/`, kliknij przełącznik („Ciemny motyw” przełącza na jasny i odwrotnie), odśwież stronę (wybór zostaje), usuń ciasteczko w narzędziach przeglądarki i zmień motyw systemu (lub emulację `prefers-color-scheme` w DevTools), odśwież — motyw podąża za systemem. Logika: `packages/core/src/theme/theme.ts`; scenariusze integracyjne: `tests/integration/theme-switch.test.ts`; przegląd ekranów: `.ai/analysis/2026-10-29-theme-review-e01.md`.

## Licznik zakończonych partii

Właściciel sprawdza, czy ktokolwiek gra z agentami (A-04), poleceniem **tylko do odczytu**; licznik jest trwały, bo `db:cleanup` usuwa partie gość–gość, gość–agent i gość–bot ok. godzinę po zakończeniu, więc zliczanie z `games` po fakcie zaniżałoby wynik. Gdy partia przechodzi w `finished` (pięć w linii, remis, upływ czasu także rozliczony leniwie, poddanie), **w tej samej transakcji** rośnie o 1 wiersz tabeli `game_pair_counters` (doba w `Europe/Warsaw` × para typów uczestników; bez odniesień do partii i kont, bez danych osobowych; błąd cofa partię i licznik razem). Funkcja `recordFinishedGame` (`packages/app/src/server/services/games/finished-game-counter.ts`) stoi we wszystkich ścieżkach; test strażnik `finished-game-counter.guard.test.ts` zawodzi, gdy nowy kod kończy partię bez niej.

```
npm run -s stats:games                                        # lokalnie, baza z DATABASE_URL
docker exec gomoku_prod-app-1 npm run -s stats:games          # produkcja (jak db:cleanup)
docker exec gomoku_prod-app-1 npm run -s stats:games | jq .
```

Wynik to jedna linia JSON: `timeZone`, `total`, `today`, `last7Days` (dziś i 6 poprzednich dób) oraz `pairs` (zawsze siedem par w stałej kolejności, także z zerem: `account-account`, `account-guest`, `account-agent`, `guest-guest`, `agent-guest`, `account-bot`, `bot-guest`; potem ewentualne nieznane pary). Kod wyjścia `1` i komunikat bez sekretów na stderr, gdy baza nie odpowiada. Odczyt zapewnia `FinishedGameStatsService.finishedByPair()` (ta sama funkcja zasila polecenie i przyszły panel `/backend`, #158).

Jak czytać liczby i czego nie mówią:

- **„Agent” znaczy „dołączył przez MCP”** (`join_channel = 'mcp'`), a nie dowód, że po drugiej stronie jest model językowy. To pomiar kanału, bez oceny i bez progu „ma sens” (Q-06 pozostaje otwarte).
- **Backfill przy wdrożeniu:** migracja doliczyła zakończone partie obecne w `games`. Dla par z kontem wynik jest dokładny; gość–gość i gość–agent zakończone i sprzątnięte przed wdrożeniem są nieodzyskiwalne, więc te dwie pary są zaniżone do dnia wdrożenia. Partie zakończone starą wersją aplikacji między migracją a startem nowej (sekundy) nie wejdą do żadnej pary.
- **Partie porzucone** (gościnne, z upłyniętym zegarem, do których nikt nie wrócił w ciągu godziny) usuwa `db:cleanup` bez rozliczenia, więc nigdy nie były `finished` i nie liczą się.
- Usunięcie konta ani sprzątanie partii nie zmniejszają licznika. Rewanż to osobna partia i liczy się osobno.
- Cofnięcie migracji (`db:migration:down`) **kasuje** liczniki, których nie da się odtworzyć: przed nim zrób `pg_dump --data-only -t game_pair_counters`.
- Po wycofaniu aplikacji do starej wersji (z nową tabelą) licznik przestaje rosnąć, bez awarii; ponowne wdrożenie wznawia zliczanie z luką.

Testy: `finished-game-counter*.test.ts`, `finished-game-stats-service.test.ts`, `packages/db/src/stats/*.test.ts`, `packages/core/src/games/finished-stats.test.ts`, integracyjne `finished-game-counter.test.ts` (każda ścieżka × każda para, wyścigi, rollback, cleanup, doba, polecenie) i `game-pair-counters-migration.test.ts` (backfill, up/down). Specyfikacja: [`.ai/specs/implemented/2026-10-31-finished-games-pair-counter.md`](../.ai/specs/implemented/2026-10-31-finished-games-pair-counter.md).

## Sprzątanie wygasłych rekordów

Wygasłe sesje, liczniki limitów i tokeny nie wpływają na poprawność (są filtrowane przy odczycie), ale tabele rosną, więc BR-18 wymaga ich usuwania bez udziału człowieka. Robi to komenda `npm run db:cleanup` (`packages/db/src/cleanup`), uruchamiana z `cron` na serwerze, a nie przez proces aplikacji.

**Co usuwa** (progi liczone od chwili uruchomienia; wiersz dokładnie na progu zostaje):

| Tabela | Usuwane, gdy |
| --- | --- |
| `sessions` | `expires_at` starsze niż 1 godzina (margines na partię trwającą po wygaśnięciu sesji) |
| `rate_limit_buckets` | `window_start` starsze niż 48 godzin (najdłuższe okno limitu to 24 godziny — dzienne pule `email-daily:*`; drugie 24 godziny to zapas na rozjazd zegara bazy, którym liczy limiter, i zegara Node, którym liczy sprzątanie) |
| `email_verification_tokens` | `expires_at` **lub** `used_at` starsze niż 24 godziny |
| `password_reset_tokens` | `expires_at` **lub** `used_at` starsze niż 24 godziny |
| `email_change_tokens` | `expires_at` **lub** `used_at` starsze niż 24 godziny |
| `lobby_seekers` | `expires_at` starsze niż 1 godzina (status „szukam gry” żyje 5 minut, odczyt filtruje wygasłe, więc godzina to tylko margines na rozjazd zegarów) |
| `game_spectators` | widzowie partii publicznych (E10-S02) po wygaśnięciu dostępu (`expires_at`: 1 godzina od ostatniego odczytu) + 1 godzina marginesu; widz znika też razem z partią lub kontem (`on delete cascade`) |
| `chat_messages` | wiadomości czatu partii `finished` (`finished_at`), `cancelled` (`created_at`) lub `active` z wygasłym zegarem (ten sam wzór co reguła partii gościnnych), starsze niż 1 godzina, **także gdy partia zostaje jako historia konta** (BR-34); reguła stoi przed regułami usuwającymi partie, a ten sam próg co tokeny gościa i agenta sprawia, że dostęp i treść znikają w jednym przebiegu |
| `games` (`waiting`) | zaproszenie wygasło ponad 1 godzinę temu (okno 1 h, w którym twórca-gość widzi „Zaproszenie wygasło”; uczestnicy i zaproszenie znikają razem z partią, `on delete cascade`) |
| `games` (`cancelled`) | `created_at` starsze niż 25 godzin (24 godziny życia zaproszenia + to samo okno 1 h dla niedołączonej wygasłej partii; razem z uczestnikami i zaproszeniem) |
| `games` (`active`, tylko goście) | partia bez uczestnika-konta (goście, agent i bot; partie gość–agent i gość–bot znikają jak gość–gość, konto–agent i konto–bot zostają jako historia), w której zegar gracza na ruchu wygasł (a gdy zegar nie ruszył — 15 minut od `started_at`) ponad 1 godzinę temu; wynik nie jest zapisywany, usuwany jest wiersz (razem z uczestnikami i zaproszeniem) |
| `games` (`finished`, tylko goście) | partia bez uczestnika-konta (także gość–agent i gość–bot) zakończona ponad 1 godzinę temu (partie z choć jednym istniejącym kontem to historia i zostają; partię, w której nie zostało żadne konto — np. konto–bot po usunięciu konta — usuwa reguła `orphanedFinishedGames` 1 godzinę po końcu) |
| `game_players.guest_token_hash` | partia `finished` ponad 1 godzinę temu: hash tokenu jest zerowany (wiersz zostaje, token i tak nie działa po godzinie) |
| `game_players.agent_token_hash` | to samo dla tokenu agenta (E06-S01): zerowany 1 godzinę po zakończeniu partii; wiersz i deklarowana nazwa modelu zostają z partią konta |
| `users` | e-mail niepotwierdzony, `created_at` starsze niż 14 dni i brak jakiegokolwiek wiersza w `game_players` (BR-28; także partia `cancelled` blokuje, dopóki reguły partii jej nie usuną; sesje i tokeny znikają kaskadą). Reguła jest ostatnia, więc konto, któremu ten sam przebieg zabrał ostatnią partię, odpada od razu |

Potwierdzone konta usuwa tylko ich właściciel ([Usunięcie konta](#usunięcie-konta)). Usuwanie idzie partiami po 1000 wierszy (krótkie transakcje, `for update skip locked`). Każda reguła ma własny budżet 15 sekund (wolna reguła nie zagłodzi następnych; najgorszy przebieg to 14 reguł × 15 s = 210 s, czyli mieści się w godzinnym odstępie `cron`); po jego upływie reguła przerywa, a resztę zabierze następny przebieg (`truncated: true`). Dwa przebiegi naraz są bezpieczne.

**Wynik i kody wyjścia.** Jedna linia JSON na stdout: liczba usuniętych wierszy na regułę (przy błędzie reguły — liczba usuniętych do chwili błędu), `null` (tylko reguła oznaczona jako opcjonalna, gdy jej tabeli brak; dziś żadna nie jest), `errors` (reguły, które zgłosiły błąd) i `truncated`:

```json
{"sessions":3,"rateLimitBuckets":0,"emailVerificationTokens":1,"passwordResetTokens":0,"emailChangeTokens":0,"lobbySeekers":0,"chatMessages":0,"gameSpectators":0,"waitingGames":0,"cancelledGames":0,"guestOnlyActiveGames":0,"guestOnlyFinishedGames":0,"orphanedFinishedGames":0,"guestTokens":0,"agentTokens":0,"unverifiedUsers":0,"errors":[],"truncated":false}
```

Błąd jednej reguły (w tym brak tabeli, np. nieuruchomione migracje) nie przerywa pozostałych: linia JSON z postępem nadal trafia na stdout, a w `errors` jest `{"rule":"sessions","code":"42P01"}` (nazwa reguły i kod SQL lub nazwa klasy błędu — bez komunikatu, który mógłby zawierać dane). Wtedy kod wyjścia to `1`, a na stderr jest `{"ok":false,"errors":[…]}`. Kod `1` i `{"ok":false,"error":"…"}` (zamaskowane hasło w adresie bazy) także przy innej awarii całego przebiegu. Kod `0` oznacza brak błędów (`truncated: true` to nie błąd). Następny przebieg `cron` spróbuje ponownie. Komenda nigdy nie tworzy brakującej bazy.

> **Uwaga:** na bazie deweloperskiej `npm run db:cleanup` naprawdę kasuje wygasłe dane z bazy z `DATABASE_URL` (pliki `.env*`). Przed uruchomieniem sprawdź, na jaką bazę wskazuje. Testy integracyjne sprawdzają komendę wyłącznie na bazie z Testcontainers.

**Cron na mikr.us.** Obraz produkcyjny zawiera `tsx` i kod pakietu `db` (zależności nie są czyszczone), a `DATABASE_URL` jest w środowisku kontenera, więc komenda działa przez `docker exec`. Na serwerze (nie w repozytorium) utwórz osobny plik `/etc/cron.d/gomoku-cleanup`:

```cron
# Co godzinę; flock -n pomija przebieg, gdy poprzedni jeszcze trwa. Wynik, błędy (kod 1) i czas lądują w logu.
0 * * * * root flock -n /tmp/gomoku-cleanup.lock sh -c 'docker exec gomoku_prod-app-1 npm run -s db:cleanup; echo "$(date -Is) exit=$?"' >> /var/log/gomoku-cleanup.log 2>&1
```

`flock -n` przy zajętym locku kończy się cicho (bez wpisu w logu — przebieg jest po prostu pominięty). To optymalizacja, nie wymóg poprawności: dwa przebiegi naraz są bezpieczne dzięki `skip locked`. Linia `<data> exit=<kod>` po każdym przebiegu pozwala ocenić, kiedy ostatnio się udał. Log rośnie, więc dodaj rotację, np. `/etc/logrotate.d/gomoku-cleanup`:

```
/var/log/gomoku-cleanup.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    copytruncate
}
```

Nazwę kontenera sprawdź przez `docker compose -f compose.prod.yaml ps` (przy `name: gomoku_prod` to zwykle `gomoku_prod-app-1`). Kontrola: `docker exec gomoku_prod-app-1 npm run -s db:cleanup; echo $?` oraz `tail /var/log/gomoku-cleanup.log`. Rollback: usunięcie pliku `/etc/cron.d/gomoku-cleanup`.

## Konto administratora

Administratorem instalacji (E08, BR-35) jest konto, którego e-mail równa się zmiennej `ADMIN_EMAIL` (nie ma pola roli w bazie). W produkcji zmienna jest **wymagana**: wpisz ją do `.env.production` przed aktualizacją (bez niej `docker compose up` odmówi startu).

Konto zakłada wyłącznie operator poleceniem (w kontenerze `app`, potrzebne `-it` dla monitu bez echa):

```bash
docker compose --env-file .env.production -f compose.prod.yaml exec -it app npm run -s admin:create -- --name "Nazwa"
```

- Gdy konto na `ADMIN_EMAIL` już istnieje (np. założył je ktoś obcy przed wdrożeniem), polecenie pyta `[t/N]` i je **przejmuje**: nowe hasło, potwierdzony e-mail, unieważnione wszystkie sesje i tokeny; nazwa gracza zostaje. `--yes` pomija pytanie (wymagane bez terminala). To także sposób na odzyskanie dostępu (A-12); alternatywą jest zwykły reset hasła z poczty.
- Bez terminala hasło idzie jedną linią ze stdin: `printf '%s\n' "$HASLO" | docker compose … exec -T app npm run -s admin:create -- --name Nazwa --yes`. Operator odpowiada za historię powłoki. Hasła nie da się podać argumentem ani zmienną środowiskową (widać je w `ps`, `/proc` i `docker inspect`).
- Polecenie działa na bazie z `DATABASE_URL` procesu (w repozytorium: na bazie dev) i wypisuje jej adres przed pytaniem o hasło; wynik to jedna linia JSON bez sekretów.
- Rejestracja przez stronę na `ADMIN_EMAIL` jest odrzucana tym samym komunikatem co zajęty e-mail, konta nie można usunąć (`403 ADMIN_ACCOUNT_PROTECTED`), a `db:cleanup` nie kasuje go jako niepotwierdzonego.
- Zmiana `ADMIN_EMAIL` po wdrożeniu: stare konto staje się zwykłym graczem (traci ochronę przed usunięciem), nowy adres wymaga `admin:create` (Q-15 w briefie jest otwarte).

## Panel administratora

`/backend` (E08-S02, BR-37) jest panelem **tylko do odczytu** dla administratora instalacji. Otwiera się wyłącznie po zalogowaniu na konto z `ADMIN_EMAIL` z potwierdzonym e-mailem; każdy inny odwiedzający (brak sesji, sesja wygasła, zwykły gracz, niedostępna baza, nieustawiony `ADMIN_EMAIL`) dostaje zwykłe `404`, bez przekierowania i bez śladu istnienia panelu. Rola jest sprawdzana z konfiguracji przy każdym żądaniu (bramka `requireAdmin()` w `packages/app/src/server/http/admin-gate.ts`), więc po `admin:create` (unieważnienie sesji) lub zmianie `ADMIN_EMAIL` dostęp znika natychmiast. Bramka doraźna z #154 została zastąpiona; w środowisku dev panel też wymaga konta administratora.

Panel pokazuje:

- **Liczniki:** konta (wszystkie, potwierdzone, niepotwierdzone); partie w bazie teraz wg statusu, początku (zaproszenie, lobby, rewanż, z botem) i zakończenia (to stan chwilowy: `db:cleanup` usuwa część zakończonych partii po ok. godzinie); zakończone partie dziś, w 7 dni i razem oraz wg pary typów uczestników z trwałego licznika (E06-S03, doba w `Europe/Warsaw`).
- **Konta:** stronicowana lista (po 25) z nazwą, **e-mailem**, potwierdzeniem e-maila, datą założenia, liczbą zakończonych partii i rolą. Wyszukiwanie tylko po nazwie gracza (e-mail w adresie URL trafiłby do logów i nagłówka `Referer`), sortowanie po nazwie lub dacie założenia. E-mail jest wyjątkiem od BR-14 widocznym wyłącznie tutaj; wymagania prawne takiego dostępu (RODO, Q-14) trzeba sprawdzić przed udostępnieniem gry osobom z zewnątrz.

Panel nie ma żadnej akcji zmieniającej dane: w grupie `(backend)` nie ma route handlerów ani server actions, a test strażnik `admin-gate.guard.test.ts` zawodzi, gdy któryś pojawi się bez `requireAdmin()` (lub w ogóle). Odpowiedź z danymi nie jest buforowana.

## Zdarzenia bezpieczeństwa w logach

Aplikacja zapisuje zdarzenia bezpieczeństwa (OWASP A09:2025, `docs/security/threat-model.md`) jako **jednowierszowy JSON** na stderr (`console.warn`, funkcja `logSecurityEvent` w `packages/app/src/server/http/security-log.ts`). Linia ma stały kod `event` (`security.<kod>`), czas `ts` i co najwyżej nazwę puli (`scope`) lub powód (`reason`). Nigdy nie zawiera e-maila, adresu IP, tokenu, pseudonimu ani user-agenta; udane żądania nie są logowane.

| Zdarzenie | Kiedy | Szczegóły |
| --- | --- | --- |
| `security.rate_limited` | pierwsze odrzucenie (429) puli w oknie licznika; kolejne odrzucenia tego samego okna nie dopisują linii, więc zalew 429 daje jedną linię na pulę i okno | `scope`: nazwa puli, np. `login:ip`, `login:email-ip`, `mcp:ip`, `invitation-lookup:ip` |
| `security.csrf_rejected` | zmiana stanu bez właściwego `Origin` lub bez nagłówka `X-Gomoku-Request` | `reason`: `origin` albo `missing_header` |
| `security.admin_denied` | `/backend`, `/show*` lub `/api/show*` otwarte przez kogoś, kto nie jest administratorem (w tym boty szukające panelu) | brak |
| `security.show_created`, `security.show_ended` | administrator utworzył albo zakończył pokaz (E14, jedyne zapisy administratora) | brak (bez id partii i konta) |
| `security.login_failed` | złe hasło lub nieznany e-mail (jedna linia dla obu przypadków) | brak |
| `security.invitation_lookup_failed` | nieznany lub nieważny kod zaproszenia (przeglądarka i agent MCP) | `scope`: `invitation-lookup:ip`, `agent-lookup:ip` lub `...:global` |
| `security.mcp_token_invalid` | wywołanie narzędzia MCP z nieznanym tokenem partii | brak |

Objętość: linia powstaje tylko przy odmowie. Najgęstsze źródło to `login_failed` i `mcp_token_invalid`, ale ograniczają je limity żądań (np. logowanie: 30 prób na godzinę i adres, MCP: 300 żądań na minutę i adres), więc jeden adres nie wyprodukuje więcej niż kilkaset linii na minutę. Logi Dockera mają rotację z konfiguracji demona; nie ma SIEM-a ani alertów.

Przegląd na VPS (kontener aplikacji, nazwę sprawdź przez `docker compose -f compose.prod.yaml ps`):

```bash
# Zdarzenia z ostatniej doby, policzone wg kodu:
docker logs --since 24h <kontener-aplikacji> 2>&1 | grep '"event":"security.' | grep -o '"event":"[^"]*"' | sort | uniq -c | sort -rn

# Surowe linie ostatniej godziny (np. po zgłoszeniu problemu):
docker logs --since 1h <kontener-aplikacji> 2>&1 | grep '"event":"security.'
```

Przykładowy wpis crona, który raz dziennie dopisuje podsumowanie do pliku (bez wysyłki, bez alertów):

```cron
5 6 * * * docker logs --since 24h <kontener-aplikacji> 2>&1 | grep -o '"event":"security\.[a-z_]*"' | sort | uniq -c >> /var/log/gomoku-security.log
```

## Limit rozmiaru ciała żądań

Ciało żądań JSON do `/api/*` (poza `/api/mcp`, które ma własny limit 8 KB) może mieć najwyżej **64 KB** (`API_BODY_MAX_BYTES` w `packages/app/src/server/http/api-handler.ts`). Większe jest odrzucane odpowiedzią `413` (`PAYLOAD_TOO_LARGE`) przed parsowaniem: po nagłówku `Content-Length` oraz przez liczenie bajtów strumienia, więc brak lub fałszywy nagłówek nie pomaga. Odpowiedzi JSON z `/api/*` mają `Cache-Control: private, no-store`.

## Adres klienta za proxy (pomiar #112)

Pomiar z 2026-11-04 na produkcji (`gomoku.byst.re`, `TRUST_PROXY_HOPS=1`). Metoda: kilka nieszkodliwych żądań `POST /api/invitations/ZZZZ-ZZZZ/spectate` (nieistniejący kod, odpowiedź `410`), po których odczytano klucze liczników `invitation-lookup:ip:<sha256(adres)>` w `rate_limit_buckets`. Klucz jest skrótem adresu, więc pozwala sprawdzić, jaki adres aplikacja uznała za klienta. Konta i partie nie były zakładane.

| Ścieżka | Wynik |
| --- | --- |
| Przez domenę (`https://gomoku.byst.re`) | Proxy mikr.us **dopisuje adres klienta na końcu** `X-Forwarded-For`. Wpis podany przez klienta po lewej (`1.2.3.4`) nie zmienia klucza, a żądania z innego adresu (serwer) dają inny klucz. Żadnego `500` z powodu adresu. `TRUST_PROXY_HOPS=1` jest właściwe. |
| Bezpośrednio na port aplikacji (`<serwer>.mikrus.xyz:<20000+ID>`) | Port jest publikowany na wszystkich interfejsach (`compose.prod.yaml`), a nagłówek podany przez klienta jest **w całości zaufany** (klucz = skrót z podanego `X-Forwarded-For`). Kto zna numer portu, może podawać inny adres przy każdym żądaniu i omijać limity per adres. |

Ryzyko resztkowe (zaakceptowane, T-01 w `docs/security/threat-model.md`): ominięcie dotyczy tylko limitów kluczowanych adresem. Limity per konto i per e-mail (np. logowanie `login:email`) działają niezależnie, a przestrzeń kodów zaproszeń (ok. 8,5·10^11) czyni zgadywanie niewykonalnym. Wiązanie portu do `127.0.0.1` nie wchodzi w grę bez osobnego sprawdzenia, bo proxy mikr.us łączy się z portem z zewnątrz. Jeśli nadużycia zaczną być problemem: nginx przed aplikacją ufający `X-Forwarded-For` tylko od adresu proxy mikr.us albo Cloudflare z `CLIENT_IP_HEADER=cf-connecting-ip`.
