// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import { ConfirmEmailChange } from "./confirm-email-change";

const failure = (code: string) => ({ ok: false, error: { code, message: "x" } });
const confirm = () => userEvent.setup().click(screen.getByRole("button", { name: "Potwierdź nowy adres" }));

beforeEach(() => apiCall.mockReset());
afterEach(cleanup);

describe("ConfirmEmailChange", () => {
  it("only offers the button first and focuses the heading", () => {
    render(<ConfirmEmailChange token="raw" />);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Potwierdź nowy adres e-mail" }));
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("applies the change on click and sends the user to sign in", async () => {
    apiCall.mockResolvedValue({ ok: true, data: null });
    render(<ConfirmEmailChange token="raw" />);
    await confirm();
    const done = await screen.findByTestId("change-confirm-done");
    expect(apiCall).toHaveBeenCalledWith("/api/auth/email-change/confirm", { body: { token: "raw" } });
    expect(done.textContent).toContain("Adres e-mail został zmieniony");
    expect(screen.getByRole("link", { name: "Zaloguj się" }).getAttribute("href")).toBe("/login");
    await waitFor(() => expect(document.activeElement).toBe(done));
  });

  it.each(["INVALID_TOKEN", "VALIDATION"])("says the link does not work for %s", async (code) => {
    apiCall.mockResolvedValue(failure(code));
    render(<ConfirmEmailChange token="raw" />);
    await confirm();
    expect((await screen.findByTestId("change-confirm-invalid")).textContent).toContain("Link wygasł lub został już użyty.");
  });

  it("says so at once for a link without a token", () => {
    render(<ConfirmEmailChange token={undefined} />);
    expect(screen.getByTestId("change-confirm-invalid").textContent).toContain("Adres konta pozostał bez zmian");
    expect(screen.getByRole("link", { name: "Zaloguj się" }).getAttribute("href")).toBe("/login?next=%2Faccount");
  });

  it.each([
    ["INTERNAL", "Nie udało się zmienić adresu"],
    ["network", "Brak połączenia"],
  ])("offers another try after %s", async (code, title) => {
    apiCall.mockResolvedValue(failure(code));
    render(<ConfirmEmailChange token="raw" />);
    await confirm();
    expect((await screen.findByTestId("change-confirm-error")).textContent).toContain(title);

    apiCall.mockResolvedValue({ ok: true, data: null });
    await userEvent.setup().click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByTestId("change-confirm-done")).toBeTruthy();
  });
});
