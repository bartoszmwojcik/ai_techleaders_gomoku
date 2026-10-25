import { GameResultBanner } from "@gomoku/ui/game/game-result-banner";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Produkt/Partia/Baner wyniku",
  component: GameResultBanner,
  args: { result: "win", title: "Wygrałeś", children: "Pięć kamieni w linii." },
  argTypes: { result: { control: "inline-radio", options: ["win", "loss", "draw"] } },
} satisfies Meta<typeof GameResultBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Wyniki: Story = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-stack">
      <GameResultBanner result="win" title="Wygrałeś">Pięć kamieni w linii.</GameResultBanner>
      <GameResultBanner result="loss" title="Przegrałeś">Przeciwnik ułożył pięć kamieni w linii.</GameResultBanner>
      <GameResultBanner result="loss" title="Przegrałeś">Skończył się Twój czas.</GameResultBanner>
      <GameResultBanner result="draw" title="Remis">Plansza jest pełna.</GameResultBanner>
    </div>
  ),
};

export const DlugaTrescNaWaskimEkranie: Story = {
  render: () => (
    <Narrow>
      <GameResultBanner result="loss" title="Przegrałeś z Ala_Kowalska_Mistrzyni_Gomoku_2026">
        Twój zegar dobiegł końca podczas rozłączenia, więc partia została zakończona.
      </GameResultBanner>
    </Narrow>
  ),
};

export const PrzegranaOgloszonaGrzecznie: Story = {
  args: { result: "loss", title: "Przegrałeś", children: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Przegrałeś");
  },
};
