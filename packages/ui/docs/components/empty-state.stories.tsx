import { Button } from "@gomoku/ui/game/button";
import { EmptyState } from "@gomoku/ui/game/empty-state";
import { TextLink } from "@gomoku/ui/game/text-link";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Prymitywy/Pusty stan",
  component: EmptyState,
  args: {
    title: "Nie rozegrałeś jeszcze żadnej partii",
    children: "Zagraj ze znajomym albo wybierz przeciwnika w lobby, a zakończone partie pojawią się tutaj.",
    action: <Button>Utwórz zaproszenie</Button>,
  },
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const JeszczeNicTuNieMa: Story = {};

export const NikogoWLobby: Story = {
  args: {
    title: "Nikt teraz nie szuka gry",
    children: "Oznacz się jako szukający gry, a pojawisz się tu na 5 minut, albo zaproś znajomego kodem.",
    action: <Button variant="secondary">Szukam przeciwnika</Button>,
  },
};

export const BezNastepnegoKroku: Story = {
  args: { title: "Brak zakończonych partii z tym przeciwnikiem", children: undefined, action: undefined },
};

export const LinkJakoAkcja: Story = {
  args: { action: <TextLink href="#wyczysc" placement="standalone">Wyczyść filtry</TextLink> },
};

export const DlugaTrescNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <EmptyState {...args} />
    </Narrow>
  ),
};

export const PowodINastepnyKrok: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Nie rozegrałeś jeszcze żadnej partii")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Utwórz zaproszenie" })).toBeVisible();
  },
};
