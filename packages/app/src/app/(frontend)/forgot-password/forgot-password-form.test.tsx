// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import { ForgotPasswordForm } from "./forgot-password-form";

const failure = (error: { code: string; retryAfterSeconds?: number; fieldErrors?: Record<string, string[]> }) => ({
  ok: false,
  error: { message: "x", ...error },
});

async function fillAndSubmit(email = "Ala@Example.com") {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText(/E-mail/), email);
  await user.click(screen.getByRole("button", { name: /^Wyślij link/ }));
  return user;
}

beforeEach(() => {
  apiCall.mockReset();
});
afterEach(cleanup);

describe("ForgotPasswordForm", () => {
  it("shows the e-mail field and a link back to the login", () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByLabelText(/E-mail/).getAttribute("autocomplete")).toBe("email");
    expect(screen.getByRole("link", { name: "Wróć do logowania" }).getAttribute("href")).toBe("/login");
    expect(screen.queryByTestId("forgot-sent")).toBeNull();
  });

  it("sends the normalized e-mail and shows the one fixed message, focused", async () => {
    apiCall.mockResolvedValue({ ok: true, data: null });
    render(<ForgotPasswordForm />);

    await fillAndSubmit();

    expect(apiCall).toHaveBeenCalledWith("/api/auth/password-reset/request", {
      body: { email: "ala@example.com" },
    });
    const sent = await screen.findByTestId("forgot-sent");
    expect(sent.textContent).toContain(
      "Jeśli konto z tym adresem istnieje i adres jest potwierdzony, wysłaliśmy link (ważny 1 godzinę). Sprawdź też folder spam.",
    );
    expect(screen.getByRole("status")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(sent));
    expect(screen.getByRole("button", { name: "Wyślij link ponownie" })).toBeTruthy();
  });

  it("hides the message again while a new request is in flight", async () => {
    apiCall.mockResolvedValueOnce({ ok: true, data: null }).mockResolvedValueOnce(failure({ code: "network" }));
    render(<ForgotPasswordForm />);
    const user = await fillAndSubmit();
    await screen.findByTestId("forgot-sent");

    await user.click(screen.getByRole("button", { name: "Wyślij link ponownie" }));

    await screen.findByTestId("forgot-error");
    expect(screen.queryByTestId("forgot-sent")).toBeNull();
  });

  it("validates locally, without a request, and focuses the field", async () => {
    render(<ForgotPasswordForm />);

    await fillAndSubmit("nie-email");

    expect(apiCall).not.toHaveBeenCalled();
    expect(screen.getByText("Podaj poprawny adres e-mail.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(/E-mail/));
  });

  it("shows a field error from the server and keeps the address", async () => {
    apiCall.mockResolvedValue(failure({ code: "VALIDATION", fieldErrors: { email: ["Zły adres."] } }));
    render(<ForgotPasswordForm />);

    await fillAndSubmit();

    expect(await screen.findByText("Zły adres.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(/E-mail/));
    expect((screen.getByLabelText(/E-mail/) as HTMLInputElement).value).toBe("Ala@Example.com");
  });

  it.each([
    [{ code: "RATE_LIMITED", retryAfterSeconds: 600 }, "Zbyt wiele prób", "Spróbuj ponownie za 10 min."],
    [{ code: "RATE_LIMITED" }, "Zbyt wiele prób", "Spróbuj ponownie za jakiś czas."],
    [{ code: "network" }, "Brak połączenia", "Wpisany adres został zachowany"],
    [{ code: "INTERNAL" }, "Nie udało się wysłać prośby", "Spróbuj ponownie."],
  ])("shows a general error for %j and focuses the field", async (error, title, details) => {
    apiCall.mockResolvedValue(failure(error));
    render(<ForgotPasswordForm />);

    await fillAndSubmit();

    const box = await screen.findByTestId("forgot-error");
    expect(box.textContent).toContain(title);
    expect(box.textContent).toContain(details);
    expect(screen.queryByTestId("forgot-sent")).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText(/E-mail/));
  });

  it("blocks a second submit while pending", async () => {
    apiCall.mockReturnValue(new Promise(() => {}));
    render(<ForgotPasswordForm />);

    await fillAndSubmit();

    expect((screen.getByRole("button", { name: "Wysyłanie…" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
