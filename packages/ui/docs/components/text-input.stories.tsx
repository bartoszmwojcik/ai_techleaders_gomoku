import { TextInput } from "@gomoku/ui/game/text-input";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { Narrow, StateMatrix } from "../../.storybook/blocks";

const meta = {
  title: "Prymitywy/Pole tekstowe",
  component: TextInput,
  // The accessible name comes from aria-label here only because a bare input has no Field around it.
  args: { "aria-label": "Kod zaproszenia", placeholder: "ABCD-EFGH" },
} satisfies Meta<typeof TextInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Typy: Story = {
  render: (args) => (
    <div className="flex max-w-sm flex-col gap-stack">
      <TextInput {...args} />
      <TextInput {...args} type="email" aria-label="E-mail" placeholder="ala@example.com" autoComplete="email" />
      <TextInput {...args} type="password" aria-label="Hasło" placeholder="" autoComplete="current-password" />
    </div>
  ),
};

export const Stany: Story = {
  render: (args) => (
    <StateMatrix
      rows={[
        { state: "default", label: "Domyślny", render: () => <TextInput {...args} /> },
        { state: "hover", label: "Najechanie", render: (s) => <TextInput {...args} data-preview-state={s} /> },
        { state: "focus", label: "Fokus", render: (s) => <TextInput {...args} data-preview-state={s} /> },
        { state: "disabled", label: "Zablokowany", render: () => <TextInput {...args} disabled defaultValue="ABCD-EFGH" /> },
        { state: "error", label: "Błąd", render: () => <TextInput {...args} aria-invalid defaultValue="ABCD" /> },
      ]}
    />
  ),
};

export const DlugaTrescNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <TextInput {...args} defaultValue="bardzo-dlugi-adres-email-gracza@przyklad-domena-internetowa.example" aria-label="E-mail" />
    </Narrow>
  ),
};

export const Wpisywanie: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox", { name: "Kod zaproszenia" });
    await userEvent.type(input, "ABCD-EFGH");
    await expect(input).toHaveValue("ABCD-EFGH");
  },
};
