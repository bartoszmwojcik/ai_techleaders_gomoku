# Powrót do partii po rozłączeniu (E02-S04, #24)

> Status: **zatwierdzona do implementacji** (Q1–Q6 rozstrzygnięte) (`om-spec-writing`, tryb interaktywny, 2026-10-29). Źródło: zgłoszenie #24, `.ai/specs/product-brief.md` (BR-06, BR-07, BR-13, BR-22), #21 (`resolveParticipant`, token gościa), #22 (`GET` z `after`, odpytywanie co 2 s, wstrzymanie w ukrytej karcie), #23 (`.ai/specs/2026-10-26-game-clock.md`: serwer jest jedynym źródłem czasu, rozstrzyganie leniwie), mapa `lekcja-07/mapa-ekranow-partia.md` (p05.10, p05.12, p06.5–p06.7, p07.3).

## 📝 TLDR

Po #21–#23 serwer trzyma pełny stan partii, a zegar biegnie bez względu na to, czy gracz ma otwartą kartę (BR-06). Powrót po rozłączeniu działa więc w dużej mierze „z konstrukcji”: `GET /api/games/{id}` zwraca aktualną planszę i pozostały czas, a przeterminowaną partię zamyka `settleGame`. Pozostaje to, czego nie pokrywają #21–#23: zachowanie klienta po powrocie (wznowienie odpytywania, korekta zegara, komunikat „Wróciłeś do partii”), wejście do zakończonej partii i dostęp z innego urządzenia. Po wdrożeniu (zachowanie przyszłe) gracz, który wraca, zawsze widzi stan z serwera i wie, że czas biegł w jego nieobecności.

## Resolved decisions

| # | Pytanie | Decyzja (właściciel, 2026-10-29: „zgoda na rekomendacje”) |
|---|---|---|
| Q1 | Wskaźnik „przeciwnik rozłączony” | **Bez wskaźnika** (brak `lastSeenAt` i nowych danych); gracz widzi zegar przeciwnika, który biegnie lub stoi |
| Q2 | „Wróciłeś do partii” | **Po nieobecności ponad próg** (domyślnie 30 s, stała w kodzie), jednorazowy, nieblokujący komunikat `role="status"` z aktualnym czasem; znika po następnym ruchu lub po kilku sekundach |
| Q3 | Powrót z innego urządzenia | **Konto: tak** (`resolveParticipant`), **gość: nie** (token jednej przeglądarki, BR-22; po zmianie przeglądarki `404`, zegar biega) — bez zmian względem #21 |
| Q4 | Wejście do zakończonej partii | Zalogowany: wynik, plansza z linią wygrywającą, tylko do odczytu, bez limitu (do czasu historii #27); gość: do 1 h od końca (BR-22), potem `404` |
| Q5 | Wznowienie odpytywania | **Tak:** natychmiastowy odczyt przy `visibilitychange` (zamiast czekać na cykl 2 s) i nadpisanie zegara wartością z serwera |
| Q6 | Zakres | **Osobna mała specyfikacja i krótki PR** po #22 i #23; bez nowych kolumn i endpointów |

## 📝 Problem Statement

Gracz, któremu padło połączenie, zamknął kartę albo uśpił telefon, wraca do partii, w której czas biegł. Musi zobaczyć prawdziwy stan (nie lokalny, nieaktualny), zrozumieć, ile czasu stracił, i móc dokończyć partię, jeśli jeszcze trwa, albo zobaczyć wynik, jeśli się skończyła. Bez tego rozłączenie wygląda jak błąd aplikacji, a nie jak świadoma reguła (BR-06).

## 📝 Proposed Solution

Bez zmian w danych i API poza #22/#23. Zmiany leżą w kliencie `/games/[gameId]` i w testach:

1. **Hook obecności karty** `usePageVisibility` (klient): śledzi `document.visibilityState`, moment ukrycia i powrotu (zegar wstrzykiwany do testów). Przy powrocie wywołuje natychmiastowy odczyt (`GET /api/games/{id}?after=n`) bez czekania na cykl 2 s (Q5) i nadpisuje stan, w tym zegar, wartością z serwera.
2. **Komunikat „Wróciłeś do partii”** (Q2): gdy nieobecność (od ukrycia karty albo przerwy w odpytywaniu) przekroczyła `RETURN_NOTICE_THRESHOLD_MS` (30 s), po odczycie pokazuje się jednorazowy `role="status"` z aktualnym pozostałym czasem gracza. Znika po następnym ruchu lub po kilku sekundach. Przy nowym wejściu po odświeżeniu strony komunikatu nie ma (nie wiadomo, jak długo trwała nieobecność); aktualny stan wystarcza.
3. **Partia zakończona w nieobecności:** pierwszy odczyt po powrocie zwraca `finished` (serwer rozstrzygnął leniwie, #23), klient pokazuje wynik (przegrana na czas albo ruch przeciwnika, który zakończył partię) i plansza przechodzi w tryb tylko do odczytu; odpytywanie się zatrzymuje.
4. **Dostęp (Q3, Q4):** bez zmian po stronie serwera: `resolveParticipant` (konto z każdego urządzenia, gość z cookie), zakończona partia dostępna dla konta bez limitu, dla gościa 1 h po `finishedAt`.

## 📝 Architecture

Czysta logika progu nieobecności (`shouldShowReturnNotice({ hiddenAtMs, returnedAtMs, thresholdMs })`) w `core/src/games/`; hook i komunikat w `packages/app/src/components/games/`; komponent komunikatu z DS (`Alert` informacyjny) albo istniejący wzorzec z design systemu (stan „Partia: powrót po rozłączeniu” w stories). Bez nowych zależności i bez migracji.

## 📝 Edge Cases & Failure Scenarios

| Sytuacja | Zachowanie |
|---|---|
| Czas minął, gdy karta była ukryta | Pierwszy odczyt zamyka partię (#23), klient pokazuje przegraną na czas, bez „Wróciłeś do partii” |
| Przeciwnik wykonał kilka ruchów w nieobecności | `GET ?after=n` zwraca wszystkie nowe ruchy, plansza nadrabia, ostatni ruch oznaczony |
| Szybkie przełączanie kart (poniżej progu) | Odczyt natychmiast, bez komunikatu |
| Błąd sieci przy odczycie po powrocie | Komunikat błędu z „Spróbuj ponownie”, stary stan widoczny, zegar lokalny nadal odlicza do czasu odczytu |
| Gość w innej przeglądarce | `404` jak w #21 (p07.3); zegar biegnie |
| Gość po 1 h od końca partii | `404` |
| Dwie karty tego samego konta | Obie odpytują; ruch w jednej pojawia się w drugiej po odczycie; ruch w obu jednocześnie obsługuje idempotencja i `STALE_MOVE` z #22 |
| Wstrzymanie odpytywania przez przeglądarkę (oszczędzanie energii) | Po powrocie ten sam odczyt natychmiastowy |

## 📝 Risks & Impact Review

- Wiarygodność komunikatu zależy od `visibilitychange`, który różni się między przeglądarkami mobilnymi; przy braku zdarzenia pierwszy odczyt i tak poprawia stan, a brak komunikatu nie psuje gry.
- Rewanż i poddanie mają własne specyfikacje; ta nie zmienia kontraktów #21–#23.
- Brak wskaźnika obecności przeciwnika (Q1) jest świadomy; do ponownej oceny po testach z prawdziwymi graczami.

## 📋 Phasing

Jedna faza, jeden krótki PR (`Closes #24`) po #22 i #23.

## 📋 Implementation Plan

0. Zależności: #22 i #23 wdrożone (`GET` z `after`, odpytywanie, `result`, zegar).
1. `shouldShowReturnNotice` i stała progu w `core` z testami 100% (granice progu, odwrócony czas, brak ukrycia).
2. Hook `usePageVisibility` + odczyt natychmiastowy przy powrocie; testy jsdom z fałszywym `visibilityState` i zegarem.
3. Komunikat „Wróciłeś do partii” (stan ekranu p05.10 z prototypu, tekst po polsku), znikanie po ruchu i po czasie; testy.
4. Wejście do zakończonej partii: wynik i tryb tylko do odczytu po powrocie (p06.5, p06.6); testy integracyjne: partia zakończona przez czas w nieobecności, powrót konta z drugiego urządzenia (drugi jar ciasteczek), gość z drugiej przeglądarki `404`, gość po 1 h `404` (czas przez bazę).
5. Dokumentacja (README), lekcja jeśli przegląd wykaże korektę.
