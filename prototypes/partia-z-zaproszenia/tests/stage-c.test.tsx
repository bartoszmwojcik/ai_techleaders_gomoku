import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import "../src/review/comments.js";
import "../src/review/prototype.js";
import {
  advanceClock,
  checkNickname,
  createGuestGame,
  getSim,
  LONG_NICKNAME,
  opponentPlays,
  openInvite,
  opponentRematch,
  patchScenario,
  placeStone,
  playOf,
  playerName,
  resetSim,
  setRole,
  setupDemo,
  showPosition,
  type DemoStage,
} from "../src/sim";
import { resetStateIds } from "../src/stateId";

// Stage C (2026-10-30): play without an account. A nickname (E02-S07, #94) and a guest who creates a game (E02-S08, #95):
// p08, p01.8–p01.9, p03.11–p03.13, s07.2 with a nickname, s07.10, s07.11 and the "(gość)" labels of p03–p06.

const current = () => document.querySelector(".screen.is-current")?.id;
const frame = () => document.querySelector(".screen.is-current .frame") as HTMLElement;
const inFrame = () => within(frame());
const stateId = () => frame().querySelector("[data-state]")?.getAttribute("data-state");
const assumption = () => frame().querySelector("[data-assumption]")?.getAttribute("data-assumption");
const goTo = (id: string) => act(() => void document.dispatchEvent(new CustomEvent("prototype:navigate", { detail: id })));
const click = (name: RegExp | string) => fireEvent.click(inFrame().getByRole("button", { name }));
const nickField = () => inFrame().getByLabelText(/Twój nick/) as HTMLInputElement;
const type = (value: string) => fireEvent.change(nickField(), { target: { value } });
const at = (row: number, column: number) => (row - 1) * 15 + (column - 1);
const names = () => inFrame().queryAllByTestId("player-name").map((node) => node.textContent);

function begin(role: "T6" | "T5" | "T9" | "T10" | "T1" = "T6") {
  render(<App />);
  act(() => {
    window.__PROTOTYPE_START__?.();
  });
  if (!current()) goTo("p01");
  act(() => resetSim());
  act(() => setRole(role));
}

function stage(name: DemoStage, screenId: string) {
  render(<App />);
  act(() => {
    window.__PROTOTYPE_START__?.();
  });
  if (!current()) goTo("p01");
  act(() => void setupDemo(name));
  goTo(screenId);
}

/** Creates a game as a guest through the p08 form. */
async function createOnP08(nick: string) {
  goTo("p08");
  type(nick);
  click("Rozumiem, utwórz zaproszenie");
  await waitFor(() => expect(current()).toBe("p03"));
}

beforeAll(() => {
  document.documentElement.setAttribute("data-start-screen", "p01");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  act(() => {
    resetSim();
    resetStateIds();
  });
  window.location.hash = "";
});

describe("nick: normalizacja i reguły (nick Q2)", () => {
  it("poprawny nick jest przycinany; puste, same spacje i znaki niewidoczne dają domyślną nazwę", () => {
    expect(checkNickname("  Ola  ")).toEqual({ ok: true, nick: "Ola" });
    expect(checkNickname("Ola  K_1-b")).toEqual({ ok: true, nick: "Ola K_1-b" });
    expect(checkNickname("Ola\tK")).toEqual({ ok: true, nick: "Ola K" });
    expect(checkNickname("O‮ł​a")).toEqual({ ok: true, nick: "Oła" });
    for (const empty of ["", "   ", "​‮", "\t\n"]) expect(checkNickname(empty)).toEqual({ ok: true, nick: null });
  });

  it("długość liczy punkty kodowe: 24 znaki ok, 25 za dużo; znak spoza BMP liczy się za jeden", () => {
    expect(checkNickname("a".repeat(24)).ok).toBe(true);
    expect(checkNickname("a".repeat(25))).toEqual({ ok: false, error: "length" });
    expect(checkNickname(`${"a".repeat(23)}\u{20000}`)).toEqual({ ok: true, nick: `${"a".repeat(23)}\u{20000}` });
    expect(checkNickname(`${"a".repeat(24)}\u{20000}`)).toEqual({ ok: false, error: "length" });
    expect(LONG_NICKNAME).toHaveLength(24);
  });

  it("niedozwolone znaki są odrzucane", () => {
    for (const bad of ["Ola!", "a@b", "<b>", "Ola.K", "Ola\u{1F600}"]) expect(checkNickname(bad)).toEqual({ ok: false, error: "chars" });
    expect(checkNickname("Zażółć gęślą-jaźń 12")).toEqual({ ok: true, nick: "Zażółć gęślą-jaźń 12" });
  });
});

describe("p01.8 i p01.9: strona główna gościa", () => {
  it("p01.8: niezalogowany widzi „Załóż konto” (główna) i „Zagraj ze znajomym bez konta” (drugorzędny przycisk, L34)", () => {
    begin("T6");
    goTo("p01");
    expect(stateId()).toBe("p01.8");
    const guestButton = inFrame().getByRole("button", { name: "Zagraj ze znajomym bez konta" });
    expect(guestButton.getAttribute("data-assumption")).toBe("L34");
    expect(guestButton.className).toContain("w-full");
    expect(inFrame().getByRole("button", { name: "Załóż konto" })).toBeTruthy();
    expect(inFrame().queryByRole("button", { name: "Utwórz zaproszenie" })).toBeNull();
    fireEvent.click(guestButton);
    expect(current()).toBe("p08");
  });

  it("zalogowany nie widzi akcji gościa, a stan to p01.1", () => {
    begin("T1");
    goTo("p01");
    expect(stateId()).toBe("p01.1");
    expect(inFrame().queryByRole("button", { name: "Zagraj ze znajomym bez konta" })).toBeNull();
  });

  it("p01.9: gość-twórca z oczekującą partią widzi „Masz partię” („Czekasz na przeciwnika”) i wraca do niej (L27)", () => {
    stage("g-waiting", "p01");
    expect(stateId()).toBe("p01.8 + p01.9");
    expect(assumption()).toBe("L27");
    expect(inFrame().getByText("Czekasz na przeciwnika.", { exact: false })).toBeTruthy();
    fireEvent.click(inFrame().getByRole("link", { name: "Wróć do partii" }));
    expect(current()).toBe("p03");
  });

  it("p01.9: także przy partii aktywnej („Partia w toku”) i dla gościa-dołączającego; po zakończeniu znika", () => {
    stage("g-play-ola", "p01");
    expect(stateId()).toBe("p01.8 + p01.9");
    expect(inFrame().getByText("Partia w toku.", { exact: false })).toBeTruthy();
    act(() => setRole("T5"));
    expect(stateId()).toBe("p01.8 + p01.9");
    act(() => void showPosition("loss"));
    expect(stateId()).toBe("p01.8");
    expect(inFrame().queryByText("Masz partię")).toBeNull();
  });

  it("gość nie jest blokowany: ma „Zaloguj się” w nagłówku i „Załóż konto” na stronie", () => {
    stage("g-waiting", "p01");
    expect(inFrame().getByTestId("guest-who").textContent).toBe("Grasz jako Ola (gość)");
    expect(inFrame().getByRole("button", { name: "Zaloguj się" })).toBeTruthy();
    expect(inFrame().getByRole("button", { name: "Załóż konto" })).toBeTruthy();
  });
});

describe("p08: gość tworzy partię", () => {
  it("p08.1: pole nicku z podpowiedzią „Gracz 1”, ostrzeżenie, linia o 24 godzinach i przycisk", () => {
    begin("T6");
    goTo("p08");
    expect(stateId()).toBe("p08.1");
    expect(assumption()).toBe("L25, L26, L32");
    expect(inFrame().getByRole("heading", { name: "Zagraj ze znajomym bez konta" })).toBeTruthy();
    expect(inFrame().getByText("Zostaw puste, a będziesz „Gracz 1”")).toBeTruthy();
    expect(nickField().getAttribute("aria-describedby")).toBeTruthy();
    expect(inFrame().getByText("Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii")).toBeTruthy();
    expect(inFrame().getByText(/Jeśli zmienisz przeglądarkę albo wyczyścisz dane, stracisz dostęp do tej partii\./)).toBeTruthy();
    expect(inFrame().getByTestId("p08-ttl").textContent).toBe("Zaproszenie jest ważne 24 godziny.");
    expect(inFrame().getByRole("button", { name: "Rozumiem, utwórz zaproszenie" })).toBeTruthy();
  });

  it("p08.1 → p03.11 + p03.12: poprawny nick, gość-twórca czeka z Kartą kodu i ostrzeżeniem (L28)", async () => {
    begin("T6");
    await createOnP08("  Ola ");
    expect(stateId()).toBe("p03.11 + p03.12");
    expect(assumption()).toBe("L28");
    expect(getSim().role).toBe("T9");
    expect(getSim().games.at(-1)!.creatorNick).toBe("Ola");
    expect(inFrame().getByText("ABCD-EFGH")).toBeTruthy();
    expect(inFrame().getByText("Nie zmieniaj przeglądarki, bo stracisz dostęp do partii.")).toBeTruthy();
    expect(inFrame().getByRole("button", { name: "Kopiuj" })).toBeTruthy();
    expect(inFrame().getByRole("button", { name: "Anuluj zaproszenie" })).toBeTruthy();
    click("Kopiuj");
    expect(stateId()).toBe("p03.11 + p03.2 + p03.12");
  });

  it("puste pole i same spacje: „Gracz 1”, nick nie jest zapisany", async () => {
    begin("T6");
    await createOnP08("   ");
    const game = getSim().games.at(-1)!;
    expect(game.creatorNick).toBeNull();
    expect(playerName(game, "creator").label).toBe("Gracz 1 (gość)");
  });

  it("p08.2: niepoprawny nick — błąd przy polu, wartość zostaje, nic nie powstaje", async () => {
    begin("T6");
    goTo("p08");
    type("Ola!");
    click("Rozumiem, utwórz zaproszenie");
    await waitFor(() => expect(stateId()).toBe("p08.2"));
    expect(inFrame().getByText("Nick może zawierać tylko litery, cyfry, spacje oraz znaki _ i -.")).toBeTruthy();
    expect(nickField().value).toBe("Ola!");
    expect(nickField().getAttribute("aria-invalid")).toBe("true");
    expect(getSim().games).toHaveLength(2);
    type("a".repeat(25));
    click("Rozumiem, utwórz zaproszenie");
    await waitFor(() => expect(inFrame().getByText("Nick może mieć najwyżej 24 znaków.")).toBeTruthy());
    expect(nickField().value).toHaveLength(25);
    type("a".repeat(24));
    click("Rozumiem, utwórz zaproszenie");
    await waitFor(() => expect(current()).toBe("p03"));
  });

  it("p08.3: tworzenie w toku blokuje przycisk", async () => {
    begin("T6");
    goTo("p08");
    click("Rozumiem, utwórz zaproszenie");
    expect(stateId()).toBe("p08.3");
    expect(inFrame().getByRole("button", { name: "Tworzenie zaproszenia…" }).getAttribute("aria-busy")).toBe("true");
    await waitFor(() => expect(current()).toBe("p03"));
  });

  it("p08.4, p08.5, p08.8: limit adresu z czasem, błąd serwera (L26) i brak sieci z ponowieniem", async () => {
    begin("T6");
    goTo("p08");
    patchScenario({ createOutcome: "limit" });
    click("Rozumiem, utwórz zaproszenie");
    await waitFor(() => expect(stateId()).toBe("p08.4"));
    expect(inFrame().getByText(/Spróbuj ponownie za 23 min/)).toBeTruthy();
    act(() => patchScenario({ createOutcome: "server" }));
    click("Rozumiem, utwórz zaproszenie");
    await waitFor(() => expect(stateId()).toBe("p08.5"));
    expect(inFrame().getByText("Nie udało się utworzyć zaproszenia. Spróbuj ponownie.")).toBeTruthy();
    act(() => patchScenario({ createOutcome: "network" }));
    click("Spróbuj ponownie");
    await waitFor(() => expect(stateId()).toBe("p08.8"));
    expect(inFrame().getByText("Nie udało się połączyć z serwerem. Spróbuj ponownie.")).toBeTruthy();
    act(() => patchScenario({ createOutcome: "auto" }));
    click("Spróbuj ponownie");
    await waitFor(() => expect(current()).toBe("p03"));
  });

  it("limit adresu liczy się naprawdę: 11. utworzenie w godzinę to 429, po godzinie znowu można", async () => {
    begin("T6");
    for (let i = 0; i < 10; i++) expect((await createGuestGame("", true)).kind).toBe("ok");
    const refused = await createGuestGame("", true);
    expect(refused).toEqual({ kind: "limit", minutes: 60 });
    act(() => advanceClock(60 * 60_000));
    expect((await createGuestGame("", true)).kind).toBe("ok");
  });

  it("p08.6: gość z aktywną partią (i gość-dołączający) dostaje 409 „Masz już partię” z przejściem do niej", async () => {
    stage("g-play-ola", "p08");
    click("Rozumiem, utwórz zaproszenie");
    await waitFor(() => expect(stateId()).toBe("p08.6"));
    expect(inFrame().getByText("Masz już partię")).toBeTruthy();
    fireEvent.click(inFrame().getByRole("link", { name: "Przejdź do partii" }));
    expect(current()).toBe("p05");
    act(() => setRole("T5"));
    goTo("p08");
    click("Rozumiem, utwórz zaproszenie");
    await waitFor(() => expect(stateId()).toBe("p08.6"));
  });

  it("p08.7: oczekująca partia — „Anuluj i utwórz nową” pyta o potwierdzenie (L32) i zastępuje partię w jednym kroku", async () => {
    stage("g-waiting", "p08");
    const oldId = getSim().tokens.T9!.game;
    type("Ola 2");
    click("Rozumiem, utwórz zaproszenie");
    await waitFor(() => expect(stateId()).toBe("p08.7"));
    expect(inFrame().getByText("Masz oczekującą partię")).toBeTruthy();
    click("Anuluj i utwórz nową");
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Anulować poprzednie zaproszenie?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Wróć" }));
    expect(getSim().games.find((g) => g.id === oldId)!.cancelled).toBe(false);
    click("Anuluj i utwórz nową");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Tak, anuluj i utwórz nową" }));
    await waitFor(() => expect(current()).toBe("p03"));
    expect(getSim().games.find((g) => g.id === oldId)!.cancelled).toBe(true);
    const fresh = getSim().games.at(-1)!;
    expect(fresh.creatorNick).toBe("Ola 2");
    expect(getSim().tokens.T9!.game).toBe(fresh.id);
  });

  it("p08.7 wymuszony kontrolką bez partii: powstaje oczekująca partia, a 409 jest prawdziwy", async () => {
    begin("T6");
    goTo("p08");
    patchScenario({ createOutcome: "waiting" });
    click("Rozumiem, utwórz zaproszenie");
    await waitFor(() => expect(stateId()).toBe("p08.7"));
    expect(getSim().role).toBe("T9");
    expect(inFrame().getByRole("button", { name: "Anuluj i utwórz nową" })).toBeTruthy();
  });

  it("p08.6 wymuszony kontrolką bez partii nie ma linku do partii; konto używa p01 i nie tworzy z p08", async () => {
    begin("T6");
    goTo("p08");
    patchScenario({ createOutcome: "active" });
    click("Rozumiem, utwórz zaproszenie");
    await waitFor(() => expect(stateId()).toBe("p08.6"));
    fireEvent.click(inFrame().getByRole("link", { name: "Przejdź do partii" }));
    expect(current()).toBe("p08");
    act(() => setRole("T1"));
    expect(inFrame().getByText("Jesteś zalogowany")).toBeTruthy();
    expect((await createGuestGame("")).kind).toBe("server");
    click("Wróć na stronę główną");
    expect(current()).toBe("p01");
  });
});

describe("p03: gość-twórca", () => {
  it("p03.8: gość anuluje z potwierdzeniem, wraca na / (p01.8), a link jest nieważny", async () => {
    stage("g-waiting", "p03");
    const code = getSim().games.at(-1)!.code;
    click("Anuluj zaproszenie");
    expect(stateId()).toBe("p03.11 + p03.6 + p03.12");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Tak, anuluj zaproszenie" }));
    await waitFor(() => expect(current()).toBe("p01"));
    expect(stateId()).toBe("p01.8");
    expect(inFrame().getByText("Zaproszenie zostało anulowane. Link jest już nieważny.", { exact: false })).toBeTruthy();
    act(() => setRole("T6"));
    act(() => openInvite(code));
    goTo("s07");
    expect(stateId()).toBe("s07.9");
    expect(inFrame().getByText("To zaproszenie jest już nieważne")).toBeTruthy();
  });

  it("p03.13 (L29, rozstrzygnięte): po 24 h gość widzi „Zaproszenie wygasło”, po kolejnej godzinie p07.2", () => {
    stage("g-waiting", "p03");
    act(() => advanceClock(24 * 60 * 60_000));
    expect(stateId()).toBe("p03.13 + p03.9");
    expect(inFrame().getByRole("heading", { name: "Zaproszenie wygasło" })).toBeTruthy();
    expect(inFrame().getByRole("button", { name: "Utwórz nowe zaproszenie" })).toBeTruthy();
    act(() => advanceClock(60 * 60_000));
    expect(stateId()).toBe("p07.2");
    expect(inFrame().getByText("Ta partia nie istnieje albo nie masz do niej dostępu")).toBeTruthy();
  });

  it("po wygaśnięciu gość tworzy nową partię z p08 (wygasła nie blokuje)", async () => {
    stage("g-waiting", "p03");
    act(() => advanceClock(24 * 60 * 60_000));
    click("Utwórz nowe zaproszenie");
    expect(current()).toBe("p08");
    click("Rozumiem, utwórz zaproszenie");
    await waitFor(() => expect(current()).toBe("p03"));
    expect(stateId()).toBe("p03.11 + p03.12");
  });

  it("p07.3: ta sama partia w innej przeglądarce (T6) to 404, a token nadal działa u twórcy", () => {
    stage("g-waiting", "p03");
    act(() => setRole("T6"));
    expect(stateId()).toBe("p07.3");
    act(() => setRole("T9"));
    expect(stateId()).toBe("p03.11 + p03.12");
  });

  it("p03.5: przeciwnik-gość dołączył — „Gracz 2 (gość) dołączył do partii”, z nickiem „Piotr (gość)”", () => {
    stage("g-waiting", "p03");
    act(() => document.getElementById("sc-join-guest")!.click());
    expect(stateId()).toBe("p03.5");
    expect(inFrame().getByText("Gracz 2 (gość) dołączył do partii")).toBeTruthy();
    stage("g-waiting", "p03");
    act(() => document.getElementById("sc-join-guest-nick")!.click());
    expect(inFrame().getByText("Piotr (gość) dołączył do partii")).toBeTruthy();
  });
});

describe("s07: nick gościa i zaproszenie od gościa", () => {
  function openAlaInvite() {
    act(() => void setupDemo("waiting"));
    act(() => setRole("T6"));
    act(() => document.getElementById("sc-open-invite")!.click());
  }

  it("s07.2: pole „Twój nick (opcjonalnie)”, podpowiedź „Gracz 2”, bez zdania o braku nazwy", () => {
    render(<App />);
    act(() => window.__PROTOTYPE_START__?.());
    openAlaInvite();
    click("Graj jako gość");
    expect(stateId()).toBe("s07.2");
    expect(nickField()).toBeTruthy();
    expect(inFrame().getByText("Zostaw puste, a będziesz „Gracz 2”")).toBeTruthy();
    expect(inFrame().getByText(/Twój nick/).textContent).toContain("(opcjonalnie)");
    expect(inFrame().queryByText(/nie ma nazwy/)).toBeNull();
    expect(assumption()).toBe("L25, L35");
  });

  it("s07.10: niepoprawny nick — błąd w linii, wartość zostaje, nie dołącza; poprawny dołącza jako T10 „Piotr (gość)”", async () => {
    render(<App />);
    act(() => window.__PROTOTYPE_START__?.());
    openAlaInvite();
    click("Graj jako gość");
    type("Piotr#");
    click("Rozumiem, graj jako gość");
    await waitFor(() => expect(stateId()).toBe("s07.2 + s07.10"));
    expect(inFrame().getByText("Nick może zawierać tylko litery, cyfry, spacje oraz znaki _ i -.")).toBeTruthy();
    expect(nickField().value).toBe("Piotr#");
    expect(getSim().games.at(-1)!.opponent).toBeNull();
    type("Piotr");
    click("Rozumiem, graj jako gość");
    await waitFor(() => expect(current()).toBe("p04"));
    expect(getSim().role).toBe("T10");
    expect(getSim().games.at(-1)!.opponent).toEqual({ kind: "guest", nick: "Piotr" });
    expect(stateId()).toBe("p04.1 + p04.4");
  });

  it("puste pole: dołącza jako T5 „Gracz 2 (gość)”", async () => {
    render(<App />);
    act(() => window.__PROTOTYPE_START__?.());
    openAlaInvite();
    click("Graj jako gość");
    click("Rozumiem, graj jako gość");
    await waitFor(() => expect(current()).toBe("p04"));
    expect(getSim().role).toBe("T5");
    expect(names().join("|")).toContain("Ty: Gracz 2 (gość)");
  });

  it("s07.11: zaproszenie od gościa — nagłówek „Ola (gość) zaprasza Cię…” dla niezalogowanego (s07.1) i zalogowanego (s07.3)", () => {
    stage("g-waiting", "p01");
    act(() => setRole("T6"));
    act(() => document.getElementById("sc-open-guest-invite")!.click());
    expect(current()).toBe("s07");
    expect(stateId()).toBe("s07.1 + s07.11");
    expect(inFrame().getByRole("heading", { name: "Ola (gość) zaprasza Cię do partii Gomoku" })).toBeTruthy();
    act(() => setRole("T2"));
    expect(stateId()).toBe("s07.3 + s07.11");
    // The pair guest-creator + account plays (Q22).
    click("Dołącz do partii");
  });

  it("gość bez nicku jako twórca: „Gracz 1 (gość) zaprasza Cię…”", () => {
    stage("g-waiting-anon", "p01");
    act(() => setRole("T6"));
    act(() => document.getElementById("sc-open-guest-invite")!.click());
    expect(inFrame().getByRole("heading", { name: "Gracz 1 (gość) zaprasza Cię do partii Gomoku" })).toBeTruthy();
  });

  it("własne zaproszenie gościa-twórcy przekierowuje do partii (s07.5)", () => {
    stage("g-waiting", "p01");
    act(() => document.getElementById("sc-open-guest-invite")!.click());
    expect(current()).toBe("p03");
  });

  it("L35: gość z oczekującą partią anuluje ją i dołącza do cudzej, zachowując nick", async () => {
    stage("g-waiting", "p01");
    act(() => void setupDemo("waiting")); // Ala_7's invitation exists; rebuild keeps nothing of the guest
    act(() => void setupDemo("g-waiting"));
    // Another invitation (Ala_7's) next to the guest's own waiting game.
    act(() => setRole("T1"));
    act(() => document.getElementById("sc-open-invite")!.click());
    act(() => setRole("T9"));
    goTo("s07");
    expect(stateId()).toBe("s07.7");
    click("Anuluj moją partię i dołącz");
    await waitFor(() => expect(current()).toBe("p04"));
    expect(getSim().games.filter((g) => g.cancelled)).toHaveLength(1);
    expect(getSim().games.at(-1)!.opponent).toEqual({ kind: "guest", nick: "Ola" });
  });

  it("gość z aktywną partią otwiera cudzy link: s07.6 „Masz już partię”", () => {
    stage("g-play-ola", "p01");
    act(() => void setupDemo("g-play-ola"));
    act(() => document.getElementById("sc-open-invite")!.click());
    expect(stateId()).toBe("s07.6");
  });
});

describe("etykiety „(gość)” w p04–p06 (nick Q3, L30)", () => {
  it("p04: widok Gracza 2 i widok Oli — obie nazwy z sufiksem i ostrzeżenie p04.4 dla twórcy też", () => {
    stage("g-ready-g2", "p04");
    expect(stateId()).toBe("p04.2 + p04.4");
    expect(names()).toEqual(["Ola (gość)", "Ty: Gracz 2 (gość)"]);
    expect(inFrame().getByText("Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii")).toBeTruthy();
    act(() => setRole("T9"));
    expect(names()).toEqual(["Gracz 2 (gość)", "Ty: Ola (gość)"]);
    expect(stateId()).toBe("p04.2 + p04.4");
    expect(inFrame().getByText("Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii")).toBeTruthy();
  });

  it("p04.1: oczekujący gość czyta „Czekamy, aż Ola (gość) otworzy partię”", () => {
    stage("g-waiting", "p03");
    act(() => document.getElementById("sc-join-guest")!.click());
    act(() => setRole("T5"));
    goTo("p04");
    expect(stateId()).toBe("p04.1 + p04.4");
    expect(inFrame().getByText(/Czekamy, aż Ola \(gość\) otworzy partię/)).toBeTruthy();
  });

  it("p05: oba warianty widoku, ostrzeżenie p05.11 u twórcy i dołączającego", () => {
    stage("g-play-ola", "p05");
    expect(stateId()).toBe("p05.1 + p05.5 + p05.11");
    expect(names()).toEqual(["Gracz 2 (gość)", "Ty: Ola (gość)"]);
    act(() => setRole("T5"));
    expect(stateId()).toBe("p05.2 + p05.11");
    expect(names()).toEqual(["Ola (gość)", "Ty: Gracz 2 (gość)"]);
  });

  it("konto i gość z nickiem: „Piotr (gość)” po stronie konta, konto bez sufiksu po stronie gościa", () => {
    stage("a-vs-guest-nick", "p04");
    expect(names()).toEqual(["Piotr (gość)"]);
    expect(inFrame().getByText("Ty (Ala_7)")).toBeTruthy();
    expect(stateId()).toBe("p04.2");
    act(() => setRole("T10"));
    expect(inFrame().getByText("Ala_7")).toBeTruthy();
    expect(names()).toEqual(["Ty: Piotr (gość)"]);
    expect(stateId()).toBe("p04.2 + p04.4");
  });

  it("gość-twórca zaprasza konto: Kuba_P widzi „Ola (gość)”", () => {
    stage("g-vs-account", "p04");
    expect(names()).toEqual(["Ola (gość)"]);
    expect(inFrame().getByText("Ty (Kuba_P)")).toBeTruthy();
    expect(stateId()).toBe("p04.2");
  });

  it("L30: długi nick jest obcięty w jednej linii, „(gość)” zostaje widoczny, pełna nazwa w title i w tekście", () => {
    stage("g-play-long", "p05");
    const mine = inFrame().getAllByTestId("player-name").find((node) => node.textContent?.startsWith("Ty:"))!;
    expect(mine.getAttribute("title")).toBe(`${LONG_NICKNAME} (gość)`);
    expect(mine.textContent).toBe(`Ty: ${LONG_NICKNAME} (gość)`);
    const [you, nick, suffix] = Array.from(mine.children);
    expect(you!.className).toContain("shrink-0");
    expect(nick!.className).toContain("truncate");
    expect(nick!.className).toContain("min-w-0");
    expect(suffix!.className).toContain("shrink-0");
    expect(suffix!.textContent).toBe(" (gość)");
    expect(assumption()).toBe("L30");
  });
});

describe("gość–gość do końca (Q20)", () => {
  async function playLine(cells: number[]) {
    for (const [index, cell] of cells.entries()) {
      await act(async () => void (await placeStone(playOf(getSim())!.game.id, cell)));
      if (index < cells.length - 1) act(() => void opponentPlays());
    }
  }

  it("Ola układa pięć, wygrywa; wynik z nazwami, token gościa +1 h, potem 404, brak historii", async () => {
    stage("g-play-ola", "p05");
    await playLine([at(9, 3), at(9, 4), at(9, 5), at(9, 6), at(9, 7)]);
    goTo("p06");
    expect(stateId()).toBe("p06.1 + p06.6 + p06.10");
    expect(inFrame().getByText("Wygrałeś")).toBeTruthy();
    expect(names()).toEqual(["Gracz 2 (gość)", "Ty: Ola (gość)"]);
    expect(inFrame().getByTestId("guest-until").textContent).toContain("do 1 godziny");
    act(() => setRole("T5"));
    expect(stateId()).toBe("p06.2 + p06.6 + p06.10");
    expect(inFrame().getByText("Przegrałeś")).toBeTruthy();
    act(() => advanceClock(60 * 60_000));
    expect(stateId()).toBe("p06.7");
    act(() => setRole("T9"));
    expect(stateId()).toBe("p06.7");
    expect(inFrame().getByText("Ta partia nie istnieje albo nie masz do niej dostępu")).toBeTruthy();
  });

  it("p06.1/p06.2 po stronie przeciwnika: Gracz 2 widzi przegraną; rewanż zachowuje nick i zamienia miejsca", async () => {
    stage("g-lost", "p06");
    const oldId = getSim().tokens.T9!.game;
    expect(stateId()).toContain("p06.2");
    click("Rewanż");
    act(() => void opponentRematch("accept"));
    await waitFor(() => expect(current()).toBe("p05"));
    const game = playOf(getSim())!.game;
    expect(game.id).not.toBe(oldId);
    expect(getSim().tokens.T9!.game).toBe(game.id);
    expect(getSim().tokens.T5!.game).toBe(game.id);
    // The explicit nickname stays; the default name follows the seat: the first joiner now holds seat 1.
    expect(playerName(game, "creator").label).toBe("Ola (gość)");
    expect(playerName(game, "opponent").label).toBe("Gracz 1 (gość)");
    expect(stateId()).toContain("p06.15");
    expect(names()).toEqual(["Gracz 1 (gość)", "Ty: Ola (gość)"]);
  });

  it("p06.11–p06.13: etykieta gościa w propozycji rewanżu i wyjście gościa na / (p01.8)", () => {
    stage("g-lost", "p06");
    act(() => void opponentRematch("propose"));
    expect(inFrame().getByText("Gracz 2 (gość) proponuje rewanż. Kolory zostaną zamienione.")).toBeTruthy();
    expect(stateId()).toContain("p06.12");
    click("Odrzuć");
    act(() => void opponentRematch("propose"));
    click("Wróć do panelu głównego");
    expect(current()).toBe("p01");
    expect(stateId()).toBe("p01.8");
  });

  it("gość-twórca z kontem w obu kierunkach: Ala_7 dołącza do zaproszenia gościa, gość zaprasza Kubę", async () => {
    stage("g-waiting", "p03");
    act(() => setRole("T1"));
    act(() => document.getElementById("sc-open-guest-invite")!.click());
    expect(stateId()).toBe("s07.3 + s07.11");
    click("Dołącz do partii");
    await waitFor(() => expect(current()).toBe("p04"));
    expect(names()).toEqual(["Ola (gość)"]);
    act(() => setRole("T9"));
    goTo("p03");
    expect(inFrame().getByText("Ala_7 dołączył do partii")).toBeTruthy();
  });
});
