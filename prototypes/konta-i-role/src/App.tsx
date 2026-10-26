import { useEffect } from "react";

import { OutsideDialog, ScreenSection } from "./chrome";
import { S01Register } from "./screens/s01-register";
import { S02Login } from "./screens/s02-login";
import { S03Verify } from "./screens/s03-verify";
import { S04Home } from "./screens/s04-home";
import { S05Account } from "./screens/s05-account";
import { S06Mailbox } from "./screens/s06-mailbox";
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
        id="s01"
        title="Rejestracja"
        meta="Rola: niezalogowany. Historia #19 (E01-S01). Stany s01.1–s01.13."
        notes={[
          "Historia: #19 (E01-S01), kryteria K1–K3; BR-14, BR-16, BR-23. Stany: s01.1–s01.13.",
          "Symulacja: konto, sesja i limit prób (6. próba w sesji) istnieją tylko w pamięci strony; nic nie jest wysyłane. Teksty błędów pól, błędu serwera i sieci są założeniem (A-03).",
          "Nie rozstrzyga: L02 (ekran „Sprawdź skrzynkę” po rejestracji), L04 (409 i 403), L05 (treści błędów), komunikat s01.12 i s01.13 (A-02).",
        ]}
      >
        <S01Register key={epoch} />
      </ScreenSection>
      <ScreenSection
        id="s02"
        title="Logowanie"
        meta="Rola: niezalogowany. Historia #20 (E01-S02). Stany s02.1–s02.13."
        notes={[
          "Historia: #20 (E01-S02), kryteria K1–K3; H1 (limity), H2 (Pokaż hasło), G8 (powrót na next). Stany: s02.1–s02.13.",
          "Symulacja: hasło demo drewniana-plansza-2026; konto niepotwierdzone starsze niż 7 dni znika po „+7 dni” (Q14) i daje ten sam komunikat co błędne hasło. Przycisk w nagłówku wysyła formularz logowania (uwaga z przeglądu). „Nie pamiętasz hasła?” otwiera dialog „Poza tym prototypem”.",
          "Nie rozstrzyga: L01 (komunikat po przekierowaniu i po wygaśnięciu sesji), L19 (reset hasła), L24 (niepotwierdzony na lobby i historii).",
        ]}
      >
        <S02Login key={epoch} />
      </ScreenSection>
      <ScreenSection
        id="s03"
        title="Potwierdzenie e-maila"
        meta="Rola: każdy z linkiem z wiadomości. Historia #34 (E01-S03). Stany s03.1–s03.15."
        notes={[
          "Historia: #34 (E01-S03), kryteria K2–K4; Q3 (GET niczego nie zmienia), Q5 (bez logowania), Q7, Q11. Stany: s03.1–s03.15.",
          "Symulacja: link pochodzi ze Skrzynki demo; ważność 24 h liczy zegar demo (+24 h wygasza link). Strona nie pokazuje adresu e-mail, bo token nie dowodzi, kto ogląda stronę.",
          "Nie rozstrzyga: L10 (wyniki „Wyślij nowy link” poza banerem), L13 (przejście po sukcesie: przycisk „Przejdź dalej” to założenie A-05).",
        ]}
      >
        <S03Verify key={epoch} />
      </ScreenSection>
      <ScreenSection
        id="s04"
        title="Strona główna"
        meta="Rola: niezalogowany, niepotwierdzony, potwierdzony. Historie #19, #20, #34. Stany s04.1–s04.12."
        notes={[
          "Historie: #19 (widok „zalogowany”), #20 (linki), #34/K1 i K4 (baner); BR-23, D-17. Stany: s04.1–s04.12.",
          "Symulacja: akcje gry (Utwórz zaproszenie, Szukam przeciwnika, Lobby, Historia) otwierają dialog „Poza tym prototypem” (Epik 02 i 03). Niepotwierdzony nie widzi Lobby i Historii (L06). Baner dla 503, 409 i 401 używa najbliższych stanów komponentu (luka D02).",
          "Nie rozstrzyga: L11 (wygląd banera dla 409, 401, 503), L12 (ostrzeżenie o usunięciu po 7 dniach), L18 (ładowanie), L17 (akcje gry).",
        ]}
      >
        <S04Home key={epoch} />
      </ScreenSection>
      <ScreenSection
        id="s05"
        title="Konto"
        meta="Rola: zalogowany. Historia #20 (E01-S02). Stany s05.1–s05.9."
        notes={[
          "Historia: #20 (E01-S02), kryteria K1 i K3; Q4 (potwierdzenie przy aktywnej partii). Stany: s05.1–s05.9.",
          "Symulacja: konto A3 (Marek_Z) ma aktywną partię, więc „Wyloguj” pyta o potwierdzenie. Sesja w tej przeglądarce kończy się też wtedy, gdy serwer nie potwierdzi wylogowania (założenie, L20). Zmiana hasła i usunięcie konta są poza prototypem (L19).",
          "Nie rozstrzyga: L06 (przycisk „Wyloguj” w nagłówku czy tylko na koncie), L20 (stan „w toku” i błąd wylogowania), L18.",
        ]}
      >
        <S05Account key={epoch} />
      </ScreenSection>
      <ScreenSection
        id="s06"
        title="Skrzynka demo"
        meta="Rola: właściciel skrzynki. Historia #34 (K1). Stany s06.1–s06.2. To symulacja poczty, nie ekran produktu."
        notes={[
          "Historia: #34 (E01-S03), kryterium K1; Q5 i Q8 (treść wiadomości). Stany: s06.1–s06.2. To symulacja poczty, nie ekran aplikacji.",
          "Symulacja: żadna wiadomość nie jest naprawdę wysyłana; pojawia się w skrzynce zgodnie z ustawieniem dostawcy. Szablon wiadomości to Panel z tekstem (luka D01).",
          "Nie rozstrzyga: L21 (temat i dokładny tekst wiadomości, przypadek „nie dotarła”).",
        ]}
      >
        <S06Mailbox key={epoch} />
      </ScreenSection>
      <OutsideDialog />
    </div>
  );
}
