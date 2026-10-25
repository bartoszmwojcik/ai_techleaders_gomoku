import { TurnStatus } from "@gomoku/ui/game/turn-status";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Produkt/Partia/Status tury",
  component: TurnStatus,
  args: { children: "Twój ruch (czarne)", color: "black" },
  argTypes: { color: { control: "inline-radio", options: ["black", "white"] } },
} satisfies Meta<typeof TurnStatus>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Warianty: Story = {
  render: () => (
    <div className="flex flex-col gap-stack">
      <TurnStatus color="black">Twój ruch (czarne)</TurnStatus>
      <TurnStatus color="white">Twój ruch (białe)</TurnStatus>
      <TurnStatus color="white">Ruch przeciwnika</TurnStatus>
      <TurnStatus>Czekamy, aż przeciwnik otworzy partię</TurnStatus>
    </div>
  ),
};

export const DlugaTrescNaWaskimEkranie: Story = {
  render: () => (
    <Narrow>
      <TurnStatus color="black">Czekamy, aż Ala_Kowalska_Mistrzyni_Gomoku_2026 otworzy partię (do 15 minut)</TurnStatus>
    </Narrow>
  ),
};

export const OgloszenieGrzeczne: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Twój ruch (czarne)");
  },
};
