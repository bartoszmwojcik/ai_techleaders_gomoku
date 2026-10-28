// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import { ChangePasswordForm } from "./change-password-form";

const failure = (error: { code: string; retryAfterSeconds?: number; fieldErrors?: Record<string, string[]> }) => ({
  ok: false,
  error: { message: "x", ...error },
});

const current = () => screen.getByLabelText(/^Obecne hasło/) as HTMLInputElement;
const next = () => screen.getByLabelText(/^Nowe hasło/) as HTMLInputElement;

async function fillAndSubmit({ currentPassword = "secret123", newPassword = "brand-new-pass1" } = {}) {
  const user = userEvent.setup();
  if (currentPassword) await user.type(current(), currentPassword);
  if (newPassword) await user.type(next(), newPassword);
  await user.click(screen.getByRole("button", { name: "Zmień hasło" }));
  return user;
}

beforeEach(() => apiCall.mockReset());
afterEach(cleanup);

describe("ChangePasswordForm", () => {
  it("shows both fields, the hint and the warning before sending", () => {
    render(<ChangePasswordForm />);
    expect(current().getAttribute("autocomplete")).toBe("current-password");
    expect(next().getAttribute("autocomplete")).toBe("new-password");
    expect(screen.getByText("Co najmniej 8 znaków")).toBeTruthy();
    expect(screen.getByText("Inne urządzenia zostaną wylogowane, także w trakcie partii.")).toBeTruthy();
    expect(screen.queryByTestId("change-password-success")).toBeNull();
    expect(screen.queryByTestId("change-password-error")).toBeNull();
  });

  it("reveals and hides each password independently", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    const [first] = screen.getAllByRole("button", { name: "Pokaż hasło" });
    await user.click(first as HTMLElement);
    expect(current().type).toBe("text");
    expect(next().type).toBe("password");
  });

  it("changes the password, clears and hides the fields and shows the success", async () => {
    apiCall.mockResolvedValue({ ok: true, data: null });
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await user.click(screen.getAllByRole("button", { name: "Pokaż hasło" })[0] as HTMLElement);
    await user.type(current(), "secret123");
    await user.type(next(), "brand-new-pass1");
    await user.click(screen.getByRole("button", { name: "Zmień hasło" }));

    expect(apiCall).toHaveBeenCalledWith("/api/auth/password", {
      body: { currentPassword: "secret123", newPassword: "brand-new-pass1" },
    });
    expect(screen.getByTestId("change-password-success").textContent).toContain("Inne urządzenia zostały wylogowane.");
    expect(current().value).toBe("");
    expect(next().value).toBe("");
    expect(current().type).toBe("password");
    expect((screen.getByRole("button", { name: "Zmień hasło" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("hides the previous success when sending again", async () => {
    apiCall.mockResolvedValueOnce({ ok: true, data: null });
    render(<ChangePasswordForm />);
    const user = await fillAndSubmit();
    expect(screen.getByTestId("change-password-success")).toBeTruthy();
    let finish: (value: unknown) => void = () => {};
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await user.type(current(), "secret123");
    await user.type(next(), "other-pass-123");
    const click = user.click(screen.getByRole("button", { name: "Zmień hasło" }));
    await waitFor(() => expect(screen.queryByTestId("change-password-success")).toBeNull());
    expect((screen.getByRole("button", { name: "Zmienianie hasła…" }) as HTMLButtonElement).disabled).toBe(true);
    finish({ ok: true, data: null });
    await click;
  });

  it("blames the current password, clears and hides it, keeps the new one and focuses it", async () => {
    apiCall.mockResolvedValue(
      failure({
        code: "INVALID_CURRENT_PASSWORD",
        fieldErrors: { currentPassword: ["Obecne hasło jest nieprawidłowe."] },
      }),
    );
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await user.click(screen.getAllByRole("button", { name: "Pokaż hasło" })[0] as HTMLElement);
    await user.type(current(), "wrong-one");
    await user.type(next(), "brand-new-pass1");
    await user.click(screen.getByRole("button", { name: "Zmień hasło" }));

    expect(screen.getByText("Obecne hasło jest nieprawidłowe.")).toBeTruthy();
    expect(current().value).toBe("");
    expect(current().type).toBe("password");
    expect(next().value).toBe("brand-new-pass1");
    expect(document.activeElement).toBe(current());
    expect(screen.queryByTestId("change-password-success")).toBeNull();
  });

  it("focuses the new password when the server blames only it", async () => {
    apiCall.mockResolvedValue(
      failure({ code: "VALIDATION_ERROR", fieldErrors: { newPassword: ["Za słabe."] } }),
    );
    render(<ChangePasswordForm />);
    await fillAndSubmit();
    expect(screen.getByText("Za słabe.")).toBeTruthy();
    expect(document.activeElement).toBe(next());
    expect(current().value).toBe("secret123");
  });

  it("validates on the client without calling the API and focuses the first invalid field", async () => {
    render(<ChangePasswordForm />);
    await fillAndSubmit({ currentPassword: "", newPassword: "" });
    expect(apiCall).not.toHaveBeenCalled();
    expect(screen.getByText("Podaj obecne hasło.")).toBeTruthy();
    expect(document.activeElement).toBe(current());
  });

  it("focuses the new password when only it is invalid on the client", async () => {
    render(<ChangePasswordForm />);
    await fillAndSubmit({ currentPassword: "secret123", newPassword: "secret123" });
    expect(apiCall).not.toHaveBeenCalled();
    expect(screen.getByText("Nowe hasło musi się różnić od obecnego.")).toBeTruthy();
    expect(document.activeElement).toBe(next());
  });

  it("tells how long to wait after a rate limit and keeps the input", async () => {
    apiCall.mockResolvedValue(failure({ code: "RATE_LIMITED", retryAfterSeconds: 125 }));
    render(<ChangePasswordForm />);
    await fillAndSubmit();
    expect(screen.getByTestId("change-password-error").textContent).toContain("Zbyt wiele prób");
    expect(screen.getByTestId("change-password-error").textContent).toContain("za 3 min.");
    expect(current().value).toBe("secret123");
    expect(document.activeElement).toBe(current());
  });

  it("falls back to a generic wait without Retry-After", async () => {
    apiCall.mockResolvedValue(failure({ code: "RATE_LIMITED" }));
    render(<ChangePasswordForm />);
    await fillAndSubmit();
    expect(screen.getByTestId("change-password-error").textContent).toContain("za jakiś czas");
  });

  it("reports a network error and keeps what was typed", async () => {
    apiCall.mockResolvedValue(failure({ code: "network" }));
    render(<ChangePasswordForm />);
    await fillAndSubmit();
    expect(screen.getByTestId("change-password-error").textContent).toContain("Brak połączenia");
    expect(current().value).toBe("secret123");
    expect(next().value).toBe("brand-new-pass1");
  });

  it("reports an unknown error generically", async () => {
    apiCall.mockResolvedValue(failure({ code: "INTERNAL" }));
    render(<ChangePasswordForm />);
    await fillAndSubmit();
    expect(screen.getByTestId("change-password-error").textContent).toContain("Nie udało się zmienić hasła");
  });
});
