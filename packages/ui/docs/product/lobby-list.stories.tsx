import { LobbyList, LobbyRow } from "@gomoku/ui/game/lobby-list";
import { Panel } from "@gomoku/ui/game/panel";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Produkt/Lobby/Lista graczy",
  component: LobbyList,
  args: { label: "Gracze szukający gry", children: null },
  decorators: [(Story) => <div className="max-w-xl"><Story /></div>],
} satisfies Meta<typeof LobbyList>;

export default meta;

type Story = StoryObj<typeof meta>;

const select = fn();

const row = (name: string, since: string, ms: number, selecting = false) => (
  <LobbyRow
    key={name}
    name={name}
    since={since}
    expiresLabel="wygasa za"
    expiresInMs={ms}
    selectLabel="Zagraj"
    selectAriaLabel={`Zagraj z ${name}`}
    selecting={selecting}
    onSelect={() => select(name)}
  />
);

export const Playground: Story = {
  render: (args) => (
    <Panel title="Lobby: szukają gry">
      <LobbyList {...args}>
        {row("Alicja_99", "szuka od 1 min", 242_000)}
        {row("czarny_kamień", "szuka od 3 min", 130_000)}
        {row("PiątkaWLinii", "szuka od 4 min", 48_000)}
      </LobbyList>
    </Panel>
  ),
};

export const DoOdczytu: Story = {
  render: (args) => (
    <LobbyList {...args}>
      <LobbyRow name="Alicja_99" since="szuka od 1 min" expiresLabel="wygasa za" expiresInMs={242_000} />
      <LobbyRow name="czarny_kamień" since="szuka od 3 min" expiresLabel="wygasa za" expiresInMs={130_000} />
    </LobbyList>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Alicja_99")).toBeVisible();
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};

export const WybieranieTrwa: Story = {
  render: (args) => (
    <LobbyList {...args}>
      {row("Alicja_99", "szuka od 1 min", 242_000, true)}
      {row("czarny_kamień", "szuka od 3 min", 130_000)}
    </LobbyList>
  ),
};

export const DuzoGraczy: Story = {
  render: (args) => (
    <LobbyList {...args}>
      {Array.from({ length: 12 }, (_, index) => row(`Gracz_${index + 1}`, `szuka od ${index + 1} min`, 300_000 - index * 20_000))}
    </LobbyList>
  ),
};

export const DlugieNazwyNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <LobbyList {...args}>
        {row("Ala_Kowalska_Mistrzyni_Gomoku_2026", "szuka od 3 min", 130_000)}
        {row("PiątkaWLinii", "szuka od 4 min", 48_000)}
      </LobbyList>
    </Narrow>
  ),
};

export const WyborPrzeciwnika: Story = {
  render: Playground.render,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("listitem")).toHaveLength(3);
    await userEvent.click(canvas.getByRole("button", { name: "Zagraj z Alicja_99" }));
    await expect(select).toHaveBeenCalledWith("Alicja_99");
  },
};
