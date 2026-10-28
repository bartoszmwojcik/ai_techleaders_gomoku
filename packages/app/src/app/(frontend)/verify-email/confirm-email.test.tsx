// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import { ConfirmEmail } from "./confirm-email";

const base = { token: "tok", nextPath: "/", signedIn: false, alreadyVerified: false };
const failure = (code: string) => ({ ok: false, error: { code, message: "x" } });

beforeEach(() => apiCall.mockReset());
afterEach(cleanup);

async function confirm() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Potwierdź e-mail" }));
  return user;
}

describe("ConfirmEmail", () => {
  it("shows the button, sends nothing on its own and focuses the heading", () => {
    render(<ConfirmEmail {...base} />);

    expect(screen.getByRole("heading", { name: "Potwierdź adres e-mail" })).toBe(document.activeElement);
    expect(screen.getByRole("button", { name: "Potwierdź e-mail" })).toBeTruthy();
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("posts the token and next, blocks a second click while pending", async () => {
    let resolve!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ConfirmEmail {...base} nextPath="/invite/abc" />);

    await confirm();

    expect(apiCall).toHaveBeenCalledWith("/api/auth/email-verification/confirm", {
      body: { token: "tok", next: "/invite/abc" },
    });
    expect((screen.getByRole("button", { name: "Potwierdź e-mail" }) as HTMLButtonElement).disabled).toBe(true);
    resolve({ ok: true, data: { next: "/invite/abc" } });
    await screen.findByText("Adres potwierdzony");
    expect(apiCall).toHaveBeenCalledOnce();
  });

  it("after success a signed-in player continues to the server's next path; focus moves to the result", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { next: "/invite/abc" } });
    render(<ConfirmEmail {...base} signedIn nextPath="/invite/abc" />);

    await confirm();

    const link = await screen.findByRole("link", { name: "Przejdź dalej" });
    expect(link.getAttribute("href")).toBe("/invite/abc");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("verify-done")));
  });

  it("after success a signed-out player is not logged in and gets a login link keeping next", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { next: "/invite/abc" } });
    render(<ConfirmEmail {...base} nextPath="/invite/abc" />);

    await confirm();

    expect(await screen.findByText(/Nie jesteś zalogowany na tym urządzeniu/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Zaloguj się" }).getAttribute("href")).toBe(
      "/login?next=%2Finvite%2Fabc",
    );
  });

  it("links to a plain /login when next is the home page", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { next: "/" } });
    render(<ConfirmEmail {...base} />);

    await confirm();

    expect((await screen.findByRole("link", { name: "Zaloguj się" })).getAttribute("href")).toBe("/login");
  });

  it.each(["INVALID_TOKEN", "VALIDATION"])("%s shows the uniform message and focuses it", async (code) => {
    apiCall.mockResolvedValue(failure(code));
    render(<ConfirmEmail {...base} />);

    await confirm();

    expect(await screen.findByText("Link wygasł lub został już użyty.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Potwierdź e-mail" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("verify-invalid")));
    expect(screen.getByRole("link", { name: "Zaloguj się, aby wysłać nowy link" }).getAttribute("href")).toBe(
      "/login?next=/account",
    );
    expect(screen.queryByRole("button", { name: "Wyślij nowy link" })).toBeNull();
  });

  it("without a token shows the same message straight away", () => {
    render(<ConfirmEmail {...base} token={undefined} />);

    expect(screen.getByText("Link wygasł lub został już użyty.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Potwierdź e-mail" })).toBeNull();
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("tells a signed-in player with a confirmed account so, and offers to continue", () => {
    render(<ConfirmEmail {...base} token={undefined} signedIn alreadyVerified nextPath="/account" />);

    expect(screen.getByText("Adres jest już potwierdzony.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Przejdź dalej" }).getAttribute("href")).toBe("/account");
    expect(screen.queryByRole("button", { name: "Wyślij nowy link" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Zaloguj się, aby/ })).toBeNull();
  });

  it("a server error offers a retry that posts again", async () => {
    apiCall.mockResolvedValueOnce(failure("INTERNAL")).mockResolvedValueOnce({ ok: true, data: { next: "/" } });
    render(<ConfirmEmail {...base} />);

    const user = await confirm();
    expect(await screen.findByText("Nie udało się potwierdzić adresu")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("verify-error")));

    await user.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    expect(await screen.findByText("Adres potwierdzony")).toBeTruthy();
    expect(apiCall).toHaveBeenCalledTimes(2);
  });

  it("a network failure says so and offers a retry", async () => {
    apiCall.mockResolvedValue(failure("network"));
    render(<ConfirmEmail {...base} />);

    await confirm();

    expect(await screen.findByText("Brak połączenia")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeTruthy();
  });

  describe("new link (invalid link, signed in, unconfirmed)", () => {
    const signedIn = { ...base, token: undefined, signedIn: true };

    async function resend() {
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Wyślij nowy link" }));
      return user;
    }

    it("posts without a body, shows a status and moves the focus to it", async () => {
      let resolve!: (value: unknown) => void;
      apiCall.mockReturnValue(new Promise((r) => (resolve = r)));
      render(<ConfirmEmail {...signedIn} />);

      await resend();

      expect(apiCall).toHaveBeenCalledWith("/api/auth/email-verification/resend");
      expect((screen.getByRole("button", { name: "Wyślij nowy link" }) as HTMLButtonElement).disabled).toBe(true);
      resolve({ ok: true, data: null });
      const status = await screen.findByTestId("resend-feedback");
      expect(status.textContent).toBe("Wysłano. Nowy link zastępuje poprzedni.");
      await waitFor(() => expect(document.activeElement).toBe(status));
      expect((screen.getByRole("button", { name: "Wyślij nowy link" }) as HTMLButtonElement).disabled).toBe(false);
    });

    it.each([
      [3600, "Za wiele prób. Spróbuj za 60 min."],
      [2461, "Za wiele prób. Spróbuj za 42 min."],
      [5, "Za wiele prób. Spróbuj za 1 min."],
      [undefined, "Za wiele prób. Spróbuj później."],
    ])("a limit (retry after %s s) says when to come back and blocks the button", async (retryAfterSeconds, text) => {
      apiCall.mockResolvedValue({ ok: false, error: { code: "RATE_LIMITED", message: "x", retryAfterSeconds } });
      render(<ConfirmEmail {...signedIn} />);

      await resend();

      const alert = await screen.findByTestId("resend-feedback");
      expect(alert.textContent).toBe(text);
      await waitFor(() => expect(document.activeElement).toBe(alert));
      expect((screen.getByRole("button", { name: "Wyślij nowy link" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it.each([
      ["EMAIL_SEND_FAILED", "Nie udało się wysłać wiadomości. Spróbuj później."],
      ["INTERNAL", "Nie udało się wysłać wiadomości. Spróbuj później."],
      ["EMAIL_QUOTA_EXCEEDED", "Wysyłka wiadomości jest chwilowo niedostępna. Spróbuj jutro. Gra nie zależy od potwierdzenia."],
      ["network", "Nie udało się połączyć z serwerem. Spróbuj ponownie."],
    ])("%s shows an alert and allows another try", async (code, text) => {
      apiCall.mockResolvedValue(failure(code));
      render(<ConfirmEmail {...signedIn} />);

      await resend();

      expect((await screen.findByTestId("resend-feedback")).textContent).toBe(text);
      expect((screen.getByRole("button", { name: "Wyślij nowy link" }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("an already confirmed address offers a page refresh", async () => {
      apiCall.mockResolvedValue(failure("ALREADY_VERIFIED"));
      const reload = vi.fn();
      vi.stubGlobal("location", { ...window.location, reload });
      render(<ConfirmEmail {...signedIn} />);

      const user = await resend();
      expect((await screen.findByTestId("resend-feedback")).textContent).toContain("Ten adres jest już potwierdzony.");
      await user.click(screen.getByRole("button", { name: "Odśwież stronę" }));

      expect(reload).toHaveBeenCalledOnce();
      vi.unstubAllGlobals();
    });

    it("an expired session links to logging in", async () => {
      apiCall.mockResolvedValue(failure("UNAUTHORIZED"));
      render(<ConfirmEmail {...signedIn} />);

      await resend();

      expect((await screen.findByTestId("resend-feedback")).textContent).toContain("Sesja wygasła.");
      expect(screen.getByRole("link", { name: "Zaloguj się" }).getAttribute("href")).toBe("/login?next=/account");
    });

    it("also works after a failed confirmation of a real token", async () => {
      apiCall.mockResolvedValueOnce(failure("INVALID_TOKEN")).mockResolvedValueOnce({ ok: true, data: null });
      render(<ConfirmEmail {...base} signedIn />);

      const user = await confirm();
      await user.click(await screen.findByRole("button", { name: "Wyślij nowy link" }));

      expect((await screen.findByTestId("resend-feedback")).textContent).toContain("Wysłano.");
    });
  });
});
