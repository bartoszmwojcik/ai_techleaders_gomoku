# Backlogs

## .ai/specs/product-brief.md
Backlog source: .ai/specs/product-brief.md
Last filed: 2026-11-04

| Id | Issue | Title | Epic | Depends on | Adopted |
|---|---|---|---|---|---|
| E01 | #15 | Konta użytkowników | — | — | no |
| E01-S01 | #19 | Użytkownik może założyć konto i widzi, że jest zalogowany | #15 | — | no |
| E01-S01-T01 | #28 | Migracja: tabela użytkowników | #19 | — | no |
| E01-S02 | #20 | Użytkownik może się zalogować i wylogować | #15 | E01-S01 (#19) | no |
| E01-S02-T01 | #39 | Sprzątanie wygasłych sesji i liczników limitu | #20 | E01-S02 (#20) | no |
| E01-S03 | #34 | Zalogowany użytkownik może potwierdzić e-mail linkiem (nieblokująco) | #15 | E01-S01 (#19), E01-S03-T01 (#38) | no |
| E01-S03-T01 | #38 | Decyzja: dostawca wysyłki poczty i jego koszt | #34 | — | no |
| E01-S04 | #35 | Użytkownik, który zapomniał hasła, ustawia nowe przez link z e-maila | #15 | E01-S03 (#34) | no |
| E01-S05 | #36 | Zalogowany użytkownik zmienia hasło | #15 | E01-S02 (#20) | no |
| E01-S06 | #37 | Zalogowany użytkownik usuwa konto, a jego partie zostają u przeciwników jako „Usunięty gracz” | #15 | E01-S02 (#20), E02-S01-T01 (#29) | no |
| E02 | #16 | Partia z zaproszenia | — | — | no |
| E02-S01 | #21 | Zalogowany użytkownik tworzy partię i wysyła link lub kod, a zaproszona osoba dołącza | #16 | E01-S02 (#20) | no |
| E02-S01-T01 | #29 | Migracja: partia, uczestnik, zaproszenie, ruch | #21 | E01-S01-T01 (#28) | no |
| E02-S01-T02 | #30 | Spike: transport czasu rzeczywistego | #21 | — | no |
| E02-S02 | #22 | Gracze wykonują naprzemienne ruchy, a system wykrywa wygraną lub remis | #16 | E02-S01 (#21) | no |
| E02-S03 | #23 | Każdy gracz ma zegar 10 minut, a wyczerpanie czasu kończy partię | #16 | E02-S02 (#22) | no |
| E02-S04 | #24 | Rozłączony gracz wraca do partii, a jego zegar w tym czasie biegł | #16 | E02-S03 (#23) | no |
| E02-S05 | #87 | Gracz poddaje partię, a przeciwnik wygrywa z powodem „poddanie” | #16 | — | yes |
| E02-S06 | #88 | Gracze proponują rewanż po partii, a przyjęcie tworzy nową partię z odwróconymi kolorami | #16 | — | yes |
| E02-S07 | #94 | Gość podaje nick albo zatwierdza „Gracz 1” / „Gracz 2”, a przeciwnik widzi go jako „{nick} (gość)” | #16 | — | yes |
| E02-S08 | #95 | Użytkownik bez konta tworzy partię i wysyła zaproszenie kodem lub linkiem | #16 | — | yes |
| E03 | #17 | Otwarte lobby | — | — | no |
| E03-S01 | #25 | Zalogowany użytkownik oznacza się jako „szukający gry” i widzi swój status, który wygasa po 5 minutach | #17 | E02-S01 (#21) | no |
| E03-S01-T01 | #31 | Migracja: status „szukającego” | #25 | E02-S01-T01 (#29) | no |
| E03-S02 | #26 | Zalogowany użytkownik przegląda lobby, wybiera przeciwnika i obaj trafiają do nowej partii | #17 | E03-S01 (#25) | no |
| E04 | #18 | Historia partii | — | — | no |
| E04-S01 | #27 | Użytkownik widzi listę swoich zakończonych partii z przeciwnikiem, wynikiem, datą i sposobem zakończenia | #18 | E02-S03 (#23) | no |
| E05 | #33 | Later | — | — | no |
| E06 | #124 | Gra z własnym agentem LLM przez MCP | — | — | no |
| E06-S01 | #127 | Agent dołącza kodem lub linkiem do partii prywatnej jako uczestnik „Agent”, a człowiek widzi etykietę „Agent” | #124 | E02-S01 (#21), E02-S08 (#95), E06-S01-T01 (#125), E06-S01-T02 (#126) | no |
| E06-S01-T01 | #125 | Decyzja: tożsamość klienta MCP, token, jego ważność i limity nadużyć (Q-09) | #127 | — | no |
| E06-S01-T02 | #126 | Migracja: typ uczestnika i kanał dołączenia | #127 | E06-S01-T01 (#125) | no |
| E06-S02 | #128 | Agent gra partię do końca przez narzędzia MCP (join, get_state, play_move) pod zegarem 10 minut | #124 | E06-S01 (#127) | no |
| E06-S03 | #129 | Właściciel widzi licznik zakończonych partii wg pary typów uczestników (konto, gość, agent) | #124 | E06-S01 (#127) | no |
| E06-S04 | #140 | Człowiek widzi wskazówkę „Jak podłączyć agenta” (adres MCP, komenda, kod zaproszenia) | #124 | E06-S01 (#127), E06-S02 (#128) | no |
| E07 | #144 | Czat w partii | — | — | no |
| E07-S01 | #146 | Uczestnik partii (konto lub gość) wysyła i czyta wiadomości przeciwnika w trwającej partii i na ekranie wyniku | #144 | E02-S02 (#22), E02-S08 (#95), E07-S01-T01 (#145) | no |
| E07-S01-T01 | #145 | Migracja: wiadomości czatu i ustawienie wyłączenia per partia | #146 | E02-S01-T01 (#29) | no |
| E07-S02 | #147 | Uczestnik wyłącza czat w partii, a rozmówca widzi „Rozmówca wyłączył czat” | #144 | E07-S01 (#146) | no |
| E07-S03 | #148 | Czat znika po grze: wiadomości są usuwane w ciągu ok. 2 h od zakończenia, a także przy usunięciu konta lub wygaśnięciu tokenu | #144 | E07-S01 (#146); cron `db:cleanup` | no |
| E07-S04 | #149 | Agent czyta i pisze na czacie przez MCP (`send_message`, pole `chat`, `chatStatus`) | #144 | E06-S02 (#128), E07-S01 (#146), E07-S02 (#147) | no |
| E08 | #155 | Administrator instancji i panel /backend (v1) | — | — | no |
| E08-S01 | #157 | Właściciel zakłada lub przejmuje konto administratora poleceniem npm run admin:create i loguje się nim | #155 | E08-S01-T01 (#156) | no |
| E08-S01-T01 | #156 | Konfiguracja ADMIN_EMAIL (wymagany w produkcji, fail closed) | #157 | — | no |
| E08-S02 | #158 | Administrator widzi w panelu /backend liczniki partii i listę kont ze stanami | #155 | E08-S01 (#157); #154 (bramka doraźna dla #152) | no |
| E09 | #200 | Przegląd przebiegu zakończonej partii | — | — | no |
| E09-S01 | #203 | Uczestnik z kontem otwiera zakończoną partię z /history i przegląda jej ruchy | #200 | E04-S01 (#27) | no |
| E09-S02 | #204 | Każdy z kodem/linkiem przegląda zakończoną partię publiczną | #200 | E09-S01 (#203), E10-S01 (#202) | no |
| E10 | #201 | Partie publiczne z widzami | — | — | no |
| E10-S01 | #202 | Twórca zaznacza „partia publiczna” przy zaproszeniu, a przeciwnik widzi to przed dołączeniem | #201 | E02-S02 (#22), E02-S08 (#95), E10-S01-T01 (#205) | no |
| E10-S01-T01 | #205 | Migracja: flaga publiczności partii | #202 | E02-S01-T01 (#29) | no |
| E10-S02 | #207 | Osoba z kodem ogląda rozpoczętą partię publiczną na żywo jako widz | #201 | E10-S01 (#202), E10-S02-T01 (#206), E10-S02-T02 (#208) | no |
| E10-S02-T01 | #206 | Decyzja: mechanizm odświeżania widza (polling czy push, Q-17) i pomiar obciążenia przy 20 widzach (A-14) | #207 | — | no |
| E10-S02-T02 | #208 | Migracja: uczestnik-widz (tymczasowy; nick lub konto) | #207 | E10-S01-T01 (#205) | no |
| E10-S03 | #209 | Widz pisze na czacie i nie może go wyłączyć; gracz wyłącza czat dla siebie | #201 | E10-S02 (#207), E07-S01 (#146), E07-S02 (#147) | no |
| E10-S04 | #210 | Gracze i widzowie widzą flagę „Partia publiczna” z licznikiem oglądających | #201 | E10-S02 (#207) | no |
| E10-S05 | #211 | Twórca zamyka publiczność w trakcie partii | #201 | E10-S02 (#207) | no |
| E10-S06 | #212 | Partia z agentem (MCP) też może być publiczna | #201 | E10-S01 (#202), E06-S01 (#127) | no |
| E12 | #232 | Kod QR zaproszenia | — | — | no |
| E12-S01 | #233 | Twórca zaproszenia widzi kod QR z linkiem, a osoba obok skanuje go i trafia do dołączenia | #232 | — | no |
| E12-S02 | #234 | W trwającej partii publicznej widać kod QR, którego skan otwiera oglądanie | #232 | E12-S01 (#233), E10-S01 (#202) | no |

Uwagi 2026-11-04 (E12): kod QR zaproszenia to osąd właściciela (D-35; przesłanka: pokaz na spotkaniu, A-19), bez dowodu popytu; zgoda na zależność `qrcode` (MIT), działanie na mikr.us do potwierdzenia po wdrożeniu; `SDLC.md` nie ma Definition of Ready. Q-22 (kto widzi kod w partii publicznej) nieblokujące. Id E11 zajęte przez źródło specyfikacji wariantu „papier i ołówek”.

Uwagi 2026-11-02 (E09, E10): przegląd historii i partie publiczne z widzami to osąd właściciela (D-33), bez dowodu popytu (A-01); przyjęte ryzyka A-13, A-15, A-14 do zmierzenia (E10-S02-T01); `SDLC.md` nie ma Definition of Ready. Zgłoszenia założono przez `om-prepare-issue` (bez adopcji: wyszukiwanie „publiczna”, „widz”, „przegląd partii”, „spectator”, „replay” niczego nie znalazło). Szczegóły z „propozycja agenta, niepotwierdzona” (BR-13 dla widza, podpis widza, czat widzów po zakończeniu i w polu `chat` agenta, ponowne otwarcie publiczności, czas dostępu widza) zapisano jako otwarte pytania nieblokujące do specyfikacji. Q-16 (prawo) wymagane przed udostępnieniem osobom z zewnątrz (S3).

Uwagi 2026-10-31 (E08): rola administratora i panel `/backend` to eksperyment i potrzeba właściciela (D-32, A-10), bez dowodu popytu; `SDLC.md` nie ma Definition of Ready. Zgłoszenia założono przez `om-prepare-issue`. Q-13 i Q-15 blokują tylko historyjki poza v1, Q-14 dopiero udostępnienie osobom z zewnątrz. Zależność: licznik z E06-S03 (#129) jest odczytywany w panelu, więc wyświetla go E08-S02 (#158); sam panel nie czeka na E06. Niezałożone (E05 #33): nadawanie i odbieranie roli z dziennikiem audytowym (BR-36, BR-38), edycja nazwy gracza przez administratora, usuwanie cudzego konta przez administratora.

Uwagi 2026-10-31 (E07): czat w partii to eksperyment właściciela (D-30), bez dowodu popytu (A-07); przyjęte ryzyka A-08 i A-09; `SDLC.md` nie ma Definition of Ready. Zgłoszenia założono przez `om-prepare-issue`. Niezałożone (E05 #33): zgłaszanie nadużyć i moderacja czatu (Q-10), historia czatu, gotowe frazy i emotki, zapamiętane ustawienie czatu na koncie; pominięto też licznik partii z wiadomością (niezatwierdzony) i stronę o danych (Q-11).

Uwagi 2026-10-31: E02-S05…S08 (#87, #88, #94, #95) założono poza `om-backlog` (bez linii `Backlog source:`/`Backlog id:`); ich zależności nie zostały odtworzone, kolumna „Depends on” zawiera „—”. E06 to eksperyment właściciela (D-28), bez dowodu popytu (A-04, A-06); `SDLC.md` nie ma Definition of Ready. E06-S01-T01 (Q-09) blokuje E06-S01, E06-S01-T02 i E06-S02. Pozycje „Później” (CLI dla agenta, agent w lobby, przeciwnik hostowany przez nas) dopisano do E05 (#33).

## Stan wdrożenia E06 (2026-10-31)

Źródło: `track-e06.md`. Specyfikacje S01 i decyzja D-29 leżą w `.ai/specs/implemented/`.

| Id | Issue | Stan | Dowód |
|---|---|---|---|
| E06-S01-T01 | #125 | decyzja zatwierdzona i wdrożona w S01 (token, transport, limity początkowe, `agentName`) | `.ai/specs/implemented/2026-10-31-mcp-agent-identity.md`, PR #138, wdrożenie w PR #143 |
| E06-S01-T02 | #126 | wdrożone (`Migration20261031175106_agent_participant`, `Closes #126`) | PR #143 |
| E06-S01 | #127 | wdrożone (`join`, etykieta „Agent”, rewanż niedostępny, `Closes #127`) | PR #143, `.ai/specs/implemented/2026-10-31-agent-joins-private-game.md` |
| E06-S02 | #128 | wdrożone (`get_state` z `waitSeconds`, `play_move`, jednolity błąd `isError`, limit `mcp-token:*`, `Closes #128`) | `.ai/specs/implemented/2026-10-31-agent-plays-game-mcp.md`, spec PR #142 |
| E06-S03 | #129 | wdrożone (tabela `game_pair_counters`, `recordFinishedGame` w każdej ścieżce zakończenia, backfill, `npm run stats:games`, `Closes #129`) | `.ai/specs/implemented/2026-10-31-finished-games-pair-counter.md`, spec PR #164 |
| E06-S04 | #140 | po S02 | — |

## Zmiany z 2026-10-26: uproszczony start konta

Źródło: `.ai/specs/implemented/2026-10-26-account-onboarding-simplification.md` (decyzje D-24…D-26, BR-26…BR-28; osąd właściciela, nie wynik badania). Tabela wyżej odpowiada jeszcze tytułom zgłoszeń sprzed zmiany; edycje zgłoszeń to osobna pozycja (Faza 4) i **muszą być zakończone przed rozpoczęciem implementacji #20, #21 i dalszych**.

| Pozycja | Zmiana | Zgłoszenie |
|---|---|---|
| E01-S01 | Hasło co najmniej 8 znaków (BR-28), konto aktywne od razu. **Zgłoszenie zamknięte bez kodu w `main`:** uzgodnić ze stanem rzeczywistym (otworzyć ponownie albo wskazać następcę). | #19 |
| E01-S02 | Bez zmian poza komunikatem i bannerem (konto niepotwierdzone loguje się i gra normalnie). | #20 |
| E01-S03 | Tytuł zmieniony (bez „i może grać”): kryterium „gra odblokowana” odpada; zostaje „e-mail potwierdzony”. Potwierdzenie nie blokuje niczego. | #34 |
| E01-S04 | Reset tylko po potwierdzonym e-mailu (BR-27). | #35 |
| E01-S05 | Nowe hasło 8–72 bajty (BR-28). | #36 |
| E02-S01 | Bez stanu „zalogowany bez potwierdzenia”; `as = guest` niedozwolone dla każdego zalogowanego; strona `/invite/[code]` jako s07. | #21 |
| E03-S01, E03-S02 | Bez bramki `emailVerifiedAt` (BR-26). | #25, #26 |
| E01-S03-T01 | Dostawca poczty nie blokuje rejestracji ani gry; potrzebny dla potwierdzenia i resetu. | #38 |
| Nowa pozycja w #39 | Reguła 14 dni: `emailVerifiedAt IS NULL`, `createdAt` starsze niż now − 14 dni, `NOT EXISTS` wiersz uczestnika partii; kaskada usuwa sesje i tokeny. **Zablokowana przez** E02-S01-T01 (#29). Zastępuje Q14 (7 dni). | #39 |

## .ai/specs/2026-11-02-paper-pencil-gomoku.md
Backlog source: .ai/specs/2026-11-02-paper-pencil-gomoku.md
Last filed: 2026-11-02

| Id | Issue | Title | Epic | Depends on | Adopted |
|---|---|---|---|---|---|
| E11 | #215 | Wariant gry „papier i ołówek” | — | — | no |
| E11-S01 | #216 | Twórca zaproszenia wybiera „papier i ołówek” i czas, a gracze stawiają kamienie z odstępem ≤ 3 i zdobywają punkty za piątki | #215 | E11-S01-T01 (#222), E11-S01-T02 (#223) | no |
| E11-S01-T01 | #222 | Migracja: wariant i czas partii, paper_game_states, paper_moves | #216 | — | no |
| E11-S01-T02 | #223 | Reguły wariantu w core (odstęp, punktacja, ruch automatu, oś czasu) | #216 | — | no |
| E11-S02 | #217 | Po upływie czasu wygrywa wyższy wynik, a za prowadzącego bez czasu stawia automat | #215 | E11-S01 (#216) | no |
| E11-S03 | #218 | Gracz przesuwa i powiększa planszę (telefon 15–21 pól) i stawia kamień przyciskami 44 px | #215 | E11-S01 (#216) | no |
| E11-S04 | #219 | Rewanż i lobby zachowują wariant i czas | #215 | E11-S01 (#216) | no |
| E11-S05 | #220 | Historia pokazuje wariant i wynik punktowy, a sprzątanie zna termin partii „papier” | #215 | E11-S02 (#217) | no |
| E11-S06 | #221 | Agent MCP gra partię „papier i ołówek” | #215 | E11-S02 (#217) | no |

Uwagi 2026-11-02 (E11): wariant to osąd właściciela (D-34), bez dowodu popytu (A-16, Q-21); `SDLC.md` nie ma Definition of Ready (formalny test gotowości pominięty). Zgłoszenia są podzgłoszeniami GitHub (epik → historie → zadania). Implementacja jednym PR-em zamykającym całe E11 (spec R11); specyfikacja na gałęzi `claude/paper-grid-pencil-game-0ycu0x` czeka na akceptację właściciela przed kodem.
