# Decyzje: przegląd historii i partie publiczne (2026-11-02)

- **Właściciel:** Bartosz Wójcik. **Charakter:** osąd właściciela, **nie wynik badania**. Podstawą są wyłącznie jego odpowiedzi w sesji `om-discover --refresh` (tryb own) z 2026-11-02; nie opisał żadnego zdarzenia, w którym brakowało oglądania cudzej partii albo przeglądu ruchów, nie ma wywiadów z graczami, danych użycia ani benchmarku oglądania partii w sprawdzonych serwisach (PlayOK, papergames.io, DonkeyCat). Wartość limitu widzów (20) jest wartością początkową bez danych.
- **Źródła:** rozmowa z 2026-11-02; `product-brief.md` (N-05, N-11, BR-24, BR-29…BR-34, D-21, D-22, D-28, D-30, A-01, A-08, A-09, Q-10, Q-11); `research/decisions/2026-10-31-chat.md`; `research/decisions/2026-10-31-agent-opponent.md`.
- **Decyzje w briefie:** D-33, BR-39…BR-44, N-13 (nowe), N-05 (nadpisane przez N-13), N-11, BR-24, BR-31, BR-32, BR-33, BR-34, D-28, D-30 (nadpisane w części), A-13…A-15, Q-16…Q-18.

## Pomysł i przesłanka właściciela

Dwie powiązane zmiany. (1) Z historii można wejść w każdą zakończoną partię i przejrzeć jej przebieg (ruchy, odtwarzanie). (2) Twórca zaproszenia może zaznaczyć „partia publiczna”: po rozpoczęciu partii każdy z kodem lub linkiem ogląda ją na żywo jako widz. Dla partii z agentem (MCP) przesłanką jest powód z D-28: „chcę zobaczyć, jak agent gra”. Pozostałe przesłanki właściciel podał jako decyzje, nie jako opis zdarzeń; popyt na oglądanie to `[ASSUMPTION]` (A-01).

## Pytania i odpowiedzi

| Pytanie | Odpowiedź właściciela |
|---|---|
| 1. Kto może przejrzeć przebieg zakończonej partii? | Uczestnicy z kontem (swoje partie z `/history`) oraz każdy, kto zna kod/link, jeśli partia była publiczna. Partie prywatne: tylko uczestnicy z kontem. |
| 2. Jak powstaje partia publiczna i kto w niej ogląda? | Przy tworzeniu zaproszenia twórca zaznacza „partia publiczna”. Po rozpoczęciu partii każdy z kodem/linkiem ogląda jako widz (kolejna osoba po zajęciu miejsca przeciwnika; do rozpoczęcia pierwszy z kodem zostaje przeciwnikiem jak dziś). Widz widzi planszę, ruchy, zegary i wynik na żywo, nie gra. |
| 3. Tożsamość widza i czat? | Gość z nickiem (jak BR-29: 1–24 znaki) albo konto (nazwa konta). Bez nicka tylko ogląda. Widz może pisać na czacie, nie może go wyłączyć (brak przełącznika). |
| 4. Czat graczy? | Bez zmian dla graczy (BR-33): gracz wyłącza czat dla siebie, nie widzi go i nie pisze; drugi gracz i widzowie rozmawiają dalej. |
| 5. Partia z agentem (MCP)? | Też może być publiczna: twórca wybiera publiczność; agent i narzędzia MCP bez zmian; widz nie jest uczestnikiem MCP. |
| 6. Limit widzów? | 20 na partię (wartość początkowa, konfigurowalna, bez danych). Nadmiarowi widzą „Partia ma komplet widzów”. |
| 7. Ochrona przed nadużyciem? | Kill-switch: twórca może w trakcie zamknąć publiczność — widzowie od razu odłączeni, partia zostaje prywatna, kod nie otwiera już oglądania. Bez wyrzucania pojedynczych osób. Zgłaszanie nadużyć i moderacja nadal poza v1 (Q-10). |
| 8. Retencja i wykrywalność? | Retencja czatu bez zmian (BR-34, ok. godzina po zakończeniu). Widzowie nie mają historii. Partie publiczne nie trafiają do żadnej publicznej listy ani lobby (dostęp wyłącznie przez kod/link). |

## Skutki opisane w briefie (nie pytania)

- Gość nie ma historii (BR-24), więc nie wejdzie w partię przez `/history`.
- Zakończone partie gości są sprzątane przez `db:cleanup`; przegląd po kodzie działa, dopóki rekord partii istnieje.
- Czat nie wraca po przeglądzie (BR-34); wiadomości widzów podlegają tej samej retencji.

## Rozważone alternatywy

- **Widz tylko zalogowany:** odrzucone przez właściciela; widz może być gościem z nickiem, tak jak gracz (BR-29).
- **Widzowie anonimowi bez nicka (piszący):** odrzucone; bez nicka widz tylko ogląda.
- **Publiczne tylko partie ludzi, nie agenta:** odrzucone; partia z agentem też może być publiczna (powód z D-28).
- **Wyłączanie czatu także przez widza:** odrzucone przez właściciela; widz nie ma przełącznika. Wyłączenie zostaje prawem graczy.
- **Limit 5 widzów albo bez limitu:** odrzucone; wybrane 20 jako wartość początkowa, bez danych.
- **Bez kill-switcha:** odrzucone; twórca może zamknąć publiczność w trakcie.
- **Wyrzucanie pojedynczych widzów, moderacja, zgłaszanie nadużyć:** poza v1 (N-13, Q-10).
- **Przegląd historii tylko dla uczestników:** odrzucone w części — partie publiczne otwiera także każdy z kodem/linkiem.
- **Przegląd po kodzie także partii prywatnych:** odrzucone; prywatne tylko uczestnicy z kontem.
- **Publiczna lista/lobby partii do oglądania:** nie budujemy (N-13); dostęp wyłącznie przez kod/link.

Powody odrzuceń inne niż podane wyżej nie zostały zapisane; właściciel wybrał wariant, a agent nie dopisuje uzasadnień, których nie podał.

## Przyjęte ryzyka (właściciel: Bartosz Wójcik)

- Obcy z kodem/linkiem mogą pisać na czacie partii bez moderacji i bez prawa gracza do ukrycia widza; wzmacnia to A-08 (A-13). Jedyne środki: wyłączenie czatu przez gracza i kill-switch twórcy.
- Obciążenie hosta o ok. 2 GB RAM przy 20 widzach odświeżających stan jest niezmierzone (A-14).
- Założenie, że twórca użyje kill-switcha zamiast moderacji (A-15, `[ASSUMPTION]` agenta).
- Wymagania prawne publicznej widowni i czatu z obcymi (RODO, DSA, wiek) niesprawdzone (Q-16); to nie jest porada prawna; blokuje udostępnienie osobom z zewnątrz, nie znajomym.
- Brak popytu na oglądanie (A-01); limit 20 bez danych.

## Luki zauważone przez agenta (nie rozstrzygnięte przez właściciela)

- Czy przeciwnik jest informowany, że partia jest publiczna, zanim do niej dołączy (Q-18).
- Czy twórca może zamknąć publiczność po zakończeniu partii (wtedy przegląd po kodzie); w briefie: kill-switch dotyczy partii w trakcie, reszta do specyfikacji.
- Czy oglądanie liczy się do limitu jednej aktywnej partii (BR-13), czas życia dostępu widza, podpis widza na czacie, czy wiadomości widzów trafiają do pola `chat` agenta: propozycje agenta, niepotwierdzone.
