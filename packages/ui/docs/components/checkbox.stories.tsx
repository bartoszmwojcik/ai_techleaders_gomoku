import { Checkbox } from "@gomoku/ui/game/checkbox";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { Narrow, StateMatrix } from "../../.storybook/blocks";

const meta = {
  title: "Prymitywy/Pole wyboru",
  component: Checkbox,
  args: { label: "Rozumiem, że konta nie da się odzyskać" },
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const ZPodpowiedzia: Story = {
  args: { hint: "Twoje zakończone partie zostaną u przeciwników jako „Usunięty gracz”." },
};

export const Stany: Story = {
  render: (args) => (
    <StateMatrix
      rows={[
        { state: "default", label: "Niezaznaczony", render: () => <Checkbox {...args} /> },
        { state: "selected", label: "Zaznaczony", render: () => <Checkbox {...args} defaultChecked /> },
        { state: "hover", label: "Najechanie", render: (s) => <Checkbox {...args} data-preview-state={s} /> },
        { state: "focus", label: "Fokus", render: (s) => <Checkbox {...args} data-preview-state={s} /> },
        { state: "disabled", label: "Zablokowany", render: () => <Checkbox {...args} disabled /> },
      ]}
    />
  ),
};

export const DlugaTrescNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <Checkbox {...args} label="Rozumiem, że usunięcie konta jest natychmiastowe i nieodwracalne oraz że nie będę mógł odzyskać swoich partii" />
    </Narrow>
  ),
};

export const KlikniecieWEtykieteIKlawiatura: Story = {
  play: async ({ canvasElement }) => {
    const box = within(canvasElement).getByRole("checkbox", { name: "Rozumiem, że konta nie da się odzyskać" });
    await expect(box).not.toBeChecked();
    await userEvent.click(within(canvasElement).getByText("Rozumiem, że konta nie da się odzyskać"));
    await expect(box).toBeChecked();
    box.focus();
    await userEvent.keyboard(" ");
    await expect(box).not.toBeChecked();
  },
};
