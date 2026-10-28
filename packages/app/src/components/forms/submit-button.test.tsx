// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SubmitButton } from "./submit-button";

afterEach(cleanup);

describe("SubmitButton", () => {
  it("submits the form on click", async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <SubmitButton>Załóż konto</SubmitButton>
      </form>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Załóż konto" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("blocks a second submit and shows the pending label while pending", async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <SubmitButton pending pendingLabel="Zakładanie konta…">
          Załóż konto
        </SubmitButton>
      </form>,
    );
    const button = screen.getByRole("button", { name: "Zakładanie konta…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps the normal label while pending without a pending label", () => {
    render(<SubmitButton pending>Załóż konto</SubmitButton>);
    expect(screen.getByRole("button", { name: "Załóż konto" })).toBeTruthy();
  });
});
