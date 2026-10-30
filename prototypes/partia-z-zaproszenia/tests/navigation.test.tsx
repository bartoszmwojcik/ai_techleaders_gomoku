import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { App } from "../src/App";
import "../src/review/comments.js";
import "../src/review/prototype.js";
import {
  advanceClock,
  createGame,
  getSim,
  inviteView,
  openInvite,
  opponentJoins,
  patchScenario,
  phaseOf,
  resetSim,
  setRole,
  setupDemo,
  type RoleCode,
} from "../src/sim";
import { resetStateIds } from "../src/stateId";

const current = () => document.querySelector(".screen.is-current")?.id;
const frame = () => document.querySelector(".screen.is-current .frame") as HTMLElement;
const inFrame = () => within(frame());
const stateId = () => frame().querySelector("[data-state]")?.getAttribute("data-state");
const goTo = (id: string) => act(() => void document.dispatchEvent(new CustomEvent("prototype:navigate", { detail: id })));
const as = (role: RoleCode) => act(() => setRole(role));
const click = (name: RegExp | string) => fireEvent.click(inFrame().getByRole("button", { name }));

function start() {
  render(<App />);
  act(() => {
    window.__PROTOTYPE_START__?.();
  });
  // The engine is a module-level singleton: after the first test it only needs to be pointed at the new DOM.
  if (!current()) goTo("p01");
}

beforeAll(() => {
  document.documentElement.setAttribute("data-start-screen", "p01");
});

afterEach(() => {
  cleanup();
  act(() => {
    resetSim();
    resetStateIds();
  });
  window.location.hash = "";
});

/** Ala_7 creates an invitation through the button and lands on p03. */
async function aliaCreates() {
  click("Utwórz zaproszenie");
  await waitFor(() => expect(current()).toBe("p03"));
}

describe("nawigacja i bramki", () => {
  it("startuje na p01 i pozwala wybrać każdy ekran z paska", () => {
    start();
    expect(current()).toBe("p01");
    for (const id of ["p02", "s07", "p03", "p04", "p01"]) {
      const link = screen.getAllByRole("link").find((a) => a.getAttribute("href") === `#${id}` && a.closest(".screen-nav"))!;
      fireEvent.click(link);
      expect(current(), `pasek → ${id}`).toBe(id);
    }
  });

  it("p03 i p04 bez partii pokazują „nie masz dostępu” (p07.2)", () => {
    start();
    goTo("p03");
    expect(inFrame().getByText("Ta partia nie istnieje albo nie masz do niej dostępu")).toBeTruthy();
    expect(stateId()).toBe("p07.2");
    goTo("p04");
    expect(stateId()).toBe("p07.2");
  });

  it("niezalogowany i gość nie mają przycisku „Utwórz zaproszenie” (BR-22)", () => {
    start();
    as("T6");
    expect(inFrame().queryByRole("button", { name: "Utwórz zaproszenie" })).toBeNull();
    expect(inFrame().getByRole("button", { name: "Załóż konto" })).toBeTruthy();
    fireEvent.click(inFrame().getByRole("button", { name: "Załóż konto" }));
    expect(screen.getByRole("dialog").textContent).toContain("Poza tym prototypem");
  });

  it("Lobby, Historia i Konto w nagłówku otwierają dialog „Poza tym prototypem”", () => {
    start();
    for (const name of ["Lobby", "Historia", "Konto"]) {
      fireEvent.click(inFrame().getByRole("link", { name }));
      expect(screen.getByRole("dialog").textContent, name).toContain("Poza tym prototypem");
      fireEvent.click(screen.getByRole("button", { name: "Wróć do prototypu" }));
    }
  });
});

describe("p01 utworzenie partii", () => {
  it("p01.1 → p03.1 z kodem ABCD-EFGH", async () => {
    start();
    expect(stateId()).toBe("p01.1");
    await aliaCreates();
    expect(stateId()).toBe("p03.1");
    expect(inFrame().getByText("ABCD-EFGH")).toBeTruthy();
    expect(inFrame().getByText(/Ważne do wtorek,? 27 października,? 10:00/)).toBeTruthy();
    expect(inFrame().getByText("Czekamy na przeciwnika…")).toBeTruthy();
  });

  it("p01.3: konto z partią w toku (T3) dostaje „Masz już partię” (BR-13)", async () => {
    start();
    as("T3");
    click("Utwórz zaproszenie");
    await waitFor(() => expect(stateId()).toBe("p01.3"));
    expect(inFrame().getByText("Masz już partię")).toBeTruthy();
    // Stage B: the link leads to the board of the game in progress (p05), no longer to a dialog.
    fireEvent.click(inFrame().getAllByRole("link", { name: "Przejdź do partii" })[0]!);
    expect(current()).toBe("p05");
    expect(stateId()).toMatch(/^p05\.1/);
  });

  it("p01.4: konto z własną oczekującą partią (T4) trafia do niej z komunikatem (L01)", async () => {
    start();
    as("T4");
    click("Utwórz zaproszenie");
    await waitFor(() => expect(current()).toBe("p03"));
    expect(stateId()).toBe("p03.1 + p01.4");
    expect(inFrame().getByText("Masz już oczekującą partię.")).toBeTruthy();
    expect(inFrame().getByText("KMNP-QRST")).toBeTruthy();
  });

  it.each([
    ["limit", "p01.5", "Zbyt wiele zaproszeń"],
    ["server", "p01.6", "Nie udało się utworzyć partii"],
    ["network", "p01.7", "Brak połączenia"],
  ] as const)("wymuszony wynik %s daje %s", async (outcome, id, title) => {
    start();
    act(() => patchScenario({ createOutcome: outcome }));
    click("Utwórz zaproszenie");
    await waitFor(() => expect(stateId()).toBe(id));
    expect(inFrame().getByText(title)).toBeTruthy();
  });

  it("p01.6 → „Spróbuj ponownie” po usunięciu błędu tworzy partię", async () => {
    start();
    act(() => patchScenario({ createOutcome: "server" }));
    click("Utwórz zaproszenie");
    await waitFor(() => expect(stateId()).toBe("p01.6"));
    act(() => patchScenario({ createOutcome: "auto" }));
    click("Spróbuj ponownie");
    await waitFor(() => expect(current()).toBe("p03"));
  });

  it("limit liczy się naprawdę: 11. utworzenie w ciągu godziny (Q13)", async () => {
    start();
    for (let i = 0; i < 10; i += 1) {
      const result = await createGame();
      expect(result.kind).toBe("ok");
      act(() => {
        const g = getSim().games.at(-1)!;
        // cancel through the state: the point here is the counter, not the dialog
        Object.assign(g, { cancelled: true });
      });
    }
    click("Utwórz zaproszenie");
    await waitFor(() => expect(stateId()).toBe("p01.5"));
    expect(inFrame().getByText(/Spróbuj ponownie za \d+ min/)).toBeTruthy();
  });

  it("niepotwierdzony e-mail (T2) nie blokuje tworzenia (BR-26) i pokazuje baner", async () => {
    start();
    as("T2");
    expect(inFrame().getByText("Potwierdź adres e-mail")).toBeTruthy();
    click("Utwórz zaproszenie");
    await waitFor(() => expect(current()).toBe("p03"));
  });
});

describe("p02 kod zaproszenia", () => {
  const type = (value: string) => fireEvent.change(inFrame().getByLabelText(/Kod zaproszenia/), { target: { value } });

  it("„Masz kod?” prowadzi na p02; za krótki kod daje p02.2", async () => {
    start();
    fireEvent.click(inFrame().getByRole("link", { name: "Masz kod?" }));
    expect(current()).toBe("p02");
    expect(stateId()).toBe("p02.1");
    type("ABC");
    click("Dalej");
    await waitFor(() => expect(stateId()).toBe("p02.2"));
    expect(inFrame().getByText("Sprawdź kod: ma 8 znaków.")).toBeTruthy();
  });

  it("limit wymuszony kontrolką daje p02.3", async () => {
    start();
    goTo("p02");
    act(() => patchScenario({ forceLimit: true }));
    type("ABCD-EFGH");
    click("Dalej");
    await waitFor(() => expect(stateId()).toBe("p02.3"));
    expect(inFrame().getByText("Zbyt wiele prób")).toBeTruthy();
  });

  it("kod bez partii przechodzi na s07.9; 6. nieudane sprawdzenie daje limit s07.8", async () => {
    start();
    for (let i = 1; i <= 6; i += 1) {
      goTo("p02");
      type("ZZZZ-ZZZ" + i);
      click("Dalej");
      await waitFor(() => expect(current()).toBe("s07"));
      expect(stateId(), `próba ${i}`).toBe(i < 6 ? "s07.9" : "s07.8");
    }
  });

  it("poprawny kod (wielkość liter i myślnik bez znaczenia) pokazuje zaproszenie", async () => {
    start();
    act(() => setupDemo("waiting"));
    as("T2");
    goTo("p02");
    type("abcdefgh");
    click("Dalej");
    await waitFor(() => expect(current()).toBe("s07"));
    expect(stateId()).toBe("s07.3");
    expect(inFrame().getByText("Ala_7 zaprasza Cię do partii Gomoku")).toBeTruthy();
  });
});

describe("s07 zaproszenie", () => {
  function openAs(role: RoleCode) {
    act(() => setupDemo("waiting"));
    as(role);
    act(() => openInvite("ABCD-EFGH"));
    goTo("s07");
  }

  it("s07.1 → s07.2 (ostrzeżenie) → gość dołącza i widzi p04.1 + p04.4", async () => {
    start();
    openAs("T6");
    expect(stateId()).toBe("s07.1");
    expect(inFrame().queryByRole("button", { name: "Dołącz do partii" })).toBeNull();
    click("Graj jako gość");
    expect(stateId()).toBe("s07.2");
    expect(inFrame().getByText(/Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii/)).toBeTruthy();
    click("Wróć");
    expect(stateId()).toBe("s07.1");
    click("Graj jako gość");
    click("Rozumiem, graj jako gość");
    await waitFor(() => expect(current()).toBe("p04"));
    expect(getSim().role).toBe("T5");
    expect(stateId()).toBe("p04.1 + p04.4");
    expect(inFrame().getByText(/Czekamy, aż Ala_7 otworzy partię/)).toBeTruthy();
    expect(inFrame().getByText(/Grasz bez konta/)).toBeTruthy();
  });

  it("zalogowany nie ma opcji gościa (s07.3) i dołącza do p04.1", async () => {
    start();
    openAs("T2");
    expect(stateId()).toBe("s07.3");
    expect(inFrame().queryByRole("button", { name: "Graj jako gość" })).toBeNull();
    click("Dołącz do partii");
    await waitFor(() => expect(current()).toBe("p04"));
    expect(stateId()).toBe("p04.1");
  });

  it("Zaloguj się i Załóż konto otwierają dialog „Poza tym prototypem”", () => {
    start();
    openAs("T6");
    fireEvent.click(inFrame().getAllByRole("button", { name: "Zaloguj się" }).at(-1)!);
    expect(screen.getByRole("dialog").textContent).toContain("Poza tym prototypem");
  });

  it("twórca na własnym zaproszeniu (s07.5) i uczestnik (s07.4) są przekierowani do partii", async () => {
    start();
    act(() => setupDemo("waiting"));
    goTo("p01");
    act(() => openInvite("ABCD-EFGH"));
    expect(inviteView(getSim())).toBe("own");
    goTo("s07");
    expect(current()).toBe("p03");
    // The joiner opens the link again.
    act(() => opponentJoins("account"));
    as("T2");
    expect(inviteView(getSim())).toBe("participant");
    goTo("s07");
    expect(current()).toBe("p04");
  });

  it("s07.6: konto z partią w toku (T3) nie dołączy; s07.7: konto z oczekującą (T4) anuluje swoją i dołącza (Q18)", async () => {
    start();
    openAs("T3");
    expect(stateId()).toBe("s07.6");
    expect(inFrame().getByText("Masz już partię")).toBeTruthy();
    as("T4");
    expect(stateId()).toBe("s07.7");
    click("Anuluj moją partię i dołącz");
    await waitFor(() => expect(current()).toBe("p04"));
    const mine = getSim().games.find((g) => g.creator === "ewa@example.com")!;
    expect(phaseOf(getSim(), mine)).toBe("cancelled");
  });

  it("s07.8 i s07.9 z kontrolki; link anulowany lub dołączony jest nieważny (BR-11, Q12)", () => {
    start();
    openAs("T2");
    act(() => patchScenario({ inviteOverride: "limit" }));
    expect(stateId()).toBe("s07.8");
    act(() => patchScenario({ inviteOverride: "invalid" }));
    expect(stateId()).toBe("s07.9");
    act(() => patchScenario({ inviteOverride: "auto" }));
    // A third person after the joining: the link is void.
    as("T1");
    act(() => opponentJoins("account"));
    as("T7");
    expect(stateId()).toBe("s07.9");
  });

  it("wejście z paska bez linku pokazuje cudze oczekujące zaproszenie (Ewa_B), a bez żadnego przygotowuje zaproszenie Ala_7", () => {
    start();
    as("T2");
    goTo("s07");
    expect(stateId()).toBe("s07.3");
    expect(inFrame().getByText("Ewa_B zaprasza Cię do partii Gomoku")).toBeTruthy();
    act(() => resetSim());
    act(() => {
      // Nobody else waits: Ewa_B cancelled her game.
      getSim().games.find((g) => g.creator === "ewa@example.com")!.cancelled = true;
      setRole("T2");
    });
    goTo("p01");
    goTo("s07");
    expect(getSim().games.some((g) => g.code === "ABCD-EFGH")).toBe(true);
    expect(inFrame().getByText("Ala_7 zaprasza Cię do partii Gomoku")).toBeTruthy();
  });
});

describe("p03 czekamy na przeciwnika", () => {
  it("p03.2: Kopiuj; p03.3: schowek niedostępny; p03.4: bez „Udostępnij”", async () => {
    start();
    await aliaCreates();
    click("Kopiuj");
    expect(stateId()).toBe("p03.2");
    expect(inFrame().getByText("Skopiowano link do schowka.")).toBeTruthy();
    act(() => patchScenario({ clipboardUnavailable: true }));
    click("Skopiowano");
    expect(stateId()).toBe("p03.3");
    expect(inFrame().getByText(/Link jest zaznaczony/)).toBeTruthy();
  });

  it("p03.4: bez „Udostępnij”, gdy przeglądarka nie umie udostępniać", async () => {
    start();
    act(() => patchScenario({ shareUnavailable: true }));
    await aliaCreates();
    expect(inFrame().queryByRole("button", { name: "Udostępnij" })).toBeNull();
    expect(stateId()).toBe("p03.4");
  });

  it("„Udostępnij” mówi, że działa tylko na telefonie", async () => {
    start();
    await aliaCreates();
    click("Udostępnij");
    expect(inFrame().getByText("Udostępnianie dostępne tylko na telefonie.")).toBeTruthy();
  });

  it("p03.6 → Wróć → p03.1; p03.7 → p03.8 (strona główna, link nieważny)", async () => {
    start();
    await aliaCreates();
    click("Anuluj zaproszenie");
    await waitFor(() => expect(stateId()).toBe("p03.6"));
    fireEvent.click(screen.getByRole("button", { name: "Wróć" }));
    await waitFor(() => expect(stateId()).toBe("p03.1"));
    click("Anuluj zaproszenie");
    fireEvent.click(await screen.findByRole("button", { name: "Tak, anuluj zaproszenie" }));
    await waitFor(() => expect(current()).toBe("p01"));
    expect(inFrame().getByText("Zaproszenie zostało anulowane. Link jest już nieważny.")).toBeTruthy();
    // The link no longer works for anyone (p03.8, s07.9).
    as("T2");
    act(() => openInvite("ABCD-EFGH"));
    expect(inviteView(getSim())).toBe("invalid");
    // The creator has no game page any more.
    as("T1");
    goTo("p03");
    expect(stateId()).toBe("p07.2");
  });

  it("Q09: przeciwnik zdążył dołączyć przed potwierdzeniem anulowania", async () => {
    start();
    await aliaCreates();
    act(() => patchScenario({ joinBeforeCancel: true }));
    click("Anuluj zaproszenie");
    fireEvent.click(await screen.findByRole("button", { name: "Tak, anuluj zaproszenie" }));
    await waitFor(() => expect(stateId()).toBe("p03.5"));
    expect(inFrame().getByText(/Przeciwnik zdążył dołączyć/)).toBeTruthy();
  });

  it("p03.5: przeciwnik dołączył → „Przejdź do partii” → p04.2", async () => {
    start();
    await aliaCreates();
    act(() => opponentJoins("account"));
    await waitFor(() => expect(stateId()).toBe("p03.5"));
    expect(inFrame().getByText("Przeciwnik dołączył")).toBeTruthy();
    click("Przejdź do partii");
    await waitFor(() => expect(current()).toBe("p04"));
    expect(stateId()).toBe("p04.2");
    expect(inFrame().getByText("Partia gotowa", { selector: "h1" })).toBeTruthy();
  });

  it("p03.10: błąd odpytywania po trzech próbach, „Sprawdź teraz”", async () => {
    start();
    await aliaCreates();
    act(() => patchScenario({ pollError: true }));
    await waitFor(() => expect(stateId()).toBe("p03.10"), { timeout: 5000 });
    expect(inFrame().getByText(/Nie udało się sprawdzić, czy przeciwnik dołączył/)).toBeTruthy();
    act(() => patchScenario({ pollError: false }));
    click("Sprawdź teraz");
    await waitFor(() => expect(stateId()).toBe("p03.1"));
  });

  it("p03.9: po +24 h zaproszenie wygasa; „Utwórz zaproszenie” tworzy nowe z innym kodem", async () => {
    start();
    await aliaCreates();
    act(() => advanceClock(24 * 3_600_000));
    await waitFor(() => expect(stateId()).toBe("p03.9"));
    expect(inFrame().getByText("Zaproszenie wygasło. Utwórz nowe.")).toBeTruthy();
    click("Utwórz zaproszenie");
    await waitFor(() => expect(stateId()).toBe("p03.1"));
    expect(inFrame().getByText("JKMN-PQRS")).toBeTruthy();
  });

  it("gość i zaproszony nie widzą p03 (waiting) cudzej partii", () => {
    start();
    act(() => setupDemo("waiting"));
    as("T7");
    goTo("p03");
    expect(stateId()).toBe("p07.2");
  });
});

describe("p04 partia gotowa", () => {
  it("p04.1 u zaproszonego, p04.2 po otwarciu przez twórcę, „Przejdź do planszy” → p05", async () => {
    start();
    act(() => setupDemo("opponent-waits"));
    goTo("p04");
    expect(stateId()).toBe("p04.1");
    expect(inFrame().getByText(/Czekamy, aż Ala_7 otworzy partię — zegar ruszy, gdy obaj będziecie na stronie \(do 15 min\)/)).toBeTruthy();
    expect(inFrame().queryByRole("button", { name: "Przejdź do planszy" })).toBeNull();
    expect(inFrame().getAllByRole("timer").map((t) => t.textContent)).toEqual(["10:00", "10:00"]);
    // The creator opens the page (scenario control).
    fireEvent.click(document.getElementById("sc-opens")!);
    await waitFor(() => expect(stateId()).toBe("p04.2"));
    click("Przejdź do planszy");
    expect(current()).toBe("p05");
    expect(inFrame().getByRole("grid", { name: "Plansza 15 na 15" })).toBeTruthy();
  });

  it("p04.4: gość widzi stałe ostrzeżenie; przeciwnik gościa to „Gracz 2 (gość)”", () => {
    start();
    act(() => setupDemo("guest"));
    goTo("p04");
    expect(stateId()).toBe("p04.1 + p04.4");
    act(() => setRole("T1"));
    goTo("p03");
    expect(inFrame().getByText(/Gracz 2 \(gość\) dołączył do partii/)).toBeTruthy();
  });

  it("p04.3: po +15 min bez otwarcia partia jest anulowana, każdy czyta swoje zdanie (L06)", () => {
    start();
    act(() => setupDemo("opponent-waits"));
    act(() => advanceClock(15 * 60_000));
    goTo("p04");
    expect(stateId()).toBe("p04.3");
    expect(inFrame().getByText("Przeciwnik nie otworzył partii w ciągu 15 minut. Partię anulowano.")).toBeTruthy();
    as("T1");
    expect(stateId()).toBe("p04.3");
    expect(inFrame().getByText("Partię anulowano: nie została otwarta w ciągu 15 minut.")).toBeTruthy();
    click("Wróć do panelu głównego");
    expect(current()).toBe("p01");
    // The cancelled game frees both players (BR-13): Ala_7 can create again.
    expect(inFrame().queryByText("Masz partię")).toBeNull();
  });

  it("gość w innej przeglądarce (T6) dostaje 404 (p07.3)", () => {
    start();
    act(() => setupDemo("guest"));
    as("T6");
    goTo("p04");
    expect(stateId()).toBe("p07.3");
  });

  it("T3: partia w toku — p04 przekierowuje na planszę p05", () => {
    start();
    as("T3");
    goTo("p04");
    expect(current()).toBe("p05");
    expect(inFrame().getByText("Twój ruch (czarne)")).toBeTruthy();
  });
});

describe("scenariusze i reset", () => {
  it("skrót „Odbuduj symulację” przechodzi na właściwy ekran", () => {
    start();
    fireEvent.change(document.getElementById("sc-stage")!, { target: { value: "ready" } });
    expect(current()).toBe("p04");
    expect(stateId()).toBe("p04.2");
  });

  it("kontrolka szerokości zmienia ramkę, Reset wraca na p01", () => {
    start();
    fireEvent.change(document.getElementById("sc-width")!, { target: { value: "320" } });
    expect(document.querySelector(".doc")?.getAttribute("data-width")).toBe("320");
    fireEvent.click(screen.getByRole("button", { name: "Reset symulacji" }));
    expect(current()).toBe("p01");
    expect(getSim().games.length).toBe(2);
  });

  it("„Otwórz zaproszenie Ala_7” otwiera s07 dla wybranego konta", () => {
    start();
    as("T2");
    fireEvent.click(document.getElementById("sc-open-invite")!);
    expect(current()).toBe("s07");
    expect(stateId()).toBe("s07.3");
  });
});
