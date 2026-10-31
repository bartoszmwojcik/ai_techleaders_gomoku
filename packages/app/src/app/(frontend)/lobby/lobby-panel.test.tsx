// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import type { LobbyData } from "@/lib/games/lobby";

import { LOBBY_FAILURES_BEFORE_ERROR, LOBBY_POLL_INTERVAL_MS, LobbyPanel } from "./lobby-panel";

const seeker = (name: string, sinceMs = 60_000, expiresInMs = 240_000) => ({
  id: `id-${name}`,
  displayName: name,
  sinceMs,
  expiresInMs,
});
const lobby = (over: Partial<LobbyData> = {}): LobbyData => ({
  me: null,
  currentGame: null,
  seekers: [seeker("Alicja_99"), seeker("czarny_kamień", 190_000, 48_000)],
  ...over,
});
const ok = (data: unknown) => ({ ok: true, data });
const fail = (code: string, extra: Record<string, unknown> = {}) => ({
  ok: false,
  error: { code, message: "x", ...extra },
});
const failedRead = () => fail("network");

const mark = () => screen.getAllByRole("button", { name: "Szukam przeciwnika" })[0]!;
const flush = () => act(async () => undefined);
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const click = (element: HTMLElement) => act(async () => void fireEvent.click(element));

function setVisibility(state: "hidden" | "visible") {
  act(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  apiCall.mockReset().mockResolvedValue(ok(lobby()));
  push.mockReset();
});
afterEach(() => {
  cleanup();
  setVisibility("visible");
  vi.useRealTimers();
});

describe("LobbyPanel: what is shown", () => {
  it("shows the others: names, since, time left and a pick button each", () => {
    render(<LobbyPanel initial={lobby()} />);

    expect(screen.getByRole("heading", { name: "Lobby" })).toBeTruthy();
    const list = screen.getByRole("list", { name: "Gracze szukający gry" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(list).getByText("Alicja_99")).toBeTruthy();
    expect(within(list).getByText("szuka od 1 min")).toBeTruthy();
    expect(within(list).getByText("4:00")).toBeTruthy();
    expect(within(list).getByText("szuka od 3 min")).toBeTruthy();
    expect(within(list).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Zagraj z Alicja_99",
      "Zagraj z czarny_kamień",
    ]);
    // The own status is not set: the way to set it is one button.
    expect(mark()).toBeTruthy();
    expect(screen.queryByText("Szukasz gry")).toBeNull();
  });

  it("shows the own status with the countdown and a withdraw button", () => {
    render(<LobbyPanel initial={lobby({ me: { id: "me", expiresInMs: 272_000 } })} />);

    expect(screen.getByText("Szukasz gry")).toBeTruthy();
    expect(screen.getByText("4:32")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wycofaj" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Szukam przeciwnika" })).toBeNull();
  });

  it("explains the empty list, with the mark button, when the user is not seeking", () => {
    render(<LobbyPanel initial={lobby({ seekers: [] })} />);

    expect(screen.getByText("Nikt teraz nie szuka gry")).toBeTruthy();
    expect(screen.getByText(/pojawisz się tu na 5 minut/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Szukam przeciwnika" })).toHaveLength(2);
  });

  it("explains the empty list differently while the user seeks, without a second mark button", () => {
    render(<LobbyPanel initial={lobby({ seekers: [], me: { id: "me", expiresInMs: 100_000 } })} />);

    expect(screen.getByText(/Gdy ktoś inny się oznaczy/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Szukam przeciwnika" })).toBeNull();
  });

  it("says 'you already have a game' with a way back, and offers no marking (BR-13)", () => {
    render(<LobbyPanel initial={lobby({ currentGame: { gameId: "g1", status: "active" } })} />);

    expect(screen.getByText("Masz już partię")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wróć do swojej partii" }).getAttribute("href")).toBe("/games/g1");
    expect(screen.queryByRole("button", { name: "Szukam przeciwnika" })).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("LobbyPanel: countdowns", () => {
  it("counts down the own status and the rows, and drops a row that ran out", async () => {
    render(<LobbyPanel initial={lobby({ me: { id: "me", expiresInMs: 100_000 }, seekers: [seeker("Krótki", 0, 2_500)] })} />);
    // Reads would replace the data; this test is about the local countdown only.
    apiCall.mockReturnValue(new Promise(() => undefined));

    expect(screen.getByText("1:40")).toBeTruthy();
    expect(screen.getByText("0:03")).toBeTruthy();
    await advance(1000);
    expect(screen.getByText("1:39")).toBeTruthy();
    expect(screen.getByText("0:02")).toBeTruthy();
    await advance(2000);
    expect(screen.queryByText("Krótki")).toBeNull();
    expect(screen.getByText("Nikt teraz nie szuka gry")).toBeTruthy();
  });

  it("brings the mark button back at once when the own status runs out, says so, and asks the server", async () => {
    apiCall.mockResolvedValue(ok(lobby({ me: null, seekers: [] })));
    render(<LobbyPanel initial={lobby({ me: { id: "me", expiresInMs: 1_500 } })} />);

    await advance(1000);
    expect(screen.getByText("Szukasz gry")).toBeTruthy();
    await advance(1000);

    expect(screen.queryByText("Szukasz gry")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Status wygasł");
    expect(mark()).toBeTruthy();
    expect(apiCall).toHaveBeenCalledWith("/api/lobby", expect.objectContaining({ method: "GET" }));
  });

  it("says the status ran out when a read finds none (the read beat the countdown, or the tab was frozen)", async () => {
    apiCall.mockResolvedValue(ok(lobby({ me: null, seekers: [] })));
    render(<LobbyPanel initial={lobby({ me: { id: "me", expiresInMs: 200_000 }, seekers: [] })} />);

    await advance(LOBBY_POLL_INTERVAL_MS);

    expect(screen.getByRole("status").textContent).toContain("Status wygasł");
    expect(mark()).toBeTruthy();
  });

  it("says nothing when the player has no status and a read finds none", async () => {
    apiCall.mockResolvedValue(ok(lobby({ me: null, seekers: [] })));
    render(<LobbyPanel initial={lobby({ me: null, seekers: [] })} />);

    await advance(LOBBY_POLL_INTERVAL_MS);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("rebases the countdown on every answer of the server", async () => {
    apiCall.mockResolvedValue(ok(lobby({ me: { id: "me", expiresInMs: 250_000 }, seekers: [] })));
    render(<LobbyPanel initial={lobby({ me: { id: "me", expiresInMs: 100_000 }, seekers: [] })} />);

    await advance(LOBBY_POLL_INTERVAL_MS);

    expect(screen.getByText("4:10")).toBeTruthy();
  });
});

describe("LobbyPanel: polling", () => {
  it("reads every 3 s while the tab is visible and shows what the others did", async () => {
    render(<LobbyPanel initial={lobby({ seekers: [] })} />);
    expect(apiCall).not.toHaveBeenCalled();
    apiCall.mockResolvedValue(ok(lobby({ seekers: [seeker("Nowy")] })));

    await advance(LOBBY_POLL_INTERVAL_MS);

    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(apiCall.mock.calls[0]![0]).toBe("/api/lobby");
    expect(apiCall.mock.calls[0]![1]).toMatchObject({ method: "GET" });
    expect(screen.getByText("Nowy")).toBeTruthy();
    await advance(LOBBY_POLL_INTERVAL_MS);
    expect(apiCall).toHaveBeenCalledTimes(2);
  });

  it("stops while the tab is hidden and reads at once when it comes back", async () => {
    render(<LobbyPanel initial={lobby()} />);

    setVisibility("hidden");
    await advance(10_000);
    expect(apiCall).not.toHaveBeenCalled();
    setVisibility("visible");
    await flush();

    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it("does not start a read while another is in flight", async () => {
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<LobbyPanel initial={lobby()} />);

    await advance(LOBBY_POLL_INTERVAL_MS * 3);
    expect(apiCall).toHaveBeenCalledTimes(1);
    await act(async () => finish(ok(lobby())));
    await advance(LOBBY_POLL_INTERVAL_MS);
    expect(apiCall).toHaveBeenCalledTimes(2);
  });

  it("shows the error state after repeated failures, and a retry shows the skeleton, then the list", async () => {
    apiCall.mockResolvedValue(failedRead());
    render(<LobbyPanel initial={lobby()} />);

    await advance(LOBBY_POLL_INTERVAL_MS);
    expect(screen.queryByText("Nie udało się wczytać lobby")).toBeNull();
    expect(screen.getByText("Alicja_99")).toBeTruthy();
    for (let i = 1; i < LOBBY_FAILURES_BEFORE_ERROR; i++) await advance(LOBBY_POLL_INTERVAL_MS);
    expect(screen.getByRole("alert").textContent).toContain("Nie udało się wczytać lobby");

    let finish!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(screen.getByText("Ładowanie lobby")).toBeTruthy();
    await act(async () => finish(ok(lobby({ seekers: [seeker("Wrócił")] }))));

    expect(screen.queryByText("Ładowanie lobby")).toBeNull();
    expect(screen.queryByText("Nie udało się wczytać lobby")).toBeNull();
    expect(screen.getByText("Wrócił")).toBeTruthy();
  });

  it("tells a user whose session ended to sign in again", async () => {
    apiCall.mockResolvedValue(fail("UNAUTHORIZED"));
    render(<LobbyPanel initial={lobby()} />);

    await advance(LOBBY_POLL_INTERVAL_MS);

    expect(screen.getByText("Sesja wygasła")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Zaloguj się ponownie" }).getAttribute("href")).toBe("/login?next=%2Flobby");
  });
});

describe("LobbyPanel: marking", () => {
  const status = { id: "me", createdAt: "2026-10-31T12:00:00Z", expiresInMs: 300_000 };

  it("sets the status, shows the countdown and reads the list", async () => {
    apiCall.mockImplementation(async (path: string) =>
      path === "/api/lobby/seeking" ? ok({ me: status }) : ok(lobby({ me: { id: "me", expiresInMs: 299_000 } })),
    );
    render(<LobbyPanel initial={lobby()} />);

    await click(mark());

    expect(apiCall).toHaveBeenCalledWith("/api/lobby/seeking", { method: "PUT" });
    expect(screen.getByText("Szukasz gry")).toBeTruthy();
    expect(screen.getByText("4:59")).toBeTruthy();
    expect(apiCall).toHaveBeenCalledWith("/api/lobby", expect.objectContaining({ method: "GET" }));
  });

  it("sends one request for a double click", async () => {
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    render(<LobbyPanel initial={lobby()} />);
    const button = mark();

    await act(async () => {
      // Two clicks in one batch: React has not re-rendered the busy state between them.
      button.click();
      button.click();
    });
    expect((mark() as HTMLButtonElement).disabled).toBe(true);
    expect(apiCall).toHaveBeenCalledTimes(1);
    await act(async () => finish(ok({ me: status })));
  });

  it("switches to 'you already have a game' when the server refuses with the game (BR-13)", async () => {
    apiCall.mockResolvedValue(fail("ACTIVE_GAME_EXISTS", { data: { gameId: "g9" } }));
    render(<LobbyPanel initial={lobby()} />);

    await click(mark());

    expect(screen.getByText("Masz już partię")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wróć do swojej partii" }).getAttribute("href")).toBe("/games/g9");
  });

  it("treats a refusal without the game as an ordinary server error", async () => {
    apiCall.mockResolvedValue(fail("ACTIVE_GAME_EXISTS"));
    render(<LobbyPanel initial={lobby()} />);

    await click(mark());

    expect(screen.getByRole("alert").textContent).toContain("Nie udało się oznaczyć");
    expect(mark()).toBeTruthy();
  });

  it.each([
    [fail("RATE_LIMITED", { retryAfterSeconds: 90 }), "Zbyt wiele prób", "Spróbuj ponownie za 2 min."],
    [fail("network"), "Brak połączenia", "Nie udało się połączyć z serwerem."],
    [fail("INTERNAL"), "Nie udało się oznaczyć", "Błąd po stronie serwera."],
    [fail("UNAUTHORIZED"), "Sesja wygasła", "Zaloguj się ponownie"],
  ])("explains a failed mark (%#) and lets the player try again", async (answer, title, text) => {
    apiCall.mockResolvedValue(answer);
    render(<LobbyPanel initial={lobby()} />);

    await click(mark());

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(title);
    expect(alert.textContent).toContain(text);
    expect((mark() as HTMLButtonElement).disabled).toBe(false);
  });

  it("drops an old read that finished after the player's own action", async () => {
    let finishRead!: (value: unknown) => void;
    apiCall.mockImplementation((path: string) =>
      path === "/api/lobby" ? new Promise((resolve) => (finishRead = resolve)) : Promise.resolve(ok({ me: status })),
    );
    render(<LobbyPanel initial={lobby()} />);
    await advance(LOBBY_POLL_INTERVAL_MS); // a read begins, with no status in its answer
    await click(mark());
    expect(screen.getByText("Szukasz gry")).toBeTruthy();

    await act(async () => finishRead(ok(lobby({ me: null, seekers: [] }))));

    expect(screen.getByText("Szukasz gry")).toBeTruthy();
  });
});

describe("LobbyPanel: withdrawing", () => {
  const seeking = () => lobby({ me: { id: "me", expiresInMs: 200_000 } });

  it("withdraws, brings the mark button back and reads the list", async () => {
    apiCall.mockImplementation(async (path: string) =>
      path === "/api/lobby/seeking" ? ok({ me: null }) : ok(lobby({ me: null })),
    );
    render(<LobbyPanel initial={seeking()} />);

    await click(screen.getByRole("button", { name: "Wycofaj" }));

    expect(apiCall).toHaveBeenCalledWith("/api/lobby/seeking", { method: "DELETE" });
    expect(screen.queryByText("Szukasz gry")).toBeNull();
    expect(mark()).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("sends one request for a double click", async () => {
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    render(<LobbyPanel initial={seeking()} />);
    const button = screen.getByRole("button", { name: "Wycofaj" });

    await act(async () => {
      button.click();
      button.click();
    });

    expect(apiCall).toHaveBeenCalledTimes(1);
    await act(async () => finish(ok({ me: null })));
  });

  it("keeps the status and says so when the withdrawal fails", async () => {
    apiCall.mockResolvedValue(fail("INTERNAL"));
    render(<LobbyPanel initial={seeking()} />);

    await click(screen.getByRole("button", { name: "Wycofaj" }));

    expect(screen.getByRole("alert").textContent).toContain("Nie udało się wycofać");
    expect(screen.getByText("Szukasz gry")).toBeTruthy();
  });

  it("tells a user whose session ended to sign in again", async () => {
    apiCall.mockResolvedValue(fail("UNAUTHORIZED"));
    render(<LobbyPanel initial={seeking()} />);

    await click(screen.getByRole("button", { name: "Wycofaj" }));

    expect(screen.getByText("Sesja wygasła")).toBeTruthy();
  });
});

describe("LobbyPanel: picking an opponent (#26)", () => {
  const pickButton = (name: string) => screen.getByRole("button", { name: `Zagraj z ${name}` }) as HTMLButtonElement;
  const pickPath = "/api/lobby/seekers/id-Alicja_99/pick";

  it("picks the seeker with one POST and goes to the new game", async () => {
    apiCall.mockImplementation(async (path: string) =>
      path === pickPath ? ok({ gameId: "g1" }) : ok(lobby()),
    );
    render(<LobbyPanel initial={lobby()} />);

    await click(pickButton("Alicja_99"));

    expect(apiCall).toHaveBeenCalledWith(pickPath, { method: "POST" });
    expect(push).toHaveBeenCalledExactlyOnceWith("/games/g1");
  });

  it("sends one request for a double click, shows the row busy and locks the other rows", async () => {
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    render(<LobbyPanel initial={lobby()} />);
    const button = pickButton("Alicja_99");

    await act(async () => {
      button.click();
      button.click();
    });

    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(pickButton("czarny_kamień").disabled).toBe(true);
    expect(pickButton("czarny_kamień").getAttribute("aria-busy")).toBeNull();
    await act(async () => finish(ok({ gameId: "g1" })));
    // The page is being left: nothing can be picked meanwhile.
    expect(pickButton("czarny_kamień").disabled).toBe(true);
  });

  it.each(["LOBBY_SEEKER_TAKEN", "CANNOT_PICK_SELF"])(
    "says the player was taken (%s), refreshes the list at once and unlocks the buttons",
    async (code) => {
      apiCall.mockImplementation(async (path: string) =>
        path === pickPath ? fail(code) : ok(lobby({ seekers: [seeker("czarny_kamień")] })),
      );
      render(<LobbyPanel initial={lobby()} />);

      await click(pickButton("Alicja_99"));

      expect(screen.getByRole("alert").textContent).toContain("Ten gracz zagrał już z kimś innym. Wybierz kogoś innego z listy.");
      expect(push).not.toHaveBeenCalled();
      expect(apiCall).toHaveBeenLastCalledWith("/api/lobby", expect.objectContaining({ method: "GET" }));
      expect(screen.queryByText("Alicja_99")).toBeNull();
      expect(pickButton("czarny_kamień").disabled).toBe(false);
    },
  );

  it("says the status of the player ran out, as a status", async () => {
    apiCall.mockImplementation(async (path: string) =>
      path === pickPath ? fail("LOBBY_SEEKER_EXPIRED") : ok(lobby({ seekers: [seeker("czarny_kamień")] })),
    );
    render(<LobbyPanel initial={lobby()} />);

    await click(pickButton("Alicja_99"));

    expect(screen.getByRole("status").textContent).toContain("Status tego gracza wygasł.");
    expect(push).not.toHaveBeenCalled();
  });

  it("switches to 'you already have a game' when the picker holds one (BR-13)", async () => {
    apiCall.mockImplementation(async (path: string) =>
      path === pickPath ? fail("ACTIVE_GAME_EXISTS", { data: { gameId: "g9" } }) : ok(lobby()),
    );
    render(<LobbyPanel initial={lobby()} />);

    await click(pickButton("Alicja_99"));

    expect(screen.getByText("Masz już partię")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wróć do swojej partii" }).getAttribute("href")).toBe("/games/g9");
    expect(push).not.toHaveBeenCalled();
  });

  it.each([
    [fail("RATE_LIMITED", { retryAfterSeconds: 90 }), "Zbyt wiele prób"],
    [fail("UNAUTHORIZED"), "Sesja wygasła"],
    [fail("network"), "Nie udało się rozpocząć partii"],
    [fail("INTERNAL"), "Nie udało się rozpocząć partii"],
    [fail("ACTIVE_GAME_EXISTS"), "Nie udało się rozpocząć partii"],
  ])("explains another refusal (%#) and lets the player pick again", async (answer, title) => {
    apiCall.mockImplementation(async (path: string) => (path === pickPath ? answer : ok(lobby())));
    render(<LobbyPanel initial={lobby()} />);

    await click(pickButton("Alicja_99"));

    expect(screen.getByRole("alert").textContent).toContain(title);
    expect(pickButton("Alicja_99").disabled).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("sends the player picked by somebody else to the game when a read finds it", async () => {
    render(<LobbyPanel initial={lobby({ me: { id: "me", expiresInMs: 200_000 } })} />);
    apiCall.mockResolvedValue(ok(lobby({ me: null, currentGame: { gameId: "g7", status: "active" } })));

    await advance(LOBBY_POLL_INTERVAL_MS);
    await advance(LOBBY_POLL_INTERVAL_MS);

    expect(push).toHaveBeenCalledExactlyOnceWith("/games/g7");
  });

  it("does not redirect a player who opened the page with a game already", async () => {
    render(<LobbyPanel initial={lobby({ currentGame: { gameId: "g7", status: "active" } })} />);
    apiCall.mockResolvedValue(ok(lobby({ currentGame: { gameId: "g7", status: "active" } })));

    await advance(LOBBY_POLL_INTERVAL_MS);

    expect(push).not.toHaveBeenCalled();
  });
});
