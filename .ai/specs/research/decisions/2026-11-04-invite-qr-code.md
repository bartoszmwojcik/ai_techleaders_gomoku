# Decyzje: kod QR zaproszenia (2026-11-04)

- **Właściciel:** Bartosz Wójcik. **Charakter:** osąd właściciela, **nie wynik badania**. Podstawą są jego odpowiedzi w sesji `om-discover --refresh --quick` (tryb own, 1 runda, 2026-11-04). Brak wywiadów z graczami i danych o tym, jak gracze przekazują zaproszenia.
- **Źródła:** rozmowa z 2026-11-04; `product-brief.md` (BR-09, BR-11, BR-29, BR-39…BR-43, D-33, OD-3 w `.ai/docs/2026-09-01-engineering-standards.md`); kod: `packages/ui/src/game/invite-code-card.tsx` (karta z linkiem `/invite/{kod}`, kodem, „Kopiuj”, „Udostępnij”) `[PRODUCT]`.
- **Decyzje w briefie:** D-35, BR-52, BR-53 (nowe); A-19; Q-22.

## Pomysł i przesłanka właściciela

Prośba: „Na ekranie z zaproszeniem do gry dodaj QR kod prowadzący do gry z zaproszenia.” Sytuacja (słowa właściciela): „Zaraz na spotkaniu chcę pokazać.” To zapowiedź pokazu, nie opis zdarzenia, w którym gracz miał kłopot z przekazaniem linku lub kodu.

## Pytania i odpowiedzi

| # | Pytanie | Odpowiedź właściciela | Pochodzenie |
|---|---|---|---|
| 1 | W jakiej sytuacji ma być używany kod QR | „Zaraz na spotkaniu chcę pokazać.” | słowa właściciela |
| 2 | Gdzie: (a) tylko karta zaproszenia do dołączenia przeciwnika, (b) także trwająca partia publiczna dla widzów | „b” | wybór spośród opcji agenta (agent rekomendował a) |
| 3 | Nowa zależność: (a) biblioteka `qrcode` (MIT) generująca SVG w aplikacji, (b) własna implementacja | „zgoda, jeśli licencja się zgadza i na mikrusie będzie działać” | warunkowa zgoda na rekomendację agenta |

**Sprawdzenie warunków z odpowiedzi 3 (agent, 2026-11-04, `npm view`):** `qrcode` 1.5.4 — MIT; zależności `pngjs` 5 (MIT), `dijkstrajs` (MIT), `yargs` 15 (MIT); `@types/qrcode` (MIT); brak skryptów instalacyjnych i modułów natywnych, `engines.node >= 10.13`. Działanie na mikr.us nie jest jeszcze sprawdzone — potwierdzi je job CI „Obraz Docker” i `/api/health` po wdrożeniu (kryterium akceptacji).

## Rozważone alternatywy

- **Kod QR tylko na karcie zaproszenia (przed dołączeniem przeciwnika):** odrzucone; właściciel wybrał także partię publiczną.
- **Własna implementacja algorytmu QR:** odrzucona (zgoda na bibliotekę).
- **Generowanie przez zewnętrzny serwis:** odrzucone przez agenta — link zaproszenia trafiałby do obcej firmy; nie było przedmiotem wyboru właściciela.

## Luki (propozycje agenta, niepotwierdzone)

- Kto widzi kod QR w trwającej partii publicznej: gracze i widzowie czy tylko gracze (Q-22). Propozycja: wszyscy, którzy widzą link (każdy z linkiem i tak może go przekazać). Rozstrzygnięte 2026-11-04 przez właściciela przy przeglądzie PR #235: gracze i widzowie.
- Kod QR w partii prywatnej po dołączeniu przeciwnika: nie pokazujemy (link nie prowadzi już do gry).

## Ustalenia z wdrożenia (2026-11-04)

- Karta zaproszenia ma 480 px, więc kod QR o szerokości 200 px stoi pod linkiem i kodem, nie obok nich (BR-52). Właściciel zaakceptował ten układ przy przeglądzie PR #235.
