import { ThemeSwitch } from "@gomoku/ui/game/theme-switch";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { Narrow, StateMatrix } from "../../.storybook/blocks";

const meta = {
  title: "Prymitywy/Przełącznik motywu",
  component: ThemeSwitch,
  args: { theme: "dark", label: "Jasny motyw", onToggle: fn() },
  argTypes: { theme: { control: "inline-radio", options: ["dark", "light"] } },
} satisfies Meta<typeof ThemeSwitch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Ciemny: Story = { args: { theme: "dark" } };

export const Jasny: Story = { args: { theme: "light" } };

export const Stany: Story = {
  render: (args) => (
    <StateMatrix
      rows={[
        { state: "default", label: "Ciemny (niewciśnięty)", render: () => <ThemeSwitch {...args} theme="dark" /> },
        { state: "pressed", label: "Jasny (wciśnięty)", render: () => <ThemeSwitch {...args} theme="light" /> },
        { state: "hover", label: "Najechanie", render: (s) => <ThemeSwitch {...args} data-preview-state={s} /> },
        { state: "focus", label: "Fokus", render: (s) => <ThemeSwitch {...args} data-preview-state={s} /> },
      ]}
    />
  ),
};

export const NaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <div className="flex justify-end">
        <ThemeSwitch {...args} />
      </div>
    </Narrow>
  ),
};

function Stateful() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  return <ThemeSwitch theme={theme} label="Jasny motyw" onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />;
}

export const KlikniecieIKlawiatura: Story = {
  render: () => <Stateful />,
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: "Jasny motyw" });
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(button).toHaveFocus();
  },
};
