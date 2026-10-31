# Backlogs

## .ai/specs/product-brief.md
Backlog source: .ai/specs/product-brief.md
Last filed: 2026-10-31

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

Uwagi 2026-10-31: E02-S05…S08 (#87, #88, #94, #95) założono poza `om-backlog` (bez linii `Backlog source:`/`Backlog id:`); ich zależności nie zostały odtworzone, kolumna „Depends on” zawiera „—”. E06 to eksperyment właściciela (D-28), bez dowodu popytu (A-04, A-06); `SDLC.md` nie ma Definition of Ready. E06-S01-T01 (Q-09) blokuje E06-S01, E06-S01-T02 i E06-S02. Pozycje „Później” (CLI dla agenta, agent w lobby, przeciwnik hostowany przez nas) dopisano do E05 (#33).

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
