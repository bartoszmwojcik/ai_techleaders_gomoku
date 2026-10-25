import { TextLink } from "@gomoku/ui/game/text-link";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Narrow, StateMatrix } from "../../.storybook/blocks";

const meta = {
  title: "Prymitywy/Link tekstowy",
  component: TextLink,
  args: { href: "#jak-to-dziala", children: "Jak to działa" },
  argTypes: { placement: { control: "inline-radio", options: ["inline", "standalone"] } },
} satisfies Meta<typeof TextLink>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Rozmieszczenie: Story = {
  render: (args) => (
    <div className="flex flex-col gap-stack">
      <p className="m-0 max-w-[var(--measure-text)] text-body">
        Zaproszony może zagrać bez konta. <TextLink {...args} placement="inline" />
      </p>
      <TextLink {...args} placement="standalone">Konto</TextLink>
    </div>
  ),
};

export const Stany: Story = {
  render: (args) => (
    <StateMatrix
      rows={[
        { state: "default", label: "Domyślny", render: () => <TextLink {...args} /> },
        { state: "hover", label: "Najechanie", render: (s) => <TextLink {...args} data-preview-state={s} /> },
        { state: "focus", label: "Fokus", render: (s) => <TextLink {...args} data-preview-state={s} /> },
      ]}
    />
  ),
};

export const DlugaTrescNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <TextLink {...args} placement="standalone">Zaloguj się, aby wysłać nowy link</TextLink>
    </Narrow>
  ),
};

export const LinkMaPodkreslenieIAdres: Story = {
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("link", { name: "Jak to działa" });
    await expect(link).toHaveAttribute("href", "#jak-to-dziala");
    await expect(getComputedStyle(link).textDecorationLine).toBe("underline");
  },
};
