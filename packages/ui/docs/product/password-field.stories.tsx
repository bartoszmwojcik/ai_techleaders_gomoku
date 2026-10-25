import { PasswordField } from "@gomoku/ui/game/password-field";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Produkt/Konta/Pole hasła",
  component: PasswordField,
  args: { label: "Hasło", showLabel: "Pokaż hasło", hideLabel: "Ukryj hasło", autoComplete: "current-password" },
} satisfies Meta<typeof PasswordField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const NoweHaslo: Story = {
  args: { label: "Nowe hasło", autoComplete: "new-password", hint: "Co najmniej 16 znaków", required: true, requirement: "(wymagane)" },
};

export const Blad: Story = {
  args: { error: "Hasło jest za krótkie: dodaj jeszcze kilka znaków.", defaultValue: "krotkie" },
};

export const DlugaEtykietaNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <PasswordField {...args} label="Aktualne hasło do konta, którego używasz na tym urządzeniu" hint="Podaj hasło, żeby potwierdzić zmianę." />
    </Narrow>
  ),
};

export const PokazujeIUkrywaHaslo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Hasło");
    await userEvent.type(input, "tajne-haslo");
    await expect(input).toHaveAttribute("type", "password");
    await userEvent.click(canvas.getByRole("button", { name: "Pokaż hasło" }));
    await expect(input).toHaveAttribute("type", "text");
    await expect(canvas.getByRole("button", { name: "Ukryj hasło" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Ukryj hasło" }));
    await expect(input).toHaveAttribute("type", "password");
  },
};
