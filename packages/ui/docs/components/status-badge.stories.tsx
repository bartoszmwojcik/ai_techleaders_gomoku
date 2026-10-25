import { StatusBadge } from "@gomoku/ui/game/status-badge";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Prymitywy/Znacznik statusu",
  component: StatusBadge,
  args: { children: "Czeka na przeciwnika", status: "info" },
  argTypes: { status: { control: "inline-radio", options: ["info", "success", "warning", "danger"] } },
} satisfies Meta<typeof StatusBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Warianty: Story = {
  render: () => (
    <ul className="m-0 flex list-none flex-wrap gap-group p-0">
      <li><StatusBadge status="success">Wygrana</StatusBadge></li>
      <li><StatusBadge status="danger">Porażka</StatusBadge></li>
      <li><StatusBadge status="info">Remis</StatusBadge></li>
      <li><StatusBadge status="warning">Czas się kończy</StatusBadge></li>
    </ul>
  ),
};

export const DlugaTrescNaWaskimEkranie: Story = {
  render: () => (
    <Narrow>
      <StatusBadge status="warning">Czekamy, aż przeciwnik otworzy partię</StatusBadge>
    </Narrow>
  ),
};

export const MaIkoneISlowo: Story = {
  play: async ({ canvasElement }) => {
    const badge = within(canvasElement).getByText("Czeka na przeciwnika");
    await expect(badge.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  },
};
