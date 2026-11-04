// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));
vi.setConfig({ testTimeout: 20_000 });
// The chat has its own tests; here only where it is placed matters.
vi.mock("@/components/chat/chat-panel", () => ({
  ChatPanel: ({ game, gameId }: { game: { status: string }; gameId: string }) => (
    <div data-testid="chat-panel-stub" data-status={game.status} data-game={gameId} />
  ),
}));
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import type { GameView } from "@/server/http/game-view";

import { PlayField } from "./play-field";

const player = (seat: 1 | 2, name: string | null, kind: "account" | "guest" = "account") => ({ seat, kind, displayName: name, seen: true });
const game = (over: Partial<GameView> = {}): GameView => ({
  status: "active",
  variant: "classic",
  timeControlMs: 600_000,
  you: { seat: 1, kind: "account" },
  players: [player(1, "Ala_7"), player(2, "Kuba_P")],
  moveCount: 0,
  blackSeat: 1,
  turnSeat: 1,
  moves: [],
  result: null,
  clock: { remainingMs: [600_000, 600_000] as [number, number], running: null, now: 0 },
  ...over,
});
const failure = (code: string) => ({ ok: false, error: { code, message: "x" } });
const CENTER = "Kolumna H, rząd 8, puste";

const onState = vi.fn();
const onRefresh = vi.fn();
const onGone = vi.fn();
const onAccepting = vi.fn();
const field = (over: Partial<GameView> = {}, pollFails = 0) =>
  render(<PlayField gameId="g1" game={game(over)} pollFails={pollFails} onState={onState} onRefresh={onRefresh} onAccepting={onAccepting} onGone={onGone} />);

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

describe("PlayField, on the server", () => {
  it("renders the mouse variant first (the pointer is unknown there) without a confirm button", () => {
    stubPointer(true);
    const html = renderToStaticMarkup(
      <PlayField gameId="g1" game={game()} pollFails={0} onState={onState} onRefresh={onRefresh} onAccepting={onAccepting} onGone={onGone} />,
    );
    expect(html).toContain("Twój ruch (czarne)");
    expect(html).not.toContain("Postaw kamień");
  });
});

describe("PlayField, the public flag (E10-S04)", () => {
  it("shows the QR code of the link in a public game only (BR-53)", () => {
    field({ audience: { spectators: 0 } });
    expect(screen.getByRole("img", { name: "Kod QR z linkiem do oglądania partii" }).getAttribute("src")).toBe("/api/games/g1/qr");
    cleanup();
    field();
    expect(screen.queryByRole("img", { name: "Kod QR z linkiem do oglądania partii" })).toBeNull();
  });

  it("shows the flag with the count of spectators for a public game and none otherwise", () => {
    field({ audience: { spectators: 2 } });
    expect(screen.getByTestId("public-flag").textContent).toContain("Partia publiczna");
    expect(screen.getByTestId("public-flag-count").textContent).toBe("2");
    cleanup();
    field();
    expect(screen.queryByTestId("public-flag")).toBeNull();
  });
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

  it("needs a second step: select the intersection, then 'Postaw kamień'", async () => {
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

  it("sends nothing on the second touch of the same intersection and keeps it selected (issue 181)", async () => {
    field();
    await press(cell(CENTER));
    await press(cell(CENTER));
    await press(cell(CENTER));
    expect(apiCall).not.toHaveBeenCalled();
    expect(screen.getByTestId("selection").textContent).toBe("Zaznaczono: Kolumna H, rząd 8. Naciśnij „Postaw kamień”.");
    expect(byText("Postaw kamień").hasAttribute("disabled")).toBe(false);
  });

  it("sends the move once, only from the button, after any number of touches", async () => {
    field();
    await press(cell(CENTER));
    await press(cell(CENTER));
    await press(byText("Postaw kamień"));
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/moves", { body: { x: 7, y: 7, moveNumber: 1 } });
  });

  it("puts the button right under the board, before the player's own clock (issue 181)", () => {
    field();
    const order = [grid(), byText("Postaw kamień"), screen.getByTestId("my-color")];
    expect(order[0]!.compareDocumentPosition(order[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1]!.compareDocumentPosition(order[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Wylosowano: Ty grasz czarnymi.").compareDocumentPosition(byText("Postaw kamień")) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("drops the selection when the move changes under it", async () => {
    const { rerender } = field();
    await press(cell(CENTER));
    rerender(
      <PlayField gameId="g1" game={game({ moveCount: 2, moves: [1, 2] })} pollFails={0} onState={onState} onRefresh={onRefresh} onAccepting={onAccepting} onGone={onGone} />,
    );
    expect(screen.getByTestId("selection").textContent).toBe("Dotknij przecięcia, żeby je zaznaczyć.");
  });

  it("asks to wait during the opponent's turn", () => {
    field({ turnSeat: 2, moveCount: 1, moves: [112] });
    expect(screen.getByTestId("selection").textContent).toBe("Poczekaj na ruch przeciwnika.");
  });

  it("announces the opponent's last move to screen readers, only on the player's turn", () => {
    field({ turnSeat: 1, moveCount: 2, moves: [112, 7 * 15 + 7 + 1] });
    expect(screen.getByTestId("opponent-move").textContent).toBe("Przeciwnik: kolumna I, rząd 8");
    cleanup();
    field({ turnSeat: 2, moveCount: 1, moves: [112] });
    expect(screen.queryByTestId("opponent-move")).toBeNull();
    cleanup();
    field();
    expect(screen.queryByTestId("opponent-move")).toBeNull();
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
    field({ you: { seat: 2, kind: "guest" }, players: [player(1, "Ala_7"), player(2, "Piotr", "guest")], turnSeat: 2, blackSeat: 2 });
    expect(screen.getByText("Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii")).toBeTruthy();
    expect(screen.getByTitle("Piotr (gość)").textContent).toBe("Ty: Piotr (gość)");
    expect(screen.getByText("Ala_7")).toBeTruthy();
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

  it("says it is a return when the page was opened on a finished game (p06.5), and not when it ended here", () => {
    const view = finished(1, "five_in_row", [112, 113, 114, 115, 116]);
    render(<PlayField gameId="g1" game={game(view)} pollFails={0} reopened onState={onState} onRefresh={onRefresh} onAccepting={onAccepting} onGone={onGone} />);
    expect(screen.getByTestId("reload-note").textContent).toBe("Powrót do zakończonej partii: wynik jest ten sam, ruch nie jest możliwy.");
    cleanup();
    field(view);
    expect(screen.queryByTestId("reload-note")).toBeNull();
  });

  it("tells a guest the result stays for an hour and drops the play-time warning (p06.6)", () => {
    field({ ...finished(1, "five_in_row", [112, 113, 114, 115, 116]), you: { seat: 1, kind: "guest" }, players: [player(1, null, "guest"), player(2, "Kuba_P")] });
    expect(screen.getByTestId("guest-until").textContent).toBe("Wynik zobaczysz w tej przeglądarce do 1 godziny po zakończeniu partii.");
    expect(screen.queryByText(/Grasz bez konta/)).toBeNull();
    cleanup();
    field(finished(1, "five_in_row", [112, 113, 114, 115, 116]));
    expect(screen.queryByTestId("guest-until")).toBeNull();
  });

  it("shows no return notice on a finished board", () => {
    render(<PlayField gameId="g1" game={game(finished(1, "five_in_row", [112, 113, 114, 115, 116]))} pollFails={0} returnNotice="Wróciłeś do partii. Twój zegar: 9:15." onState={onState} onRefresh={onRefresh} onAccepting={onAccepting} onGone={onGone} />);
    expect(screen.queryByText(/Wróciłeś/)).toBeNull();
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

describe("PlayField, clocks (#23, p05.1, p05.3, p06.3)", () => {
  const clock = (remainingMs: [number, number], running: 1 | 2 | null = 1) => ({ remainingMs, running, now: 1_000_000 });
  const digits = () => [...document.querySelectorAll("time")].map((time) => time.textContent);
  const live = () => screen.getByTestId("low-live");

  it("shows the digits of both clocks, the opponent's first, and counts down the one on turn", async () => {
    field({ clock: clock([541_000, 300_000]) });
    expect(digits()).toEqual(["5:00", "9:01"]);
    await act(async () => void (await vi.advanceTimersByTimeAsync(3_000)));
    expect(digits()).toEqual(["5:00", "8:58"]);
  });

  it("counts down the opponent's clock while they are on turn, and shows the seat's own clock for seat 2", async () => {
    field({ you: { seat: 2, kind: "account" }, turnSeat: 1, clock: clock([200_000, 100_000]) });
    expect(digits()).toEqual(["3:20", "1:40"]);
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_000)));
    expect(digits()).toEqual(["3:18", "1:40"]);
  });

  it("flags low time on the clock below a minute, and announces it once (p05.3)", async () => {
    field({ clock: clock([61_000, 600_000]) });
    expect(document.querySelectorAll("[data-low]")).toHaveLength(0);
    expect(live().textContent).toBe("");
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_000)));
    expect(document.querySelectorAll("[data-low]")).toHaveLength(1);
    expect(live().textContent).toBe("Zostało mniej niż minuta");
    expect(live().getAttribute("role")).toBe("status");
    expect(screen.queryByText("Mało czasu")).toBeNull();
  });

  it("does not say it again when a read puts the time back above the threshold", async () => {
    const { rerender } = field({ clock: clock([30_000, 600_000]) });
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    expect(live().textContent).toBe("Zostało mniej niż minuta");
    rerender(
      <PlayField gameId="g1" game={game({ clock: clock([62_000, 600_000]) })} pollFails={0} onState={onState} onRefresh={onRefresh} onAccepting={onAccepting} onGone={onGone} />,
    );
    expect(document.querySelectorAll("[data-low]")).toHaveLength(0);
    expect(live().textContent).toBe("Zostało mniej niż minuta");
  });

  it("does not announce the opponent's low time", async () => {
    field({ turnSeat: 2, clock: clock([600_000, 20_000], 2) });
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    expect(document.querySelectorAll("[data-low]")).toHaveLength(1);
    expect(live().textContent).toBe("");
  });

  it("reads the state at once when the running clock reaches zero", async () => {
    field({ clock: clock([2_000, 600_000]) });
    await act(async () => void (await vi.advanceTimersByTimeAsync(1_000)));
    expect(onRefresh).not.toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(1_500)));
    expect(digits()[1]).toBe("0:00");
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("freezes the clocks of a finished game and says nothing about low time", async () => {
    field({
      status: "finished",
      turnSeat: null,
      result: { winnerSeat: 2, reason: "timeout", winLine: null },
      clock: clock([0, 45_000], null),
    });
    expect(digits()).toEqual(["0:45", "0:00"]);
    await act(async () => void (await vi.advanceTimersByTimeAsync(5_000)));
    expect(digits()).toEqual(["0:45", "0:00"]);
    expect(live().textContent).toBe("");
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.getByText("Przegrałeś — skończył się Twój czas")).toBeTruthy();
  });

  it("shows the win on time for the opponent's lost clock (p06.1 variant)", () => {
    field({
      status: "finished",
      turnSeat: null,
      result: { winnerSeat: 1, reason: "timeout", winLine: null },
      clock: clock([300_000, 0], null),
    });
    expect(screen.getByText("Wygrałeś — przeciwnikowi skończył się czas")).toBeTruthy();
  });

  it("does not run before the clock started", async () => {
    field({ clock: clock([600_000, 600_000], null) });
    await act(async () => void (await vi.advanceTimersByTimeAsync(5_000)));
    expect(digits()).toEqual(["10:00", "10:00"]);
  });
});

describe("PlayField, closing the audience (E10-S05)", () => {
  it("offers the creator of a public game the kill-switch, and both players the note once it is closed", () => {
    field({ canCloseAudience: true });
    expect(screen.getByTestId("close-audience")).toBeTruthy();
    cleanup();
    field({ audienceClosed: true });
    expect(screen.getByTestId("audience-closed-note")).toBeTruthy();
    expect(screen.queryByTestId("close-audience")).toBeNull();
  });
});

describe("PlayField, resigning (p05.13, p05.14)", () => {
  const open = async () => {
    await press(byText("Poddaj partię"));
  };
  const dialog = () => document.querySelector<HTMLElement>("[role=alertdialog]");

  it("offers the button in a game in progress, also out of turn and before the first move, never in a finished one", () => {
    field({ turnSeat: 2 });
    expect(byText("Poddaj partię")).toBeTruthy();
    cleanup();
    field({ status: "finished", turnSeat: null, result: { winnerSeat: 1, reason: "five_in_row", winLine: null } });
    expect(screen.queryByText("Poddaj partię")).toBeNull();
  });

  it("asks first, with the focus on the way out, and Esc closes without sending", async () => {
    field();
    await open();
    expect(dialog()!.textContent).toContain("Czy na pewno chcesz się poddać?");
    expect(dialog()!.textContent).toContain("Przeciwnik wygra partię.");
    expect(document.activeElement?.textContent).toBe("Wróć do gry");
    await act(async () => {
      await user().keyboard("{Escape}");
    });
    expect(dialog()).toBeNull();
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("closes on \"Wróć do gry\" without sending", async () => {
    field();
    await open();
    await press(byText("Wróć do gry"));
    expect(dialog()).toBeNull();
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("sends once for a double click, shows the progress and hands the state to the room", async () => {
    const finished = game({ status: "finished", turnSeat: null, result: { winnerSeat: 2, reason: "resignation", winLine: null } });
    let release!: (value: unknown) => void;
    apiCall.mockReset().mockReturnValue(new Promise((resolve) => (release = resolve)));
    field();
    await open();
    const confirm = document.querySelector<HTMLElement>("[role=alertdialog] button:last-child")!;
    await act(async () => {
      confirm.click();
      confirm.click();
    });
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/resign");
    expect(dialog()!.textContent).toContain("Poddawanie…");
    // Esc does not close the dialog while the server answers.
    await act(async () => {
      await user().keyboard("{Escape}");
    });
    expect(dialog()).not.toBeNull();
    await act(async () => release({ ok: true, data: finished }));
    expect(dialog()).toBeNull();
    expect(onState).toHaveBeenCalledWith(finished, 0);
  });

  it("keeps the dialog on a network error and sends again on \"Spróbuj ponownie\" (p05.14)", async () => {
    apiCall.mockReset().mockResolvedValueOnce(failure("network")).mockResolvedValueOnce({ ok: true, data: game({ status: "finished" }) });
    field();
    await open();
    await press(document.querySelector<HTMLElement>("[role=alertdialog] button:last-child")!);
    expect(dialog()!.querySelector("[role=alert]")!.textContent).toBe("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    await press(byText("Spróbuj ponownie"));
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(dialog()).toBeNull();
    expect(onState).toHaveBeenCalledTimes(1);
  });

  it("says so for an unknown failure and forgets the error when the dialog is closed and opened again", async () => {
    apiCall.mockReset().mockResolvedValue(failure("INTERNAL"));
    field();
    await open();
    await press(document.querySelector<HTMLElement>("[role=alertdialog] button:last-child")!);
    expect(dialog()!.textContent).toContain("Nie udało się poddać partii. Spróbuj ponownie.");
    await press(byText("Wróć do gry"));
    await open();
    expect(dialog()!.querySelector("[role=alert]")).toBeNull();
  });

  it.each(["GAME_FINISHED", "GAME_NOT_ACTIVE"])("closes the dialog and reads the state when the server answers %s", async (code) => {
    apiCall.mockReset().mockResolvedValue(failure(code));
    field();
    await open();
    await press(document.querySelector<HTMLElement>("[role=alertdialog] button:last-child")!);
    expect(dialog()).toBeNull();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Partia jest już zakończona. Plansza została odświeżona.")).toBeTruthy();
    expect(onState).not.toHaveBeenCalled();
  });

  it("tells the room the game is gone on 404", async () => {
    apiCall.mockReset().mockResolvedValue(failure("NOT_FOUND"));
    field();
    await open();
    await press(document.querySelector<HTMLElement>("[role=alertdialog] button:last-child")!);
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });
});


describe("PlayField, a game that began as a rematch (p05, p06.15)", () => {
  it("says the colours were swapped instead of 'drawn'", () => {
    field({ fromRematch: true, blackSeat: 2 });
    expect(screen.getByText("Rewanż: kolory zostały zamienione. Grasz białymi.")).toBeTruthy();
    expect(screen.queryByText(/Wylosowano/)).toBeNull();
    expect(screen.queryByText("Nowa partia ma nowy dostęp w tej przeglądarce")).toBeNull();
  });

  it("tells a guest about the new access until they confirm it", async () => {
    field({ fromRematch: true, you: { seat: 1, kind: "guest" } });
    expect(screen.getByText("Nowa partia ma nowy dostęp w tej przeglądarce")).toBeTruthy();
    await press(screen.getByTestId("token-notice-dismiss"));
    expect(screen.queryByText("Nowa partia ma nowy dostęp w tej przeglądarce")).toBeNull();
  });

  it("says nothing about a new access to a guest of an ordinary game", () => {
    field({ you: { seat: 1, kind: "guest" } });
    expect(screen.queryByText("Nowa partia ma nowy dostęp w tej przeglądarce")).toBeNull();
  });
});

describe("PlayField, the rematch under the result", () => {
  it("shows the rematch block of a finished game, and none in a game in progress", () => {
    field({ status: "finished", turnSeat: null, result: { winnerSeat: 1, reason: "resignation", winLine: null } });
    expect(screen.getByTestId("rematch-box")).toBeTruthy();
    cleanup();
    field();
    expect(screen.queryByTestId("rematch-box")).toBeNull();
  });

  it("hands the page-open flag to the block: a reload on an accepted rematch of a guest reads the game first", async () => {
    apiCall.mockResolvedValue({ ok: true, data: {} });
    render(
      <PlayField
        gameId="g1"
        game={game({ status: "finished", turnSeat: null, you: { seat: 1, kind: "guest" }, result: { winnerSeat: 1, reason: "draw", winLine: null }, rematch: { state: "accepted", offeredBySeat: 1, expiresAt: "2999-01-01T00:00:00.000Z", gameId: "g2" } })}
        pollFails={0}
        reopened
        onState={onState}
        onRefresh={onRefresh}
        onAccepting={onAccepting}
        onGone={onGone}
      />,
    );
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1", { method: "GET" });
    expect(push).toHaveBeenCalledWith("/games/g2");
  });
});

describe("PlayField, the chat (E07-S01)", () => {
  it("puts the chat panel under the controls of a game in progress and of a finished one", () => {
    field();
    expect(screen.getByTestId("chat-panel-stub").getAttribute("data-status")).toBe("active");
    expect(screen.getByTestId("chat-panel-stub").getAttribute("data-game")).toBe("g1");
    cleanup();
    field({ status: "finished", turnSeat: null, result: { winnerSeat: 1, reason: "draw", winLine: null } });
    expect(screen.getByTestId("chat-panel-stub").getAttribute("data-status")).toBe("finished");
  });
});

describe("PlayField, the paper game (E11)", () => {
  const AT = "2026-11-03T10:00:00.000Z";
  const clock = (remainingMs: [number, number], running: 1 | 2 | null = 1) => ({ remainingMs, running, now: 1_000_000 });
  const stone = (n: number, x: number, y: number, seat: 1 | 2, auto = false) => ({ n, x, y, seat, auto, at: AT });
  const OPENING = [stone(1, 50, 50, 1), stone(2, 51, 50, 2)];
  type Sheet = NonNullable<GameView["paper"]>;
  const paperGame = (over: Partial<GameView> = {}, sheet: Partial<Sheet> = {}): Partial<GameView> => {
    const moves = sheet.moves ?? OPENING;
    return {
      variant: "paper",
      timeControlMs: 180_000,
      moveCount: moves.length,
      turnSeat: 1,
      moves: [],
      clock: clock([180_000, 180_000]),
      paper: { moveCount: moves.length, moves, scores: [0, 0], fives: [], autoSeat: null, autoMoveAt: null, ...sheet },
      ...over,
    };
  };
  // Screen coordinates: the start of the sheet is 0, 0.
  const at = (x: number, y: number, state = "puste") => cell(`Pole ${x}, ${y}, ${state}`);

  it("draws the sheet, not the 15×15 board, and sends the absolute coordinates on one click", async () => {
    field(paperGame());
    expect(document.querySelector('[aria-label="Plansza bez granic, papier i ołówek"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Plansza 15 na 15"]')).toBeNull();
    expect(screen.getByText("Twój ruch (krzyżyk)")).toBeTruthy();
    await press(at(2, 0));
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/moves", { body: { x: 52, y: 50, moveNumber: 3 } });
    expect(onState).toHaveBeenCalledWith(expect.anything(), 2);
  });

  it("does not send a field that is too far from every stone", async () => {
    field(paperGame());
    await press(cell("Pole 8, 0, puste, za daleko od znaków"));
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("shows the stone at once while the move is on its way", async () => {
    apiCall.mockReturnValue(new Promise(() => {}));
    field(paperGame());
    await press(at(0, 1));
    expect(screen.getByText("Wysyłanie ruchu…")).toBeTruthy();
    expect(document.querySelector('[aria-label^="Pole 0, 1, krzyżyk"]')).not.toBeNull();
  });

  it("names the sides by mark everywhere and shows the marks at the names and the turn, without colours or stones", () => {
    field(paperGame({ moveCount: 0 }, { moves: [] }));
    expect(screen.getByText("Twój ruch (krzyżyk)")).toBeTruthy();
    expect(screen.getByText("Wylosowano: Ty grasz krzyżykiem.")).toBeTruthy();
    expect(screen.getByTestId("my-color").textContent).toBe("Grasz krzyżykiem.");
    expect(screen.getByRole("img", { name: "krzyżyk" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "kółko" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/kamie|czarn|biał/i);
  });

  it("names the second player's side and the swap of a rematch by mark", () => {
    field(paperGame({ moveCount: 0, blackSeat: 2, turnSeat: 1, fromRematch: true }, { moves: [] }));
    expect(screen.getByText("Rewanż: znaki zostały zamienione. Grasz kółkiem.")).toBeTruthy();
    expect(screen.getByText("Twój ruch (kółko)")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/kamie|czarn|biał|kolor/i);
  });

  it("says the past tense by mark at the end of a game", () => {
    field(paperGame({ status: "finished", turnSeat: null, result: { winnerSeat: 1, reason: "points", winLine: null, scores: [7, 5] } }));
    expect(screen.getByTestId("my-color").textContent).toBe("Grałeś krzyżykiem.");
    expect(screen.getByTestId("rematch-info").textContent).toBe("Rewanż to nowa partia z zamienionymi znakami: zagrasz kółkiem.");
    expect(document.body.textContent).not.toMatch(/kamie|czarn|biał|kolor/i);
  });

  it("shows the points at the clocks and who the automat plays for", () => {
    field(paperGame({}, { scores: [3, 1], autoSeat: 2, autoMoveAt: AT }));
    expect(screen.getByTestId("score-mine").textContent).toBe(" · punkty: 3");
    expect(screen.getByTestId("score-theirs").textContent).toBe(" · punkty: 1 · Automat");
  });

  it("says the automat is putting the stone and keeps the board read-only", () => {
    field(paperGame({ turnSeat: 2 }, { autoSeat: 2, autoMoveAt: AT }));
    expect(screen.getByText("Automat stawia znak…")).toBeTruthy();
    expect(grid().getAttribute("aria-readonly")).toBe("true");
  });

  it("keeps the own clock running while the automat plays for the opponent", () => {
    field(paperGame({ clock: { remainingMs: [100_000, 0], running: 1, now: 0 } }, { autoSeat: 2 }));
    expect(screen.getByText("Twój ruch (krzyżyk)")).toBeTruthy();
    expect(document.querySelectorAll('[data-slot="clock"]')).toHaveLength(2);
  });

  it("tells a player whose own time ran out that the automat plays for them", () => {
    field(paperGame({ turnSeat: 1, clock: { remainingMs: [0, 100_000], running: 2, now: 0 } }, { autoSeat: 1 }));
    expect(screen.getByText("Twój czas minął — automat stawia znaki za Ciebie")).toBeTruthy();
    expect(grid().getAttribute("aria-readonly")).toBe("true");
  });

  it("flags low time against the budget of the game and announces it once", async () => {
    field(paperGame({ timeControlMs: 60_000, clock: clock([14_000, 60_000]) }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_000)));
    expect(screen.getByTestId("low-live").textContent).toBe("Zostało mało czasu");
  });

  it("explains the refusals of the sheet", async () => {
    apiCall.mockResolvedValue(failure("MOVE_TOO_FAR"));
    field(paperGame());
    await press(at(2, 0));
    expect(screen.getByText("Za daleko od znaków: najwyżej 3 pola od innego.")).toBeTruthy();
    expect(onRefresh).toHaveBeenCalled();
  });

  it("does not guess the board of a variant it does not know", () => {
    field({ variant: "future" as never });
    expect(screen.getByRole("alert").textContent).toContain("Odśwież stronę");
    expect(document.querySelector("[role=grid]")).toBeNull();
  });

  describe("on a touch screen", () => {
    beforeEach(() => stubPointer(true));

    it("starts the selection on the opponent's last stone and moves it with the arrows", async () => {
      field(paperGame());
      expect(screen.getByTestId("selection").textContent).toBe("Dotknij pola albo przesuń zaznaczenie strzałkami.");
      expect(byText("Postaw krzyżyk").hasAttribute("disabled")).toBe(true);
      await press(screen.getByRole("button", { name: "Zaznaczenie w prawo" }));
      expect(screen.getByTestId("selection").textContent).toBe("Zaznaczono pole 2, 0. Naciśnij „Postaw krzyżyk”.");
      expect(byText("Postaw krzyżyk").hasAttribute("disabled")).toBe(false);
      expect(apiCall).not.toHaveBeenCalled();
      await press(byText("Postaw krzyżyk"));
      expect(apiCall).toHaveBeenCalledWith("/api/games/g1/moves", { body: { x: 52, y: 50, moveNumber: 3 } });
    });

    it("keeps the button off for a field that is too far or taken, and says why", async () => {
      field(paperGame());
      const right = screen.getByRole("button", { name: "Zaznaczenie w prawo" });
      for (let step = 0; step < 4; step += 1) await press(right);
      expect(screen.getByTestId("selection").textContent).toBe("Za daleko od znaków: najwyżej 3 pola od innego.");
      expect(byText("Postaw krzyżyk").hasAttribute("disabled")).toBe(true);
      await press(screen.getByRole("button", { name: "Zaznaczenie w lewo" }));
      await press(screen.getByRole("button", { name: "Zaznaczenie w lewo" }));
      await press(screen.getByRole("button", { name: "Zaznaczenie w lewo" }));
      await press(screen.getByRole("button", { name: "Zaznaczenie w lewo" }));
      expect(screen.getByTestId("selection").textContent).toBe("To pole jest już zajęte.");
    });

    it("selects the middle for the first stone of the game", async () => {
      field(paperGame({ moveCount: 0 }, { moves: [] }));
      expect(screen.getByTestId("selection").textContent).toBe("Zaznaczono pole 0, 0. Naciśnij „Postaw krzyżyk”.");
      await press(byText("Postaw krzyżyk"));
      expect(apiCall).toHaveBeenCalledWith("/api/games/g1/moves", { body: { x: 50, y: 50, moveNumber: 1 } });
    });

    it("lets the player pick a field with a tap and centre the view with a button next to the confirmation", async () => {
      field(paperGame());
      await press(at(0, 1));
      expect(screen.getByTestId("selection").textContent).toContain("Zaznaczono pole 0, 1");
      await press(screen.getByTestId("paper-recenter"));
      expect(screen.getByTestId("selection").textContent).toContain("Zaznaczono pole 0, 1");
    });

    it("asks to wait while the automat plays", () => {
      field(paperGame({ turnSeat: 2 }, { autoSeat: 2 }));
      expect(screen.getByTestId("selection").textContent).toBe("Poczekaj, aż automat postawi znak.");
    });

    it("asks to wait for the opponent", () => {
      field(paperGame({ turnSeat: 2 }));
      expect(screen.getByTestId("selection").textContent).toBe("Poczekaj na ruch przeciwnika.");
    });
  });

  describe("finished", () => {
    const over = (winnerSeat: 1 | 2 | null, reason: "points" | "resignation", scores: [number, number]) =>
      paperGame({ status: "finished", turnSeat: null, result: { winnerSeat, reason, winLine: null, scores } }, { scores });

    it("announces the points: a win, a loss and a draw", () => {
      field(over(1, "points", [7, 5]));
      expect(screen.getByText("Wygrana 7 : 5")).toBeTruthy();
      cleanup();
      field(over(2, "points", [5, 7]));
      expect(screen.getByText("Przegrana 5 : 7")).toBeTruthy();
      cleanup();
      field(over(null, "points", [4, 4]));
      expect(screen.getByText("Remis 4 : 4")).toBeTruthy();
    });

    it("announces a resignation without the points deciding", () => {
      field(over(2, "resignation", [9, 1]));
      expect(screen.getByText("Przegrana przez poddanie")).toBeTruthy();
    });
  });
});
