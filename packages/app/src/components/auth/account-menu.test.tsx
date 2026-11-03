// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replace, apiCall } = vi.hoisted(() => ({ replace: vi.fn(), apiCall: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import { AccountMenu } from "./account-menu";

const LABEL = "Zalogowano jako Ala_7, menu konta";
const trigger = () => screen.getByRole("button", { name: LABEL });

/** Answers the lobby read and the logout separately. */
function answers(lobby: unknown, logout: unknown = { ok: true, data: null }) {
  apiCall.mockImplementation(async (path: string) => (path === "/api/lobby" ? lobby : logout));
}
const noGame = { ok: true, data: { currentGame: null } };
const activeGame = { ok: true, data: { currentGame: { gameId: "g1", status: "active" } } };
const logoutCalls = () => apiCall.mock.calls.filter(([path]) => path === "/api/auth/logout").length;

async function chooseLogout() {
  await userEvent.click(trigger());
  await userEvent.click(await screen.findByRole("menuitem", { name: "Wyloguj" }));
}

beforeEach(() => {
  replace.mockReset();
  vi.stubGlobal("location", { replace, origin: "https://gomoku.example" });
  apiCall.mockReset();
  answers(noGame);
});
afterEach(cleanup);

describe("AccountMenu", () => {
  it("names the player, for a screen reader in a whole sentence, and links to the account and the history", async () => {
    render(<AccountMenu displayName="Ala_7" />);
    expect(trigger().textContent).toBe("Ala_7");
    expect(trigger().getAttribute("data-testid")).toBe("signed-in-as");

    await userEvent.click(trigger());
    expect(screen.getByRole("menuitem", { name: "Konto" }).getAttribute("href")).toBe("/account");
    expect(screen.getByRole("menuitem", { name: "Historia" }).getAttribute("href")).toBe("/history");
  });

  it("reads the game when logout is chosen, and logs out at once when none runs, also while waiting for an opponent", async () => {
    answers({ ok: true, data: { currentGame: { gameId: "g1", status: "waiting" } } });
    render(<AccountMenu displayName="Ala_7" />);
    await chooseLogout();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://gomoku.example/"));
    expect(apiCall).toHaveBeenCalledWith("/api/lobby", { method: "GET", signal: expect.any(AbortSignal) });
    expect(apiCall).toHaveBeenCalledWith("/api/auth/logout");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("logs out at once with no game at all", async () => {
    render(<AccountMenu displayName="Ala_7" />);
    await chooseLogout();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://gomoku.example/"));
    expect(logoutCalls()).toBe(1);
  });

  it("logs out at once when the session has already expired", async () => {
    answers({ ok: false, error: { code: "UNAUTHORIZED", message: "x" } });
    render(<AccountMenu displayName="Ala_7" />);
    await chooseLogout();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://gomoku.example/"));
  });

  it("asks during a running game, stays on cancel with focus on the button, and logs out on confirmation", async () => {
    answers(activeGame);
    render(<AccountMenu displayName="Ala_7" />);
    await chooseLogout();

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Trwa partia — po wylogowaniu zegar biegnie dalej. Wylogować?");
    expect(logoutCalls()).toBe(0);

    await userEvent.click(screen.getByRole("button", { name: "Zostań zalogowany" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(logoutCalls()).toBe(0);
    await waitFor(() => expect(document.activeElement).toBe(trigger()));

    await chooseLogout();
    const again = await screen.findByRole("alertdialog");
    await userEvent.click(within(again).getByRole("button", { name: "Wyloguj" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://gomoku.example/"));
    expect(logoutCalls()).toBe(1);
  });

  it("asks when the game cannot be read, without claiming that one runs", async () => {
    answers({ ok: false, error: { code: "network", message: "x" } });
    render(<AccountMenu displayName="Ala_7" />);
    await chooseLogout();

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Nie udało się sprawdzić, czy trwa partia.");
    expect(dialog.textContent).not.toContain("Trwa partia");
    expect(logoutCalls()).toBe(0);
  });

  it("does not report an earlier failed logout when asking again", async () => {
    answers(activeGame, { ok: false, error: { code: "network", message: "x" } });
    render(<AccountMenu displayName="Ala_7" />);
    await chooseLogout();
    let dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Wyloguj" }));
    await within(dialog).findByRole("alert");
    await userEvent.click(within(dialog).getByRole("button", { name: "Zostań zalogowany" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    await chooseLogout();
    dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("shows a failed logout in the dialog and retries from there", async () => {
    answers(noGame, { ok: false, error: { code: "network", message: "x" } });
    render(<AccountMenu displayName="Ala_7" />);
    await chooseLogout();

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("alert").textContent).toBe("Nie udało się wylogować. Spróbuj ponownie.");
    expect(replace).not.toHaveBeenCalled();

    answers(noGame);
    await userEvent.click(within(dialog).getByRole("button", { name: "Wyloguj" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://gomoku.example/"));
  });

  it("forgets the running game once it ended: a later failure does not say it runs", async () => {
    answers(activeGame);
    render(<AccountMenu displayName="Ala_7" />);
    await chooseLogout();
    await userEvent.click(await screen.findByRole("button", { name: "Zostań zalogowany" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    answers(noGame, { ok: false, error: { code: "network", message: "x" } });
    await chooseLogout();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).not.toContain("Trwa partia");
  });

  it("logs out once when the item is chosen again while the read is on its way", async () => {
    let finish: (value: unknown) => void = () => undefined;
    apiCall.mockImplementation((path: string) =>
      path === "/api/lobby" ? new Promise((resolve) => (finish = resolve)) : Promise.resolve({ ok: true, data: null }),
    );
    render(<AccountMenu displayName="Ala_7" />);
    await chooseLogout();
    await chooseLogout();

    finish(noGame);
    await waitFor(() => expect(replace).toHaveBeenCalledOnce());
    expect(apiCall.mock.calls.filter(([path]) => path === "/api/lobby")).toHaveLength(1);
  });
});
