// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UserMenu, UserMenuAction, UserMenuLink } from "./user-menu";

afterEach(cleanup);

const LABEL = "Zalogowano jako Ala_7, menu konta";

function renderMenu(onLogout = vi.fn()) {
  render(
    <UserMenu name="Ala_7" label={LABEL} data-testid="menu" className="extra">
      <UserMenuLink href="/account" className="link-extra">
        Konto
      </UserMenuLink>
      <UserMenuLink href="/history">Historia</UserMenuLink>
      <UserMenuAction onSelect={onLogout} className="action-extra">
        Wyloguj
      </UserMenuAction>
    </UserMenu>,
  );
  return onLogout;
}

const trigger = () => screen.getByRole("button", { name: LABEL });

describe("UserMenu", () => {
  it("is a closed button with the name, the whole sentence for a screen reader and the popup attributes", () => {
    renderMenu();

    const button = trigger();
    expect(button.textContent).toBe("Ala_7");
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("data-testid")).toBe("menu");
    expect(button.className).toContain("extra");
    expect(button.className).toContain("min-h-target");
    expect(button.querySelector("[title='Ala_7']")).toBeTruthy();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens with a click and shows links and an action in order", async () => {
    renderMenu();
    await userEvent.click(trigger());

    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Konto", "Historia", "Wyloguj"]);
    expect(items[0]!.getAttribute("href")).toBe("/account");
    expect(items[0]!.className).toContain("link-extra");
    expect(items[1]!.getAttribute("href")).toBe("/history");
    expect(items[2]!.className).toContain("action-extra");
  });

  it("marks the item reached with the keyboard by the focus ring, not only by its background", async () => {
    renderMenu();
    await userEvent.click(trigger());
    expect((await screen.findByRole("menuitem", { name: "Wyloguj" })).className).toContain("data-[highlighted]:focus-ring");
  });

  it("works from the keyboard: Enter opens, arrows move, Escape closes and returns focus to the button", async () => {
    renderMenu();
    trigger().focus();

    await userEvent.keyboard("{Enter}");
    const items = await screen.findAllByRole("menuitem");
    await waitFor(() => expect(document.activeElement).toBe(items[0]));

    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[1]);

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.activeElement).toBe(trigger());
  });

  it("runs the action when it is chosen and closes", async () => {
    const onLogout = renderMenu();
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("menuitem", { name: "Wyloguj" }));

    expect(onLogout).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("hands the button out through triggerRef", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <UserMenu name="Ala_7" label={LABEL} triggerRef={ref}>
        <UserMenuLink href="/account">Konto</UserMenuLink>
      </UserMenu>,
    );

    expect(ref.current).toBe(trigger());
  });
});
