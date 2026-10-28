// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import { BANNER_REOPEN_MS } from "./verify-email-banner-memory";
import { VerifyEmailNotice } from "./verify-email-banner";

const KEY = "gomoku:verify-email-banner-closed:u1";
const NOW = new Date("2026-10-28T12:00:00Z");

function renderBanner() {
  return render(
    <main>
      <h1>Konto</h1>
      <VerifyEmailNotice userId="u1" email="ala@example.com" />
    </main>,
  );
}

const outcomeText = () => screen.findByText((_, el) => el?.tagName === "P" && el.getAttribute("role") === "status");
const banner = () => screen.queryByTestId("verify-email-banner");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  apiCall.mockReset().mockResolvedValue({ ok: true, data: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("VerifyEmailNotice", () => {
  it("renders the banner open on the server, so the layout does not shift", () => {
    const html = renderToString(<VerifyEmailNotice userId="u1" email="ala@example.com" />);
    expect(html).toContain("Potwierdź adres e-mail");
    expect(html).toContain("ala@example.com");
  });

  it("hydrates the server markup without a mismatch and hides a banner closed earlier", async () => {
    const html = renderToString(<VerifyEmailNotice userId="u1" email="ala@example.com" />);
    window.localStorage.setItem(KEY, String(NOW.getTime()));
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <VerifyEmailNotice userId="u1" email="ala@example.com" />);
    });

    expect(consoleError).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid=verify-email-banner]")).toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it("keeps the server banner after hydration when it was never closed", async () => {
    const html = renderToString(<VerifyEmailNotice userId="u1" email="ala@example.com" />);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <VerifyEmailNotice userId="u1" email="ala@example.com" />);
    });

    expect(consoleError).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid=verify-email-banner]")).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it("shows the banner with the reason and the address", () => {
    renderBanner();
    expect(banner()?.textContent).toContain("Potwierdź adres e-mail");
    expect(banner()?.textContent).toContain("Bez potwierdzonego adresu nie odzyskasz konta, jeśli zapomnisz hasła.");
    expect(banner()?.textContent).toContain("Link wysyłamy na ala@example.com — sprawdź też folder spam.");
  });

  it("closes, remembers it and does not come back on the next visit", async () => {
    const first = renderBanner();
    await userEvent.click(screen.getByRole("button", { name: "Zamknij" }));

    expect(banner()).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBe(String(NOW.getTime()));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Konto" }));

    first.unmount();
    renderBanner();
    expect(banner()).toBeNull();
  });

  it("returns after 7 days", () => {
    window.localStorage.setItem(KEY, String(NOW.getTime() - BANNER_REOPEN_MS + 1000));
    const first = renderBanner();
    expect(banner()).toBeNull();
    first.unmount();

    vi.setSystemTime(new Date(NOW.getTime() + 1000));
    renderBanner();
    expect(banner()).not.toBeNull();
  });

  it("is closed for one account only", () => {
    window.localStorage.setItem("gomoku:verify-email-banner-closed:other", String(NOW.getTime()));
    renderBanner();
    expect(banner()).not.toBeNull();
  });

  it("hides when it is closed in another tab", () => {
    renderBanner();
    act(() => {
      window.localStorage.setItem(KEY, String(NOW.getTime()));
      window.dispatchEvent(new Event("storage"));
    });
    expect(banner()).toBeNull();
  });

  it("is visible when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    renderBanner();
    expect(banner()).not.toBeNull();
  });

  it("still closes for this visit when storage refuses the write", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    renderBanner();
    await userEvent.click(screen.getByRole("button", { name: "Zamknij" }));
    expect(banner()).toBeNull();
  });

  it("closes without a heading on the page", async () => {
    render(<VerifyEmailNotice userId="u1" email="ala@example.com" />);
    await userEvent.click(screen.getByRole("button", { name: "Zamknij" }));
    expect(banner()).toBeNull();
  });
});

describe("VerifyEmailNotice: resend", () => {
  const resend = () => userEvent.click(screen.getByRole("button", { name: "Wyślij ponownie" }));

  it("is busy while sending, then says it was sent and moves the focus to the text", async () => {
    let finish: (value: unknown) => void = () => undefined;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderBanner();
    await resend();

    const button = screen.getByRole("button", { name: "Wyślij ponownie" }) as HTMLButtonElement;
    expect(apiCall).toHaveBeenCalledWith("/api/auth/email-verification/resend");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");

    finish({ ok: true, data: null });
    const status = await outcomeText();
    expect(status.textContent).toBe("Wysłano. Nowy link zastępuje poprzedni.");
    await waitFor(() => expect(document.activeElement).toBe(status));
    expect((screen.getByRole("button", { name: "Wyślij ponownie" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not mind the banner being closed in another tab while sending", async () => {
    let finish: (value: unknown) => void = () => undefined;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderBanner();
    await resend();
    act(() => {
      window.localStorage.setItem(KEY, String(NOW.getTime()));
      window.dispatchEvent(new Event("storage"));
    });
    await act(async () => finish({ ok: true, data: null }));
    expect(banner()).toBeNull();
  });

  it("shows the waiting time of a limit and blocks the button", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "RATE_LIMITED", message: "x", retryAfterSeconds: 2461 } });
    renderBanner();
    await resend();

    expect((await screen.findByRole("alert")).textContent).toBe("Za wiele prób. Spróbuj za 42 min.");
    expect((screen.getByRole("button", { name: "Wyślij ponownie" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says to try later when the limit has no time", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "RATE_LIMITED", message: "x" } });
    renderBanner();
    await resend();
    expect((await screen.findByRole("alert")).textContent).toBe("Za wiele prób. Spróbuj później.");
  });

  it.each([
    ["EMAIL_SEND_FAILED", "Nie udało się wysłać wiadomości. Spróbuj później."],
    ["EMAIL_QUOTA_EXCEEDED", "Wysyłka wiadomości jest chwilowo niedostępna. Spróbuj jutro. Gra nie zależy od potwierdzenia."],
    ["network", "Nie udało się połączyć z serwerem. Spróbuj ponownie."],
    ["INTERNAL", "Nie udało się wysłać wiadomości. Spróbuj później."],
  ])("reports %s", async (code, text) => {
    apiCall.mockResolvedValue({ ok: false, error: { code, message: "x" } });
    renderBanner();
    await resend();

    expect((await screen.findByRole("alert")).textContent).toBe(text);
    expect((screen.getByRole("button", { name: "Wyślij ponownie" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("offers a refresh when the address is already confirmed (409)", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "ALREADY_VERIFIED", message: "x" } });
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload });
    renderBanner();
    await resend();

    expect((await outcomeText()).textContent).toContain("Ten adres jest już potwierdzony.");
    await userEvent.click(screen.getByRole("button", { name: "Odśwież stronę" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("asks to sign in again when the session expired (401)", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "UNAUTHORIZED", message: "x" } });
    renderBanner();
    await resend();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Sesja wygasła.");
    expect(alert.querySelector("a")?.getAttribute("href")).toBe("/login?next=/account");
  });
});
