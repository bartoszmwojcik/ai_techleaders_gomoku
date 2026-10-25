// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import { Dialog } from "./dialog";

afterEach(cleanup);

describe("Dialog", () => {
  it("is a named dialog with a description and a labelled close button", () => {
    render(
      <Dialog open title="Dołącz do partii" description="Wpisz kod od znajomego." closeLabel="Zamknij">
        <p>Treść</p>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Dołącz do partii" });
    expect(dialog.getAttribute("aria-describedby")).not.toBeNull();
    expect(screen.getByText("Wpisz kod od znajomego.")).toBeTruthy();
    expect(screen.getByText("Treść")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zamknij" })).toBeTruthy();
  });

  it("has no description when none is given", () => {
    render(<Dialog open title="Dołącz do partii" closeLabel="Zamknij" className="max-w-sm" />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-describedby")).toBeNull();
    expect(dialog.className).toContain("max-w-sm");
  });

  it("opens from its trigger and closes with the close button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog
        trigger={<Button>Mam kod</Button>}
        title="Dołącz do partii"
        closeLabel="Zamknij"
        onOpenChange={onOpenChange}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Mam kod" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole("button", { name: "Zamknij" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<Dialog defaultOpen title="Dołącz" closeLabel="Zamknij" />);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
