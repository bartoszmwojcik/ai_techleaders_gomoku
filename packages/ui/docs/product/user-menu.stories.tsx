import { UserMenu, UserMenuAction, UserMenuLink } from "@gomoku/ui/game/user-menu";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const onLogout = fn();

const items = (
  <>
    <UserMenuLink href="#konto">Konto</UserMenuLink>
    <UserMenuLink href="#historia">Historia</UserMenuLink>
    <UserMenuAction onSelect={onLogout}>Wyloguj</UserMenuAction>
  </>
);

const meta = {
  title: "Produkt/Konta/Menu użytkownika",
  component: UserMenu,
  args: {
    name: "Ala_7",
    label: "Zalogowano jako Ala_7, menu konta",
    children: items,
  },
} satisfies Meta<typeof UserMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const DlugaNazwaNaWaskimEkranie320: Story = {
  args: {
    name: "Bardzo_Dluga_Nazwa_Gracza_Ktora_Sie_Nie_Miesci",
    label: "Zalogowano jako Bardzo_Dluga_Nazwa_Gracza_Ktora_Sie_Nie_Miesci, menu konta",
  },
  render: (args) => (
    <Narrow>
      <div className="flex justify-between gap-group">
        <span className="shrink-0 text-body">Gomoku</span>
        <div className="flex min-w-0 justify-end">
          <UserMenu {...args} />
        </div>
      </div>
    </Narrow>
  ),
};

export const MenuOtwarteMyszka: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Zalogowano jako Ala_7, menu konta" }));
    await expect(await body.findByRole("menuitem", { name: "Konto" })).toBeVisible();
    await expect(body.getByRole("menuitem", { name: "Historia" })).toBeVisible();
    await expect(body.getByRole("menuitem", { name: "Wyloguj" })).toBeVisible();
  },
};

export const KlawiaturaStrzalkiIEsc: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const button = canvas.getByRole("button", { name: "Zalogowano jako Ala_7, menu konta" });
    button.focus();
    await userEvent.keyboard("{Enter}");
    const first = await body.findByRole("menuitem", { name: "Konto" });
    await waitFor(() => expect(first).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}");
    await expect(body.getByRole("menuitem", { name: "Historia" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("menu")).toBeNull());
    await expect(button).toHaveFocus();
  },
};
