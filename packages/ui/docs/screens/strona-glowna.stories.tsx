import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { HomeScreen } from "./home-screen";
import { screenParameters } from "./screen";

const meta = {
  title: "Ekrany/Strona główna",
  parameters: screenParameters,
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Niezalogowany: Story = {
  render: () => <HomeScreen state="visitor" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 1, name: "Gomoku" })).toBeVisible();
    await expect(canvas.getByText("Przykładowa pozycja.")).toBeVisible();
  },
};

export const ZalogowanyEmailNiepotwierdzony: Story = { render: () => <HomeScreen state="unconfirmed" /> };

export const ZalogowanyEmailPotwierdzony: Story = { render: () => <HomeScreen state="confirmed" /> };
