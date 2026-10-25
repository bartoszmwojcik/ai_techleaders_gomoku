// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import { ConfirmDialog } from "./confirm-dialog";

afterEach(cleanup);

function renderOpen(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Usunąć konto Ala_7?"
      description="Zakończone partie zostaną u przeciwników jako „Usunięty gracz”."
      confirmLabel="Usuń konto na zawsze"
      cancelLabel="Zostaw konto"
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return onConfirm;
}

describe("ConfirmDialog", () => {
  it("asks with the object name, starts focus on the way out and offers a verb to confirm", () => {
    renderOpen();

    expect(screen.getByRole("alertdialog", { name: "Usunąć konto Ala_7?" })).toBeTruthy();
    expect(screen.getByText(/Zakończone partie/)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Zostaw konto" }));
    expect(screen.getByRole("button", { name: "Usuń konto na zawsze" }).className).toContain("bg-action-danger-bg");
  });

  it("runs onConfirm and leaves closing to the parent", async () => {
    const user = userEvent.setup();
    const onConfirm = renderOpen();

    await user.click(screen.getByRole("button", { name: "Usuń konto na zawsze" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("closes without confirming when the player cancels", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = renderOpen({ onOpenChange });

    await user.click(screen.getByRole("button", { name: "Zostaw konto" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("blocks a second click while confirming", () => {
    renderOpen({ confirming: true });

    const confirm = screen.getByRole("button", { name: "Usuń konto na zawsze" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(confirm.getAttribute("aria-busy")).toBe("true");
  });

  it("can be a primary question without a description", () => {
    renderOpen({ tone: "primary", description: undefined, confirmLabel: "Anuluj i dołącz", className: "max-w-sm" });

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.getAttribute("aria-describedby")).toBeNull();
    expect(dialog.className).toContain("max-w-sm");
    expect(screen.getByRole("button", { name: "Anuluj i dołącz" }).className).toContain("bg-action-primary-bg");
  });

  it("opens from its trigger", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        trigger={<Button variant="danger">Usuń konto</Button>}
        title="Usunąć konto?"
        confirmLabel="Usuń"
        cancelLabel="Zostaw"
        onConfirm={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Usuń konto" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
});
