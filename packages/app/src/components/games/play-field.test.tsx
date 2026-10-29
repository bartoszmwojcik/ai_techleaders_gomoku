// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));
vi.setConfig({ testTimeout: 20_000 });
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import type { GameView } from "@/server/http/game-view";

import { PlayField } from "./play-field";

const player = (seat: 1 | 2, name: string | null, kind: "account" | "guest" = "account") => ({ seat, kind, displayName: name, seen: true });
const game = (over: Partial<GameView> = {}): GameView => ({
  status: "active",
  you: { seat: 1, kind: "account" },
  players: [player(1, "Ala_7"), player(2, "Kuba_P")],
  moveCount: 0,
  blackSeat: 1,
  turnSeat: 1,
  moves: [],
  result: null,
  ...over,
});
const failure = (code: string) => ({ ok: false, error: { code, message: "x" } });
const CENTER = "Kolumna H, rząd 8, puste";

const onState = vi.fn();
const onRefresh = vi.fn();
const onGone = vi.fn();
const field = (over: Partial<GameView> = {}, pollFails = 0) =>
  render(<PlayField gameId="g1" game={game(over)} pollFails={pollFails} onState={onState} onRefresh={onRefresh} onGone={onGone} />);

function stubPointer(coarse: boolean) {
  const query = { matches: coarse, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: vi.fn(() => query) });
  return query;
}
const user = () => userEvent.setup({ delay: null });
// Clicking through user-event walks all 225 cells of the board: far too slow, a plain click is enough here.
const press = (element: HTMLElement) => act(async () => element.click());
// Role queries walk the accessibility tree of 225 buttons and are slow; the label is what we look for anyway.
const cell = (name: string) => document.querySelector<HTMLElement>(`[aria-label="${name}"]`)!;
const grid = () => document.querySelector("[role=grid]")!;
const byText = (text: string) => screen.getByText(text).closest("button")!;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiCall.mockReset().mockResolvedValue({ ok: true, data: game({ moveCount: 1, moves: [112] }) });
  onState.mockReset();
  onRefresh.mockReset();
  onGone.mockReset();
  stubPointer(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PlayField, own turn with a mouse (p05.1, p05.5)", () => {
  it("shows the status in words, the colour, the draw and the board", () => {
    field();
    expect(screen.getByText("Partia w toku")).toBeTruthy();
    expect(screen.getByText("Twój ruch (czarne)")).toBeTruthy();
    expect(screen.getByText("Wylosowano: Ty grasz czarnymi.")).toBeTruthy();
    expect(screen.getByTestId("my-color").textContent).toBe("Grasz czarnymi.");
    expect(document.querySelector("[role=grid][aria-label='Plansza 15 na 15']")).toBeTruthy();
    expect(screen.getByText("Kuba_P")).toBeTruthy();
    expect(screen.getByText("Ty (Ala_7)")).toBeTruthy();
    expect(screen.queryByText("Postaw kamień")).toBeNull();
  });

  it("sends the move on one click, with the number of the next move, and hands the answer on", async () => {
    field({ moveCount: 2, moves: [10, 11] });
    await press(cell(CENTER));
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/moves", { body: { x: 7, y: 7, moveNumber: 3 } });
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ moveCount: 1 }), 2);
  });

  it("shows the stone at once with 'Wysyłanie ruchu…' and locks the board until the answer", async () => {
    let answer!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    field();
    await press(cell(CENTER));
    expect(screen.getByText("Wysyłanie ruchu…")).toBeTruthy();
    expect(cell("Kolumna H, rząd 8, czarny kamień")).toBeTruthy();
    expect(grid().getAttribute("aria-readonly")).toBe("true");
    await act(async () => answer({ ok: true, data: game({ moveCount: 1, moves: [112] }) }));
    expect(screen.queryByText("Wysyłanie ruchu…")).toBeNull();
  });

  it("sends a double click once (a ref, not state, guards it)", async () => {
    let answer!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    field();
    const target = cell(CENTER);
    await act(async () => {
      target.click();
      target.click();
    });
    expect(apiCall).toHaveBeenCalledTimes(1);
    await act(async () => answer({ ok: true, data: game() }));
  });

  it("selects and sends with the keyboard: arrows move, Enter plays", async () => {
    field();
    const u = user();
    cell(CENTER).focus();
    await u.keyboard("{ArrowRight}{ArrowDown}{Enter}");
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/moves", { body: { x: 8, y: 8, moveNumber: 1 } });
  });
});

describe("PlayField, refusals and errors (p05.7, p05.8, p05.9)", () => {
  it.each([
    ["STALE_MOVE", "Plansza była nieaktualna i została odświeżona. Spróbuj ponownie."],
    ["NOT_YOUR_TURN", "Teraz ruch przeciwnika. Plansza została odświeżona."],
    ["CELL_OCCUPIED", "To pole jest już zajęte"],
    ["GAME_FINISHED", "Partia jest już zakończona. Plansza została odświeżona."],
    ["GAME_NOT_ACTIVE", "Partia jest już zakończona. Plansza została odświeżona."],
  ])("%s: a short message and a refresh, no retry button", async (code, text) => {
    apiCall.mockResolvedValue(failure(code));
    field();
    await press(cell(CENTER));
    expect(screen.getByText(text)).toBeTruthy();
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(screen.queryByText("Spróbuj ponownie")).toBeNull();
    expect(onState).not.toHaveBeenCalled();
  });

  it("a network error keeps the move and retries the very same one (same number)", async () => {
    apiCall.mockResolvedValueOnce(failure("network"));
    field({ moveCount: 4, moves: [1, 2, 3, 4] });
    await press(cell(CENTER));
    expect(screen.getByText("Nie udało się połączyć z serwerem. Spróbuj ponownie.")).toBeTruthy();
    await press(byText("Spróbuj ponownie"));
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(apiCall.mock.calls[1]).toEqual(apiCall.mock.calls[0]);
    expect(apiCall.mock.calls[1]![1]).toEqual({ body: { x: 7, y: 7, moveNumber: 5 } });
    expect(onState).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Nie udało się połączyć/)).toBeNull();
  });

  it("any other error says so and also offers the retry", async () => {
    apiCall.mockResolvedValue(failure("INTERNAL"));
    field();
    await press(cell(CENTER));
    expect(screen.getByText("Nie udało się zagrać ruchu. Spróbuj ponownie.")).toBeTruthy();
    expect(byText("Spróbuj ponownie")).toBeTruthy();
  });

  it("a 404 tells the room the game is gone", async () => {
    apiCall.mockResolvedValue(failure("NOT_FOUND"));
    field();
    await press(cell(CENTER));
    expect(onGone).toHaveBeenCalledOnce();
  });
});

describe("PlayField, the opponent's turn (p05.2)", () => {
  it("is read-only and says so", async () => {
    field({ turnSeat: 2, moveCount: 1, moves: [112] });
    expect(screen.getAllByText("Ruch przeciwnika")).toHaveLength(2);
    expect(screen.queryByText(/Wylosowano/)).toBeNull();
    expect(grid().getAttribute("aria-readonly")).toBe("true");
    await press(cell(CENTER.replace("puste", "czarny kamień")));
    await press(cell("Kolumna A, rząd 1, puste"));
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("marks the white seat's colour in the words", () => {
    field({ blackSeat: 2, turnSeat: 1, moveCount: 1, moves: [112] });
    expect(screen.getByText("Twój ruch (białe)")).toBeTruthy();
    expect(screen.getByTestId("my-color").textContent).toBe("Grasz białymi.");
  });
});

describe("PlayField, a touch screen (p05.4)", () => {
  beforeEach(() => stubPointer(true));

  it("needs a second step: select the intersection, then 'Postaw kamień' or touch it again", async () => {
    field();
    const send = byText("Postaw kamień");
    expect(send.hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("selection").textContent).toBe("Dotknij przecięcia, żeby je zaznaczyć.");
    await press(cell(CENTER));
    expect(apiCall).not.toHaveBeenCalled();
    expect(screen.getByTestId("selection").textContent).toBe("Zaznaczono: Kolumna H, rząd 8. Naciśnij „Postaw kamień”.");
    await press(cell("Kolumna A, rząd 1, puste"));
    expect(screen.getByTestId("selection").textContent).toContain("Kolumna A, rząd 1");
    await press(byText("Postaw kamień"));
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/moves", { body: { x: 0, y: 0, moveNumber: 1 } });
  });

  it("sends on the second touch of the same intersection", async () => {
    field();
    await press(cell(CENTER));
    await press(cell(CENTER));
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it("drops the selection when the move changes under it", async () => {
    const { rerender } = field();
    await press(cell(CENTER));
    rerender(
      <PlayField gameId="g1" game={game({ moveCount: 2, moves: [1, 2] })} pollFails={0} onState={onState} onRefresh={onRefresh} onGone={onGone} />,
    );
    expect(screen.getByTestId("selection").textContent).toBe("Dotknij przecięcia, żeby je zaznaczyć.");
  });

  it("asks to wait during the opponent's turn", () => {
    field({ turnSeat: 2, moveCount: 1, moves: [112] });
    expect(screen.getByTestId("selection").textContent).toBe("Poczekaj na ruch przeciwnika.");
  });

  it("reacts to the device changing (a keyboard docked to a tablet)", () => {
    const query = stubPointer(true);
    field();
    expect(query.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    cleanup();
    expect(query.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});

describe("PlayField, the guest and the problems of polling", () => {
  it("keeps the guest warning on the board (p05.11)", () => {
    field({ you: { seat: 2, kind: "guest" }, players: [player(1, "Ala_7"), player(2, null, "guest")], turnSeat: 2, blackSeat: 2 });
    expect(screen.getByText("Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii")).toBeTruthy();
    expect(screen.getByText("Ty (Gość)")).toBeTruthy();
  });

  it("counts failed reads of the state, then shows the banner with 'Sprawdź teraz' (L02)", async () => {
    const { unmount } = field({}, 2);
    expect(screen.getByText("Ponawiamy sprawdzanie stanu partii (próba 2 z 3).")).toBeTruthy();
    unmount();
    field({}, 3);
    expect(screen.queryByText(/próba/)).toBeNull();
    expect(screen.getByText("Nie udało się sprawdzić stanu partii. Ponawiamy próby.")).toBeTruthy();
    await press(byText("Sprawdź teraz"));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});

describe("PlayField, finished (p06)", () => {
  const finished = (winnerSeat: 1 | 2 | null, reason: "five_in_row" | "draw", winLine: number[] | null) =>
    game({ status: "finished", turnSeat: null, moveCount: 9, moves: [112, 0, 113, 1, 114, 2, 115, 3, 116], result: { winnerSeat, reason, winLine } });

  it("announces the win, shows the board read-only and the way back", () => {
    field(finished(1, "five_in_row", [112, 113, 114, 115, 116]));
    expect(screen.getByText("Koniec partii")).toBeTruthy();
    expect(screen.getByText("Wygrałeś")).toBeTruthy();
    expect(screen.getByText("Ułożyłeś pięć kamieni w jednej linii.")).toBeTruthy();
    expect(grid().getAttribute("aria-readonly")).toBe("true");
    expect(screen.queryByText(/Twój ruch|Ruch przeciwnika/)).toBeNull();
    expect(screen.getByTestId("my-color").textContent).toBe("Grałeś czarnymi.");
    expect(screen.getByText("Wróć do panelu głównego").closest("a")!.getAttribute("href")).toBe("/");
    expect(screen.queryByText("Postaw kamień")).toBeNull();
  });

  it("announces a loss and a draw", () => {
    field(finished(2, "five_in_row", [1, 2, 3, 4, 5]));
    expect(screen.getByText("Przegrałeś")).toBeTruthy();
    cleanup();
    field(finished(null, "draw", null));
    expect(screen.getByText("Remis")).toBeTruthy();
  });

  it("cannot play on a finished board even by touch", async () => {
    stubPointer(true);
    field(finished(1, "five_in_row", [112, 113, 114, 115, 116]));
    expect(screen.queryByText("Postaw kamień")).toBeNull();
    await press(cell("Kolumna O, rząd 15, puste"));
    expect(apiCall).not.toHaveBeenCalled();
  });
});
