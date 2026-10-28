// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replace, apiCall } = vi.hoisted(() => ({ replace: vi.fn(), apiCall: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import { RegisterForm } from "./register-form";

const failure = (error: { code: string; message?: string; fieldErrors?: Record<string, string[]>; retryAfterSeconds?: number }) => ({
  ok: false,
  error: { message: "x", ...error },
});

async function fillAndSubmit({
  email = "ala@example.com",
  name = "Ala_7",
  password = "secret123",
}: { email?: string; name?: string; password?: string } = {}) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText(/E-mail/), email);
  if (name) await user.type(screen.getByLabelText(/Nazwa gracza/), name);
  if (password) await user.type(screen.getByLabelText(/^Hasło/), password);
  await user.click(screen.getByRole("button", { name: "Załóż konto" }));
  return user;
}

beforeEach(() => {
  replace.mockReset();
  apiCall.mockReset();
});
afterEach(cleanup);

describe("RegisterForm", () => {
  it("shows the labels and hints, without a login link", () => {
    render(<RegisterForm nextPath="/" />);
    expect(screen.getByLabelText(/E-mail/)).toBeTruthy();
    expect(screen.getByText("Używasz go do logowania.")).toBeTruthy();
    expect(screen.queryByText(/Wyślemy/)).toBeNull();
    expect(screen.getByText("Widzą ją Twoi przeciwnicy.")).toBeTruthy();
    expect(screen.getByText("Co najmniej 8 znaków")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByTestId("register-error")).toBeNull();
  });

  it("reveals the password on demand", async () => {
    const user = userEvent.setup();
    render(<RegisterForm nextPath="/" />);
    const input = screen.getByLabelText(/^Hasło/) as HTMLInputElement;
    expect(input.type).toBe("password");
    await user.click(screen.getByRole("button", { name: "Pokaż hasło" }));
    expect(input.type).toBe("text");
    await user.click(screen.getByRole("button", { name: "Ukryj hasło" }));
    expect(input.type).toBe("password");
  });

  it("registers and replaces the location with the safe next path, staying pending", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { user: { id: "u1", displayName: "Ala_7" } } });
    render(<RegisterForm nextPath="/invite/abc" />);

    await fillAndSubmit();

    expect(apiCall).toHaveBeenCalledWith("/api/auth/register", {
      body: { email: "ala@example.com", displayName: "Ala_7", password: "secret123" },
    });
    expect(replace).toHaveBeenCalledWith("/invite/abc");
    const button = screen.getByRole("button", { name: "Zakładanie konta…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("validates locally without calling the API and focuses the first invalid field", async () => {
    render(<RegisterForm nextPath="/" />);

    await fillAndSubmit({ email: "nie-email", name: "ab", password: "short" });

    expect(apiCall).not.toHaveBeenCalled();
    expect(screen.getByText("Podaj poprawny adres e-mail.")).toBeTruthy();
    expect(screen.getByText(/Nazwa gracza musi mieć co najmniej 3/)).toBeTruthy();
    expect(screen.getByText(/Hasło musi mieć co najmniej 8/)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(/E-mail/));
    expect(screen.getByLabelText(/E-mail/).getAttribute("aria-invalid")).toBe("true");
  });

  it("clears old errors on the next attempt", async () => {
    apiCall.mockResolvedValue({ ok: true, data: null });
    const user = await (async () => {
      render(<RegisterForm nextPath="/" />);
      return fillAndSubmit({ name: "ab" });
    })();
    expect(screen.getByText(/Nazwa gracza musi mieć co najmniej 3/)).toBeTruthy();

    await user.clear(screen.getByLabelText(/Nazwa gracza/));
    await user.type(screen.getByLabelText(/Nazwa gracza/), "Ala_7");
    await user.click(screen.getByRole("button", { name: "Załóż konto" }));

    expect(screen.queryByText(/Nazwa gracza musi mieć/)).toBeNull();
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("shows a taken name at its field, keeps e-mail and name and clears the password", async () => {
    apiCall.mockResolvedValue(failure({ code: "CONFLICT", fieldErrors: { displayName: ["Ta nazwa jest zajęta."] } }));
    render(<RegisterForm nextPath="/" />);

    await fillAndSubmit();

    expect(screen.getByText("Ta nazwa jest zajęta.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Nazwa gracza/)));
    expect((screen.getByLabelText(/E-mail/) as HTMLInputElement).value).toBe("ala@example.com");
    expect((screen.getByLabelText(/Nazwa gracza/) as HTMLInputElement).value).toBe("Ala_7");
    expect((screen.getByLabelText(/^Hasło/) as HTMLInputElement).value).toBe("");
    expect(screen.queryByTestId("register-error")).toBeNull();
    expect((screen.getByRole("button", { name: "Załóż konto" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows server-side field errors of the password", async () => {
    apiCall.mockResolvedValue(failure({ code: "VALIDATION", fieldErrors: { password: ["Za krótkie"] } }));
    render(<RegisterForm nextPath="/" />);

    await fillAndSubmit();

    expect(screen.getByText("Za krótkie")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^Hasło/)));
  });

  it("shows the uniform conflict message above the form, without naming a field", async () => {
    apiCall.mockResolvedValue(failure({ code: "CONFLICT" }));
    render(<RegisterForm nextPath="/" />);

    await fillAndSubmit();

    const alert = screen.getByTestId("register-error");
    expect(alert.textContent).toContain("Nie udało się założyć konta");
    expect(alert.textContent).toContain("Jeśli masz już konto, zaloguj się.");
    expect(alert.querySelector("a")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^Hasło/)));
  });

  it.each([
    [90, "Spróbuj ponownie za 2 min."],
    [5, "Spróbuj ponownie za 1 min."],
    [undefined, "Spróbuj ponownie za jakiś czas."],
  ])("shows the rate limit with Retry-After %s", async (retryAfterSeconds, text) => {
    apiCall.mockResolvedValue(failure({ code: "RATE_LIMITED", retryAfterSeconds }));
    render(<RegisterForm nextPath="/" />);

    await fillAndSubmit();

    const alert = screen.getByTestId("register-error");
    expect(alert.textContent).toContain("Zbyt wiele prób");
    expect(alert.textContent).toContain(text);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^Hasło/)));
  });

  it("explains an already signed-in session", async () => {
    apiCall.mockResolvedValue(failure({ code: "ALREADY_AUTHENTICATED" }));
    render(<RegisterForm nextPath="/" />);

    await fillAndSubmit();

    const alert = screen.getByTestId("register-error");
    expect(alert.textContent).toContain("Jesteś już zalogowany");
    expect(alert.querySelector("a")?.getAttribute("href")).toBe("/");
  });

  it("explains a network failure and keeps the data except the password", async () => {
    apiCall.mockResolvedValue(failure({ code: "network" }));
    render(<RegisterForm nextPath="/" />);

    await fillAndSubmit();

    expect(screen.getByTestId("register-error").textContent).toContain("Brak połączenia");
    expect((screen.getByLabelText(/E-mail/) as HTMLInputElement).value).toBe("ala@example.com");
    expect((screen.getByLabelText(/^Hasło/) as HTMLInputElement).value).toBe("");
  });

  it.each(["INTERNAL", "FORBIDDEN", "VALIDATION"])("shows a generic message for %s without field errors", async (code) => {
    apiCall.mockResolvedValue(failure({ code }));
    render(<RegisterForm nextPath="/" />);

    await fillAndSubmit();

    const alert = screen.getByTestId("register-error");
    expect(alert.textContent).toContain("Nie udało się założyć konta");
    expect(alert.textContent).toContain("Spróbuj ponownie.");
  });

  it("ignores a submit while a request is in flight", async () => {
    let finish: (value: unknown) => void = () => {};
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<RegisterForm nextPath="/" />);
    const user = await fillAndSubmit();

    // Submit again (Enter in a field) while pending.
    await user.type(screen.getByLabelText(/Nazwa gracza/), "{Enter}");
    expect(apiCall).toHaveBeenCalledTimes(1);

    finish({ ok: true, data: null });
    await waitFor(() => expect(replace).toHaveBeenCalled());
  });
});
