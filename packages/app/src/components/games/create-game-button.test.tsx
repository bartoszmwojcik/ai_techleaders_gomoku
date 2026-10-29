// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push, apiCall } = vi.hoisted(() => ({ push: vi.fn(), apiCall: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import { CreateGameButton } from "./create-game-button";

const failure = (error: { code: string; retryAfterSeconds?: number }) => ({
  ok: false,
  error: { message: "x", ...error },
});
const click = () => userEvent.setup().click(screen.getByRole("button", { name: "Utwórz zaproszenie" }));

beforeEach(() => {
  push.mockReset();
  apiCall.mockReset();
});
afterEach(cleanup);

describe("CreateGameButton", () => {
  it("creates the game, opens its page and stays busy while navigating", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { gameId: "g1" } });
    render(<CreateGameButton heldGame={null} />);
    await click();
    expect(apiCall).toHaveBeenCalledWith("/api/games");
    expect(push).toHaveBeenCalledWith("/games/g1");
    const busy = screen.getByRole("button", { name: "Tworzenie zaproszenia…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
  });

  it("sends only one request while busy", async () => {
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<CreateGameButton heldGame={null} />);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "Utwórz zaproszenie" });
    await user.click(button);
    await user.click(screen.getByRole("button", { name: "Tworzenie zaproszenia…" }));
    expect(apiCall).toHaveBeenCalledTimes(1);
    finish({ ok: true, data: { gameId: "g1" } });
  });

  it("takes a player who already waits in a game to that game, with a notice (L01)", async () => {
    apiCall.mockResolvedValue(failure({ code: "ACTIVE_GAME_EXISTS" }));
    render(<CreateGameButton heldGame={{ gameId: "g9", status: "waiting" }} />);
    await click();
    expect(push).toHaveBeenCalledWith("/games/g9?notice=own-waiting");
  });

  it("tells a player with a game in progress to finish it first, with a link", async () => {
    apiCall.mockResolvedValue(failure({ code: "ACTIVE_GAME_EXISTS" }));
    render(<CreateGameButton heldGame={{ gameId: "g9", status: "active" }} />);
    await click();
    expect(screen.getByText("Masz już partię")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Przejdź do partii" }).getAttribute("href")).toBe("/games/g9");
    expect(push).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Utwórz zaproszenie" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("omits the link when the page does not know the game", async () => {
    apiCall.mockResolvedValue(failure({ code: "ACTIVE_GAME_EXISTS" }));
    render(<CreateGameButton heldGame={null} />);
    await click();
    expect(screen.getByText("Masz już partię")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it.each([
    [90, "Spróbuj ponownie za 2 min."],
    [undefined, "Spróbuj ponownie za jakiś czas."],
  ])("shows the creation limit with Retry-After %s", async (retryAfterSeconds, text) => {
    apiCall.mockResolvedValue(failure({ code: "RATE_LIMITED", retryAfterSeconds }));
    render(<CreateGameButton heldGame={null} />);
    await click();
    expect(screen.getByText("Zbyt wiele zaproszeń")).toBeTruthy();
    expect(screen.getByText(new RegExp(`Limit to 10 utworzeń na godzinę. ${text}`))).toBeTruthy();
  });

  it("asks an expired session to sign in again", async () => {
    apiCall.mockResolvedValue(failure({ code: "UNAUTHORIZED" }));
    render(<CreateGameButton heldGame={null} />);
    await click();
    expect(screen.getByRole("link", { name: "Zaloguj się ponownie" }).getAttribute("href")).toBe("/login?next=%2F");
  });

  it.each([
    ["network", "Brak połączenia"],
    ["INTERNAL", "Nie udało się utworzyć partii"],
  ])("offers a retry after %s", async (code, title) => {
    apiCall.mockResolvedValueOnce(failure({ code }));
    render(<CreateGameButton heldGame={null} />);
    await click();
    expect(screen.getByText(title)).toBeTruthy();
    apiCall.mockResolvedValueOnce({ ok: true, data: { gameId: "g2" } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(push).toHaveBeenCalledWith("/games/g2");
  });

  it("clears the previous failure when trying again", async () => {
    apiCall.mockResolvedValueOnce(failure({ code: "INTERNAL" }));
    render(<CreateGameButton heldGame={null} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Utwórz zaproszenie" }));
    expect(screen.getByText("Nie udało się utworzyć partii")).toBeTruthy();
    apiCall.mockResolvedValueOnce({ ok: true, data: { gameId: "g2" } });
    await user.click(screen.getByRole("button", { name: "Utwórz zaproszenie" }));
    expect(screen.queryByText("Nie udało się utworzyć partii")).toBeNull();
  });
});
