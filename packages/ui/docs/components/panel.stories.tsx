import { Alert } from "@gomoku/ui/game/alert";
import { Panel } from "@gomoku/ui/game/panel";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Prymitywy/Panel",
  component: Panel,
  args: {
    title: "Lobby: szukają gry",
    children: <p className="m-0 text-body text-text-secondary">Wybierz przeciwnika z listy albo zaproś znajomego kodem.</p>,
  },
  argTypes: { headingLevel: { control: "inline-radio", options: [2, 3, 4] } },
} satisfies Meta<typeof Panel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const BezTytulu: Story = { args: { title: undefined } };

export const PoziomyNaglowka: Story = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-stack">
      <Panel title="Konto" headingLevel={2}>
        <Panel title="Zmień hasło" headingLevel={3}>
          <p className="m-0 text-body text-text-secondary">Inne urządzenia zostaną wylogowane.</p>
        </Panel>
      </Panel>
    </div>
  ),
};

export const ZAlertemWSrodku: Story = {
  render: () => (
    <Panel title="Usuń konto" className="max-w-xl">
      <Alert status="warning" title="Tego nie da się cofnąć">Twoje zakończone partie zostaną u przeciwników jako „Usunięty gracz”.</Alert>
    </Panel>
  ),
};

export const DlugaTrescNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <Panel {...args} title="Historia partii rozegranych w ostatnich tygodniach z różnymi przeciwnikami">
        <p className="m-0 text-body text-text-secondary">Bardzo_długa_nazwa_gracza_bez_spacji_która_nie_mieści_się_w_wąskim_panelu_na_telefonie</p>
      </Panel>
    </Narrow>
  ),
};

export const RegionMaNazweZNaglowka: Story = {
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole("region", { name: "Lobby: szukają gry" });
    await expect(region).toBeInTheDocument();
  },
};
