# QA PR #224 — przegląd partii i partie publiczne z widzami (E09/E10)

Head: 56a72cfe207d619954cdc2000869d976eee329e1 · środowisko: produkcyjny `next start` z buildu głowy PR, świeży PostgreSQL 17, migracje z PR (4 nowe) w górę bez błędów · przeglądarka: agent-browser, Chrome · konta demo jednorazowe.

| # | Scenariusz | Wynik | Dowód |
|---|---|---|---|
| 1 | Lobby: brak opcji "partia publiczna" (BR-40) | PASS | s01 |
| 2 | Konto: checkbox domyślnie odznaczony; zaznaczony -> is_public=true | PASS | s02, s03, s04 |
| 3 | Gość: checkbox przy tworzeniu zaproszenia (320 px, ciemny); is_public=true | PASS | s24 |
| 4 | Przeciwnik widzi "Partia publiczna: może ją oglądać każdy z kodem" przed dołączeniem (1280 i 320 px, bez poziomego przewijania) | PASS | s05, s06 |
| 5 | Trzecia osoba (gość bez nicka) z kodem po rozpoczęciu: plansza, ruchy na żywo, zegary; klik w pole nic nie zmienia; moves/resign/rematch/chat gracza -> 404 | PASS | s08, s09, s10 |
| 6 | Widz bez nicka nie pisze (brak pola; API 403) | PASS | s09 |
| 7 | Widz z nickiem i konto piszą na czacie z oznaczeniem "Widz · nick"; widz nie ma przełącznika czatu | PASS | s11, s15 |
| 8 | Flaga "Partia publiczna · widzów: N" u graczy i widzów, licznik rośnie/maleje | PASS | s12 |
| 9 | Gracz wyłącza czat dla siebie: nie widzi wiadomości; drugi gracz i widzowie rozmawiają dalej | PASS | s13 |
| 10 | Limit widzów 20 (stała SPECTATORS_MAX; 19 obecnych + 1 = OK, kolejny): "Partia ma komplet widzów", 320 px bez przewijania | PASS | s14 |
| 11 | Widz (konto) nie blokuje utworzenia własnej partii (jedna aktywna partia nie liczy widza); druga partia -> ACTIVE_GAME_EXISTS | PASS | API |
| 12 | Widok widza: ciemny motyw, 320 px, bez przewijania poziomego | PASS | s15, s16 |
| 13 | Twórca zamyka publiczność (dialog potwierdzenia, "Zostaw publiczność"/"Zamknij publiczność"): widz odłączony komunikatem, kod nie otwiera oglądania (UI i API 410), partia toczy się jako prywatna, flaga znika | PASS | s17-s20 |
| 14 | Po zakończeniu partii z zamkniętą publicznością: kod nie otwiera przeglądu (404) | PASS | s21 |
| 15 | /history -> przegląd własnej partii: poprzedni/następny/początek/koniec (mysz i klawiatura Enter), wynik i sposób zakończenia, brak czatu | PASS | s22, s23 |
| 16 | Cudza partia prywatna -> 404 (obcy zalogowany); /history bez konta -> login | PASS | API/UI |
| 17 | Partia publiczna po kodzie/linku bez konta: przegląd ruchów, wynik; zły kod -> 404; w historii widza pusto | PASS | s27, s28, s29 |
| 18 | Partia prywatna po kodzie (w trakcie i po zakończeniu): odmowa | PASS | s32 |
| 19 | Widz na żywo widzi wynik końcowy | PASS | s25, s26 |
| 20 | Partia z agentem (MCP) publiczna: join/get_state/play_move działają, widz widzi "Agent · probe model 1" i ruchy; token agenta nie występuje w HTML ani w stanie widza; cookie widza nie jest tokenem MCP (INVALID_TOKEN); widzowie w polu chat agenta jako `spectator`, `untrusted` | PASS | s30, s31 |
| 21 | Migracje 4 sztuki na świeżej bazie w górę | PASS | log |
| - | Migracje w dół, 21 widzów w przeglądarce (limit przez 18 sesji API + UI) | not exercised (w dół: pokrywają testy integracyjne `*-migration.test.ts` w CI) | |

Uwagi: (1) Obecność widza jest liczona oknem 15 s, więc w tabeli bywa >20 wierszy, a limit dotyczy obecnych (zgodne z implementacją). (2) Skrypt środowiska `.ai/scripts/test-env-up.sh` nie ustawia `ADMIN_EMAIL` (wymagane od E08, rejestracja daje 500) - to błąd skryptu QA, nie PR; obejście: `ADMIN_EMAIL=... sh test-env-up.sh`.
