import { InviteCodeCard } from "@gomoku/ui/game/invite-code-card";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Produkt/Partia/Karta kodu zaproszenia",
  component: InviteCodeCard,
  args: {
    title: "Zaproś znajomego",
    link: "https://gomoku.example/invite/ABCD-EFGH",
    code: "ABCD-EFGH",
    linkLabel: "Link do zaproszenia",
    codeLabel: "Kod do wpisania na stronie „Mam kod”",
    validUntil: "Ważne do 18:40",
    copyLabel: "Kopiuj link",
    copiedLabel: "Skopiowano",
    shareLabel: "Udostępnij",
    cancelLabel: "Anuluj zaproszenie",
    onCopy: fn(),
    onShare: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof InviteCodeCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Skopiowano: Story = { args: { copied: true } };

export const BezUdostepniania: Story = { args: { onShare: undefined, shareLabel: undefined } };

export const DlugiLinkNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <InviteCodeCard {...args} link="https://gomoku-bardzo-dluga-nazwa-domeny.example/invite/ABCD-EFGH?utm_source=komunikator" />
    </Narrow>
  ),
};

export const KopiujUdostepnijAnuluj: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Kopiuj link" }));
    await userEvent.click(canvas.getByRole("button", { name: "Udostępnij" }));
    await userEvent.click(canvas.getByRole("button", { name: "Anuluj zaproszenie" }));
    await expect(args.onCopy).toHaveBeenCalledTimes(1);
    await expect(args.onShare).toHaveBeenCalledTimes(1);
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
  },
};
