import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { GameScreen, type GameState } from "../screens/game-screen";
import { Screen, screenParameters } from "../screens/screen";

// "Widok szczegółów": one object (a game) with its most important information and its main action in view.
const meta = {
  title: "Wzorce/Widok szczegółów",
  parameters: screenParameters,
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const detail = (state: GameState): Story => ({
  render: () => (
    <Screen viewer="player">
      <GameScreen state={state} />
    </Screen>
  ),
});

export const Ladowanie: Story = detail("loading");
export const NieIstniejeAlboBrakDostepu: Story = detail("not-found");
export const TworcaCzeka: Story = detail("waiting-for-opponent");
export const TwojRuchGlownaAkcjaWidoczna: Story = {
  ...detail("your-turn"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("grid", { name: "Plansza 15 na 15" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Postaw kamień" })).toBeVisible();
  },
};
export const Zakonczona: Story = detail("won");
