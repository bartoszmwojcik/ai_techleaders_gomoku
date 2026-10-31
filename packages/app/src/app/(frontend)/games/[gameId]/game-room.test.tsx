// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replace, push, apiCall } = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), apiCall: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import type { GameView } from "@/server/http/game-view";

import { formatValidUntil, GameRoom, GUEST_RESULT_WINDOW_MS, JOIN_STEP_MS, REMATCH_IDLE_AFTER_MS, REMATCH_IDLE_POLL_INTERVAL_MS, PLAY_POLL_INTERVAL_MS, POLL_INTERVAL_MS, POLL_TIMEOUT_MS, RETURN_NOTICE_MS } from "./game-room";

vi.setConfig({ testTimeout: 20_000 });

const EXPIRES = "2026-10-30T09:00:00.000Z";
const NO_BOARD = {
  moveCount: 0,
  blackSeat: null,
  turnSeat: null,
  moves: [],
  result: null,
  clock: { remainingMs: [600_000, 600_000] as [number, number], running: null, now: 0 },
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
      { seat: 2, kind: "guest", displayName: "Gracz 2", seen: true },
    ],
  });
const finished = (): GameView =>
  active({ status: "finished", turnSeat: null, result: { winnerSeat: 1, reason: "five_in_row", winLine: [0, 1, 2, 3, 4] } });
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
  push.mockReset();
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

const guestWaiting = (): GameView => ({
  ...waiting(),
  you: { seat: 1, kind: "guest" },
  players: [{ seat: 1, kind: "guest", displayName: "Ala", seen: true }],
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

  it("shows a guest creator the same card and a permanent warning under it (p03.11, p03.12)", () => {
    room(guestWaiting());
    expect(screen.getByText("ABCD-EFGH")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anuluj zaproszenie" })).toBeTruthy();
    expect(screen.getByText("Nie zmieniaj przeglądarki, bo stracisz dostęp do partii.")).toBeTruthy();
  });

  it("shows no browser warning to an account creator", () => {
    room(waiting());
    expect(screen.queryByText(/Nie zmieniaj przeglądarki/)).toBeNull();
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
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1?after=0", { method: "GET", signal: expect.any(AbortSignal) });
    await tick();
    expect(apiCall).toHaveBeenCalledTimes(2);
    apiCall.mockResolvedValue({ ok: true, data: active() });
    await tick();
    expect(apiCall).toHaveBeenCalledTimes(3);
    // The game is on: the cadence is the 2 s of a game in progress, not the 3 s of waiting.
    apiCall.mockClear();
    await tick(PLAY_POLL_INTERVAL_MS);
    expect(apiCall).toHaveBeenCalledTimes(1);
    apiCall.mockResolvedValue({ ok: true, data: { ...waiting(), status: "cancelled", closedReason: "cancelled" } });
    await tick(PLAY_POLL_INTERVAL_MS);
    apiCall.mockClear();
    await tick(POLL_INTERVAL_MS * 3);
    expect(apiCall).not.toHaveBeenCalled();
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

  it("names a guest opponent '{nick} (gość)' (E02-S07)", async () => {
    room(waiting());
    apiCall.mockResolvedValue({ ok: true, data: guestOpponent() });
    await tick();
    expect(screen.getByText("Gracz 2 (gość) dołączył do partii")).toBeTruthy();
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
    expect(apiCall).toHaveBeenLastCalledWith("/api/games/g1?after=0", { method: "GET", signal: expect.any(AbortSignal) });
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
    // Both opened the page: the board takes over (the game in progress is polled on the own turn too, #23).
    apiCall.mockResolvedValue({ ok: true, data: active({ you: { seat: 2, kind: "account" }, turnSeat: 2 }, [true, true]) });
    await tick();
    expect(screen.getByRole("heading", { name: "Partia w toku" })).toBeTruthy();
    await tick(PLAY_POLL_INTERVAL_MS * 3);
    expect(apiCall).toHaveBeenCalledTimes(4);
  });

  it("keeps the guest warning while the guest waits for the other player to open the page (p04.4)", () => {
    room({ ...active({ you: { seat: 2, kind: "guest" } }, [false, true]), players: [
      { seat: 1, kind: "account", displayName: "Ala_7", seen: false },
      { seat: 2, kind: "guest", displayName: "Gracz 2", seen: true },
    ] });
    expect(screen.getByRole("heading", { name: "Czekamy na otwarcie partii" })).toBeTruthy();
    expect(screen.getByText("Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii")).toBeTruthy();
  });

  it("keeps the guest warning on the page for a guest (p04.4)", () => {
    room({ ...guestOpponent(), you: { seat: 2, kind: "guest" } });
    expect(screen.getByText("Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii")).toBeTruthy();
    expect(screen.getByTitle("Gracz 2 (gość)").textContent).toBe("Ty: Gracz 2 (gość)");
    expect(screen.getByText("Gracz 2").getAttribute("class")).toContain("truncate");
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

  it("sends a guest creator whose invitation ran out to the guest form, not to the one-click button (p03.13)", () => {
    room({ ...guestWaiting(), status: "cancelled", closedReason: "expired", invitation: undefined });
    expect(screen.getByRole("heading", { name: "Zaproszenie wygasło" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Utwórz nowe zaproszenie" }).getAttribute("href")).toBe("/play");
    expect(screen.queryByRole("button", { name: "Utwórz zaproszenie" })).toBeNull();
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

  it("shows the result of a finished game and reads it every 3 s for an offer of a rematch (p06, p06.12)", async () => {
    room(active({ status: "finished", turnSeat: null, result: { winnerSeat: 1, reason: "five_in_row", winLine: [0, 1, 2, 3, 4] } }));
    expect(screen.getByRole("heading", { name: "Koniec partii" })).toBeTruthy();
    expect(screen.getByText("Wygrałeś")).toBeTruthy();
    expect(screen.getByText("Rewanż", { selector: "h2" })).toBeTruthy();
    apiCall.mockResolvedValue({ ok: true, data: { ...finished(), rematch: { state: "pending", offeredBySeat: 2, expiresAt: "2999-01-01T00:00:00.000Z", gameId: null } } });
    await tick(POLL_INTERVAL_MS);
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Przyjmij" })).toBeTruthy();
  });

  it("stops reading a finished game once the rematch is accepted", async () => {
    room({ ...finished(), rematch: { state: "accepted", offeredBySeat: 2, expiresAt: "2999-01-01T00:00:00.000Z", gameId: "g2" } });
    await tick(POLL_INTERVAL_MS * 3);
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
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1?after=1", { method: "GET", signal: expect.any(AbortSignal) });
    expect(stonesOnBoard()).toHaveLength(2);
    expect(screen.getByText("Twój ruch (czarne)")).toBeTruthy();
    // Own turn: the clock runs for the player and the game can end without a move, so it is read too (#23).
    await tick(PLAY_POLL_INTERVAL_MS * 3);
    expect(apiCall).toHaveBeenCalledTimes(4);
  });

  it("reads the state the moment the local clock reaches zero and shows the loss on time (p06.3)", async () => {
    const running = { remainingMs: [3_000, 600_000] as [number, number], running: 1 as const, now: 5_000_000 };
    room(active({ clock: running }));
    expect(screen.getByText("Twój ruch (czarne)")).toBeTruthy();
    apiCall.mockResolvedValue({ ok: true, data: active({ clock: running }) });
    await tick(PLAY_POLL_INTERVAL_MS);
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Twój ruch (czarne)")).toBeTruthy();
    // The server settles the game when it is asked; the next regular read is at 4 s, the zero is at 3 s.
    apiCall.mockResolvedValue({
      ok: true,
      data: active({
        status: "finished",
        turnSeat: null,
        result: { winnerSeat: 2, reason: "timeout", winLine: null },
        clock: { remainingMs: [0, 600_000], running: null, now: 5_003_100 },
      }),
    });
    await tick(1_100);
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Przegrałeś — skończył się Twój czas")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Koniec partii" })).toBeTruthy();
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
    // From here on only for an offer of a rematch, at the pace of a waiting game.
    await tick(POLL_INTERVAL_MS * 2);
    expect(apiCall).toHaveBeenCalledTimes(3);
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

  describe("return notice (p05.10, #24 Q2)", () => {
    const withClock = (mine = 555_000): GameView => ({
      ...theirTurn([112]),
      clock: { remainingMs: [mine, 600_000], running: 2, now: 9_000_000 },
    });
    const away = async (ms: number) => {
      hide(true);
      await tick(ms);
      apiCall.mockClear();
    };
    const back = async () => {
      hide(false);
      await tick(0);
    };
    const NOTICE = "Wróciłeś do partii. Twój zegar: 9:15.";

    it("shows the notice with the server's time after more than 30 s, and removes it after 8 s", async () => {
      room(theirTurn([112]));
      await away(45_000);
      apiCall.mockResolvedValue({ ok: true, data: withClock() });
      await back();
      expect(apiCall).toHaveBeenCalledTimes(1);
      expect(screen.getByText(NOTICE)).toBeTruthy();
      expect(screen.getAllByRole("status").some((el) => el.textContent?.includes(NOTICE))).toBe(true);
      await tick(RETURN_NOTICE_MS - 3000);
      expect(screen.getByText(NOTICE)).toBeTruthy();
      await tick(3500);
      expect(screen.queryByText(NOTICE)).toBeNull();
    });

    it("says nothing after a short absence, but still reads the state at once", async () => {
      room(theirTurn([112]));
      await away(20_000);
      apiCall.mockResolvedValue({ ok: true, data: withClock() });
      await back();
      expect(apiCall).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/Wróciłeś/)).toBeNull();
    });

    it("disappears with the next move", async () => {
      room(theirTurn([112]));
      await away(45_000);
      apiCall.mockResolvedValue({ ok: true, data: withClock() });
      await back();
      expect(screen.getByText(NOTICE)).toBeTruthy();
      apiCall.mockResolvedValue({ ok: true, data: { ...withClock(), turnSeat: 1, moveCount: 2, moves: [113] } });
      await tick(PLAY_POLL_INTERVAL_MS);
      expect(screen.queryByText(/Wróciłeś/)).toBeNull();
    });

    it("is not shown when the game ended during the absence (p06.3)", async () => {
      room(theirTurn([112]));
      await away(45_000);
      apiCall.mockResolvedValue({
        ok: true,
        data: { ...theirTurn([112]), status: "finished", turnSeat: null, result: { winnerSeat: 1, reason: "timeout", winLine: null } },
      });
      await back();
      expect(screen.getByText("Wygrałeś — przeciwnikowi skończył się czas")).toBeTruthy();
      expect(screen.queryByText(/Wróciłeś/)).toBeNull();
      expect(screen.queryByTestId("reload-note")).toBeNull();
    });

    it("waits for the first successful read; a failed one leaves the notice due", async () => {
      room(theirTurn([112]));
      await away(45_000);
      apiCall.mockResolvedValue(failure("network"));
      await back();
      expect(screen.queryByText(/Wróciłeś/)).toBeNull();
      apiCall.mockResolvedValue({ ok: true, data: withClock() });
      await tick(PLAY_POLL_INTERVAL_MS);
      expect(screen.getByText(NOTICE)).toBeTruthy();
    });

    it("reads again after an in-flight read and takes the time from that later read", async () => {
      room(theirTurn([112]));
      let first!: (value: unknown) => void;
      let second!: (value: unknown) => void;
      apiCall
        .mockReturnValueOnce(new Promise((resolve) => (first = resolve)))
        .mockReturnValueOnce(new Promise((resolve) => (second = resolve)));
      await tick(PLAY_POLL_INTERVAL_MS);
      expect(apiCall).toHaveBeenCalledTimes(1);
      hide(true);
      await tick(45_000);
      await back();
      // The read in flight is not repeated yet, and its answer (the time from before the sleep) says nothing.
      expect(apiCall).toHaveBeenCalledTimes(1);
      await act(async () => first({ ok: true, data: { ...withClock(600_000), moves: [], clock: { remainingMs: [600_000, 600_000], running: 2, now: 8_000_000 } } }));
      expect(apiCall).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/Wróciłeś/)).toBeNull();
      await act(async () => second({ ok: true, data: { ...withClock(), moves: [] } }));
      expect(screen.getByText(NOTICE)).toBeTruthy();
      expect(screen.queryByText(/Twój zegar: 10:00/)).toBeNull();
    });

    it("does not multiply reads when the player comes back several times during one read", async () => {
      room(theirTurn([112]));
      let first!: (value: unknown) => void;
      apiCall.mockReturnValueOnce(new Promise((resolve) => (first = resolve)));
      await tick(PLAY_POLL_INTERVAL_MS);
      for (let i = 0; i < 3; i++) {
        hide(true);
        await tick(1_000);
        await back();
      }
      expect(apiCall).toHaveBeenCalledTimes(1);
      apiCall.mockReturnValue(new Promise(() => {}));
      await act(async () => first({ ok: true, data: withClock() }));
      expect(apiCall).toHaveBeenCalledTimes(2);
      await tick(0);
      expect(apiCall).toHaveBeenCalledTimes(2);
    });

    it("shows the notice for a read that ends within 10 s of the return", async () => {
      room(theirTurn([112]));
      await away(45_000);
      apiCall.mockResolvedValue(failure("network"));
      await back();
      await tick(PLAY_POLL_INTERVAL_MS * 3);
      apiCall.mockResolvedValue({ ok: true, data: withClock() });
      await tick(PLAY_POLL_INTERVAL_MS);
      expect(screen.getByText(NOTICE)).toBeTruthy();
    });

    it("drops the notice when the first successful read comes more than 10 s after the return", async () => {
      room(theirTurn([112]));
      await away(45_000);
      apiCall.mockResolvedValue(failure("network"));
      await back();
      await tick(PLAY_POLL_INTERVAL_MS * 6);
      expect(screen.getByText(/Nie udało się sprawdzić/)).toBeTruthy();
      apiCall.mockResolvedValue({ ok: true, data: withClock() });
      await tick(PLAY_POLL_INTERVAL_MS);
      expect(screen.queryByText(/Wróciłeś/)).toBeNull();
      // And it is not kept for later: the flag was cleared without showing.
      await tick(PLAY_POLL_INTERVAL_MS * 2);
      expect(screen.queryByText(/Wróciłeś/)).toBeNull();
    });

    it("gives every read a timeout so one hung request cannot stop the polling", async () => {
      const timeout = vi.spyOn(AbortSignal, "timeout");
      room(theirTurn([112]));
      apiCall.mockResolvedValue({ ok: true, data: theirTurn([112]) });
      await tick(PLAY_POLL_INTERVAL_MS);
      expect(timeout).toHaveBeenCalledWith(POLL_TIMEOUT_MS);
      timeout.mockRestore();
    });

    it("is not shown while still waiting for the opponent to open the page", async () => {
      room(active({}, [true, false]));
      await away(45_000);
      apiCall.mockResolvedValue({ ok: true, data: active({}, [true, false]) });
      await back();
      expect(screen.queryByText(/Wróciłeś/)).toBeNull();
      expect(apiCall).toHaveBeenCalledTimes(1);
    });
  });

  it("says it is a return when the page opens on a finished game, but not when the game ends on the page (p06.5)", async () => {
    room(active({ status: "finished", turnSeat: null, result: { winnerSeat: 1, reason: "five_in_row", winLine: [0, 1, 2, 3, 4] } }));
    expect(screen.getByTestId("reload-note")).toBeTruthy();
    cleanup();
    room(theirTurn([112]));
    apiCall.mockResolvedValue({
      ok: true,
      data: active({ status: "finished", turnSeat: null, moveCount: 2, moves: [113], result: { winnerSeat: 2, reason: "five_in_row", winLine: [1, 2, 3, 4, 5] } }),
    });
    await tick(PLAY_POLL_INTERVAL_MS);
    expect(screen.getByText("Przegrałeś")).toBeTruthy();
    expect(screen.queryByTestId("reload-note")).toBeNull();
  });

  it("reads the state on coming back to a finished game (an offer may have come), but not to an accepted rematch", async () => {
    room(finished());
    apiCall.mockResolvedValue({ ok: true, data: finished() });
    hide(true);
    hide(false);
    await tick(0);
    expect(apiCall).toHaveBeenCalledTimes(1);
    cleanup();
    apiCall.mockReset();
    room({ ...finished(), rematch: { state: "accepted", offeredBySeat: 1, expiresAt: "2999-01-01T00:00:00.000Z", gameId: "g2" } });
    hide(true);
    hide(false);
    await tick(0);
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("does not read the state on coming back to a game that was cancelled or gone", async () => {
    room(active({ status: "cancelled", turnSeat: null, closedReason: "not_opened" }));
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
    expect(apiCall).toHaveBeenLastCalledWith("/api/games/g1?after=1", { method: "GET", signal: expect.any(AbortSignal) });
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
    expect(apiCall).toHaveBeenLastCalledWith("/api/games/g1?after=0", { method: "GET", signal: expect.any(AbortSignal) });
    expect(stonesOnBoard()).toHaveLength(1);
  });
});

describe("GameRoom, the reads of a result screen (M2, L2-L4)", () => {
  const GATE = "Ta partia nie istnieje albo nie masz do niej dostępu";
  const theirs = { state: "pending", offeredBySeat: 2, expiresAt: "2999-01-01T00:00:00.000Z", gameId: null } as const;
  const mineOffer = { ...theirs, offeredBySeat: 1 } as const;
  const accepted = { state: "accepted", offeredBySeat: 2, expiresAt: "2999-01-01T00:00:00.000Z", gameId: "g2" } as const;
  const visibility = (hidden: boolean) =>
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: hidden ? "hidden" : "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  afterEach(() => visibility(false));
  const reads = () => apiCall.mock.calls.filter(([path]) => String(path).startsWith("/api/games/g1?")).length;
  const deferred = () => {
    let resolve!: (value: unknown) => void;
    const promise = new Promise((done) => (resolve = done));
    return { promise, resolve };
  };

  describe("the pace (M2)", () => {
    beforeEach(() => apiCall.mockResolvedValue({ ok: true, data: finished() }));

    it("slows down to 12 s after a few minutes without an offer", async () => {
      room(finished());
      await tick(REMATCH_IDLE_AFTER_MS + POLL_INTERVAL_MS);
      apiCall.mockClear();
      await tick(8000);
      expect(reads()).toBe(0);
      await tick(2000);
      expect(reads()).toBe(1);
      await tick(REMATCH_IDLE_POLL_INTERVAL_MS);
      expect(reads()).toBe(2);
    });

    it("keeps the 3 s pace while an offer is open", async () => {
      apiCall.mockResolvedValue({ ok: true, data: { ...finished(), rematch: theirs } });
      room(finished());
      await tick(REMATCH_IDLE_AFTER_MS + POLL_INTERVAL_MS);
      apiCall.mockClear();
      await tick(POLL_INTERVAL_MS);
      expect(reads()).toBe(1);
      await tick(POLL_INTERVAL_MS);
      expect(reads()).toBe(2);
    });

    it("returns to 3 s and reads at once when the tab comes back", async () => {
      room(finished());
      await tick(REMATCH_IDLE_AFTER_MS + POLL_INTERVAL_MS);
      apiCall.mockClear();
      visibility(true);
      visibility(false);
      await tick(0);
      expect(reads()).toBe(1);
      await tick(POLL_INTERVAL_MS);
      expect(reads()).toBe(2);
    });

    it("returns to 3 s and reads at once when the window gets the focus", async () => {
      room(finished());
      await tick(REMATCH_IDLE_AFTER_MS + POLL_INTERVAL_MS);
      apiCall.mockClear();
      await act(async () => void window.dispatchEvent(new Event("focus")));
      await tick(0);
      expect(reads()).toBe(1);
      await tick(POLL_INTERVAL_MS);
      expect(reads()).toBe(2);
    });

    it("returns to 3 s after the player's own answer to an offer", async () => {
      apiCall.mockResolvedValue({ ok: true, data: { ...finished(), rematch: theirs } });
      room(finished());
      await tick(POLL_INTERVAL_MS);
      apiCall.mockImplementation(async (path?: string) => ({
        ok: true,
        data: path?.endsWith("/decline") ? null : { ...finished(), rematch: theirs },
      }));
      await tick(REMATCH_IDLE_AFTER_MS);
      await press(screen.getByRole("button", { name: "Odrzuć" }));
      apiCall.mockClear();
      await tick(POLL_INTERVAL_MS);
      expect(reads()).toBe(1);
    });

    it("does not show the red banner for the failed reads of a finished game", async () => {
      apiCall.mockResolvedValue(failure("network"));
      room(finished());
      await tick(POLL_INTERVAL_MS * 5);
      expect(reads()).toBe(5);
      expect(screen.queryByText(/Nie udało się sprawdzić stanu partii/)).toBeNull();
      expect(screen.queryByText(/Ponawiamy sprawdzanie/)).toBeNull();
    });
  });

  describe("a guest's token (L1)", () => {
    const guestFinished = (over: Partial<GameView> = {}): GameView => ({ ...finished(), you: { seat: 1, kind: "guest" }, ...over });
    const FINISHED_AT = Date.parse("2026-10-30T12:00:00.000Z");
    const served = (kind: "guest" | "account") => async () => ({
      ok: true,
      data: { ...guestFinished({ you: { seat: 1, kind } }), finishedAt: new Date(FINISHED_AT).toISOString(), clock: { ...finished().clock, now: Date.now() } },
    });

    beforeEach(() => vi.setSystemTime(FINISHED_AT + 60_000));

    it("stops reading 55 minutes after the end, going by the server's time", async () => {
      apiCall.mockImplementation(served("guest"));
      room({ ...guestFinished(), finishedAt: new Date(FINISHED_AT).toISOString(), clock: { ...finished().clock, now: FINISHED_AT + 60_000 } });
      await tick(30 * 60_000);
      expect(reads()).toBeGreaterThan(10);
      await tick(26 * 60_000);
      apiCall.mockClear();
      await tick(10 * 60_000);
      expect(reads()).toBe(0);
      expect(screen.queryByText(GATE)).toBeNull();
      // And neither a return to the tab nor the focus reads it.
      visibility(true);
      visibility(false);
      await act(async () => void window.dispatchEvent(new Event("focus")));
      await tick(0);
      expect(reads()).toBe(0);
    });

    it("keeps reading for an account, whose session does not lapse", async () => {
      apiCall.mockImplementation(served("account"));
      room({ ...finished(), finishedAt: new Date(FINISHED_AT).toISOString(), clock: { ...finished().clock, now: FINISHED_AT + 60_000 } });
      await tick(58 * 60_000);
      apiCall.mockClear();
      await tick(REMATCH_IDLE_POLL_INTERVAL_MS);
      expect(reads()).toBeGreaterThanOrEqual(1);
    });

    it("exposes the length of the window", () => {
      expect(GUEST_RESULT_WINDOW_MS).toBe(55 * 60_000);
    });
  });

  describe("races of the reads", () => {
    it("T1: after a read shows the rematch accepted, no read of the old game follows, not even the one a return queued (L2)", async () => {
      apiCall.mockResolvedValue({ ok: true, data: { ...finished(), rematch: theirs } });
      room({ ...finished(), rematch: theirs });
      const answer = deferred();
      apiCall.mockReturnValue(answer.promise);
      await tick(POLL_INTERVAL_MS);
      expect(reads()).toBe(1);
      // The tab came back while the read was in flight: a second read is queued behind it.
      visibility(true);
      visibility(false);
      apiCall.mockResolvedValue({ ok: true, data: { ...finished(), rematch: accepted } });
      await act(async () => answer.resolve({ ok: true, data: { ...finished(), rematch: accepted } }));
      await tick(POLL_INTERVAL_MS * 3);
      expect(reads()).toBe(1);
    });

    it("does not call a 404 after the acceptance 'no access': the old game's token was replaced (L2)", async () => {
      room({ ...finished(), rematch: theirs });
      const answer = deferred();
      apiCall.mockReturnValueOnce(answer.promise);
      await tick(POLL_INTERVAL_MS);
      apiCall.mockResolvedValue({ ok: true, data: { gameId: "g2" } });
      await press(screen.getByRole("button", { name: "Przyjmij" }));
      await act(async () => answer.resolve(failure("NOT_FOUND")));
      expect(screen.queryByText(GATE)).toBeNull();
    });

    it("still says 'no access' for a 404 of a read when nothing was accepted", async () => {
      room({ ...finished(), rematch: theirs });
      apiCall.mockResolvedValue(failure("NOT_FOUND"));
      await tick(POLL_INTERVAL_MS);
      expect(screen.getByText(GATE)).toBeTruthy();
    });

    it("L3: calls off the read in flight when the acceptance starts and reads nothing until it is answered", async () => {
      room({ ...finished(), rematch: theirs });
      const read = deferred();
      const accept = deferred();
      apiCall.mockImplementation((path: string) => (path.endsWith("/accept") ? accept.promise : read.promise));
      await tick(POLL_INTERVAL_MS);
      const signal = (apiCall.mock.calls[0]![1] as { signal: AbortSignal }).signal;
      expect(signal.aborted).toBe(false);
      await press(screen.getByRole("button", { name: "Przyjmij" }));
      expect(signal.aborted).toBe(true);
      apiCall.mockClear();
      await tick(POLL_INTERVAL_MS * 3);
      expect(reads()).toBe(0);
      // The called-off read comes back as a failure: it is no news and no 404.
      await act(async () => read.resolve(failure("NOT_FOUND")));
      expect(screen.queryByText(GATE)).toBeNull();
      await act(async () => accept.resolve({ ok: true, data: { gameId: "g2" } }));
      expect(push).toHaveBeenCalledWith("/games/g2");
    });

    it("L3: reads again when the acceptance fails", async () => {
      room({ ...finished(), rematch: theirs });
      apiCall.mockImplementation(async (path: string) => (path.endsWith("/accept") ? failure("network") : { ok: true, data: { ...finished(), rematch: theirs } }));
      await press(screen.getByRole("button", { name: "Przyjmij" }));
      apiCall.mockClear();
      await tick(POLL_INTERVAL_MS);
      expect(reads()).toBe(1);
    });

    it("L4: an older read that ends after the player's offer does not take the offer back; a newer read follows", async () => {
      room(finished());
      const old = deferred();
      apiCall.mockReturnValueOnce(old.promise);
      await tick(POLL_INTERVAL_MS);
      apiCall.mockImplementation(async (path: string) =>
        path.endsWith("/rematch") ? { ok: true, data: mineOffer } : { ok: true, data: { ...finished(), rematch: mineOffer } },
      );
      await press(screen.getByRole("button", { name: "Rewanż" }));
      expect(screen.getByTestId("rematch-status").textContent).toContain("Zaproponowano rewanż");
      apiCall.mockClear();
      await act(async () => old.resolve({ ok: true, data: finished() }));
      await tick(0);
      expect(screen.getByTestId("rematch-status").textContent).toContain("Zaproponowano rewanż");
      expect(reads()).toBe(1);
    });
  });
});
