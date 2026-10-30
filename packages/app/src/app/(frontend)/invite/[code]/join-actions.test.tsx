// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replace, refresh, apiCall } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), apiCall: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import { JoinActions } from "./join-actions";

const failure = (code: string) => ({ ok: false, error: { code, message: "x" } });
const ok = { ok: true, data: { gameId: "g1" } };

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  apiCall.mockReset();
});
afterEach(cleanup);

describe("JoinActions as a visitor", () => {
  it("offers login and registration that come back to the invitation, and the guest option", () => {
    render(<JoinActions code="ABCD-EFGH" mode="visitor" />);
    expect(screen.getByRole("link", { name: "Zaloguj się" }).getAttribute("href")).toBe("/login?next=%2Finvite%2FABCD-EFGH");
    expect(screen.getByRole("link", { name: "Załóż konto" }).getAttribute("href")).toBe("/register?next=%2Finvite%2FABCD-EFGH");
    expect(screen.getByRole("button", { name: "Graj jako gość" })).toBeTruthy();
    expect(screen.queryByText(/Grasz bez konta/)).toBeNull();
  });

  it("shows the guest warning first, and nothing is sent until it is acknowledged", async () => {
    const user = userEvent.setup();
    render(<JoinActions code="ABCD-EFGH" mode="visitor" />);
    await user.click(screen.getByRole("button", { name: "Graj jako gość" }));
    expect(screen.getByText("Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Zaloguj się" })).toBeNull();
    expect(apiCall).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Wróć" }));
    expect(screen.getByRole("button", { name: "Graj jako gość" })).toBeTruthy();
  });

  it("joins as a guest with the acknowledgement and opens the game, staying busy", async () => {
    apiCall.mockResolvedValue(ok);
    const user = userEvent.setup();
    render(<JoinActions code="ABCD-EFGH" mode="visitor" />);
    await user.click(screen.getByRole("button", { name: "Graj jako gość" }));
    await user.click(screen.getByRole("button", { name: "Rozumiem, graj jako gość" }));
    expect(apiCall).toHaveBeenCalledWith("/api/invitations/ABCD-EFGH/accept", {
      body: { as: "guest", acknowledgedGuestWarning: true },
    });
    expect(replace).toHaveBeenCalledWith("/games/g1");
    expect((screen.getByRole("button", { name: "Dołączanie…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Wróć" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends exactly one request however often the button is pressed (the second one would cost the pool)", async () => {
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<JoinActions code="ABCD-EFGH" mode="visitor" />);
    await user.click(screen.getByRole("button", { name: "Graj jako gość" }));
    const confirm = screen.getByRole("button", { name: "Rozumiem, graj jako gość" });
    await user.dblClick(confirm);
    await user.click(screen.getByRole("button", { name: "Dołączanie…" }));
    expect(apiCall).toHaveBeenCalledTimes(1);
    await act(async () => finish(ok));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("ignores a press that arrives before the button is disabled", async () => {
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<JoinActions code="ABCD-EFGH" mode="visitor" />);
    await user.click(screen.getByRole("button", { name: "Graj jako gość" }));
    const confirm = screen.getByRole("button", { name: "Rozumiem, graj jako gość" });
    await act(async () => {
      // Two clicks in one batch: React has not re-rendered the disabled state between them.
      confirm.click();
      confirm.click();
    });
    expect(apiCall).toHaveBeenCalledTimes(1);
    await act(async () => finish(ok));
  });
});

describe("JoinActions as a member", () => {
  it("joins as the account", async () => {
    apiCall.mockResolvedValue(ok);
    render(<JoinActions code="ABCD-EFGH" mode="member" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Dołącz do partii" }));
    expect(apiCall).toHaveBeenCalledWith("/api/invitations/ABCD-EFGH/accept", { body: { as: "user" } });
    expect(replace).toHaveBeenCalledWith("/games/g1");
  });

  it.each([
    ["INVALID_INVITATION"],
    ["OWN_INVITATION"],
    ["OWN_WAITING_GAME"],
    ["ACTIVE_GAME_EXISTS"],
    ["GUEST_NOT_ALLOWED"],
  ])("refreshes the page when the server answers %s, so it shows the new state", async (code) => {
    apiCall.mockResolvedValue(failure(code));
    render(<JoinActions code="ABCD-EFGH" mode="member" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Dołącz do partii" }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
    await waitFor(() => expect((screen.getByRole("button", { name: "Dołącz do partii" }) as HTMLButtonElement).disabled).toBe(false));
    // L6: a quiet status line says why the page was reloaded.
    const note = screen.getByTestId("state-changed-note");
    expect(note.getAttribute("role")).toBe("status");
    expect(note.textContent).toBe("Coś się zmieniło, odświeżyliśmy stronę");
  });

  it("says nothing about a refresh before one happens, and drops the note at the next attempt", async () => {
    apiCall.mockResolvedValueOnce(failure("INVALID_INVITATION")).mockResolvedValue(failure("RATE_LIMITED"));
    render(<JoinActions code="ABCD-EFGH" mode="member" />);
    expect(screen.getByTestId("state-changed-note").textContent).toBe("");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Dołącz do partii" }));
    await waitFor(() => expect(screen.getByTestId("state-changed-note").textContent).not.toBe(""));
    await user.click(screen.getByRole("button", { name: "Dołącz do partii" }));
    await waitFor(() => expect(screen.getByText("Zbyt wiele prób — spróbuj za chwilę")).toBeTruthy());
    expect(screen.getByTestId("state-changed-note").textContent).toBe("");
  });

  it("shows the spent pool inline", async () => {
    apiCall.mockResolvedValue(failure("RATE_LIMITED"));
    render(<JoinActions code="ABCD-EFGH" mode="member" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Dołącz do partii" }));
    expect(screen.getByText("Zbyt wiele prób — spróbuj za chwilę")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("asks an expired session to sign in again, coming back to the invitation", async () => {
    apiCall.mockResolvedValue(failure("UNAUTHORIZED"));
    render(<JoinActions code="ABCD-EFGH" mode="member" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Dołącz do partii" }));
    expect(screen.getByRole("link", { name: "Zaloguj się ponownie" }).getAttribute("href")).toBe(
      "/login?next=%2Finvite%2FABCD-EFGH",
    );
  });

  it.each([
    ["network", "Brak połączenia"],
    ["INTERNAL", "Nie udało się dołączyć do partii"],
  ])("lets the player retry after %s", async (code, title) => {
    apiCall.mockResolvedValueOnce(failure(code));
    const user = userEvent.setup();
    render(<JoinActions code="ABCD-EFGH" mode="member" />);
    await user.click(screen.getByRole("button", { name: "Dołącz do partii" }));
    expect(screen.getByText(title)).toBeTruthy();
    apiCall.mockResolvedValueOnce(ok);
    await user.click(screen.getByRole("button", { name: "Dołącz do partii" }));
    expect(screen.queryByText(title)).toBeNull();
    expect(replace).toHaveBeenCalledWith("/games/g1");
  });
});

describe("JoinActions with an own waiting game", () => {
  it("joins and gives the own game up in one request (Q18)", async () => {
    apiCall.mockResolvedValue(ok);
    render(<JoinActions code="ABCD-EFGH" mode="swap" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Anuluj moją partię i dołącz" }));
    expect(apiCall).toHaveBeenCalledWith("/api/invitations/ABCD-EFGH/accept", {
      body: { as: "user", cancelOwnWaitingGame: true },
    });
    expect(screen.getByRole("button", { name: "Dołączanie…" })).toBeTruthy();
  });
});
