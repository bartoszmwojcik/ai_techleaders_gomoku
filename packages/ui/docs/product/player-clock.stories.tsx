import { PlayerClock } from "@gomoku/ui/game/player-clock";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Narrow, StateMatrix } from "../../.storybook/blocks";

const meta = {
  title: "Produkt/Partia/Zegar gracza",
  component: PlayerClock,
  args: { name: "Ala_7", remainingMs: 581_000, activeLabel: "Twój ruch", lowLabel: "Mało czasu" },
} satisfies Meta<typeof PlayerClock>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = { args: { active: true } };

export const Stany: Story = {
  render: (args) => (
    <div className="max-w-md">
      <StateMatrix
        rows={[
          { state: "default", label: "Start partii (10:00)", render: () => <PlayerClock {...args} remainingMs={600_000} /> },
          { state: "selected", label: "Zegar biegnie", render: () => <PlayerClock {...args} active /> },
          { state: "default", label: "Mało czasu", render: () => <PlayerClock {...args} remainingMs={42_000} active /> },
          { state: "disabled", label: "Czas się skończył", render: () => <PlayerClock {...args} remainingMs={0} /> },
        ]}
      />
    </div>
  ),
};

export const DlugaNazwaNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <PlayerClock {...args} name="Ala_Kowalska_Mistrzyni_Gomoku_2026" active />
    </Narrow>
  ),
};

export const CzasZegarIOgloszenie: Story = {
  args: { active: true, remainingMs: 42_000 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("timer")).toHaveTextContent("0:42");
    await expect(canvas.getByText("Mało czasu")).toBeVisible();
    await expect(canvas.getByText("Twój ruch")).toBeVisible();
  },
};
