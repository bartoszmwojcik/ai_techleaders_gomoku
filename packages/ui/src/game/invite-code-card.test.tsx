// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InviteCodeCard, type InviteCodeCardProps } from "./invite-code-card";

afterEach(cleanup);

function renderCard(props: Partial<InviteCodeCardProps> = {}) {
  const onCopy = vi.fn();
  render(
    <InviteCodeCard
      title="Zaproś znajomego"
      link="https://gomoku.example/invite/ABCD-EFGH"
      code="ABCD-EFGH"
      linkLabel="Link do zaproszenia"
      codeLabel="Kod zaproszenia"
      copyLabel="Kopiuj link"
      copiedLabel="Skopiowano"
      onCopy={onCopy}
      {...props}
    />,
  );
  return onCopy;
}

describe("InviteCodeCard", () => {
  it("shows the link and the code under named lines in a labelled region", () => {
    renderCard();

    expect(screen.getByRole("region", { name: "Zaproś znajomego" })).toBeTruthy();
    expect(screen.getByText("Link do zaproszenia")).toBeTruthy();
    expect(screen.getByText("https://gomoku.example/invite/ABCD-EFGH")).toBeTruthy();
    expect(screen.getByText("ABCD-EFGH").className).toContain("text-section");
    expect(screen.queryByText(/Ważne do/)).toBeNull();
  });

  it("copies the link on click and announces the copy once it is done", async () => {
    const user = userEvent.setup();
    const onCopy = renderCard();

    await user.click(screen.getByRole("button", { name: "Kopiuj link" }));

    expect(onCopy).toHaveBeenCalledTimes(1);
    cleanup();
    renderCard({ copied: true });
    expect(screen.getByRole("button", { name: "Skopiowano" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Skopiowano");
  });

  it("shows until when the invitation works", () => {
    renderCard({ validUntil: "Ważne do 18:40" });

    expect(screen.getByText("Ważne do 18:40")).toBeTruthy();
  });

  it("offers sharing only when the page can share, and cancelling when given", async () => {
    const user = userEvent.setup();
    const onShare = vi.fn();
    const onCancel = vi.fn();
    renderCard({ shareLabel: "Udostępnij", onShare, cancelLabel: "Anuluj zaproszenie", onCancel, className: "mt-4" });

    await user.click(screen.getByRole("button", { name: "Udostępnij" }));
    await user.click(screen.getByRole("button", { name: "Anuluj zaproszenie" }));

    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("hides share and cancel when they are not given", () => {
    renderCard({ shareLabel: "Udostępnij", cancelLabel: "Anuluj zaproszenie" });

    expect(screen.queryByRole("button", { name: "Udostępnij" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Anuluj zaproszenie" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skopiowano" })).toBeNull();
  });
});
