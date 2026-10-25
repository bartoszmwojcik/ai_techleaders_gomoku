import { Button } from "@gomoku/ui/game/button";
import { PageHeader } from "@gomoku/ui/game/page-header";
import { TextLink } from "@gomoku/ui/game/text-link";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

const meta = {
  title: "Prymitywy/Nagłówek strony",
  component: PageHeader,
  args: {
    brand: "Gomoku",
    homeHref: "#start",
    children: (
      <>
        <Button variant="secondary" asChild><a href="#zaloz-konto">Załóż konto</a></Button>
        <Button asChild><a href="#zaloguj">Zaloguj się</a></Button>
      </>
    ),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PageHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const GraczNiezalogowany: Story = {
  args: {
    children: <Button asChild><a href="#zaloguj">Zaloguj się</a></Button>,
  },
};

export const GraczZalogowany: Story = {
  args: {
    navigation: (
      <>
        <TextLink href="#lobby" placement="standalone">Lobby</TextLink>
        <TextLink href="#historia" placement="standalone">Historia</TextLink>
      </>
    ),
    navigationLabel: "Główna nawigacja",
    children: (
      <>
        <TextLink href="#konto" placement="standalone">Konto</TextLink>
        <Button variant="secondary">Wyloguj</Button>
      </>
    ),
  },
};

export const DlugaNazwaNaWaskimEkranie: Story = {
  args: { brand: "Gomoku: gra online 1:1 dla dwóch osób", navigationLabel: "Główna nawigacja" },
  parameters: { viewport: { defaultViewport: "phone" } },
};

export const BaneroweIGlownyPrzycisk: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("banner")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Gomoku" })).toHaveAttribute("href", "#start");
    await expect(canvas.getByRole("link", { name: "Zaloguj się" })).toBeVisible();
  },
};
