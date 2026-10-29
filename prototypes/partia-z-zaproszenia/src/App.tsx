import { useEffect } from "react";

import { OutsideDialog, ScreenSection } from "./chrome";
import { P01Home } from "./screens/p01-home";
import { P02Join } from "./screens/p02-join";
import { P03Waiting } from "./screens/p03-waiting";
import { P04Ready } from "./screens/p04-ready";
import { P05Board } from "./screens/p05-board";
import { P06Result } from "./screens/p06-result";
import { P07Errors } from "./screens/p07-errors";
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
        meta="Rola: zalogowany, z potwierdzonym e-mailem lub bez (BR-26); gość i niezalogowany bez przycisku. Historia #21 (E02-S01). Stany p01.1–p01.7."
        notes={[
          "Historia: #21 (E02-S01), kryteria K1 i K4; Q13 (10 utworzeń na godzinę), BR-13 (jedna aktywna partia), BR-22 (gość nie tworzy). Stany: p01.1–p01.7. Ekran to strona główna `/` z akcją „Utwórz zaproszenie”.",
          "Symulacja: konta T1–T7 w panelu „Scenariusze”; T3 ma partię w toku (p01.3), T4 ma własną oczekującą (p01.4, założenie L01: przejście do niej z komunikatem). Limit liczy się naprawdę (11. utworzenie w godzinę). Wynik tworzenia można też wymusić kontrolką.",
          "Nie rozstrzyga: L01 i L02 (treści są założeniami do zatwierdzenia). Lobby, Historia i Konto są poza prototypem.",
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
        meta="Rola: niezalogowany, zalogowany, gość. Ekran wspólny z Epikiem 01 (stany s07.1–s07.9). Trasa `/invite/[code]`."
        notes={[
          "Historia: #21 (E02-S01), K2, K3, K6, K10; BR-01, BR-11, BR-13, BR-22, BR-26, Q11, Q12, Q18, Q19. Stany s07.1–s07.9 z mapy Epiku 01. Przejścia s07.4 i s07.5 to przekierowania do partii.",
          "Symulacja: zaproszenie pochodzi z partii, którą ktoś utworzył (albo ze skrótu Ala_7 ABCD-EFGH). Logowanie i rejestracja otwierają dialog „Poza tym prototypem” (konto wybierasz w panelu). „Graj jako gość” po ostrzeżeniu dołącza i przełącza przeglądarkę na gościa (T5).",
          "Nie rozstrzyga: L19 (powrót po logowaniu na zaproszenie to założenie).",
        ]}
      >
        <S07Invite key={epoch} />
      </ScreenSection>
      <ScreenSection
        id="p03"
        title="Partia czeka na przeciwnika"
        meta="Rola: twórca. Historia #21 (E02-S01). Stany p03.1–p03.10. Trasa `/games/{id}` (status waiting)."
        notes={[
          "Historia: #21 (E02-S01), K1; Q3 (24 h), Q5 (anulowanie), Q6 (odpytywanie co 3 s), Q22 (Kopiuj, Udostępnij). Stany: p03.1–p03.10.",
          "Symulacja: link, kod i „Ważne do” pochodzą z partii; „Kopiuj” i „Udostępnij” niczego nie kopiują ani nie udostępniają (komunikaty zastępują schowek i okno systemowe). Odpytywanie co sekundę. Przeciwnik dołącza kontrolką albo z ekranu s07. „+24 h” wygasza zaproszenie.",
          "Nie rozstrzyga: L02 (błąd odpytywania), L05 (treść wygaśnięcia), D03 i D05 w design systemie (Karta kodu bez stanów kopiowania; wiersz wyniku pod kartą to luka).",
        ]}
      >
        <P03Waiting key={epoch} />
      </ScreenSection>
      <ScreenSection
        id="p04"
        title="Partia gotowa"
        meta="Rola: twórca, zaproszony zalogowany, gość. Historia #21 (E02-S01). Stany p04.1–p04.4. Trasa `/games/{id}` (active, przed otwarciem przez obu)."
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
      <OutsideDialog />
    </div>
  );
}
