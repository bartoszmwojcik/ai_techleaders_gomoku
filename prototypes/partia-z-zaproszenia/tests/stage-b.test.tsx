import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import "../src/review/comments.js";
import "../src/review/prototype.js";
import {
  addToClock,
  advanceClock,
  backgroundTab,
  expireClock,
  getSim,
  jumpClockTo,
  moverOf,
  opponentPlays,
  opponentRematch,
  opponentResigns,
  patchScenario,
  placeStone,
  playOf,
  remainingMs,
  reloadGamePage,
  resetSim,
  setRole,
  setupDemo,
  showPosition,
  winningLine,
} from "../src/sim";
import { resetStateIds } from "../src/stateId";

// Stage B: the board, the rules, the clocks, the result, resignation, rematch, return after a disconnect, p07.

const current = () => document.querySelector(".screen.is-current")?.id;
const frame = () => document.querySelector(".screen.is-current .frame") as HTMLElement;
const inFrame = () => within(frame());
const stateId = () => frame().querySelector("[data-state]")?.getAttribute("data-state");
const goTo = (id: string) => act(() => void document.dispatchEvent(new CustomEvent("prototype:navigate", { detail: id })));
const click = (name: RegExp | string) => fireEvent.click(inFrame().getByRole("button", { name }));
const at = (row: number, column: number) => (row - 1) * 15 + (column - 1);
const cellButton = (row: number, column: number) =>
  inFrame().getByRole("button", { name: new RegExp(`^Kolumna ${String.fromCharCode(64 + column)}, rząd ${row},`) });
const timers = () => inFrame().getAllByRole("timer").map((t) => t.textContent);

function start(stage: Parameters<typeof setupDemo>[0], screenId: "p05" | "p06" = "p05") {
  render(<App />);
  act(() => {
    window.__PROTOTYPE_START__?.();
  });
  if (!current()) goTo("p01");
  act(() => void setupDemo(stage));
  goTo(screenId);
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

/** The viewer plays `cells` in turn; after each of the first moves the simulated opponent answers. */
async function playLine(cells: number[]) {
  for (const [index, cell] of cells.entries()) {
    await act(async () => void (await placeStone(playOf(getSim())!.game.id, cell)));
    if (index < cells.length - 1) act(() => void opponentPlays());
  }
}

describe("p05: plansza i reguły", () => {
  it("p05.1: plansza 15×15 (grid, 225 pól), Twój ruch (czarne), zegary 10:00, grasz czarnymi, wylosowano", () => {
    start("play-black");
    expect(current()).toBe("p05");
    expect(stateId()).toBe("p05.1 + p05.5");
    const grid = inFrame().getByRole("grid", { name: "Plansza 15 na 15" });
    expect(within(grid).getAllByRole("button")).toHaveLength(225);
    expect(inFrame().getByText("Twój ruch (czarne)")).toBeTruthy();
    expect(inFrame().getByText("Grasz czarnymi.")).toBeTruthy();
    expect(inFrame().getByText("Wylosowano: Ty grasz czarnymi.")).toBeTruthy();
    expect(timers()).toEqual(["10:00", "10:00"]);
    expect(inFrame().getByText("Kuba_P")).toBeTruthy();
    expect(inFrame().getByText("Ty (Ala_7)")).toBeTruthy();
  });

  it("losowanie koloru: kontrolka wymusza kolor, losowo daje jeden z dwóch", () => {
    start("ready", "p04");
    act(() => patchScenario({ colorDraw: "viewer-white" }));
    click("Przejdź do planszy");
    expect(current()).toBe("p05");
    expect(inFrame().getByText("Grasz białymi.")).toBeTruthy();
    expect(inFrame().getAllByText("Ruch przeciwnika").length).toBeGreaterThan(0);
    expect(stateId()).toBe("p05.2");
  });

  it("losowo (domyślnie) wychodzi czarne albo białe", () => {
    for (const [value, word] of [[0.1, "czarnymi"], [0.9, "białymi"]] as const) {
      const random = vi.spyOn(Math, "random").mockReturnValue(value);
      start("ready", "p04");
      click("Przejdź do planszy");
      expect(inFrame().getByText(`Grasz ${word}.`)).toBeTruthy();
      random.mockRestore();
      cleanup();
      act(() => resetSim());
    }
  });

  it("p05.5/p05.6: kliknięcie wysyła ruch, kamień jest na planszy, potem ruch przeciwnika (p05.2) i jego zegar", async () => {
    start("play-black");
    fireEvent.click(cellButton(8, 8));
    expect(stateId()).toContain("p05.6");
    expect(inFrame().getByText("Wysyłanie ruchu…")).toBeTruthy();
    await waitFor(() => expect(stateId()).toBe("p05.2"));
    expect(cellButton(8, 8).getAttribute("aria-label")).toBe("Kolumna H, rząd 8, czarny kamień");
    expect(inFrame().getAllByText("Ruch przeciwnika").length).toBeGreaterThan(0);
    expect(inFrame().getByRole("grid").getAttribute("aria-readonly")).toBe("true");
    // The first stone is down: the draw notice goes away, the colour line stays (L15).
    expect(inFrame().queryByText(/Wylosowano/)).toBeNull();
    expect(inFrame().getByText("Grasz czarnymi.")).toBeTruthy();
    act(() => void opponentPlays());
    expect(stateId()).toBe("p05.1 + p05.5");
    expect(inFrame().getByText("Twój ruch (czarne)")).toBeTruthy();
  });

  it("zajęte pole i naprzemienność: serwer odrzuca ruch bez zmiany planszy", async () => {
    start("play-black");
    const id = playOf(getSim())!.game.id;
    expect((await placeStone(id, at(8, 8))).kind).toBe("ok");
    expect((await placeStone(id, at(9, 9))).kind).toBe("not-your-turn");
    act(() => void opponentPlays());
    expect((await placeStone(id, at(8, 8))).kind).toBe("occupied");
    expect(playOf(getSim())!.play.moves).toHaveLength(2);
    expect(opponentPlays()).toBe(false); // his move is over: it is the viewer's turn
    expect((await placeStone(id, at(9, 9))).kind).toBe("ok");
    expect(opponentPlays()).toBe(true);
  });

  it("opponentPlays nie gra, gdy nie ma partii, a placeStone mówi „koniec” bez dostępu", async () => {
    start("ready", "p04");
    expect(opponentPlays()).toBe(false);
    expect(opponentResigns()).toBe(false);
    expect(expireClock()).toBe(false);
    expect(showPosition("win")).toBe(false);
    expect(opponentRematch("propose")).toMatch(/Nie dotyczy/);
    expect((await placeStone(999, 0)).kind).toBe("finished");
  });

  it.each([
    ["poziomo", [at(9, 2), at(9, 3), at(9, 4), at(9, 5), at(9, 6)]],
    ["pionowo", [at(8, 11), at(9, 11), at(10, 11), at(11, 11), at(12, 11)]],
    ["przekątna \\", [at(8, 2), at(9, 3), at(10, 4), at(11, 5), at(12, 6)]],
    ["przekątna /", [at(8, 12), at(9, 11), at(10, 10), at(11, 9), at(12, 8)]],
  ])("prawdziwa wygrana %s: pięć kończy partię, cztery nie", async (_name, cells) => {
    start("play-black");
    await playLine(cells.slice(0, 4));
    expect(playOf(getSim())!.play.result).toBeNull();
    act(() => void opponentPlays());
    await playLine(cells.slice(4));
    const { play } = playOf(getSim())!;
    expect(play.result).toMatchObject({ kind: "five", winner: "creator" });
    expect(play.result!.line).toEqual([...cells].sort((a, b) => a - b));
    expect(current()).toBe("p06");
    expect(stateId()).toBe("p06.1 + p06.10");
  });

  it("sześć w linii też wygrywa (swobodne gomoku), a plansza podświetla całą linię", async () => {
    start("play-black");
    await playLine([at(9, 2), at(9, 3), at(9, 5), at(9, 6), at(9, 7)]);
    expect(playOf(getSim())!.play.result).toBeNull(); // XX_XXX: the gap keeps it open
    act(() => void opponentPlays());
    await playLine([at(9, 4)]);
    expect(playOf(getSim())!.play.result!.line).toHaveLength(6);
    expect(frame().querySelectorAll(".outline-4")).toHaveLength(6);
  });

  it("wygrana białymi i przegrana: przeciwnik daje piątkę w rzędzie", async () => {
    start("play-white");
    act(() => patchScenario({ opponentPattern: "five" }));
    for (const cell of [at(2, 2), at(4, 4), at(2, 6), at(4, 8)]) {
      act(() => void opponentPlays());
      await playLine([cell]);
    }
    act(() => void opponentPlays());
    const { play } = playOf(getSim())!;
    expect(play.result).toMatchObject({ kind: "five", winner: "opponent" });
    expect(current()).toBe("p06");
    expect(stateId()).toBe("p06.2 + p06.10");
    expect(inFrame().getByText("Przeciwnik ułożył pięć kamieni w jednej linii.")).toBeTruthy();
  });

  it("winningLine zna rogi i krawędzie", () => {
    const row = [0, 1, 2, 3, 4].map((cell) => ({ cell, color: "black" as const }));
    expect(winningLine(row, 4, "black")).toEqual([0, 1, 2, 3, 4]);
    expect(winningLine(row.slice(0, 4), 3, "black")).toBeNull();
    expect(winningLine(row, 2, "white")).toBeNull();
  });

  it("remis: ostatni wolny cel kończy partię remisem (prawdziwe wykrycie), pełna plansza bez piątki", async () => {
    start("play-black");
    act(() => void showPosition("almost-full"));
    expect(inFrame().getAllByRole("button", { name: /puste$/ })).toHaveLength(1);
    const last = playOf(getSim())!;
    expect(last.play.moves).toHaveLength(224);
    fireEvent.click(inFrame().getAllByRole("button", { name: /puste$/ })[0]!);
    await waitFor(() => expect(current()).toBe("p06"));
    expect(playOf(getSim())!.play.result).toEqual({ kind: "draw", winner: null, line: [] });
    expect(stateId()).toBe("p06.4 + p06.10");
    expect(inFrame().getByText("Remis")).toBeTruthy();
    expect(frame().querySelectorAll(".outline-4")).toHaveLength(0);
    expect(inFrame().queryAllByRole("button", { name: /puste$/ })).toHaveLength(0);
  });
});

describe("p05: błędy ruchu, dotyk, klawiatura", () => {
  it("p05.7: błąd sieci i „Spróbuj ponownie” ponawia TEN SAM ruch", async () => {
    start("play-black");
    act(() => patchScenario({ moveOutcome: "network" }));
    fireEvent.click(cellButton(7, 7));
    await waitFor(() => expect(stateId()).toContain("p05.7"));
    expect(inFrame().getByText("Nie udało się połączyć z serwerem. Spróbuj ponownie.")).toBeTruthy();
    expect(playOf(getSim())!.play.moves).toHaveLength(0);
    click("Spróbuj ponownie");
    await waitFor(() => expect(stateId()).toBe("p05.2"));
    expect(playOf(getSim())!.play.moves).toEqual([{ cell: at(7, 7), color: "black" }]);
  });

  it("p05.8: nieaktualny widok i „nie Twoja kolej” dają komunikat, plansza się odświeża", async () => {
    start("play-black");
    act(() => patchScenario({ moveOutcome: "stale" }));
    fireEvent.click(cellButton(7, 7));
    await waitFor(() => expect(stateId()).toContain("p05.8"));
    expect(inFrame().getByText("Plansza była nieaktualna i została odświeżona. Spróbuj ponownie.")).toBeTruthy();
    expect(playOf(getSim())!.play.moves).toHaveLength(0);
    act(() => patchScenario({ moveOutcome: "not-your-turn" }));
    fireEvent.click(cellButton(7, 7));
    await waitFor(() => expect(inFrame().getByText("Teraz ruch przeciwnika. Plansza została odświeżona.")).toBeTruthy());
    expect(playOf(getSim())!.play.moves).toHaveLength(1);
    expect(stateId()).toContain("p05.8");
  });

  it("p05.9: pole zajęte", async () => {
    start("play-black");
    act(() => patchScenario({ moveOutcome: "occupied" }));
    fireEvent.click(cellButton(7, 7));
    await waitFor(() => expect(inFrame().getByText("To pole jest już zajęte")).toBeTruthy());
    expect(stateId()).toContain("p05.9");
    expect(cellButton(7, 7).getAttribute("aria-label")).toBe("Kolumna G, rząd 7, biały kamień");
    // The next move clears the message.
    fireEvent.click(cellButton(7, 8));
    await waitFor(() => expect(inFrame().queryByText("To pole jest już zajęte")).toBeNull());
  });

  it("p05.4: dotyk — pierwsze dotknięcie zaznacza, drugie tego pola albo „Postaw kamień” wysyła", async () => {
    start("play-black");
    act(() => patchScenario({ input: "touch" }));
    expect(inFrame().getByRole("button", { name: "Postaw kamień" }).hasAttribute("disabled")).toBe(true);
    expect(inFrame().getByText("Dotknij przecięcia, żeby je zaznaczyć.")).toBeTruthy();
    fireEvent.click(cellButton(8, 8));
    expect(stateId()).toBe("p05.1 + p05.4");
    expect(playOf(getSim())!.play.moves).toHaveLength(0);
    expect(inFrame().getByText("Zaznaczono: Kolumna H, rząd 8. Naciśnij „Postaw kamień”.")).toBeTruthy();
    fireEvent.click(cellButton(9, 9)); // moves the selection
    expect(inFrame().getByText(/Kolumna I, rząd 9/)).toBeTruthy();
    click("Postaw kamień");
    await waitFor(() => expect(stateId()).toBe("p05.2"));
    expect(playOf(getSim())!.play.moves).toEqual([{ cell: at(9, 9), color: "black" }]);
    // Second tap of the same cell sends too.
    act(() => void opponentPlays());
    fireEvent.click(cellButton(10, 10));
    fireEvent.click(cellButton(10, 10));
    await waitFor(() => expect(playOf(getSim())!.play.moves).toHaveLength(3));
    // Out of turn there is nothing to confirm.
    expect(inFrame().getByText("Poczekaj na ruch przeciwnika.")).toBeTruthy();
  });

  it("wykrywanie urządzenia: pointer: coarse włącza tryb dotyku, brak matchMedia to mysz", () => {
    start("play-black");
    expect(inFrame().queryByRole("button", { name: "Postaw kamień" })).toBeNull();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes("coarse") })) as typeof window.matchMedia;
    cleanup();
    start("play-black");
    expect(inFrame().getByRole("button", { name: "Postaw kamień" })).toBeTruthy();
    window.matchMedia = original;
  });

  it("klawiatura: strzałki przesuwają fokus (jedno pole z tabindex 0), Enter stawia kamień (K10–K14)", async () => {
    start("play-black");
    const grid = inFrame().getByRole("grid");
    const zero = () => within(grid).getAllByRole("button").filter((b) => b.getAttribute("tabindex") === "0");
    expect(zero()).toHaveLength(1);
    const start0 = zero()[0]!;
    start0.focus();
    fireEvent.keyDown(start0, { key: "ArrowRight" });
    const moved = zero()[0]!;
    expect(zero()).toHaveLength(1);
    expect(moved).not.toBe(start0);
    expect(document.activeElement).toBe(moved);
    fireEvent.click(moved); // Enter on a button is a click
    await waitFor(() => expect(playOf(getSim())!.play.moves).toHaveLength(1));
  });

  it("p05.11: gość widzi stałe ostrzeżenie, a twórca ma przeciwnika „Gość”", () => {
    start("play-guest");
    expect(stateId()).toContain("p05.11");
    expect(inFrame().getByText("Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii")).toBeTruthy();
    expect(inFrame().getByText("Ty (Gość)")).toBeTruthy();
    act(() => setRole("T1"));
    expect(inFrame().getByText("Gość")).toBeTruthy();
    expect(inFrame().queryByText(/Grasz bez konta/)).toBeNull();
  });
});

describe("zegar (#23)", () => {
  it("stoi na 10:00; kiedy czas płynie, tyka tylko zegar gracza na ruchu (BR-05)", async () => {
    start("play-black");
    const { game, play } = playOf(getSim())!;
    act(() => advanceClock(30_000));
    expect(timers()).toEqual(["10:00", "9:30"]); // the opponent's clock on top, mine below
    expect(moverOf(play)).toBe("creator");
    await act(async () => void (await placeStone(game.id, at(8, 8))));
    expect(timers()).toEqual(["10:00", "9:30"]);
    act(() => advanceClock(20_000));
    expect(timers()).toEqual(["9:40", "9:30"]);
    expect(remainingMs(getSim(), playOf(getSim())!.play, "creator")).toBe(570_000);
  });

  it("p05.3: poniżej minuty kolor i obrys, bez tekstu, ukryty komunikat ogłasza raz", () => {
    start("play-black");
    const live = () => inFrame().getByTestId("low-live").textContent;
    expect(live()).toBe("");
    act(() => jumpClockTo(50_000));
    expect(timers()[1]).toBe("0:50");
    expect(stateId()).toBe("p05.1 + p05.3 + p05.5");
    expect(inFrame().getByTestId("clock-creator").hasAttribute("data-low")).toBe(true);
    expect(inFrame().getByTestId("clock-opponent").hasAttribute("data-low")).toBe(false);
    expect(live()).toBe("Zostało mniej niż minuta");
    expect(frame().textContent).not.toMatch(/Mało czasu/);
    expect(document.querySelector("audio")).toBeNull();
    // Back above the threshold and below again: the text stays, so the region does not announce twice.
    act(() => addToClock(30_000));
    expect(inFrame().getByTestId("clock-creator").hasAttribute("data-low")).toBe(false);
    act(() => jumpClockTo(40_000));
    expect(live()).toBe("Zostało mniej niż minuta");
  });

  it("zegar przeciwnika też bywa niski; kontrolka „Zegar dotyczy” wybiera zegar", () => {
    start("play-black");
    act(() => patchScenario({ clockTarget: "theirs" }));
    act(() => jumpClockTo(50_000));
    expect(timers()[0]).toBe("0:50");
    expect(inFrame().getByTestId("clock-opponent").hasAttribute("data-low")).toBe(true);
    // Not his turn: his clock is not running, so the jump changes the stored value only.
    act(() => advanceClock(10_000));
    expect(timers()).toEqual(["0:50", "9:50"]);
  });

  it("przegrana na czas: czas wyczerpany bez nikogo na stronie rozstrzyga się leniwie (p06.3)", () => {
    start("play-black");
    act(() => advanceClock(11 * 60_000));
    const { play } = playOf(getSim())!;
    expect(play.result).toMatchObject({ kind: "timeout", winner: "opponent" });
    expect(play.remaining.creator).toBe(0);
    // The game ended exactly when the clock hit zero, not when somebody looked.
    expect(play.finishedAt).toBe(play.tickAt + 600_000);
    expect(current()).toBe("p06");
    expect(stateId()).toBe("p06.3 + p06.10");
    expect(inFrame().getByText("Przegrałeś — skończył się Twój czas")).toBeTruthy();
    expect(timers()).toEqual(["10:00", "0:00"]);
  });

  it("„Minął czas” na zegarze przeciwnika to wygrana (p06.1), a na moim przegrana", () => {
    start("play-black");
    act(() => patchScenario({ clockTarget: "theirs" }));
    act(() => void expireClock());
    expect(stateId()).toBe("p06.1 + p06.10");
    expect(inFrame().getByText("Wygrałeś — przeciwnikowi skończył się czas")).toBeTruthy();
  });

  it("„Odliczaj zegar”: czas demo płynie sam (x10) i kończy partię; bez partii sam się wyłącza", () => {
    vi.useFakeTimers();
    start("play-black");
    act(() => patchScenario({ autoClock: true, speed: 30 }));
    act(() => void vi.advanceTimersByTime(1000)); // 4 ticks x 250 ms x 30 = 30 s
    expect(timers()[1]).toBe("9:30");
    act(() => void vi.advanceTimersByTime(20_000)); // past 10 minutes
    expect(playOf(getSim())!.play.result?.kind).toBe("timeout");
    act(() => void vi.advanceTimersByTime(500));
    expect(getSim().scenario.autoClock).toBe(false);
  });

  it("czas demo „+15 min” liczy się też graczowi (BR-06): zaproszone zegary stoją tylko do startu planszy", () => {
    start("ready", "p04");
    expect(inFrame().getAllByRole("timer").map((t) => t.textContent)).toEqual(["10:00", "10:00"]);
    act(() => advanceClock(15 * 60_000)); // nobody started the board: the invitation is cancelled (Q21), not a loss
    expect(getSim().games.at(-1)!.play).toBeNull();
  });
});

describe("poddanie", () => {
  it("p05.13: dialog z pytaniem, fokus na „Wróć do gry”; Esc zamyka i oddaje fokus przyciskowi", async () => {
    start("play-black");
    click("Poddaj partię");
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Czy na pewno chcesz się poddać?")).toBeTruthy();
    expect(within(dialog).getByText("Przeciwnik wygra partię.")).toBeTruthy();
    expect(stateId()).toContain("p05.13");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Wróć do gry"));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(playOf(getSim())!.play.result).toBeNull();
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Poddaj partię"));
  });

  it("p05.14 → p06.9: potwierdzenie kończy partię poddaniem", async () => {
    start("play-black");
    click("Poddaj partię");
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Poddaj partię" }));
    expect(stateId()).toContain("p05.14");
    await waitFor(() => expect(current()).toBe("p06"));
    expect(stateId()).toBe("p06.9 + p06.10");
    expect(playOf(getSim())!.play.result).toMatchObject({ kind: "resignation", winner: "opponent" });
    expect(inFrame().getByText("Przegrałeś, poddałeś partię")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("błąd sieci przy poddaniu: alert w dialogu i „Spróbuj ponownie” (jednorazowy)", async () => {
    start("play-white");
    act(() => patchScenario({ resignFails: true }));
    click("Poddaj partię"); // also in the opponent's turn
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Poddaj partię" }));
    await waitFor(() => expect(within(screen.getByRole("alertdialog")).getByRole("alert")).toBeTruthy());
    expect(stateId()).toContain("p05.7");
    expect(playOf(getSim())!.play.result).toBeNull();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Spróbuj ponownie" }));
    await waitFor(() => expect(current()).toBe("p06"));
    expect(stateId()).toBe("p06.9 + p06.10");
  });

  it("poddanie przed pierwszym ruchem jest możliwe; poddanie przeciwnika to p06.8", () => {
    start("play-black");
    act(() => void opponentResigns());
    expect(current()).toBe("p06");
    expect(stateId()).toBe("p06.8 + p06.10");
    expect(inFrame().getByText("Wygrałeś, przeciwnik poddał partię")).toBeTruthy();
  });

  it("poddanie po zakończeniu partii nic nie zmienia", async () => {
    start("play-black");
    const id = playOf(getSim())!.game.id;
    act(() => void opponentResigns());
    const { resignGame } = await import("../src/sim");
    expect((await resignGame(id)).kind).toBe("finished");
  });
});

describe("p06: wynik", () => {
  it("p06.1: wygrana z podświetloną linią, plansza tylko do odczytu, zegary stoją", () => {
    start("won", "p06");
    expect(stateId()).toBe("p06.1 + p06.10");
    expect(inFrame().getByText("Wygrałeś")).toBeTruthy();
    expect(frame().querySelectorAll(".outline-4")).toHaveLength(5);
    expect(inFrame().getByRole("grid").getAttribute("aria-readonly")).toBe("true");
    const before = timers();
    act(() => advanceClock(60_000));
    expect(timers()).toEqual(before);
    expect(inFrame().getByText("Grałeś czarnymi.")).toBeTruthy();
  });

  it("skróty „Pokaż przegraną” i „Pokaż remis” z widoku białych", () => {
    start("play-white");
    act(() => void showPosition("loss"));
    expect(stateId()).toBe("p06.2 + p06.10");
    expect(frame().querySelectorAll(".outline-4")).toHaveLength(5);
    cleanup();
    act(() => resetSim());
    start("play-white");
    act(() => void showPosition("win"));
    expect(stateId()).toBe("p06.1 + p06.10");
    cleanup();
    act(() => resetSim());
    start("play-white");
    act(() => void showPosition("draw"));
    expect(stateId()).toBe("p06.4 + p06.10");
    expect(playOf(getSim())!.play.moves).toHaveLength(225);
  });

  it("p06.5: odświeżenie strony po końcu pokazuje wynik bez ruchu", () => {
    start("lost", "p06");
    act(() => reloadGamePage());
    expect(stateId()).toBe("p06.2 + p06.5 + p06.10");
    expect(inFrame().getByText(/Powrót do zakończonej partii/)).toBeTruthy();
    act(() => reloadGamePage());
    expect(getSim().reload).toBe(2);
  });

  it("odświeżenie w trakcie partii nie udaje wyniku", () => {
    start("play-black");
    act(() => reloadGamePage());
    expect(getSim().refreshed).toBe(false);
  });

  it("p06.6 i p06.7: gość widzi wynik do godziny po końcu, potem 404", () => {
    start("play-guest");
    act(() => void showPosition("loss"));
    expect(current()).toBe("p06");
    expect(stateId()).toBe("p06.2 + p06.6 + p06.10");
    expect(inFrame().getByText("Wynik zobaczysz w tej przeglądarce do 1 godziny po zakończeniu partii.")).toBeTruthy();
    act(() => advanceClock(59 * 60_000));
    expect(stateId()).toContain("p06.6");
    act(() => advanceClock(2 * 60_000));
    expect(stateId()).toBe("p06.7");
    expect(inFrame().getByText("Ta partia nie istnieje albo nie masz do niej dostępu")).toBeTruthy();
    // The account of the creator keeps the result without a limit (#24 Q4).
    act(() => setRole("T1"));
    expect(stateId()).toContain("p06.1");
  });
});

describe("rewanż", () => {
  it("p06.10 → p06.11 → wycofanie → p06.10; kolory w zapowiedzi są odwrócone", () => {
    start("lost", "p06");
    expect(inFrame().getByText("Rewanż to nowa partia z odwróconymi kolorami: zagrasz białymi.")).toBeTruthy();
    click("Rewanż");
    expect(stateId()).toBe("p06.2 + p06.11");
    expect(inFrame().getByText("Zaproponowano rewanż. Czekamy na odpowiedź przeciwnika (do 5 min).")).toBeTruthy();
    click("Wycofaj propozycję");
    expect(stateId()).toBe("p06.2 + p06.10");
  });

  it("przeciwnik przyjmuje: nowa partia z odwróconymi kolorami, zegary 10:00, pusta plansza, stara zostaje w pamięci", () => {
    start("lost", "p06");
    const old = playOf(getSim())!;
    click("Rewanż");
    act(() => void opponentRematch("accept"));
    expect(current()).toBe("p05");
    const fresh = playOf(getSim())!;
    expect(fresh.game.id).not.toBe(old.game.id);
    expect(fresh.play.creatorColor).toBe("white");
    expect(fresh.play.fromRematch).toBe(true);
    expect(stateId()).toBe("p05.2");
    expect(inFrame().getByText("Rewanż: kolory zostały zamienione. Grasz białymi.")).toBeTruthy();
    expect(timers()).toEqual(["10:00", "10:00"]);
    expect(frame().querySelectorAll('button[aria-label$="kamień"]')).toHaveLength(0);
    expect(getSim().games.find((g) => g.id === old.game.id)!.play!.result).not.toBeNull();
    // And another rematch turns the colours again.
    act(() => void showPosition("loss"));
    click("Rewanż");
    act(() => void opponentRematch("accept"));
    expect(playOf(getSim())!.play.creatorColor).toBe("black");
  });

  it("p06.12: przeciwnik proponuje, „Przyjmij” zaczyna nową partię, a „Odrzuć” wraca do p06.10 z komunikatem", async () => {
    start("lost", "p06");
    act(() => void opponentRematch("propose"));
    expect(stateId()).toBe("p06.2 + p06.12");
    expect(inFrame().getByText("Kuba_P proponuje rewanż. Kolory zostaną zamienione.")).toBeTruthy();
    click("Odrzuć");
    expect(stateId()).toBe("p06.2 + p06.10");
    expect(inFrame().getByText("Odrzuciłeś propozycję rewanżu.")).toBeTruthy();
    act(() => void opponentRematch("propose"));
    click("Przyjmij");
    await waitFor(() => expect(current()).toBe("p05"));
    expect(playOf(getSim())!.play.fromRematch).toBe(true);
  });

  it("BR-13: przy przyjęciu 409 z linkiem, propozycja trwa; przeciwnik z inną partią też nie przyjmie", async () => {
    start("lost", "p06");
    act(() => patchScenario({ rematchConflict: true }));
    act(() => void opponentRematch("propose"));
    click("Przyjmij");
    await waitFor(() => expect(inFrame().getByText("Masz już partię")).toBeTruthy());
    expect(stateId()).toBe("p06.2 + p06.12");
    fireEvent.click(inFrame().getByRole("link", { name: "Przejdź do partii" }));
    expect(screen.getByRole("dialog").textContent).toContain("inna partia");
    fireEvent.click(screen.getByRole("button", { name: "Wróć do prototypu" }));
    // The opponent's side: he cannot accept either; only the line in the panel tells.
    act(() => void opponentRematch("withdraw"));
    click("Rewanż");
    act(() => void opponentRematch("accept"));
    expect(current()).toBe("p06");
    expect(getSim().event).toMatch(/409/);
  });

  it("p06.13: przeciwnik odrzucił albo wyszedł — od razu odrzucone, przycisk do panelu", () => {
    start("lost", "p06");
    click("Rewanż");
    act(() => void opponentRematch("decline"));
    expect(stateId()).toBe("p06.2 + p06.13");
    expect(inFrame().getByText("Zaproszenie do rewanżu odrzucone")).toBeTruthy();
    expect(inFrame().getByText("Przeciwnik odrzucił rewanż.")).toBeTruthy();
    click("Wróć do panelu głównego");
    expect(current()).toBe("p01");
    goTo("p06");
    cleanup();
    act(() => resetSim());
    start("lost", "p06");
    click("Rewanż");
    act(() => void opponentRematch("leave"));
    expect(inFrame().getByText("Przeciwnik wyszedł do panelu głównego.")).toBeTruthy();
  });

  it("p06.14: po 5 minutach propozycja wygasa; „Zaproponuj ponownie” wraca do p06.10", () => {
    start("lost", "p06");
    click("Rewanż");
    act(() => advanceClock(4 * 60_000));
    expect(stateId()).toBe("p06.2 + p06.11");
    act(() => advanceClock(60_000));
    expect(stateId()).toBe("p06.2 + p06.14");
    expect(inFrame().getByText("Zaproszenie do rewanżu wygasło (po 5 minutach).")).toBeTruthy();
    click("Zaproponuj ponownie");
    expect(stateId()).toBe("p06.2 + p06.10");
  });

  it("„Wróć do panelu głównego” z własną propozycją zapisuje ją jako odrzuconą (L21); propozycja przeciwnika znika", () => {
    start("lost", "p06");
    click("Rewanż");
    click("Wróć do panelu głównego");
    expect(current()).toBe("p01");
    expect(playOf(getSim())!.play.rematch).toMatchObject({ declined: "left" });
    cleanup();
    act(() => resetSim());
    start("lost", "p06");
    act(() => void opponentRematch("propose"));
    click("Wróć do panelu głównego");
    expect(playOf(getSim())!.play.rematch).toBeNull();
  });

  it("odpowiedzi przeciwnika bez propozycji nic nie robią i mówią dlaczego", () => {
    start("lost", "p06");
    expect(opponentRematch("accept")).toMatch(/Nie dotyczy/);
    expect(opponentRematch("decline")).toMatch(/Nie dotyczy/);
    expect(opponentRematch("withdraw")).toMatch(/Nie dotyczy/);
    expect(playOf(getSim())!.play.rematch).toBeNull();
  });

  it("p06.15: gość przyjmuje rewanż i dostaje nowy token (nowa partia, „Rozumiem”)", async () => {
    start("play-guest");
    const oldId = playOf(getSim())!.game.id;
    act(() => void showPosition("loss"));
    expect(inFrame().getByTestId("guest-rematch-note")).toBeTruthy();
    act(() => void opponentRematch("propose"));
    expect(stateId()).toBe("p06.2 + p06.6 + p06.12 + p06.15");
    click("Przyjmij");
    await waitFor(() => expect(current()).toBe("p05"));
    expect(getSim().guestGame).not.toBe(oldId);
    expect(getSim().guestGame).toBe(playOf(getSim())!.game.id);
    expect(stateId()).toContain("p06.15");
    expect(inFrame().getByText("Nowa partia ma nowy dostęp w tej przeglądarce")).toBeTruthy();
    click("Rozumiem");
    expect(inFrame().queryByText("Nowa partia ma nowy dostęp w tej przeglądarce")).toBeNull();
    // A guest who proposes and is accepted gets the token as well.
    act(() => void showPosition("win"));
    click("Rewanż");
    act(() => void opponentRematch("accept"));
    expect(getSim().guestGame).toBe(playOf(getSim())!.game.id);
  });
});

describe("powrót po rozłączeniu (#24)", () => {
  it("p05.12 → 20 s: zegar mniejszy o nieobecność, bez komunikatu", async () => {
    start("play-black");
    act(() => backgroundTab(20));
    expect(stateId()).toContain("p05.12");
    expect(inFrame().getByText("Karta w tle: odpytywanie wstrzymane.")).toBeTruthy();
    await waitFor(() => expect(getSim().bg).toBe(false));
    expect(timers()[1]).toBe("9:40");
    expect(inFrame().queryByText(/Wróciłeś/)).toBeNull();
    expect(stateId()).not.toContain("p05.10");
  });

  it("45 s: „Wróciłeś do partii”, znika po ruchu", async () => {
    start("play-black");
    act(() => backgroundTab(45));
    await waitFor(() => expect(stateId()).toContain("p05.10"));
    expect(inFrame().getByText("Wróciłeś do partii. Twój zegar: 9:15.")).toBeTruthy();
    fireEvent.click(cellButton(8, 8));
    await waitFor(() => expect(inFrame().queryByText(/Wróciłeś/)).toBeNull());
  });

  it("komunikat znika sam po 8 s; nowszy komunikat nie jest kasowany starym zegarem", () => {
    vi.useFakeTimers();
    start("play-black");
    act(() => backgroundTab(45));
    act(() => void vi.advanceTimersByTime(900));
    expect(getSim().returned).not.toBeNull();
    act(() => void vi.advanceTimersByTime(5000));
    act(() => backgroundTab(40));
    act(() => void vi.advanceTimersByTime(900));
    act(() => void vi.advanceTimersByTime(3000)); // the first timeout fires here and must not clear the second message
    expect(getSim().returned).not.toBeNull();
    act(() => void vi.advanceTimersByTime(6000));
    expect(getSim().returned).toBeNull();
  });

  it("czas wyczerpał się podczas nieobecności: od razu p06.3, bez „Wróciłeś”", async () => {
    start("play-black");
    act(() => advanceClock(9 * 60_000));
    act(() => backgroundTab(120));
    await waitFor(() => expect(current()).toBe("p06"));
    expect(stateId()).toBe("p06.3 + p06.10");
    expect(getSim().returned).toBeNull();
  });

  it("prawdziwa zmiana widoczności karty: powrót po ponad 30 s", () => {
    vi.useFakeTimers();
    start("play-black");
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    act(() => void vi.advanceTimersByTime(40_000));
    visibility.mockReturnValue("visible");
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(stateId()).toContain("p05.10");
    // A "visible" without a prior "hidden" does nothing.
    cleanup();
    act(() => resetSim());
    start("play-black");
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(getSim().returned).toBeNull();
    visibility.mockRestore();
  });

  it("błąd odpytywania w partii: próby, potem baner z „Sprawdź teraz” (p05.7)", () => {
    vi.useFakeTimers();
    start("play-white"); // the opponent's turn: the board is polled
    act(() => patchScenario({ pollError: true }));
    act(() => void vi.advanceTimersByTime(1000));
    expect(inFrame().getByText(/próba 1 z 3/)).toBeTruthy();
    act(() => void vi.advanceTimersByTime(2000));
    expect(stateId()).toContain("p05.7");
    click("Sprawdź teraz");
    expect(inFrame().queryByText(/Nie udało się sprawdzić stanu partii/)).toBeNull();
  });
});

describe("p07: błędy dostępu", () => {
  it("p07.4: baza niedostępna na każdej stronie partii; po ustąpieniu wraca plansza", () => {
    start("play-black");
    act(() => patchScenario({ dbDown: true }));
    expect(stateId()).toBe("p07.4");
    expect(inFrame().getByRole("alert").textContent).toContain("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    click("Spróbuj ponownie");
    expect(inFrame().getByText("Spróbowano ponownie: serwer nadal nie odpowiada.")).toBeTruthy();
    expect(stateId()).toBe("p07.4");
    act(() => patchScenario({ dbDown: false }));
    expect(stateId()).toMatch(/^p05\.1/);
    // The gate holds on p03 too, even for somebody who has no game.
    act(() => setRole("T7"));
    act(() => patchScenario({ dbDown: true }));
    goTo("p03");
    expect(stateId()).toBe("p07.4");
  });

  it("p07.1: szkielet po wejściu na ekran partii przy wolnym ładowaniu, potem plansza", async () => {
    start("play-black");
    goTo("p01");
    act(() => patchScenario({ slowLoad: true }));
    goTo("p05");
    expect(stateId()).toBe("p07.1");
    expect(within(frame()).getByRole("status", { busy: true })).toBeTruthy();
    await waitFor(() => expect(stateId()).toMatch(/^p05\.1/));
  });

  it("p07.2 i p07.3: ten sam 404 dla spoza partii i gościa w innej przeglądarce", () => {
    start("play-guest");
    act(() => setRole("T7"));
    expect(stateId()).toBe("p07.2");
    act(() => setRole("T6"));
    expect(stateId()).toBe("p07.3");
    expect(inFrame().getByText("Ta partia nie istnieje albo nie masz do niej dostępu")).toBeTruthy();
    // The clock ran on all the time (BR-06): back in the guest's browser the clock is smaller.
    act(() => advanceClock(30_000));
    act(() => setRole("T5"));
    expect(timers()[1]).toBe("9:30");
  });

  it("ekran p07 z wybranego paska: dostęp, 404 i błędy", () => {
    start("play-black");
    goTo("p07");
    expect(stateId()).toBe("p07");
    expect(inFrame().getByText("Masz dostęp do tej partii")).toBeTruthy();
    click("Przejdź do partii");
    expect(current()).toBe("p05");
    goTo("p07");
    act(() => patchScenario({ dbDown: true }));
    expect(stateId()).toBe("p07.4");
    act(() => patchScenario({ dbDown: false }));
    act(() => setRole("T7"));
    expect(stateId()).toBe("p07.2");
    expect(inFrame().getByText("Ta partia nie istnieje albo nie masz do niej dostępu")).toBeTruthy();
  });

  it("p05 i p06 bez partii pokazują 404", () => {
    render(<App />);
    act(() => {
      window.__PROTOTYPE_START__?.();
    });
    if (!current()) goTo("p01");
    goTo("p05");
    expect(stateId()).toBe("p07.2");
    goTo("p06");
    expect(stateId()).toBe("p07.2");
  });
});

describe("nawigacja z etapu A", () => {
  it("T3 (Marek_Z) wchodzi na swoją partię w toku z p01 i z p04; ekran wynika z fazy", () => {
    render(<App />);
    act(() => {
      window.__PROTOTYPE_START__?.();
    });
    if (!current()) goTo("p01");
    act(() => setRole("T3"));
    goTo("p03");
    expect(current()).toBe("p05");
    expect(stateId()).toBe("p05.1 + p05.5");
    expect(timers()).toEqual(["9:05", "8:12"]);
    expect(inFrame().getByText("Olek_R")).toBeTruthy();
    expect(frame().querySelectorAll('button[aria-label$="kamień"]')).toHaveLength(6);
  });
});
