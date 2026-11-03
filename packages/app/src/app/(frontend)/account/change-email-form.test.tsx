// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall, replace } = vi.hoisted(() => ({ apiCall: vi.fn(), replace: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import { ChangeEmailForm } from "./change-email-form";

const failure = (error: { code: string; retryAfterSeconds?: number; fieldErrors?: Record<string, string[]> }) => ({
  ok: false,
  error: { message: "x", ...error },
});
const email = () => screen.getByLabelText(/^Nowy adres e-mail/) as HTMLInputElement;
const password = () => screen.getByLabelText(/^Obecne hasło/) as HTMLInputElement;

async function submit({ newEmail = "nowy@example.com", currentPassword = "secret123" } = {}) {
  const user = userEvent.setup();
  if (newEmail) await user.type(email(), newEmail);
  if (currentPassword) await user.type(password(), currentPassword);
  await user.click(screen.getByRole("button", { name: "Zmień adres e-mail" }));
}

beforeEach(() => {
  apiCall.mockReset();
  replace.mockReset();
  vi.stubGlobal("location", { replace, origin: "https://gomoku.example" });
});
afterEach(cleanup);

describe("ChangeEmailForm", () => {
  it("explains what will happen before sending", () => {
    render(<ChangeEmailForm />);
    expect(screen.getByText(/Adres konta zmieni się po jego kliknięciu/)).toBeTruthy();
    expect(screen.queryByTestId("change-email-success")).toBeNull();
  });

  it("sends the request, says the same thing for every address and clears the fields", async () => {
    apiCall.mockResolvedValue({ ok: true, data: null });
    render(<ChangeEmailForm />);
    await submit();

    await waitFor(() => expect(screen.getByTestId("change-email-success").textContent).toContain("Jeśli ten adres może zostać użyty"));
    expect(apiCall).toHaveBeenCalledWith("/api/auth/email-change", { body: { newEmail: "nowy@example.com", currentPassword: "secret123" } });
    expect(email().value).toBe("");
    expect(password().value).toBe("");
  });

  it("refuses a malformed address and a missing password before sending, focusing the first", async () => {
    render(<ChangeEmailForm />);
    await submit({ newEmail: "nie-adres", currentPassword: "" });
    expect(screen.getByText("Podaj poprawny adres e-mail.")).toBeTruthy();
    expect(screen.getByText("Podaj obecne hasło.")).toBeTruthy();
    expect(document.activeElement).toBe(email());
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("explains that the administrator's address cannot be changed", async () => {
    apiCall.mockResolvedValue(failure({ code: "ADMIN_EMAIL_LOCKED" }));
    render(<ChangeEmailForm />);
    await submit();
    await waitFor(() => expect(screen.getByTestId("change-email-error").textContent).toContain("Nie można zmienić adresu"));
    expect(screen.getByTestId("change-email-error").textContent).toContain("konfiguracji serwera");
  });

  it("clears only the wrong password and shows the field error", async () => {
    apiCall.mockResolvedValue(
      failure({ code: "INVALID_CURRENT_PASSWORD", fieldErrors: { currentPassword: ["Obecne hasło jest nieprawidłowe."] } }),
    );
    render(<ChangeEmailForm />);
    await submit();
    expect(await screen.findByText("Obecne hasło jest nieprawidłowe.")).toBeTruthy();
    expect(password().value).toBe("");
    expect(email().value).toBe("nowy@example.com");
    expect(document.activeElement).toBe(password());
  });

  it("shows a server error for the address field", async () => {
    apiCall.mockResolvedValue(failure({ code: "VALIDATION", fieldErrors: { newEmail: ["To już jest adres Twojego konta."] } }));
    render(<ChangeEmailForm />);
    await submit();
    expect(await screen.findByText("To już jest adres Twojego konta.")).toBeTruthy();
    expect(email().value).toBe("nowy@example.com");
  });

  it.each([
    [{ code: "RATE_LIMITED", retryAfterSeconds: 300 }, "Spróbuj ponownie za 5 min."],
    [{ code: "RATE_LIMITED" }, "Spróbuj ponownie za jakiś czas."],
    [{ code: "network" }, "Wpisane dane zostały zachowane"],
    [{ code: "INTERNAL" }, "Spróbuj ponownie."],
  ])("explains %j", async (error, text) => {
    apiCall.mockResolvedValue(failure(error));
    render(<ChangeEmailForm />);
    await submit();
    expect((await screen.findByTestId("change-email-error")).textContent).toContain(text);
  });

  it("sends a signed-out user to the login page and back", async () => {
    apiCall.mockResolvedValue(failure({ code: "UNAUTHORIZED" }));
    render(<ChangeEmailForm />);
    await submit();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://gomoku.example/login?next=%2Faccount"));
  });
});
