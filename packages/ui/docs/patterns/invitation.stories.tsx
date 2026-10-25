import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { GameScreen } from "../screens/game-screen";
import { InviteLanding, JoinPage } from "../screens/invite-screens";
import { Screen, screenParameters } from "../screens/screen";

// "Zaproszenie przez link lub kod": the creator waits with the card, the invited person lands on /invite
// or types the code on /join, the guest is warned before joining.
const meta = {
  title: "Wzorce/Zaproszenie przez link lub kod",
  parameters: screenParameters,
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const TworcaCzekaZKartaZaproszenia: Story = {
  render: () => (
    <Screen viewer="player">
      <GameScreen state="waiting-for-opponent" />
    </Screen>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("ABCD-EFGH")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Kopiuj link" })).toBeVisible();
  },
};

export const ZaproszonyOtwieraLink: Story = { render: () => <InviteLanding state="visitor" viewer="none" /> };

export const ZaproszonyWpisujeKod: Story = { render: () => <JoinPage /> };

export const BlednyKod: Story = { render: () => <JoinPage error="Sprawdź kod: ma 8 znaków." /> };

export const GoscJestOstrzezonyPrzedDolaczeniem: Story = { render: () => <InviteLanding state="guest-warning" viewer="guest" /> };

export const ZaproszenieNiewazne: Story = { render: () => <InviteLanding state="invalid" viewer="none" /> };
