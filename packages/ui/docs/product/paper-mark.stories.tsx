import { PaperMark } from "@gomoku/ui/game/paper-mark";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

const meta = {
  title: "Produkt/Partia/Znak papier i ołówek",
  component: PaperMark,
  args: { color: "black", framed: true, label: "krzyżyk" },
  parameters: { layout: "padded" },
} satisfies Meta<typeof PaperMark>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Krzyzyk: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("img", { name: "krzyżyk" })).toBeTruthy();
  },
};

export const Kolko: Story = { args: { color: "white", label: "kółko" } };

export const ObokImienia: Story = {
  render: () => (
    <p className="m-0 text-meta font-strong text-text-secondary">
      <PaperMark framed color="white" label="kółko" className="mr-1" />
      Ty (Ola) · punkty: 2
    </p>
  ),
};
