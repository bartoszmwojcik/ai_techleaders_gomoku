// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replace, refresh, apiCall } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), apiCall: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import { WatchActions } from "./watch-actions";

const failure = (code: string, extra: Record<string, unknown> = {}) => ({ ok: false, error: { code, message: "x", ...extra } });
const ok = { ok: true, data: { gameId: "g1" } };

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  apiCall.mockReset().mockResolvedValue(ok);
});
afterEach(cleanup);

describe("WatchActions for a visitor", () => {
  it("offers an optional nickname and watches without one", async () => {
    const user = userEvent.setup();
    render(<WatchActions code="ABCD-EFGH" signedIn={false} />);
    expect(screen.getByLabelText(/Twój nick/)).toBeTruthy();
    expect(screen.getByText("(opcjonalnie)")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Oglądaj partię" }));

    expect(apiCall).toHaveBeenCalledWith("/api/invitations/ABCD-EFGH/spectate", { body: {} });
    expect(replace).toHaveBeenCalledWith("/games/g1");
    // Busy while the page navigates: no second request is possible.
    expect((screen.getByRole("button", { name: "Otwieranie…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends the normalized nickname", async () => {
    const user = userEvent.setup();
    render(<WatchActions code="ABCD-EFGH" signedIn={false} />);
    await user.type(screen.getByLabelText(/Twój nick/), "  Piotr   K  ");
    await user.click(screen.getByRole("button", { name: "Oglądaj partię" }));
    expect(apiCall).toHaveBeenCalledWith("/api/invitations/ABCD-EFGH/spectate", { body: { nickname: "Piotr K" } });
  });

  it("refuses a bad nickname in the field's line and sends nothing", async () => {
    const user = userEvent.setup();
    render(<WatchActions code="ABCD-EFGH" signedIn={false} />);
    await user.type(screen.getByLabelText(/Twój nick/), "Ala<b>");
    await user.click(screen.getByRole("button", { name: "Oglądaj partię" }));
    expect(apiCall).not.toHaveBeenCalled();
    expect(screen.getByText(/Nick może zawierać/)).toBeTruthy();
  });

  it("shows the refusal of the server for the nickname in the same line", async () => {
    apiCall.mockResolvedValue(failure("VALIDATION", { fieldErrors: { nickname: ["Nick zajęty."] } }));
    const user = userEvent.setup();
    render(<WatchActions code="ABCD-EFGH" signedIn={false} />);
    await user.click(screen.getByRole("button", { name: "Oglądaj partię" }));
    expect(screen.getByText("Nick zajęty.")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("WatchActions for an account", () => {
  it("asks for no nickname and sends an empty body", async () => {
    const user = userEvent.setup();
    render(<WatchActions code="ABCD-EFGH" signedIn />);
    expect(screen.queryByLabelText(/Twój nick/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Oglądaj partię" }));
    expect(apiCall).toHaveBeenCalledWith("/api/invitations/ABCD-EFGH/spectate", { body: {} });
  });
});

describe("WatchActions when the server says no", () => {
  async function press() {
    const user = userEvent.setup();
    render(<WatchActions code="ABCD-EFGH" signedIn />);
    await user.click(screen.getByRole("button", { name: "Oglądaj partię" }));
    return user;
  }

  it("tells a 21st spectator that the audience is full, and lets them try again", async () => {
    apiCall.mockResolvedValue(failure("SPECTATORS_FULL"));
    const user = await press();
    expect(screen.getByText("Partia ma komplet widzów")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    apiCall.mockResolvedValue(ok);
    await user.click(screen.getByRole("button", { name: "Oglądaj partię" }));
    expect(replace).toHaveBeenCalledWith("/games/g1");
    expect(screen.queryByText("Partia ma komplet widzów")).toBeNull();
  });

  it("refreshes the page when the game ended or closed its audience meanwhile", async () => {
    apiCall.mockResolvedValue(failure("INVALID_INVITATION"));
    await press();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each([
    ["RATE_LIMITED", "Zbyt wiele prób — spróbuj za chwilę"],
    ["network", "Brak połączenia"],
    ["INTERNAL", "Nie udało się otworzyć partii"],
  ])("explains %s", async (code, title) => {
    apiCall.mockResolvedValue(failure(code));
    await press();
    expect(screen.getByText(title)).toBeTruthy();
  });

  it("ignores a second press while the first is in flight (two clicks in one act)", async () => {
    apiCall.mockReturnValue(new Promise(() => {}));
    render(<WatchActions code="ABCD-EFGH" signedIn />);
    const button = screen.getByRole("button", { name: "Oglądaj partię" });
    await act(async () => {
      button.click();
      button.click();
    });
    expect(apiCall).toHaveBeenCalledTimes(1);
  });
});
