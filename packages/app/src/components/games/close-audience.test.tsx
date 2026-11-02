// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));
vi.setConfig({ testTimeout: 20_000 });

import { CloseAudience } from "./close-audience";

const onState = vi.fn();
const onRefresh = vi.fn();
const onGone = vi.fn();
const failure = (code: string) => ({ ok: false, error: { code, message: "x" } });
const view = (game: Parameters<typeof CloseAudience>[0]["game"]) =>
  render(<CloseAudience gameId="g1" game={game} onState={onState} onRefresh={onRefresh} onGone={onGone} />);
const press = (element: HTMLElement) => act(async () => element.click());
const dialog = () => document.querySelector<HTMLElement>("[role=alertdialog]");
const confirmButton = () => document.querySelector<HTMLElement>("[role=alertdialog] button:last-child")!;
const open = () => press(screen.getByTestId("close-audience"));

beforeEach(() => {
  apiCall.mockReset().mockResolvedValue({ ok: true, data: { audienceClosed: true } });
  onState.mockReset();
  onRefresh.mockReset();
  onGone.mockReset();
});
afterEach(cleanup);

describe("CloseAudience", () => {
  it("shows nothing for a game that is not public or not the caller's to close", () => {
    view({});
    expect(document.body.textContent).toBe("");
  });

  it("tells both players once the audience is closed, with no button", () => {
    view({ audienceClosed: true, canCloseAudience: true });
    expect(screen.getByTestId("audience-closed-note").textContent).toContain("Publiczność zamknięta przez twórcę");
    expect(screen.queryByTestId("close-audience")).toBeNull();
  });

  it("asks first and does not send when the creator keeps the audience", async () => {
    view({ canCloseAudience: true });
    await open();
    expect(dialog()!.textContent).toContain("Nie da się tego cofnąć");
    await press(screen.getByText("Zostaw publiczność"));
    expect(dialog()).toBeNull();
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("sends once for a double click, blocks Esc meanwhile and hands the state to the room", async () => {
    let release!: (value: unknown) => void;
    apiCall.mockReset().mockReturnValue(new Promise((resolve) => (release = resolve)));
    view({ canCloseAudience: true });
    await open();
    await act(async () => {
      confirmButton().click();
      confirmButton().click();
    });
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/audience/close");
    expect(dialog()!.textContent).toContain("Zamykanie…");
    // The dialog does not close while the server answers.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(dialog()).not.toBeNull();
    await act(async () => release({ ok: true, data: { audienceClosed: true } }));
    expect(dialog()).toBeNull();
    expect(onState).toHaveBeenCalledWith({ audienceClosed: true }, 0);
  });

  it("keeps the dialog on a network error and sends again", async () => {
    apiCall.mockReset().mockResolvedValueOnce(failure("network")).mockResolvedValueOnce({ ok: true, data: {} });
    view({ canCloseAudience: true });
    await open();
    await press(confirmButton());
    expect(dialog()!.querySelector("[role=alert]")!.textContent).toBe("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    await press(screen.getByText("Spróbuj ponownie"));
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(dialog()).toBeNull();
  });

  it("says so for an unknown failure and forgets the error when closed and reopened", async () => {
    apiCall.mockReset().mockResolvedValue(failure("INTERNAL"));
    view({ canCloseAudience: true });
    await open();
    await press(confirmButton());
    expect(dialog()!.textContent).toContain("Nie udało się zamknąć publiczności. Spróbuj ponownie.");
    await press(screen.getByText("Zostaw publiczność"));
    await open();
    expect(dialog()!.querySelector("[role=alert]")).toBeNull();
  });

  it.each(["GAME_NOT_ACTIVE", "GAME_NOT_PUBLIC"])("explains %s and reads the state again", async (code) => {
    apiCall.mockReset().mockResolvedValue(failure(code));
    view({ canCloseAudience: true });
    await open();
    await press(confirmButton());
    expect(dialog()!.textContent).toContain("Publiczności nie można już zamknąć");
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("tells the room the game is gone on 404", async () => {
    apiCall.mockReset().mockResolvedValue(failure("NOT_FOUND"));
    view({ canCloseAudience: true });
    await open();
    await press(confirmButton());
    expect(dialog()).toBeNull();
    expect(onGone).toHaveBeenCalledTimes(1);
  });
});
