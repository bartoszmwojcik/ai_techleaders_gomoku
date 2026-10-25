import { HistoryList, HistoryRow } from "@gomoku/ui/game/history-list";
import { Panel } from "@gomoku/ui/game/panel";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Produkt/Historia/Lista partii",
  component: HistoryList,
  args: { label: "Zakończone partie", children: null },
  decorators: [(Story) => <div className="max-w-xl"><Story /></div>],
} satisfies Meta<typeof HistoryList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <Panel title="Historia partii">
      <HistoryList {...args}>
        <HistoryRow opponent="Alicja_99" result="win" resultLabel="Wygrana" date="24.10.2026" reason="5 w linii" />
        <HistoryRow opponent="Zaproszony przez link" result="loss" resultLabel="Porażka" date="23.10.2026" reason="Koniec czasu" />
        <HistoryRow opponent="Usunięty gracz" result="draw" resultLabel="Remis" date="20.10.2026" reason="Plansza pełna" />
      </HistoryList>
    </Panel>
  ),
};

export const DuzoPartii: Story = {
  render: (args) => (
    <HistoryList {...args}>
      {Array.from({ length: 20 }, (_, index) => (
        <HistoryRow
          key={index}
          opponent={`Gracz_${index + 1}`}
          result={(["win", "loss", "draw"] as const)[index % 3] as "win" | "loss" | "draw"}
          resultLabel={["Wygrana", "Porażka", "Remis"][index % 3]}
          date={`${20 - index}.10.2026`}
          reason="5 w linii"
        />
      ))}
    </HistoryList>
  ),
};

export const DlugaNazwaNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <HistoryList {...args}>
        <HistoryRow opponent="Ala_Kowalska_Mistrzyni_Gomoku_2026" result="win" resultLabel="Wygrana" date="24.10.2026" reason="5 w linii" />
        <HistoryRow opponent="Zaproszony przez link" result="loss" resultLabel="Porażka" date="23.10.2026" />
      </HistoryList>
    </Narrow>
  ),
};

export const WynikToSlowoIIkona: Story = {
  render: Playground.render,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("listitem")).toHaveLength(3);
    await expect(canvas.getByText("Wygrana")).toBeVisible();
    await expect(canvas.getByText("Usunięty gracz")).toBeVisible();
  },
};
