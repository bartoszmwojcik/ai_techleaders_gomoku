// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replace, apiCall } = vi.hoisted(() => ({ replace: vi.fn(), apiCall: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import { LoginForm } from "./login-form";

const failure = (error: { code: string; retryAfterSeconds?: number }) => ({
  ok: false,
  error: { message: "x", ...error },
});

async function fillAndSubmit({ email = "ala@example.com", password = "secret123" } = {}) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText(/E-mail/), email);
  if (password) await user.type(screen.getByLabelText(/^Hasło/), password);
  await user.click(screen.getByRole("button", { name: "Zaloguj się" }));
  return user;
}

beforeEach(() => {
  replace.mockReset();
  apiCall.mockReset();
});
afterEach(cleanup);

describe("LoginForm", () => {
  it("shows the fields with the right autocomplete and a link to register", () => {
    render(<LoginForm nextPath="/" />);
    expect(screen.getByLabelText(/E-mail/).getAttribute("autocomplete")).toBe("email");
    expect(screen.getByLabelText(/^Hasło/).getAttribute("autocomplete")).toBe("current-password");
    expect(screen.getByRole("link", { name: "Załóż konto" }).getAttribute("href")).toBe("/register");
    expect(screen.queryByTestId("login-error")).toBeNull();
  });

  it("keeps a non-default next path in the register link", () => {
    render(<LoginForm nextPath="/account" />);
    expect(screen.getByRole("link", { name: "Załóż konto" }).getAttribute("href")).toBe(
      "/register?next=%2Faccount",
    );
  });

  it("hides the password by default, reveals it on demand and hides it again", async () => {
    const user = userEvent.setup();
    render(<LoginForm nextPath="/" />);
    const input = screen.getByLabelText(/^Hasło/) as HTMLInputElement;
    expect(input.type).toBe("password");
    await user.click(screen.getByRole("button", { name: "Pokaż hasło" }));
    expect(input.type).toBe("text");
    await user.click(screen.getByRole("button", { name: "Ukryj hasło" }));
    expect(input.type).toBe("password");
  });

  it("logs in and replaces the location with next, staying pending", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { user: { id: "u1", displayName: "Ala_7" } } });
    render(<LoginForm nextPath="/account" />);

    await fillAndSubmit();

    expect(apiCall).toHaveBeenCalledWith("/api/auth/login", {
      body: { email: "ala@example.com", password: "secret123" },
    });
    expect(replace).toHaveBeenCalledWith("/account");
    expect((screen.getByRole("button", { name: "Logowanie…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("validates locally, without a request, and focuses the first invalid field", async () => {
    render(<LoginForm nextPath="/" />);

    await fillAndSubmit({ email: "nie-email", password: "" });

    expect(apiCall).not.toHaveBeenCalled();
    expect(screen.getByText("Podaj poprawny adres e-mail.")).toBeTruthy();
    expect(screen.getByText("Podaj hasło.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(/E-mail/));
  });

  it("focuses the password when only it is missing", async () => {
    render(<LoginForm nextPath="/" />);
    await fillAndSubmit({ password: "" });
    expect(apiCall).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText(/^Hasło/));
  });

  it("shows one general message for wrong credentials, clears and hides the password, focuses it", async () => {
    apiCall.mockResolvedValue(failure({ code: "INVALID_CREDENTIALS" }));
    const user = userEvent.setup();
    render(<LoginForm nextPath="/" />);
    await user.type(screen.getByLabelText(/E-mail/), "ala@example.com");
    await user.type(screen.getByLabelText(/^Hasło/), "secret123");
    await user.click(screen.getByRole("button", { name: "Pokaż hasło" }));
    await user.click(screen.getByRole("button", { name: "Zaloguj się" }));

    const alert = screen.getByTestId("login-error");
    expect(alert.textContent).toContain("Nieprawidłowy e-mail lub hasło");
    expect(screen.queryByText("Podaj hasło.")).toBeNull();
    const input = screen.getByLabelText(/^Hasło/) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.type).toBe("password");
    expect(input.getAttribute("aria-invalid")).not.toBe("true");
    expect((screen.getByLabelText(/E-mail/) as HTMLInputElement).value).toBe("ala@example.com");
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect((screen.getByRole("button", { name: "Zaloguj się" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("moves focus to the password again on a second failure", async () => {
    apiCall.mockResolvedValue(failure({ code: "INVALID_CREDENTIALS" }));
    const user = await (async () => {
      render(<LoginForm nextPath="/" />);
      return fillAndSubmit();
    })();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^Hasło/)));
    await user.click(screen.getByLabelText(/E-mail/));
    await user.type(screen.getByLabelText(/^Hasło/), "x");
    await user.click(screen.getByRole("button", { name: "Zaloguj się" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^Hasło/)));
  });

  it.each([
    [90, "Spróbuj ponownie za 2 min."],
    [5, "Spróbuj ponownie za 1 min."],
    [undefined, "Spróbuj ponownie za jakiś czas."],
  ])("shows the rate limit with Retry-After %s", async (retryAfterSeconds, text) => {
    apiCall.mockResolvedValue(failure({ code: "RATE_LIMITED", retryAfterSeconds }));
    render(<LoginForm nextPath="/" />);
    await fillAndSubmit();
    const alert = screen.getByTestId("login-error");
    expect(alert.textContent).toContain("Zbyt wiele prób");
    expect(alert.textContent).toContain(text);
  });

  it("explains an already signed-in session with a link onward", async () => {
    apiCall.mockResolvedValue(failure({ code: "ALREADY_AUTHENTICATED" }));
    render(<LoginForm nextPath="/account" />);
    await fillAndSubmit();
    const alert = screen.getByTestId("login-error");
    expect(alert.textContent).toContain("Jesteś już zalogowany");
    expect(alert.querySelector("a")?.getAttribute("href")).toBe("/account");
  });

  it("explains a network failure and keeps the e-mail and the password", async () => {
    apiCall.mockResolvedValue(failure({ code: "network" }));
    render(<LoginForm nextPath="/" />);
    await fillAndSubmit();
    expect(screen.getByTestId("login-error").textContent).toContain("Brak połączenia");
    expect((screen.getByLabelText(/E-mail/) as HTMLInputElement).value).toBe("ala@example.com");
    const input = screen.getByLabelText(/^Hasło/) as HTMLInputElement;
    expect(input.value).toBe("secret123");
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("keeps the typed password and its visibility when the limit is hit", async () => {
    apiCall.mockResolvedValue(failure({ code: "RATE_LIMITED", retryAfterSeconds: 60 }));
    const user = userEvent.setup();
    render(<LoginForm nextPath="/" />);
    await user.type(screen.getByLabelText(/E-mail/), "ala@example.com");
    await user.type(screen.getByLabelText(/^Hasło/), "secret123");
    await user.click(screen.getByRole("button", { name: "Pokaż hasło" }));
    await user.click(screen.getByRole("button", { name: "Zaloguj się" }));

    const input = screen.getByLabelText(/^Hasło/) as HTMLInputElement;
    expect(input.value).toBe("secret123");
    expect(input.type).toBe("text");
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it.each(["INTERNAL", "FORBIDDEN", "VALIDATION"])("shows a generic message for %s", async (code) => {
    apiCall.mockResolvedValue(failure({ code }));
    render(<LoginForm nextPath="/" />);
    await fillAndSubmit();
    const alert = screen.getByTestId("login-error");
    expect(alert.textContent).toContain("Nie udało się zalogować");
    expect(alert.textContent).toContain("Spróbuj ponownie.");
    expect((screen.getByLabelText(/^Hasło/) as HTMLInputElement).value).toBe("secret123");
  });
});
