import { TruncatedName } from "@gomoku/ui/game/truncated-name";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";


const FULL_NICK = "abcdefghijklmnopqrstuvwx";

const meta = {
  title: "Prymitywy/Skracana nazwa",
  component: TruncatedName,
  args: { children: "Piotr", tail: " (gość)", title: "Piotr (gość)" },
} satisfies Meta<typeof TruncatedName>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const DlugiNickNaWaskimEkranie: Story = {
  render: () => (
    <Narrow>
      <TruncatedName tail=" (gość)" title={`${FULL_NICK} (gość)`} data-testid="long">
        {FULL_NICK}
      </TruncatedName>
    </Narrow>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("(gość)")).toBeVisible();
    await expect(canvas.getByTestId("long")).toHaveAttribute("title", `${FULL_NICK} (gość)`);
  },
};

export const ZPrzedrostkiem: Story = {
  render: () => (
    <Narrow>
      <TruncatedName lead="Agent · " tail=" (deklarowane)" title="Agent · model (deklarowane)">
        model_o_bardzo_dlugiej_nazwie_podanej_przez_agenta
      </TruncatedName>
    </Narrow>
  ),
};
