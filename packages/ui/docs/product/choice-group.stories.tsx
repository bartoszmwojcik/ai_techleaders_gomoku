import { ChoiceGroup } from "@gomoku/ui/game/choice-group";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Produkt/Partia/Grupa wyboru",
  component: ChoiceGroup,
  args: {
    label: "Wariant",
    value: "classic",
    onValueChange: () => {},
    options: [
      { value: "classic", label: "Klasyczny" },
      { value: "paper", label: "Papier i ołówek" },
    ],
  },
} satisfies Meta<typeof ChoiceGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

function Controlled(args: ComponentProps<typeof ChoiceGroup>) {
  const [value, setValue] = useState(args.value);
  return <ChoiceGroup {...args} value={value} onValueChange={setValue} />;
}

export const Playground: Story = { render: (args) => <Controlled {...args} /> };

export const CzasNaGracza: Story = {
  args: {
    label: "Czas na gracza",
    value: "180000",
    options: [
      { value: "60000", label: "1 min" },
      { value: "120000", label: "2 min" },
      { value: "180000", label: "3 min" },
      { value: "300000", label: "5 min" },
    ],
  },
};

export const NaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <ChoiceGroup {...args} />
    </Narrow>
  ),
};

export const Zablokowana: Story = { args: { disabled: true } };
