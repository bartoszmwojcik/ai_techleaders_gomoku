import { VerifyEmailBanner } from "@gomoku/ui/game/verify-email-banner";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Produkt/Konta/Baner potwierdzenia e-maila",
  component: VerifyEmailBanner,
  args: {
    title: "Potwierdź e-mail, aby grać",
    children: "Link wysyłamy na ala@example.com — sprawdź też folder spam.",
    resendLabel: "Wyślij ponownie",
    onResend: fn(),
  },
  argTypes: { state: { control: "inline-radio", options: ["idle", "sending", "sent", "limited", "failed"] } },
} satisfies Meta<typeof VerifyEmailBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Wysylanie: Story = { args: { state: "sending" } };

export const Wyslano: Story = { args: { state: "sent", feedback: "Wysłano. Sprawdź skrzynkę i folder spam." } };

export const Limit: Story = { args: { state: "limited", feedback: "Za wiele prób. Spróbuj ponownie za 2 minuty." } };

export const BladWysylki: Story = { args: { state: "failed", feedback: "Nie udało się wysłać wiadomości. Spróbuj ponownie za chwilę." } };

export const DlugiAdresNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <VerifyEmailBanner {...args} state="sent" feedback="Wysłano. Sprawdź skrzynkę i folder spam.">
        Link wysyłamy na bardzo-dlugi-adres-email-gracza@przyklad-domena-internetowa.example — sprawdź też folder spam.
      </VerifyEmailBanner>
    </Narrow>
  ),
};

export const PonowneWyslanie: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Wyślij ponownie" }));
    await expect(args.onResend).toHaveBeenCalledTimes(1);
  },
};
