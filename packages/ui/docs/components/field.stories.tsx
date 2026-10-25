import { Field } from "@gomoku/ui/game/field";
import { TextInput } from "@gomoku/ui/game/text-input";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Prymitywy/Pole formularza",
  component: Field,
  args: {
    label: "Kod zaproszenia",
    hint: "Kod ma 8 znaków, wielkość liter nie ma znaczenia.",
    children: (control) => <TextInput autoComplete="off" {...control} />,
  },
} satisfies Meta<typeof Field>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Wymagane: Story = {
  args: { label: "E-mail", hint: undefined, required: true, requirement: "(wymagane)", children: (control) => <TextInput type="email" autoComplete="email" {...control} /> },
};

export const Opcjonalne: Story = {
  args: { label: "Nazwa gracza", hint: undefined, requirement: "(opcjonalne)" },
};

export const Blad: Story = {
  args: { label: "E-mail", hint: undefined, error: "Sprawdź adres e-mail: brakuje znaku @.", children: (control) => <TextInput type="email" defaultValue="alaexample.com" {...control} /> },
};

export const Zablokowane: Story = {
  args: { children: (control) => <TextInput disabled defaultValue="ABCD-EFGH" {...control} /> },
};

export const DlugaTrescNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <Field {...args} label="Aktualne hasło do konta, którego używasz na tym urządzeniu" error="Hasło jest niepoprawne. Spróbuj ponownie albo ustaw nowe przez link „Nie pamiętasz hasła?”." />
    </Narrow>
  ),
};

export const EtykietaIOpisPodpietePoprawnie: Story = {
  args: { error: "Kod jest za krótki: wpisz 8 znaków." },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByLabelText("Kod zaproszenia");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription("Kod ma 8 znaków, wielkość liter nie ma znaczenia. Kod jest za krótki: wpisz 8 znaków.");
    await userEvent.type(input, "ABCD");
    await expect(input).toHaveValue("ABCD");
  },
};
