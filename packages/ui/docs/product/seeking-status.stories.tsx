import { SeekingStatus } from "@gomoku/ui/game/seeking-status";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Produkt/Lobby/Status szukania gry",
  component: SeekingStatus,
  args: {
    title: "Szukasz gry",
    expiresLabel: "Status wygasa za",
    expiresInMs: 272_000,
    withdrawLabel: "Wycofaj",
    onWithdraw: fn(),
  },
} satisfies Meta<typeof SeekingStatus>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const StatusZaChwileWygasnie: Story = { args: { expiresInMs: 12_000 } };

export const DlugiTekstNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <SeekingStatus {...args} title="Szukasz gry: pojawiasz się na liście innych graczy" expiresLabel="Jeśli nikt Cię nie wybierze, status wygasa za" />
    </Narrow>
  ),
};

export const CzasWidocznyIWycofanie: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("4:32")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Wycofaj" }));
    await expect(args.onWithdraw).toHaveBeenCalledTimes(1);
  },
};
