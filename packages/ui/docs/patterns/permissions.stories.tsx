import { Alert } from "@gomoku/ui/game/alert";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { GameScreen } from "../screens/game-screen";
import { HomeScreen } from "../screens/home-screen";
import { screenParameters, Screen } from "../screens/screen";

// "Stan zależny od uprawnień": the same screens for a visitor, a player with an unconfirmed e-mail, a
// player with a confirmed e-mail and a guest (BR-22, BR-23).
const meta = {
  title: "Wzorce/Stan zależny od uprawnień",
  parameters: screenParameters,
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const NiezalogowanyNaStronieGlownej: Story = { render: () => <HomeScreen state="visitor" /> };

export const EmailNiepotwierdzonyAkcjeZablokowaneZPowodem: Story = {
  render: () => <HomeScreen state="unconfirmed" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Utwórz zaproszenie" })).toBeDisabled();
    await expect(canvas.getByText("Potwierdź e-mail, aby tworzyć partie i wchodzić do lobby.")).toBeVisible();
  },
};

export const EmailPotwierdzonyPelnyDostep: Story = { render: () => <HomeScreen state="confirmed" /> };

export const GoscWPartiiZTrwalymOstrzezeniem: Story = {
  render: () => (
    <Screen viewer="guest">
      <Alert status="warning" title="Grasz bez konta">Nie zmieniaj przeglądarki w trakcie partii.</Alert>
      <GameScreen state="your-turn" />
    </Screen>
  ),
};
