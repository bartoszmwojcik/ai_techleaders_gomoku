// @vitest-environment jsdom
import { SPECTATOR_IDLE_AFTER_MS, SPECTATOR_IDLE_POLL_INTERVAL_MS, SPECTATOR_POLL_INTERVAL_MS } from "@/lib/games/spectate";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

vi.mock("@/components/chat/spectator-chat", () => ({
  SpectatorChat: ({ gameId, canWrite, players, onGone }: { gameId: string; canWrite: boolean; players: unknown[]; onGone: () => void }) => (
    <div data-testid="spectator-chat">
      {`${gameId}:${canWrite}:${players.length}`}
      <button onClick={onGone}>chat gone</button>
    </div>
  ),
}));

import type { SpectatorView } from "@/server/http/spectator-view";

import { SPECTATOR_POLL_TIMEOUT_MS, SpectatorRoom } from "./spectator-room";

vi.setConfig({ testTimeout: 20_000 });

const NO_RESULT = null;
const live = (over: Partial<SpectatorView> = {}): SpectatorView => ({
  status: "active",
  variant: "classic",
  timeControlMs: 600_000,
  moveCount: 1,
  blackSeat: 1,
  turnSeat: 2,
  moves: [112],
  result: NO_RESULT,
  clock: { remainingMs: [590_000, 600_000], running: 2, now: 5_000_000 },
  players: [
    { seat: 1, kind: "account", displayName: "Ala_7" },
    { seat: 2, kind: "guest", displayName: "Kuba" },
  ],
  canChat: true,
  ...over,
});
const over = (): SpectatorView =>
  live({
    status: "finished",
    turnSeat: null,
    moveCount: 2,
    moves: [113],
    result: { winnerSeat: 1, reason: "five_in_row", winLine: [112, 113, 114, 115, 116] },
    clock: { remainingMs: [590_000, 600_000], running: null, now: 5_001_000 },
    finishedAt: "2026-11-02T12:00:00.000Z",
  });
const failure = (code: string) => ({ ok: false, error: { code, message: "x" } });
// The server sends only the moves after `after`: a read that brings no new move has none.
const same = (over: Partial<SpectatorView> = {}) => live({ moves: [], ...over });
const read = (data: SpectatorView) => ({ ok: true, data });
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const room = (initial: SpectatorView) => render(<SpectatorRoom gameId="g1" initial={initial} />);
const hide = (hidden: boolean) =>
  act(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: hidden ? "hidden" : "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
const stones = () => [...document.querySelectorAll("[aria-label]")].filter((b) => /(czarny|biały) kamień/.test(b.getAttribute("aria-label") ?? ""));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiCall.mockReset().mockResolvedValue(read(live()));
});
afterEach(() => {
  hide(false);
  cleanup();
  vi.useRealTimers();
});

describe("SpectatorRoom", () => {
  it("shows the board, both clocks, whose turn it is and that the viewer only watches", () => {
    room(live());
    expect(screen.getByRole("heading", { name: "Oglądasz partię" })).toBeTruthy();
    expect(screen.getByText(/Jesteś widzem/)).toBeTruthy();
    expect(screen.getByText("Ruch białych: Kuba (gość)")).toBeTruthy();
    expect(screen.getByText(/Czarne: Ala_7/)).toBeTruthy();
    expect(screen.getByText(/Białe:/)).toBeTruthy();
    expect(screen.getByText("9:50")).toBeTruthy();
    expect(screen.getByText("10:00")).toBeTruthy();
    expect(stones()).toHaveLength(1);
  });

  it("shows the flag with the number of spectators only while the game is public and on", () => {
    const first = room(live({ audience: { spectators: 4 } }));
    expect(screen.getByTestId("public-flag-count").textContent).toBe("4");
    first.unmount();
    room(live());
    expect(screen.queryByTestId("public-flag")).toBeNull();
  });

  it("shows the QR code of the link only while the game is public and on (BR-53)", () => {
    const first = room(live({ audience: { spectators: 4 } }));
    expect(screen.getByRole("img", { name: "Kod QR z linkiem do oglądania partii" }).getAttribute("src")).toBe("/api/games/g1/qr");
    first.unmount();
    room(live());
    expect(screen.queryByRole("img", { name: "Kod QR z linkiem do oglądania partii" })).toBeNull();
  });

  it("updates the counter from the poll and drops the flag when the audience is closed", async () => {
    room(live({ audience: { spectators: 2 } }));
    apiCall.mockResolvedValue(read(same({ audience: { spectators: 1 } })));
    await tick(SPECTATOR_POLL_INTERVAL_MS);
    expect(screen.getByTestId("public-flag-count").textContent).toBe("1");
    apiCall.mockResolvedValue(read(same()));
    await tick(SPECTATOR_POLL_INTERVAL_MS);
    expect(screen.queryByTestId("public-flag")).toBeNull();
  });

  it("has the chat of a spectator, told whether they may write", () => {
    const first = room(live());
    expect(screen.getByTestId("spectator-chat").textContent).toBe("g1:true:2chat gone");
    first.unmount();
    room(live({ canChat: false }));
    expect(screen.getByTestId("spectator-chat").textContent).toBe("g1:false:2chat gone");
  });

  it("asks the server what happened when the chat finds the game gone: the access ended", async () => {
    room(live());
    apiCall.mockResolvedValue(failure("NOT_FOUND"));
    await act(async () => screen.getByText("chat gone").click());
    expect(screen.getByText("Oglądanie wygasło albo partii już nie ma")).toBeTruthy();
  });

  it("shows the closed audience when the creator closed it: at the poll, and when the chat found out first (BR-43)", async () => {
    const first = room(live());
    apiCall.mockResolvedValue(failure("AUDIENCE_CLOSED"));
    await tick(SPECTATOR_POLL_INTERVAL_MS);
    expect(screen.getByTestId("audience-closed")).toBeTruthy();
    expect(screen.queryByTestId("spectator-chat")).toBeNull();
    expect(document.querySelector("[role=grid]")).toBeNull();
    await tick(SPECTATOR_POLL_INTERVAL_MS * 3);
    expect(apiCall).toHaveBeenCalledTimes(1);
    first.unmount();
    room(over());
    await act(async () => screen.getByText("chat gone").click());
    expect(screen.getByTestId("audience-closed")).toBeTruthy();
  });

  it("has no control of a player: no move, resignation, rematch or switch (the board is read-only)", () => {
    room(live());
    expect(screen.queryByRole("button", { name: /Poddaj|Postaw|Rewan|Wyślij/ })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector('[aria-readonly="true"]')).toBeTruthy();
    // Pressing an intersection sends nothing.
    (document.querySelector("[aria-label^='Kolumna A, rząd 1']") as HTMLElement | null)?.click();
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("orders the clocks by colour, black first, whatever the seat", () => {
    room(live({ blackSeat: 2, turnSeat: 1 }));
    const text = document.body.textContent!;
    expect(text.indexOf("Czarne: Kuba")).toBeGreaterThan(-1);
    expect(text.indexOf("Czarne: Kuba")).toBeLessThan(text.indexOf("Białe: Ala_7"));
  });

  it("reads only the new moves every 2 s and merges them", async () => {
    room(live());
    apiCall.mockResolvedValue(read(live({ moveCount: 2, moves: [113], turnSeat: 1 })));
    await tick(SPECTATOR_POLL_INTERVAL_MS);
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/spectate?after=1", { method: "GET", signal: expect.any(AbortSignal) });
    expect(stones()).toHaveLength(2);
    expect(screen.getByText("Ruch czarnych: Ala_7")).toBeTruthy();
    await tick(SPECTATOR_POLL_INTERVAL_MS);
    expect(apiCall).toHaveBeenLastCalledWith("/api/games/g1/spectate?after=2", expect.anything());
  });

  it("slows down to 5 s after a quiet minute and speeds up again with the next move", async () => {
    room(live());
    apiCall.mockResolvedValue(read(same()));
    await tick(SPECTATOR_IDLE_AFTER_MS);
    const before = apiCall.mock.calls.length;
    expect(before).toBe(Math.floor(SPECTATOR_IDLE_AFTER_MS / SPECTATOR_POLL_INTERVAL_MS));
    await tick(SPECTATOR_IDLE_POLL_INTERVAL_MS * 2);
    expect(apiCall.mock.calls.length - before).toBe(2);
    apiCall.mockResolvedValue(read(live({ moveCount: 2, moves: [113], turnSeat: 1 })));
    await tick(SPECTATOR_IDLE_POLL_INTERVAL_MS);
    const after = apiCall.mock.calls.length;
    await tick(SPECTATOR_POLL_INTERVAL_MS * 2);
    expect(apiCall.mock.calls.length - after).toBe(2);
  });

  it("shows the result of a game that ends and stops reading it", async () => {
    room(live());
    apiCall.mockResolvedValue(read(over()));
    await tick(SPECTATOR_POLL_INTERVAL_MS);
    expect(screen.getByRole("heading", { name: "Koniec partii" })).toBeTruthy();
    expect(screen.getByText("Wygrały czarne: Ala_7")).toBeTruthy();
    expect(stones()).toHaveLength(2);
    expect(apiCall).toHaveBeenCalledTimes(1);
    await tick(SPECTATOR_POLL_INTERVAL_MS * 5);
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it("is quiet about a failed read of a finished game", () => {
    room(over());
    expect(screen.queryByText(/Ponawiamy/)).toBeNull();
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("counts failed reads, shows a line and then the banner, and recovers", async () => {
    room(live());
    apiCall.mockResolvedValue(failure("network"));
    await tick(SPECTATOR_POLL_INTERVAL_MS);
    expect(screen.getByText("Ponawiamy sprawdzanie stanu partii (próba 1 z 3).")).toBeTruthy();
    await tick(SPECTATOR_POLL_INTERVAL_MS * 2);
    expect(screen.getByText("Nie udało się sprawdzić stanu partii. Ponawiamy próby.")).toBeTruthy();
    apiCall.mockResolvedValue(read(same()));
    await act(async () => screen.getByText("Sprawdź teraz").closest("button")!.click());
    await tick(0);
    expect(screen.queryByText(/Nie udało się sprawdzić/)).toBeNull();
    expect(screen.queryByText(/Ponawiamy/)).toBeNull();
  });

  it("does not start a second read while one is in flight, not even on coming back to the tab", async () => {
    room(live());
    apiCall.mockReturnValue(new Promise(() => {}));
    await tick(SPECTATOR_POLL_INTERVAL_MS * 3);
    expect(apiCall).toHaveBeenCalledTimes(1);
    hide(true);
    hide(false);
    await tick(0);
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it("plans nothing when the read in flight ends after the tab was hidden", async () => {
    room(live());
    let answer: (value: unknown) => void = () => {};
    apiCall.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await tick(SPECTATOR_POLL_INTERVAL_MS);
    expect(apiCall).toHaveBeenCalledTimes(1);
    hide(true);
    answer(read(same()));
    await tick(SPECTATOR_POLL_INTERVAL_MS * 4);
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it("says the watching is over when the server no longer knows the spectator", async () => {
    room(live());
    apiCall.mockResolvedValue(failure("NOT_FOUND"));
    await tick(SPECTATOR_POLL_INTERVAL_MS);
    expect(screen.getByText("Oglądanie wygasło albo partii już nie ma")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Masz kod? Wpisz go ponownie" }).getAttribute("href")).toBe("/join");
    await tick(SPECTATOR_POLL_INTERVAL_MS * 3);
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it("shows a cancelled game as such and does not read it", async () => {
    room(live({ status: "cancelled", turnSeat: null, blackSeat: null, moves: [], moveCount: 0 }));
    expect(screen.getByRole("heading", { name: "Partia anulowana" })).toBeTruthy();
    await tick(SPECTATOR_POLL_INTERVAL_MS * 2);
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("pauses in a hidden tab and reads the state at once on coming back", async () => {
    room(live());
    apiCall.mockResolvedValue(read(same()));
    hide(true);
    await tick(SPECTATOR_POLL_INTERVAL_MS * 3);
    expect(apiCall).not.toHaveBeenCalled();
    hide(false);
    await tick(0);
    expect(apiCall).toHaveBeenCalledTimes(1);
    await tick(SPECTATOR_POLL_INTERVAL_MS);
    expect(apiCall).toHaveBeenCalledTimes(2);
  });

  it("does not read after coming back to a game that is over or gone", async () => {
    room(live());
    hide(true);
    apiCall.mockResolvedValue(failure("NOT_FOUND"));
    hide(false);
    await tick(0);
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Oglądanie wygasło albo partii już nie ma")).toBeTruthy();
    hide(true);
    hide(false);
    await tick(SPECTATOR_POLL_INTERVAL_MS);
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it("returns to a finished game without reading", async () => {
    room(live());
    apiCall.mockResolvedValue(read(over()));
    await tick(SPECTATOR_POLL_INTERVAL_MS);
    hide(true);
    hide(false);
    await tick(0);
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it("reads the state the moment the running clock reaches zero: only the server ends the game", async () => {
    room(live());
    // The first regular read brings a clock with 1.5 s left; it runs out before the next regular read (at 4 s).
    apiCall.mockResolvedValue(read(same({ clock: { remainingMs: [590_000, 1_500], running: 2, now: 5_002_000 } })));
    await tick(SPECTATOR_POLL_INTERVAL_MS);
    expect(apiCall).toHaveBeenCalledTimes(1);
    apiCall.mockResolvedValue(
      read(
        live({
          status: "finished",
          turnSeat: null,
          moves: [],
          result: { winnerSeat: 1, reason: "timeout", winLine: null },
          clock: { remainingMs: [590_000, 0], running: null, now: 5_003_100 },
        }),
      ),
    );
    await tick(1_600);
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Wygrały czarne: Ala_7")).toBeTruthy();
  });

  it.each([-6 * 60_000, 6 * 60_000])("counts the clock against the server's time, not the device's (offset %i ms)", async (offset) => {
    vi.setSystemTime(Date.now() + offset);
    apiCall.mockReturnValue(new Promise(() => {}));
    room(live());
    expect(screen.getByText("10:00")).toBeTruthy();
    await tick(10_000);
    // Ten seconds of the browser's monotonic time were ten seconds of the white clock, wherever the wall clock is.
    expect(screen.getAllByText("9:50")).toHaveLength(2);
  });

  it("gives every read a timeout so one hung request cannot stop the polling", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    room(live());
    await tick(SPECTATOR_POLL_INTERVAL_MS);
    expect(timeout).toHaveBeenCalledWith(SPECTATOR_POLL_TIMEOUT_MS);
    timeout.mockRestore();
  });

  it("calls the read off when its timeout fires (the timer is injected, not the real 8 s)", async () => {
    const expiry = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(expiry.signal);
    room(live());
    apiCall.mockReturnValue(new Promise(() => {}));
    await tick(SPECTATOR_POLL_INTERVAL_MS);
    const signal = (apiCall.mock.calls[0]![1] as { signal: AbortSignal }).signal;
    expect(signal.aborted).toBe(false);
    expiry.abort();
    expect(signal.aborted).toBe(true);
    timeout.mockRestore();
  });

  it("names an agent by what it declared and never shows an id or e-mail", () => {
    room(
      live({
        players: [
          { seat: 1, kind: "account", displayName: "Ala_7" },
          { seat: 2, kind: "agent", displayName: null, agentName: "Claude" },
        ],
      }),
    );
    expect(document.body.textContent).toContain("Agent · Claude (deklarowane)");
    expect(document.body.textContent).not.toMatch(/@|token|kod zaproszenia/i);
  });
});

describe("SpectatorRoom, the paper game (E11)", () => {
  const at = "2026-11-03T10:00:00.000Z";
  const sheet = (over: Partial<NonNullable<SpectatorView["paper"]>> = {}) => ({
    moveCount: 2,
    moves: [
      { n: 1, x: 50, y: 50, seat: 1 as const, auto: false, at },
      { n: 2, x: 51, y: 50, seat: 2 as const, auto: false, at },
    ],
    scores: [2, 1] as [number, number],
    fives: [],
    autoSeat: null,
    autoMoveAt: null,
    ...over,
  });
  const paperLive = (over: Partial<SpectatorView> = {}, paper = sheet()) =>
    live({ variant: "paper", timeControlMs: 180_000, moveCount: 2, moves: [], turnSeat: 1, paper, clock: { remainingMs: [100_000, 90_000], running: 1, now: 5_000_000 }, ...over });

  it("draws the sheet with the points at the clocks and the automat marked", () => {
    room(paperLive({}, sheet({ autoSeat: 2 })));
    expect(document.querySelector('[aria-label="Plansza bez granic, papier i ołówek"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Plansza 15 na 15"]')).toBeNull();
    expect(screen.getByText(/Krzyżyk: Ala_7/).textContent).toContain("punkty: 2");
    expect(screen.getByText(/Kółko:/).parentElement?.textContent).toContain("punkty: 1 · Automat");
  });

  it("names the turn and the sides by mark, with the marks on screen and no colours or stones", () => {
    room(paperLive());
    expect(screen.getByText("Ruch krzyżyka: Ala_7")).toBeTruthy();
    expect(document.querySelectorAll('[role="grid"] svg path, [role="grid"] svg circle').length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector('[role="status"] svg')).not.toBeNull();
    expect(document.querySelector('[aria-label="Pole 0, 0, krzyżyk, ostatni ruch"], [aria-label^="Pole 0, 0, krzyżyk"]')).not.toBeNull();
    expect(document.querySelector('[aria-label^="Pole 1, 0, kółko"]')).not.toBeNull();
    expect(document.querySelector("main")?.textContent).not.toMatch(/kamie|czarn|biał/i);
  });

  it("announces the result with the points, the winner's first", () => {
    room(paperLive({ status: "finished", turnSeat: null, result: { winnerSeat: 1, reason: "points", winLine: null, scores: [7, 5] } }));
    expect(screen.getByText("Wygrał krzyżyk: Ala_7 · 7 : 5")).toBeTruthy();
  });

  it("reads on from the number of paper moves", async () => {
    room(paperLive());
    apiCall.mockResolvedValue(read(paperLive()));
    await tick(SPECTATOR_POLL_INTERVAL_MS);
    expect(apiCall.mock.calls[0]![0]).toBe("/api/games/g1/spectate?after=2");
  });

  it("does not guess the board of a variant it does not know", () => {
    room(live({ variant: "future" as never }));
    expect(screen.getByRole("alert").textContent).toContain("Odśwież stronę");
  });
});
