import { useEffect } from "react";

import { OutsideDialog, ScreenSection } from "./chrome";
import { P01Home } from "./screens/p01-home";
import { P02Join } from "./screens/p02-join";
import { P03Waiting } from "./screens/p03-waiting";
import { P04Ready } from "./screens/p04-ready";
import { P05Board } from "./screens/p05-board";
import { P06Result } from "./screens/p06-result";
import { P07Errors } from "./screens/p07-errors";
import { P08GuestCreate } from "./screens/p08-guest-create";
import { S07Invite } from "./screens/s07-invite";
import { Toolbar } from "./Toolbar";
import { useSim } from "./sim";

export function App() {
  const { epoch, width, reload } = useSim();
  // The review engine needs the permanent screen sections in the DOM; start it after the first render.
  useEffect(() => {
    window.__PROTOTYPE_START__?.();
  }, []);
  return (
    <div className="doc" style={width ? ({ "--preview-width": `${width}px` } as React.CSSProperties) : undefined} data-width={width || undefined}>
      <Toolbar />
      <ScreenSection
        id="p01"
        title="Utworzenie partii (strona główna)"
        meta="Rola: zalogowany (z potwierdzonym e-mailem lub bez, BR-26); niezalogowany i gość widzą „Zagraj ze znajomym bez konta”. Historie #21 (E02-S01), #95 (E02-S08). Stany p01.1–p01.9."
        notes={[
          "Historia: #21 (E02-S01), kryteria K1 i K4; Q13 (10 utworzeń na godzinę), BR-13 (jedna aktywna partia), BR-22 (gość nie tworzy). Stany: p01.1–p01.7. Ekran to strona główna `/` z akcją „Utwórz zaproszenie”.",
          "Symulacja: konta T1–T7 w panelu „Scenariusze”; T3 ma partię w toku (p01.3), T4 ma własną oczekującą (p01.4, założenie L01: przejście do niej z komunikatem). Limit liczy się naprawdę (11. utworzenie w godzinę). Wynik tworzenia można też wymusić kontrolką.",
          "Nie rozstrzyga: L01 i L02 (treści są założeniami do zatwierdzenia). Lobby, Historia i Konto są poza prototypem.",
          "Zmienione 2026-10-30 (gra bez konta, BR-29): p01.8 — niezalogowany i gość widzą „Załóż konto” (główna) i „Zagraj ze znajomym bez konta” (przycisk drugorzędny, pełnej szerokości; L34 rozstrzygnięta 2026-10-30), obie prowadzą dalej bez blokady (logowanie i rejestracja gościa nie są blokowane). p01.9 — gość z partią oczekującą („Czekasz na przeciwnika”) albo aktywną („Partia w toku”) widzi „Masz partię” z przejściem do niej; partia zakończona nie (L27, zatwierdzone założenie; LUKA D12: brak stories i wzorca strony głównej gościa).",
        ]}
      >
        <P01Home key={epoch} />
      </ScreenSection>
      <ScreenSection
        id="p02"
        title="Kod zaproszenia"
        meta="Rola: każdy, także niezalogowany. Historia #21 (E02-S01). Stany p02.1–p02.5. Trasa `/join`."
        notes={[
          "Historia: #21 (E02-S01), UI `/join`; Q2 (kod 8 znaków), Q12 (sprawdzenie nic nie zużywa), Q13 (limit prób). Stany: p02.1–p02.5; p02.4 (kod nieważny) pokazuje s07.9.",
          "Symulacja: kod z aktualnej partii działa (np. ABCD-EFGH); każdy inny kod przechodzi na stronę zaproszenia i tam jest „nieważny”. 6. nieudane sprawdzenie daje limit (w produkcie 20 w 15 min).",
          "Nie rozstrzyga: L03 (tekst „Sprawdzanie kodu…” jest założeniem).",
        ]}
      >
        <P02Join key={epoch} />
      </ScreenSection>
      <ScreenSection
        id="s07"
        title="Wejście z zaproszenia"
        meta="Rola: niezalogowany, zalogowany, gość. Ekran wspólny z Epikiem 01 (stany s07.1–s07.9; od 2026-10-30 proponowane s07.10 i s07.11). Trasa `/invite/[code]`."
        notes={[
          "Historia: #21 (E02-S01), K2, K3, K6, K10; BR-01, BR-11, BR-13, BR-22, BR-26, Q11, Q12, Q18, Q19. Stany s07.1–s07.9 z mapy Epiku 01. Przejścia s07.4 i s07.5 to przekierowania do partii.",
          "Symulacja: zaproszenie pochodzi z partii, którą ktoś utworzył (albo ze skrótu Ala_7 ABCD-EFGH). Logowanie i rejestracja otwierają dialog „Poza tym prototypem” (konto wybierasz w panelu). „Graj jako gość” po ostrzeżeniu dołącza i przełącza przeglądarkę na gościa (T5).",
          "Nie rozstrzyga: L19 (powrót po logowaniu na zaproszenie to założenie).",
          "Zmienione 2026-10-30: s07.2 ma pole „Twój nick (opcjonalnie)” z podpowiedzią „Zostaw puste, a będziesz „Gracz 2”” (puste = „Gracz 2”; wartość zostaje po błędzie), s07.10 to błąd nicku w linii pola, s07.11 to nagłówek „{nick} (gość) zaprasza Cię do partii Gomoku” dla zaproszenia od gościa (L31: tylko w mapie E02). Gość z oczekującą partią widzi s07.7 i może anulować własną partię i dołączyć z zachowanym nickiem (L35, zatwierdzone założenie; zachowanie nicku to założenie prototypu). LUKI DS: D08 (pole bez licznika; `maxLength` liczy jednostki UTF-16, nick to punkty kodowe), D10 (brak wzorca nick + ostrzeżenie), D11 (zdanie „Gość nie ma nazwy ani historii” poprawione w prototypie na „Gość nie ma historii partii”; do poprawy w DS).",
        ]}
      >
        <S07Invite key={epoch} />
      </ScreenSection>
      <ScreenSection
        id="p03"
        title="Partia czeka na przeciwnika"
        meta="Rola: twórca (konto albo gość-twórca). Historie #21 (E02-S01), #95 (E02-S08). Stany p03.1–p03.13. Trasa `/games/{id}` (status waiting)."
        notes={[
          "Historia: #21 (E02-S01), K1; Q3 (24 h), Q5 (anulowanie), Q6 (odpytywanie co 3 s), Q22 (Kopiuj, Udostępnij). Stany: p03.1–p03.10.",
          "Symulacja: link, kod i „Ważne do” pochodzą z partii; „Kopiuj” i „Udostępnij” niczego nie kopiują ani nie udostępniają (komunikaty zastępują schowek i okno systemowe). Odpytywanie co sekundę. Przeciwnik dołącza kontrolką albo z ekranu s07. „+24 h” wygasza zaproszenie.",
          "Nie rozstrzyga: L02 (błąd odpytywania), L05 (treść wygaśnięcia), D03 i D05 w design systemie (Karta kodu bez stanów kopiowania; wiersz wyniku pod kartą to luka).",
          "Zmienione 2026-10-30: p03.11 — widok gościa-twórcy (ta sama Karta kodu, anulowanie z potwierdzeniem). p03.12 — stałe ostrzeżenie pod Kartą kodu „Nie zmieniaj przeglądarki, bo stracisz dostęp do partii.” (L28, zatwierdzone założenie). p03.13 — po wygaśnięciu zaproszenia gość-twórca widzi „Zaproszenie wygasło” jak konto (p03.9) przez godzinę od wygaśnięcia, potem p07.2 (L29, rozstrzygnięte 2026-10-30). Po anulowaniu gość trafia na `/` (p01.8), link jest nieważny.",
        ]}
      >
        <P03Waiting key={epoch} />
      </ScreenSection>
      <ScreenSection
        id="p04"
        title="Partia gotowa"
        meta="Rola: twórca, zaproszony zalogowany, gość (twórca albo dołączający). Historia #21 (E02-S01). Stany p04.1–p04.4. Trasa `/games/{id}` (active, przed otwarciem przez obu)."
        notes={[
          "Historia: #21 (E02-S01), K2, K6; Q20 (zegar rusza, gdy obaj mają `seen_at`), Q21 (15 min na otwarcie), BR-22, BR-04. Stany: p04.1–p04.4.",
          "Symulacja: zegary stoją na 10:00, bo biegną dopiero na planszy. „Przejdź do planszy” losuje kolory (kontrolka „Wylosowano”) i otwiera p05. „+15 min bez otwarcia” anuluje partię, której twórca nie otworzył.",
          "Nie rozstrzyga: L06 (treść po anulowaniu przez brak otwarcia jest założeniem).",
        ]}
      >
        <P04Ready key={epoch} />
      </ScreenSection>
      <ScreenSection
        id="p05"
        title="Partia w toku"
        meta="Rola: twórca, zaproszony zalogowany, gość. Historie #22 (E02-S02), #23 (E02-S03), #24 (E02-S04), poddanie. Stany p05.1–p05.14. Trasa `/games/{id}` (active, obaj na stronie)."
        notes={[
          "Historia: #22 K1, K2, K5, #23 K1, K2, K4, #24 K1, BR-05, BR-06, BR-10, BR-21, BR-22; #22 Q4 (idempotentny ruch), Q5 (odpytywanie co 2 s), Q7 (dotyk: dwa kroki, mysz: jedno kliknięcie), #23 Q1 (mało czasu: kolor i obrys, bez tekstu), #24 Q2 i Q5 („Wróciłeś” po ponad 30 s), poddanie Q1 i Q2. Stany p05.1–p05.14.",
          "Symulacja naprawdę liczy: stawianie na wolnym polu, naprzemienność, pięć i więcej w linii (poziom, pion, obie przekątne), remis na pełnej planszy, zegar serwerowy z leniwym rozstrzygnięciem przegranej na czas, poddanie. Ruchy przeciwnika, zdarzenia serwera, dotyk, karta w tle i skróty do wyniku to kontrolki panelu „Scenariusze”. Zegar stoi na 10:00, dopóki nie włączysz „Odliczaj zegar” albo nie użyjesz skoków.",
          "Założenia (A-12…A-26 szarego prototypu): treści p05.8, p05.9, błędu sieci i „Wylosowano” (L08, L15); kolejność przycisków w dialogu poddania; „błąd odpytywania” w partii liczy się jak p05.7. Luki DS: D01 (wzorzec zaznaczenia z „Postaw kamień”), D04 (Zegar gracza nie ma wariantu bez tekstu), ConfirmDialog bez miejsca na błąd. Nie rozstrzyga: L07 w części dźwięku (brak), „przeciwnik rozłączony” (L11: wskaźnika nie ma).",
        ]}
      >
        <P05Board key={`${epoch}.${reload}`} />
      </ScreenSection>
      <ScreenSection
        id="p06"
        title="Koniec partii"
        meta="Rola: twórca, zaproszony zalogowany, gość. Historie #22 K3 i K4, #23 K3, #24 K2 i K3, poddanie, rewanż. Stany p06.1–p06.15. Trasa `/games/{id}` (finished)."
        notes={[
          "Historia: #22 K3 (pięć w linii), K4 (remis), #23 K3 (przegrana na czas), #24 K2 i K3 (po końcu odświeżenie pokazuje wynik), #21 K8 (token gościa do 1 h po końcu), BR-07, BR-22, L12 i L23 (poddanie), L13, L21, L22, L24 (rewanż: nowa partia z odwróconymi kolorami, 5 min, BR-13 przy przyjęciu, nowy token gościa). Stany p06.1–p06.15.",
          "Symulacja: wynik wynika z partii (prawdziwa wygrana, przegrana na czas lub poddanie) albo ze skrótów „Pokaż wygraną / przegraną / remis”. Rewanż proponuje się przyciskiem; odpowiedzi przeciwnika to kontrolki. „+5 min” z zegara demo wygasza propozycję, „+1 h” kończy token gościa (p06.7).",
          "Założenia: treści banerów i rewanżu (A-17, A-19), nowy dostęp gościa pokazuje się nad planszą nowej partii (A-26). Luka DS: D06 (brak komponentu akcji po końcu partii). Nie rozstrzyga: historia partii (#27) jest poza prototypem.",
        ]}
      >
        <P06Result key={`${epoch}.${reload}`} />
      </ScreenSection>
      <ScreenSection
        id="p07"
        title="Brak dostępu i błędy"
        meta="Rola: niezalogowany, osoba spoza partii, gość w innej przeglądarce. Historie #21 K7, BR-06, N-05. Stany p07.1–p07.4. Trasa `/games/{id}`."
        notes={[
          "Historia: #21 K7 (gość w innej przeglądarce: brak dostępu), N-05 (nie mówimy, czy partia istnieje), BR-06 (zegar biegnie mimo braku dostępu). p07.2 i p07.3 wyglądają tak samo; różnicę widać tylko w pasku („Stan”) i w tym, że zegar gościa biegnie dalej.",
          "Symulacja: te same bramki pokazują się na p03–p06, gdy widz nie ma dostępu (T6, T7, gość po godzinie). „Baza niedostępna” daje p07.4, „Wolne ładowanie partii” daje p07.1 (szkielet 1,5 s po wejściu na ekran partii).",
          "Założenie: treść p07.4 to „Nie udało się połączyć z serwerem. Spróbuj ponownie.” (L02). Nie rozstrzyga: L02.",
        ]}
      >
        <P07Errors key={`${epoch}.${reload}`} />
      </ScreenSection>
      <ScreenSection
        id="p08"
        title="Gość tworzy partię"
        meta="Rola: niezalogowany, gość z tokenem (twórca albo dołączający); zalogowany używa p01.1. Historie #95 (E02-S08), #94 (E02-S07). Stany p08.1–p08.8. Adres do ustalenia przy implementacji."
        notes={[
          "Historia: #95 K1, K2, K4, #94 K2, K3; BR-13, BR-29; nick Q1, Q2; gość Q5 (limit adresu 10/godz.), Q6 (ciasteczko), Q7 (jedna partia na przeglądarkę). Stany: p08.1 (pole nicku, ostrzeżenie, przycisk), p08.2 (błąd nicku), p08.3 (tworzenie), p08.4 (429), p08.5 (500), p08.6 (409 masz już partię), p08.7 (409 masz oczekującą partię, „Anuluj i utwórz nową” z potwierdzeniem), p08.8 (brak sieci).",
          "Symulacja: nick przechodzi tę samą normalizację i walidację co na serwerze (1–24 punkty kodowe: litery, cyfry, spacje, `_`, `-`; same spacje = puste = „Gracz 1”). Limit liczy się naprawdę (11. utworzenie w godzinę z jednego adresu). Wynik można wymusić kontrolką „Wynik Utwórz zaproszenie”. Po utworzeniu przeglądarka staje się gościem-twórcą (T9).",
          "Założenia: L25 (rozstrzygnięte 2026-10-30: tytuł, etykieta, ostrzeżenie, dodatkowa linia „Zaproszenie jest ważne 24 godziny.”), L26 i L32 (zatwierdzone założenia: błąd 500 z tym samym zdaniem i „Spróbuj ponownie”; „Anuluj i utwórz nową” z dialogiem jak p03.6). Luki DS: D08 (brak licznika znaków i limitu w punktach kodowych), D10 (brak wzorca nick + ostrzeżenie + przycisk).",
        ]}
      >
        <P08GuestCreate key={epoch} />
      </ScreenSection>
      <OutsideDialog />
    </div>
  );
}
