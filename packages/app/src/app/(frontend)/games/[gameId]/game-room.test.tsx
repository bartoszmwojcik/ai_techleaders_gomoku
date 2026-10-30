// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replace, apiCall } = vi.hoisted(() => ({ replace: vi.fn(), apiCall: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import type { GameView } from "@/server/http/game-view";

import { formatValidUntil, GameRoom, JOIN_STEP_MS, PLAY_POLL_INTERVAL_MS, POLL_INTERVAL_MS } from "./game-room";

vi.setConfig({ testTimeout: 20_000 });

const EXPIRES = "2026-10-30T09:00:00.000Z";
const NO_BOARD = {
  moveCount: 0,
  blackSeat: null,
  turnSeat: null,
  moves: [],
  result: null,
  clock: { remainingMs: [600_000, 600_000] as [number, number], running: null },
} as const;
const waiting = (): GameView => ({
  ...NO_BOARD,
  moves: [],
  status: "waiting",
  you: { seat: 1, kind: "account" },
  players: [{ seat: 1, kind: "account", displayName: "Ala_7", seen: true }],
  invitation: { code: "ABCD-EFGH", url: "http://localhost:3000/invite/ABCD-EFGH", expiresAt: EXPIRES },
});
const active = (over: Partial<GameView> = {}, seen = [true, true]): GameView => ({
  ...NO_BOARD,
  moves: [],
  blackSeat: 1,
  turnSeat: 1,
  status: "active",
  you: { seat: 1, kind: "account" },
  players: [
    { seat: 1, kind: "account", displayName: "Ala_7", seen: seen[0]! },
    { seat: 2, kind: "account", displayName: "Kuba_P", seen: seen[1]! },
  ],
  ...over,
});
const guestOpponent = (): GameView => ({
    ...active(),
    players: [
      { seat: 1, kind: "account", displayName: "Ala_7", seen: true },
      { seat: 2, kind: "guest", displayName: null, seen: true },
    ],
  });
const failure = (code: string) => ({ ok: false, error: { code, message: "x" } });

const room = (initial: GameView, ownWaitingNotice = false) =>
  render(<GameRoom gameId="g1" initial={initial} ownWaitingNotice={ownWaitingNotice} />);
const tick = (ms = POLL_INTERVAL_MS) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
/** jsdom has no `matchMedia`: a mouse (`false`) or a touch screen (`true`). */
function stubPointer(coarse: boolean) {
  const query = { matches: coarse, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: vi.fn(() => query) });
}
// Clicking through user-event walks all 225 cells of the board: far too slow, a plain click is enough there.
const press = (element: HTMLElement) => act(async () => element.click());
const user = () => userEvent.setup({ delay: null });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  replace.mockReset();
  apiCall.mockReset().mockResolvedValue({ ok: true, data: waiting() });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  stubPointer(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("formatValidUntil", () => {
  it("prints the weekday, date and time in the Warsaw zone, marked CET in winter", () => {
    expect(formatValidUntil(EXPIRES)).toBe("piątek, 30 października 10:00 CET");
    expect(formatValidUntil("2026-01-15T09:00:00Z")).toBe("czwartek, 15 stycznia 10:00 CET");
  });

  it("marks summer time CEST, not CET", () => {
    expect(formatValidUntil("2026-07-15T09:00:00Z")).toBe("środa, 15 lipca 11:00 CEST");
  });
});

describe("GameRoom, waiting (p03)", () => {
  it("shows the wait, the link, the code and when it expires (p03.1)", () => {
    room(waiting());
    expect(screen.getByRole("heading", { name: "Partia czeka na przeciwnika" })).toBeTruthy();
    expect(screen.getByText("Czekamy na przeciwnika…")).toBeTruthy();
    expect(screen.getByText("http://localhost:3000/invite/ABCD-EFGH")).toBeTruthy();
    expect(screen.getByText("ABCD-EFGH")).toBeTruthy();
    expect(screen.getByText("Ważne do piątek, 30 października 10:00 CET")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Udostępnij" })).toBeNull();
  });

  it("says so when the player pressed create while already waiting here (L01) and lets them close it", async () => {
    room(waiting(), true);
    expect(screen.getByText("Masz już oczekującą partię.")).toBeTruthy();
    await user().click(screen.getByRole("button", { name: "Zamknij" }));
    expect(screen.queryByText("Masz już oczekującą partię.")).toBeNull();
  });

  it("copies the link and confirms it (p03.2)", async () => {
    room(waiting());
    const u = user();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await u.click(screen.getByRole("button", { name: "Kopiuj" }));
    expect(writeText).toHaveBeenCalledWith("http://localhost:3000/invite/ABCD-EFGH");
    expect(screen.getByTestId("copy-status").textContent).toBe("Skopiowano link do schowka.");
    expect(screen.getByRole("button", { name: "Skopiowano" })).toBeTruthy();
  });

  it("selects the link for copying by hand when the clipboard fails (p03.3)", async () => {
    room(waiting());
    const u = user();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    await u.click(screen.getByRole("button", { name: "Kopiuj" }));
    expect(screen.getByTestId("copy-status").textContent).toContain("Link jest zaznaczony");
    expect(window.getSelection()?.toString()).toBe("http://localhost:3000/invite/ABCD-EFGH");
  });

  it("shares the link where the browser can (Q22)", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    room(waiting());
    await user().click(screen.getByRole("button", { name: "Udostępnij" }));
    expect(share).toHaveBeenCalledWith({ title: "Zaproszenie do partii Gomoku", url: "http://localhost:3000/invite/ABCD-EFGH" });
    expect(screen.getByTestId("copy-status").textContent).toBe("");
  });

  it("is silent when the share sheet is closed, and explains other failures", async () => {
    const share = vi.fn().mockRejectedValueOnce(Object.assign(new Error("x"), { name: "AbortError" }));
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    room(waiting());
    const u = user();
    await u.click(screen.getByRole("button", { name: "Udostępnij" }));
    expect(screen.getByTestId("copy-status").textContent).toBe("");
    share.mockRejectedValueOnce(new Error("boom"));
    await u.click(screen.getByRole("button", { name: "Udostępnij" }));
    expect(screen.getByTestId("copy-status").textContent).toContain("Nie udało się otworzyć udostępniania");
  });

  it("polls every 3 seconds while waiting and stops when the game is no longer waiting", async () => {
    room(waiting());
    expect(apiCall).not.toHaveBeenCalled();
    await tick();
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1?after=0", { method: "GET" });
    await tick();
    expect(apiCall).toHaveBeenCalledTimes(2);
    apiCall.mockResolvedValue({ ok: true, data: active() });
    await tick();
    expect(apiCall).toHaveBeenCalledTimes(3);
    await tick(POLL_INTERVAL_MS * 3);
    expect(apiCall).toHaveBeenCalledTimes(3);
  });

  it("never sends a poll while the previous one is in flight", async () => {
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    room(waiting());
    await tick(POLL_INTERVAL_MS * 3);
    expect(apiCall).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, data: waiting() }));
  });

  it("shows 'Przeciwnik dołączył' when the opponent joins, then the ready state after a moment (p03.5)", async () => {
    room(waiting());
    apiCall.mockResolvedValue({ ok: true, data: active() });
    await tick();
    expect(screen.getByRole("heading", { name: "Przeciwnik dołączył" })).toBeTruthy();
    expect(screen.getByText("Kuba_P dołączył do partii")).toBeTruthy();
    await tick(JOIN_STEP_MS);
    expect(screen.getByRole("heading", { name: "Partia w toku" })).toBeTruthy();
  });

  it("moves on at once with the button", async () => {
    room(waiting());
    apiCall.mockResolvedValue({ ok: true, data: active() });
    await tick();
    await user().click(screen.getByRole("button", { name: "Przejdź do partii" }));
    expect(screen.getByRole("heading", { name: "Partia w toku" })).toBeTruthy();
  });

  it("names a guest opponent 'Gość' (L14)", async () => {
    room(waiting());
    apiCall.mockResolvedValue({ ok: true, data: guestOpponent() });
    await tick();
    expect(screen.getByText("Gość dołączył do partii")).toBeTruthy();
  });

  it("counts failed polls, shows the banner after three and lets the player retry now (p03.10)", async () => {
    apiCall.mockResolvedValue(failure("network"));
    room(waiting());
    await tick();
    expect(screen.getByText("Czekamy na przeciwnika… Ponawiamy sprawdzanie (próba 1 z 3).")).toBeTruthy();
    await tick();
    await tick();
    expect(screen.getByText("Nie udało się sprawdzić, czy przeciwnik dołączył. Ponawiamy próby.")).toBeTruthy();
    expect(screen.getByText("Czekamy na przeciwnika…")).toBeTruthy();
    apiCall.mockResolvedValue({ ok: true, data: waiting() });
    await act(async () => screen.getByRole("button", { name: "Sprawdź teraz" }).click());
    expect(screen.queryByText(/Nie udało się sprawdzić/)).toBeNull();
  });

  it("shows the 404 text when the game is gone for this visitor (p07.2, p07.3)", async () => {
    apiCall.mockResolvedValue(failure("NOT_FOUND"));
    room(waiting());
    await tick();
    expect(screen.getByText("Ta partia nie istnieje albo nie masz do niej dostępu")).toBeTruthy();
    await tick(POLL_INTERVAL_MS * 2);
    expect(apiCall).toHaveBeenCalledTimes(1);
  });
});

describe("GameRoom on the server", () => {
  it("renders without the share button, because the server cannot know the browser", () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn() });
    const html = renderToStaticMarkup(<GameRoom gameId="g1" initial={waiting()} ownWaitingNotice={false} />);
    expect(html).toContain("Czekamy na przeciwnika…");
    expect(html).not.toContain("Udostępnij");
  });
});

describe("GameRoom, cancelling (p03.6-p03.8)", () => {
  async function openDialog() {
    const u = user();
    await u.click(screen.getByRole("button", { name: "Anuluj zaproszenie" }));
    return u;
  }

  it("asks first, and 'Wróć' changes nothing", async () => {
    room(waiting());
    const u = await openDialog();
    expect(screen.getByText("Anulować zaproszenie?")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Wróć" }));
    expect(screen.queryByText("Anulować zaproszenie?")).toBeNull();
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("cancels and leaves for the home page with a notice, staying busy", async () => {
    apiCall.mockResolvedValue({ ok: true, data: null });
    room(waiting());
    const u = await openDialog();
    await u.click(screen.getByRole("button", { name: "Tak, anuluj zaproszenie" }));
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/cancel");
    expect(replace).toHaveBeenCalledWith("/?notice=cancelled");
    expect((screen.getByRole("button", { name: "Anulowanie…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends the cancel once however often the button is pressed", async () => {
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    room(waiting());
    await openDialog();
    const confirm = screen.getByRole("button", { name: "Tak, anuluj zaproszenie" });
    await act(async () => {
      confirm.click();
      confirm.click();
    });
    expect(apiCall).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, data: null }));
  });

  it("does not close the dialog by Escape while the request runs", async () => {
    apiCall.mockReturnValue(new Promise(() => {}));
    room(waiting());
    const u = await openDialog();
    await u.click(screen.getByRole("button", { name: "Tak, anuluj zaproszenie" }));
    await u.keyboard("{Escape}");
    expect(screen.getByText("Anulować zaproszenie?")).toBeTruthy();
  });

  it("explains that the opponent was faster and refreshes the state (Q9)", async () => {
    apiCall.mockResolvedValueOnce(failure("GAME_NOT_CANCELLABLE"));
    apiCall.mockResolvedValueOnce({ ok: true, data: active() });
    room(waiting());
    const u = await openDialog();
    await u.click(screen.getByRole("button", { name: "Tak, anuluj zaproszenie" }));
    expect(screen.getByText("Przeciwnik zdążył dołączyć, zanim anulowałeś")).toBeTruthy();
    expect(apiCall).toHaveBeenLastCalledWith("/api/games/g1?after=0", { method: "GET" });
    expect(replace).not.toHaveBeenCalled();
  });

  it("clears the previous failure message when the cancel is tried again", async () => {
    apiCall.mockResolvedValueOnce(failure("INTERNAL"));
    apiCall.mockReturnValueOnce(new Promise(() => {}));
    room(waiting());
    const u = await openDialog();
    await u.click(screen.getByRole("button", { name: "Tak, anuluj zaproszenie" }));
    expect(screen.getByText("Nie udało się anulować zaproszenia")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Anuluj zaproszenie" }));
    await u.click(screen.getByRole("button", { name: "Tak, anuluj zaproszenie" }));
    expect(screen.queryByText("Nie udało się anulować zaproszenia")).toBeNull();
  });

  it.each([
    ["network", /Nie udało się połączyć z serwerem. Spróbuj ponownie./],
    ["INTERNAL", /^Spróbuj ponownie\.$/],
  ])("keeps the game and says what failed on %s", async (code, details) => {
    apiCall.mockResolvedValue(failure(code));
    room(waiting());
    const u = await openDialog();
    await u.click(screen.getByRole("button", { name: "Tak, anuluj zaproszenie" }));
    expect(screen.getByText("Nie udało się anulować zaproszenia")).toBeTruthy();
    expect(screen.getByText(details)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anuluj zaproszenie" })).toBeTruthy();
  });

  it("shows the 404 text when the cancel says the game is not the player's", async () => {
    apiCall.mockResolvedValue(failure("NOT_FOUND"));
    room(waiting());
    const u = await openDialog();
    await u.click(screen.getByRole("button", { name: "Tak, anuluj zaproszenie" }));
    expect(screen.getByText("Ta partia nie istnieje albo nie masz do niej dostępu")).toBeTruthy();
  });
});

describe("GameRoom, active (p04)", () => {
  it("waits for the player who has not opened the page, and keeps polling (p04.1)", async () => {
    room(active({ you: { seat: 2, kind: "account" } }, [false, true]));
    expect(screen.getByRole("heading", { name: "Czekamy na otwarcie partii" })).toBeTruthy();
    expect(
      screen.getByText("Czekamy, aż Ala_7 otworzy partię — zegar ruszy, gdy obaj będziecie na stronie (do 15 min)"),
    ).toBeTruthy();
    expect(screen.getByText("Ty (Kuba_P)")).toBeTruthy();
    // Both opened the page: the board takes over (own turn, so nothing more to poll).
    apiCall.mockResolvedValue({ ok: true, data: active({ you: { seat: 2, kind: "account" }, turnSeat: 2 }, [true, true]) });
    await tick();
    expect(screen.getByRole("heading", { name: "Partia w toku" })).toBeTruthy();
    await tick(PLAY_POLL_INTERVAL_MS * 3);
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it("keeps the guest warning while the guest waits for the other player to open the page (p04.4)", () => {
    room({ ...active({ you: { seat: 2, kind: "guest" } }, [false, true]), players: [
      { seat: 1, kind: "account", displayName: "Ala_7", seen: false },
      { seat: 2, kind: "guest", displayName: null, seen: true },
    ] });
    expect(screen.getByRole("heading", { name: "Czekamy na otwarcie partii" })).toBeTruthy();
    expect(screen.getByText("Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii")).toBeTruthy();
  });

  it("keeps the guest warning on the page for a guest (p04.4)", () => {
    room({ ...guestOpponent(), you: { seat: 2, kind: "guest" } });
    expect(screen.getByText("Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii")).toBeTruthy();
    expect(screen.getByText("Ty (Gość)")).toBeTruthy();
  });

  it("calls a deleted account 'Usunięty gracz'", () => {
    const game = active();
    game.players[1]!.displayName = null;
    room(game);
    expect(screen.getByText("Usunięty gracz")).toBeTruthy();
  });
});

describe("GameRoom, ended", () => {
  const cancelledTwo = (seenByYou: boolean): GameView => ({
    ...NO_BOARD,
    moves: [],
    status: "cancelled",
    closedReason: "not_opened",
    you: { seat: 1, kind: "account" },
    players: [
      { seat: 1, kind: "account", displayName: "Ala_7", seen: seenByYou },
      { seat: 2, kind: "account", displayName: "Kuba_P", seen: true },
    ],
  });

  it("tells the creator whose invitation ran out to create a new one (p03.9)", () => {
    room({ ...waiting(), status: "cancelled", closedReason: "expired", invitation: undefined });
    expect(screen.getByRole("heading", { name: "Zaproszenie wygasło" })).toBeTruthy();
    expect(screen.getByText("Zaproszenie jest ważne 24 godziny. Link i kod nie działają.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Utwórz zaproszenie" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wróć na stronę główną" }).getAttribute("href")).toBe("/");
  });

  it("tells the creator who cancelled in another tab that the invitation was cancelled, not expired (p03.8)", () => {
    room({ ...waiting(), status: "cancelled", closedReason: "cancelled", invitation: undefined });
    expect(screen.getByRole("heading", { name: "Zaproszenie zostało anulowane" })).toBeTruthy();
    expect(screen.getByText("Link i kod nie działają.")).toBeTruthy();
    expect(screen.queryByText(/wygasło/)).toBeNull();
    expect(screen.getByRole("button", { name: "Utwórz zaproszenie" })).toBeTruthy();
  });

  it("tells the player who opened the page that the opponent did not (p04.3)", () => {
    room(cancelledTwo(true));
    expect(screen.getByRole("heading", { name: "Partia anulowana" })).toBeTruthy();
    expect(screen.getByText("Przeciwnik nie otworzył partii w ciągu 15 minut. Partię anulowano.")).toBeTruthy();
  });

  it("tells the player who did not open it that the game was cancelled (p04.3)", () => {
    room(cancelledTwo(false));
    expect(screen.getByText("Partię anulowano: nie została otwarta w ciągu 15 minut.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wróć na stronę główną" })).toBeTruthy();
  });

  it("does not poll a cancelled game", async () => {
    room(cancelledTwo(true));
    await tick(POLL_INTERVAL_MS * 2);
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("shows the result of a finished game and does not poll it (p06)", async () => {
    room(active({ status: "finished", turnSeat: null, result: { winnerSeat: 1, reason: "five_in_row", winLine: [0, 1, 2, 3, 4] } }));
    expect(screen.getByRole("heading", { name: "Koniec partii" })).toBeTruthy();
    expect(screen.getByText("Wygrałeś")).toBeTruthy();
    await tick(PLAY_POLL_INTERVAL_MS * 3);
    expect(apiCall).not.toHaveBeenCalled();
  });
});

describe("GameRoom, play (p05, p06)", () => {
  const hide = (hidden: boolean) =>
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: hidden ? "hidden" : "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  afterEach(() => hide(false));

  const theirTurn = (moves: number[]) => active({ turnSeat: 2, moveCount: moves.length, moves });
  const stonesOnBoard = () => [...document.querySelectorAll("[aria-label]")].filter((b) => /(czarny|biały) kamień/.test(b.getAttribute("aria-label") ?? ""));

  it("reads only the new moves every 2 s while the opponent is on turn and merges them", async () => {
    room(theirTurn([112]));
    apiCall.mockResolvedValue({ ok: true, data: active({ turnSeat: 1, moveCount: 2, moves: [113] }) });
    await tick(PLAY_POLL_INTERVAL_MS);
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1?after=1", { method: "GET" });
    expect(stonesOnBoard()).toHaveLength(2);
    expect(screen.getByText("Twój ruch (czarne)")).toBeTruthy();
    // Own turn: nothing to read.
    await tick(PLAY_POLL_INTERVAL_MS * 3);
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it("stops polling when the game ends and shows the result with the winning line", async () => {
    room(theirTurn([112, 0, 113, 1, 114, 2, 115, 3]));
    apiCall.mockResolvedValue({
      ok: true,
      data: active({ status: "finished", turnSeat: null, moveCount: 9, moves: [116], result: { winnerSeat: 2, reason: "five_in_row", winLine: [112, 113, 114, 115, 116] } }),
    });
    await tick(PLAY_POLL_INTERVAL_MS);
    expect(screen.getByText("Przegrałeś")).toBeTruthy();
    expect(stonesOnBoard()).toHaveLength(9);
    await tick(PLAY_POLL_INTERVAL_MS * 3);
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it("counts failed reads during play and recovers (L02)", async () => {
    room(theirTurn([112]));
    apiCall.mockResolvedValue(failure("network"));
    await tick(PLAY_POLL_INTERVAL_MS * 3);
    expect(screen.getByText("Nie udało się sprawdzić stanu partii. Ponawiamy próby.")).toBeTruthy();
    apiCall.mockResolvedValue({ ok: true, data: theirTurn([112]) });
    await press(screen.getByText("Sprawdź teraz").closest("button")!);
    await tick(0);
    expect(screen.queryByText(/Nie udało się sprawdzić/)).toBeNull();
  });

  it("shows the 404 text when the game turns out not to be the visitor's", async () => {
    room(theirTurn([112]));
    apiCall.mockResolvedValue(failure("NOT_FOUND"));
    await tick(PLAY_POLL_INTERVAL_MS);
    expect(screen.getByText("Ta partia nie istnieje albo nie masz do niej dostępu")).toBeTruthy();
  });

  it("pauses in a hidden tab and reads the state at once on coming back (p05.12)", async () => {
    room(theirTurn([112]));
    hide(true);
    await tick(PLAY_POLL_INTERVAL_MS * 3);
    expect(apiCall).not.toHaveBeenCalled();
    apiCall.mockResolvedValue({ ok: true, data: theirTurn([112]) });
    hide(false);
    await tick(0);
    expect(apiCall).toHaveBeenCalledTimes(1);
    await tick(PLAY_POLL_INTERVAL_MS);
    expect(apiCall).toHaveBeenCalledTimes(2);
  });

  it("does not read the state on coming back to a game that is over", async () => {
    room(active({ status: "finished", turnSeat: null, result: { winnerSeat: 1, reason: "draw", winLine: null } }));
    hide(true);
    hide(false);
    await tick(0);
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("plays a move: the answer lands on the board and the opponent is polled next", async () => {
    room(active({ moveCount: 0 }));
    apiCall.mockResolvedValue({ ok: true, data: active({ turnSeat: 2, moveCount: 1, moves: [112] }) });
    await press(document.querySelector<HTMLElement>('[aria-label="Kolumna H, rząd 8, puste"]')!);
    await tick(0);
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/moves", { body: { x: 7, y: 7, moveNumber: 1 } });
    expect(screen.getAllByText("Ruch przeciwnika")).toHaveLength(2);
    expect(stonesOnBoard()).toHaveLength(1);
    apiCall.mockResolvedValue({ ok: true, data: active({ turnSeat: 1, moveCount: 2, moves: [113] }) });
    await tick(PLAY_POLL_INTERVAL_MS);
    expect(apiCall).toHaveBeenLastCalledWith("/api/games/g1?after=1", { method: "GET" });
    expect(stonesOnBoard()).toHaveLength(2);
  });

  it("shows the 404 text when a move finds the game gone", async () => {
    room(active({ moveCount: 0 }));
    apiCall.mockResolvedValue(failure("NOT_FOUND"));
    await press(document.querySelector<HTMLElement>('[aria-label="Kolumna H, rząd 8, puste"]')!);
    await tick(0);
    expect(screen.getByText("Ta partia nie istnieje albo nie masz do niej dostępu")).toBeTruthy();
  });

  it("refreshes after a refused move (STALE_MOVE) and shows the opponent's move", async () => {
    room(active({ moveCount: 0 }));
    apiCall.mockImplementation(async (path: string) =>
      path.includes("/moves") ? failure("STALE_MOVE") : { ok: true, data: active({ turnSeat: 1, moveCount: 1, moves: [113] }) },
    );
    await press(document.querySelector<HTMLElement>('[aria-label="Kolumna H, rząd 8, puste"]')!);
    await tick(0);
    expect(screen.getByText("Plansza była nieaktualna i została odświeżona. Spróbuj ponownie.")).toBeTruthy();
    expect(apiCall).toHaveBeenLastCalledWith("/api/games/g1?after=0", { method: "GET" });
    expect(stonesOnBoard()).toHaveLength(1);
  });
});
