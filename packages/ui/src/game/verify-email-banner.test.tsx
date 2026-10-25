// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VerifyEmailBanner, type VerifyEmailBannerProps } from "./verify-email-banner";

afterEach(cleanup);

function renderBanner(props: Partial<VerifyEmailBannerProps> = {}) {
  const onResend = vi.fn();
  render(
    <VerifyEmailBanner title="Potwierdź e-mail, aby grać" resendLabel="Wyślij ponownie" onResend={onResend} {...props}>
      Link wysyłamy na ala@example.com — sprawdź też folder spam.
    </VerifyEmailBanner>,
  );
  return onResend;
}

describe("VerifyEmailBanner", () => {
  it("asks to confirm the e-mail and offers to resend, without claiming it was sent", async () => {
    const user = userEvent.setup();
    const onResend = renderBanner();

    expect(screen.getByText("Potwierdź e-mail, aby grać")).toBeTruthy();
    expect(screen.getByText(/Link wysyłamy na/)).toBeTruthy();
    expect(screen.queryByText(/Wysłano/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Wyślij ponownie" }));

    expect(onResend).toHaveBeenCalledTimes(1);
  });

  it("blocks a second click while sending", () => {
    renderBanner({ state: "sending", feedback: "ukryte" });

    const button = screen.getByRole("button", { name: "Wyślij ponownie" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("ukryte")).toBeNull();
  });

  it("confirms politely that it was sent", () => {
    renderBanner({ state: "sent", feedback: "Wysłano." });

    expect(screen.getByText("Wysłano.").getAttribute("role")).toBe("status");
  });

  it("explains the limit and disables the button until the time passes", () => {
    renderBanner({ state: "limited", feedback: "Spróbuj za 2 minuty." });

    expect(screen.getByText("Spróbuj za 2 minuty.").getAttribute("role")).toBe("alert");
    expect((screen.getByRole("button", { name: "Wyślij ponownie" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("tells what to do when sending failed and lets the player retry", () => {
    renderBanner({ state: "failed", feedback: "Nie udało się wysłać. Spróbuj ponownie." });

    expect(screen.getByText("Nie udało się wysłać. Spróbuj ponownie.").getAttribute("role")).toBe("alert");
    expect((screen.getByRole("button", { name: "Wyślij ponownie" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows no result line without feedback text", () => {
    renderBanner({ state: "sent" });

    expect(document.querySelectorAll("p[role]")).toHaveLength(0);
  });
});
