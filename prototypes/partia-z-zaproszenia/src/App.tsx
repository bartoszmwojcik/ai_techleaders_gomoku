import { useEffect } from "react";

import { OutsideDialog, ScreenSection } from "./chrome";
import { P01Home } from "./screens/p01-home";
import { P02Join } from "./screens/p02-join";
import { P03Waiting } from "./screens/p03-waiting";
import { P04Ready } from "./screens/p04-ready";
import { S07Invite } from "./screens/s07-invite";
import { Toolbar } from "./Toolbar";
import { useSim } from "./sim";

export function App() {
  const { epoch, width } = useSim();
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
          "Symulacja: zegary stoją na 10:00, bo biegną dopiero na planszy (etap B). „Przejdź do planszy” otwiera dialog „Poza tym prototypem”. „+15 min bez otwarcia” anuluje partię, której twórca nie otworzył.",
          "Nie rozstrzyga: L06 (treść po anulowaniu przez brak otwarcia jest założeniem). Plansza, ruchy, wynik, poddanie i rewanż są w etapie B.",
        ]}
      >
        <P04Ready key={epoch} />
      </ScreenSection>
      <OutsideDialog />
    </div>
  );
}
