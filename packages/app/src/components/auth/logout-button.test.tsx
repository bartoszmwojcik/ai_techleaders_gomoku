// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replace, apiCall } = vi.hoisted(() => ({ replace: vi.fn(), apiCall: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import { LogoutButton } from "./logout-button";

beforeEach(() => {
  replace.mockReset();
  apiCall.mockReset().mockResolvedValue({ ok: true, data: null });
});
afterEach(cleanup);

describe("LogoutButton", () => {
  it("logs out and goes to the home page without asking when no game runs", async () => {
    render(<LogoutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Wyloguj" }));

    expect(apiCall).toHaveBeenCalledWith("/api/auth/logout");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("stays busy while the request runs", async () => {
    let finish: (value: unknown) => void = () => undefined;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<LogoutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Wyloguj" }));

    const button = screen.getByRole("button", { name: "Wyloguj" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");

    finish({ ok: true, data: null });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("shows an error and lets the player retry when logout fails", async () => {
    apiCall.mockResolvedValueOnce({ ok: false, error: { code: "INTERNAL", message: "x" } });
    render(<LogoutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Wyloguj" }));

    expect((await screen.findByTestId("logout-error")).textContent).toContain("Nie udało się wylogować");
    expect(replace).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: "Wyloguj" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    await userEvent.click(button);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByTestId("logout-error")).toBeNull();
  });

  it("asks first during a game and logs out only after confirmation", async () => {
    render(<LogoutButton hasActiveGame />);
    await userEvent.click(screen.getByRole("button", { name: "Wyloguj" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Trwa partia — po wylogowaniu zegar biegnie dalej. Wylogować?");
    expect(apiCall).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Zostań zalogowany" }));
    expect(apiCall).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Wyloguj" }));
    const confirm = within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Wyloguj" });
    await userEvent.click(confirm);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(apiCall).toHaveBeenCalledOnce();
  });

  it("closes the dialog and shows the error when confirmed logout fails", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "network", message: "x" } });
    render(<LogoutButton hasActiveGame />);
    await userEvent.click(screen.getByRole("button", { name: "Wyloguj" }));
    const confirm = within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Wyloguj" });
    await userEvent.click(confirm);

    expect(await screen.findByTestId("logout-error")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});
