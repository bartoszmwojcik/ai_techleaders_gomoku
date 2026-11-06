// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push, apiCall } = vi.hoisted(() => ({ push: vi.fn(), apiCall: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import { BotReplay } from "./bot-replay";

const failure = (error: Record<string, unknown>) => ({ ok: false, error: { message: "x", ...error } });
const button = () => screen.getByRole("button", { name: "Zagraj ponownie z botem" });

beforeEach(() => {
  push.mockReset();
  apiCall.mockReset();
});
afterEach(cleanup);

describe("BotReplay (hosted-bot R13)", () => {
  it("creates a new game at the same level and opens it, staying busy", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { gameId: "g2" } });
    render(<BotReplay level={2} guest={false} />);
    expect(screen.getByRole("heading", { name: "Następna partia" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wróć do panelu głównego" }).getAttribute("href")).toBe("/");
    await userEvent.setup().click(button());
    expect(apiCall).toHaveBeenCalledWith("/api/games", { body: { opponent: "bot", botLevel: 2 } });
    expect(push).toHaveBeenCalledWith("/games/g2");
    expect((screen.getByRole("button", { name: "Tworzenie partii…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends the guest's acknowledgement", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { gameId: "g2" } });
    render(<BotReplay level={1} guest />);
    await userEvent.setup().click(button());
    expect(apiCall).toHaveBeenCalledWith("/api/games", { body: { acknowledgedGuestWarning: true, opponent: "bot", botLevel: 1 } });
  });

  it("sends one request on a double click", async () => {
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<BotReplay level={1} guest={false} />);
    await act(async () => {
      button().click();
      button().click();
    });
    expect(apiCall).toHaveBeenCalledOnce();
    await act(async () => finish({ ok: true, data: { gameId: "g2" } }));
  });

  it.each([
    [{ code: "BOT_UNAVAILABLE" }, "Bot jest teraz niedostępny. Spróbuj za chwilę albo zaproś osobę."],
    [{ code: "ACTIVE_GAME_EXISTS", data: { gameId: "held" } }, "Najpierw dokończ bieżącą partię."],
    [{ code: "ACTIVE_GAME_EXISTS" }, "Najpierw dokończ bieżącą partię."],
    [{ code: "RATE_LIMITED", retryAfterSeconds: 90 }, "Spróbuj ponownie za 2 min."],
    [{ code: "network" }, "Nie udało się połączyć z serwerem."],
    [{ code: "INTERNAL" }, "Błąd po stronie serwera."],
  ])("explains a refusal %j and lets the player try again", async (error, text) => {
    apiCall.mockResolvedValue(failure(error));
    render(<BotReplay level={1} guest={false} />);
    await userEvent.setup().click(button());
    expect(screen.getByRole("alert").textContent).toContain(text);
    expect(button().hasAttribute("disabled")).toBe(false);
    expect(push).not.toHaveBeenCalled();
    const link = screen.queryByRole("link", { name: "Przejdź do partii" });
    expect(link?.getAttribute("href") ?? null).toBe("data" in error ? "/games/held" : null);
  });
});
