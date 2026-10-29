# Powrót do partii po rozłączeniu (E02-S04, #24)

> Status: **szkielet — czeka na odpowiedzi właściciela** (`om-spec-writing`, tryb interaktywny, 2026-10-29). Źródło: zgłoszenie #24, `.ai/specs/product-brief.md` (BR-06, BR-07, BR-13, BR-22), #21 (`resolveParticipant`, token gościa), #22 (`GET` z `after`, odpytywanie co 2 s, wstrzymanie w ukrytej karcie), #23 (`.ai/specs/2026-10-26-game-clock.md`: serwer jest jedynym źródłem czasu, rozstrzyganie leniwie), mapa `lekcja-07/mapa-ekranow-partia.md` (p05.10, p05.12, p06.5–p06.7, p07.3).

## 📝 TLDR

Po #21–#23 serwer trzyma pełny stan partii, a zegar biegnie bez względu na to, czy gracz ma otwartą kartę (BR-06). Powrót po rozłączeniu działa więc w dużej mierze „z konstrukcji”: `GET /api/games/{id}` zwraca aktualną planszę i pozostały czas, a przeterminowaną partię zamyka `settleGame`. Pozostaje to, czego nie pokrywają #21–#23: zachowanie klienta po powrocie (wznowienie odpytywania, korekta zegara, komunikat „Wróciłeś do partii”), wejście do zakończonej partii i dostęp z innego urządzenia. Po wdrożeniu (zachowanie przyszłe) gracz, który wraca, zawsze widzi stan z serwera i wie, że czas biegł w jego nieobecności.

## Open Questions

- **Q1 — Wskaźnik „przeciwnik rozłączony”.** (a) Bez wskaźnika: gracz widzi tylko zegar przeciwnika, który biegnie lub nie. (b) Wskaźnik obecności (nowe pole `lastSeenAt` aktualizowane przy każdym odpytywaniu, „przeciwnik nieaktywny od N s”). Rekomendacja: (a) na MVP. BR-06 mówi tylko, że rozłączenie nie zatrzymuje zegara; wskaźnik obecności to nowe dane, nowy stan w UI i nowe zasady prywatności, a zegar daje graczowi tę samą informację pośrednio.
- **Q2 — Kiedy pokazywać „Wróciłeś do partii”.** (a) Zawsze po powrocie karty z tła, (b) tylko gdy nieobecność przekroczyła próg (np. 30 s), (c) tylko po odświeżeniu strony lub nowym wejściu. Rekomendacja: (b), jednorazowy, nieblokujący komunikat `role="status"` z aktualnym czasem, który znika po następnym ruchu lub po kilku sekundach.
- **Q3 — Powrót z innego urządzenia lub przeglądarki.** Konto: tak, partia jest dostępna z każdego urządzenia po zalogowaniu (`resolveParticipant`). Gość: nie, token jest związany z jedną przeglądarką (BR-22, #21), a po zmianie przeglądarki partia daje `404`, mimo że zegar biegnie. Czy zostawiamy to tak (decyzja z #21, ostrzeżenie dla gościa już jest), czy dodajemy gościowi możliwość odzyskania partii (np. drugi link)? Rekomendacja: zostawić (poza zakresem MVP).
- **Q4 — Wejście do zakończonej partii.** Zalogowany: wynik, plansza z linią wygrywającą i brak możliwości ruchu bez limitu czasu (do czasu historii #27). Gość: do 1 h od końca (BR-22), potem `404`. Czy to wystarcza, czy gracz po końcu partii ma mieć stały adres wyniku (np. dla gościa)? Rekomendacja: wystarcza.
- **Q5 — Wznowienie odpytywania po powrocie karty.** Natychmiastowy odczyt przy zdarzeniu `visibilitychange` (zamiast czekania do kolejnego cyklu 2 s) i korekta zegara wartością z serwera. Rekomendacja: tak.
- **Q6 — Zakres tej specyfikacji.** Dopisać #24 jako zmiany w kliencie i testach (bez nowych kolumn i endpointów, jeśli Q1 = a), czy osobna implementacja z własnym PR? Rekomendacja: osobna, mała specyfikacja i jeden krótki PR po #22/#23, bo większość logiki jest w #23.

## 📝 Problem Statement

Gracz, któremu padło połączenie, zamknął kartę albo uśpił telefon, wraca do partii, w której czas biegł. Musi zobaczyć prawdziwy stan (nie lokalny, nieaktualny), zrozumieć, ile czasu stracił, i móc dokończyć partię, jeśli jeszcze trwa, albo zobaczyć wynik, jeśli się skończyła. Bez tego rozłączenie wygląda jak błąd aplikacji, a nie jak świadoma reguła (BR-06).

## 📝 Proposed Solution (do uzupełnienia po odpowiedziach)

Kierunek przy rekomendowanych odpowiedziach: bez zmian w danych i API poza #22/#23. Klient (`/games/[gameId]`) reaguje na `visibilitychange` (natychmiastowy odczyt i nadpisanie zegara), po nieobecności ponad próg pokazuje jednorazowy komunikat „Wróciłeś do partii”, a zakończoną partię renderuje w trybie tylko do odczytu z wynikiem i linią wygrywającą. Dostęp: konto z każdego urządzenia, gość tylko z tej samej przeglądarki (token), 1 h po końcu.
