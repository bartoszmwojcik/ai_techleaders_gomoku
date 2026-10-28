// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import { ResetPasswordForm } from "./reset-password-form";

const failure = (error: { code: string; retryAfterSeconds?: number; fieldErrors?: Record<string, string[]> }) => ({
  ok: false,
  error: { message: "x", ...error },
});

const field = () => screen.getByLabelText(/^Nowe hasło/) as HTMLInputElement;

async function fillAndSubmit(password = "nowe-haslo-123") {
  const user = userEvent.setup();
  if (password) await user.type(field(), password);
  await user.click(screen.getByRole("button", { name: "Ustaw nowe hasło" }));
  return user;
}

beforeEach(() => {
  apiCall.mockReset();
});
afterEach(cleanup);

describe("ResetPasswordForm", () => {
  it("shows the password field with a hint, hidden by default, and reveals it on demand", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="tok" />);
    expect(field().getAttribute("autocomplete")).toBe("new-password");
    expect(field().type).toBe("password");
    expect(screen.getByText("Co najmniej 8 znaków")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Pokaż hasło" }));
    expect(field().type).toBe("text");
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("explains a missing token and offers a new link, without a form", async () => {
    render(<ResetPasswordForm token={undefined} />);
    const box = screen.getByTestId("reset-invalid");
    expect(box.textContent).toContain("Ten link jest niepełny");
    expect(screen.getByRole("link", { name: "Wyślij nowy link" }).getAttribute("href")).toBe("/forgot-password");
    expect(screen.queryByTestId("reset-form")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(box));
  });

  it("sets the password, clears and hides the field and offers the login", async () => {
    apiCall.mockResolvedValue({ ok: true, data: null });
    const user = userEvent.setup();
    render(<ResetPasswordForm token="tok" />);
    await user.click(screen.getByRole("button", { name: "Pokaż hasło" }));
    await user.type(field(), "nowe-haslo-123");
    await user.click(screen.getByRole("button", { name: "Ustaw nowe hasło" }));

    expect(apiCall).toHaveBeenCalledWith("/api/auth/password-reset/confirm", {
      body: { token: "tok", newPassword: "nowe-haslo-123" },
    });
    const done = await screen.findByTestId("reset-done");
    expect(done.textContent).toContain("Hasło zmienione");
    expect(screen.getByRole("link", { name: "Zaloguj się" }).getAttribute("href")).toBe("/login");
    expect(screen.queryByTestId("reset-form")).toBeNull();
    expect(screen.queryByDisplayValue("nowe-haslo-123")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(done));
  });

  it("validates locally, without a request, and focuses the field", async () => {
    render(<ResetPasswordForm token="tok" />);

    await fillAndSubmit("krotkie");

    expect(apiCall).not.toHaveBeenCalled();
    expect(screen.getByText("Hasło musi mieć co najmniej 8 znaków.")).toBeTruthy();
    expect(document.activeElement).toBe(field());
  });

  it.each([
    [{ code: "INVALID_TOKEN" }],
    [{ code: "VALIDATION", fieldErrors: { token: ["Token jest za długi."] } }],
  ])("shows the expired-link state for %j, with the password cleared", async (error) => {
    apiCall.mockResolvedValue(failure(error));
    render(<ResetPasswordForm token="tok" />);

    await fillAndSubmit();

    const box = await screen.findByTestId("reset-invalid");
    expect(box.textContent).toContain("Link wygasł lub został już użyty");
    expect(screen.getByRole("link", { name: "Wyślij nowy link" }).getAttribute("href")).toBe("/forgot-password");
    expect(screen.queryByTestId("reset-form")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(box));
  });

  it("shows a password error from the server and keeps what was typed", async () => {
    apiCall.mockResolvedValue(failure({ code: "VALIDATION", fieldErrors: { newPassword: ["Za słabe."] } }));
    render(<ResetPasswordForm token="tok" />);

    await fillAndSubmit();

    expect(await screen.findByText("Za słabe.")).toBeTruthy();
    expect(field().value).toBe("nowe-haslo-123");
    expect(document.activeElement).toBe(field());
  });

  it.each([
    [{ code: "RATE_LIMITED", retryAfterSeconds: 120 }, "Zbyt wiele prób", "Spróbuj ponownie za 2 min."],
    [{ code: "RATE_LIMITED" }, "Zbyt wiele prób", "Spróbuj ponownie za jakiś czas."],
    [{ code: "network" }, "Brak połączenia", "Wpisane hasło zostało zachowane"],
    [{ code: "INTERNAL" }, "Nie udało się zmienić hasła", "Spróbuj ponownie."],
  ])("shows a general error for %j, keeps the password and focuses it", async (error, title, details) => {
    apiCall.mockResolvedValue(failure(error));
    render(<ResetPasswordForm token="tok" />);

    await fillAndSubmit();

    const box = await screen.findByTestId("reset-error");
    expect(box.textContent).toContain(title);
    expect(box.textContent).toContain(details);
    expect(field().value).toBe("nowe-haslo-123");
    expect(document.activeElement).toBe(field());
  });

  it("blocks a second submit while pending", async () => {
    apiCall.mockReturnValue(new Promise(() => {}));
    render(<ResetPasswordForm token="tok" />);

    await fillAndSubmit();

    expect((screen.getByRole("button", { name: "Zapisywanie…" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
