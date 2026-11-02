import { InfoToggleButton, InfoToggleNote } from "@gomoku/ui/game/info-toggle";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

function Demo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex max-w-xl flex-col gap-group">
      <div className="flex items-center gap-group">
        <span className="text-subsection font-strong">Czat</span>
        <InfoToggleButton label="Informacja o wiadomościach czatu" expanded={open} controls="info-note" onClick={() => setOpen(!open)} />
      </div>
      <InfoToggleNote id="info-note" open={open}>
        Wiadomości są usuwane około godziny po zakończeniu partii. Widzą je tylko uczestnicy partii.
      </InfoToggleNote>
    </div>
  );
}

const meta = {
  title: "Prymitywy/Informacja rozwijana",
  component: InfoToggleButton,
  args: { label: "Informacja", expanded: false, controls: "info-note" },
  render: () => <Demo />,
} satisfies Meta<typeof InfoToggleButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const OtwieraSieKlawiatura: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Informacja o wiadomościach czatu" });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByText(/usuwane około godziny/)).toBeVisible();
    await userEvent.keyboard(" ");
    await expect(button).toHaveAttribute("aria-expanded", "false");
  },
};

export const NaWaskimEkranie: Story = {
  render: () => (
    <Narrow>
      <Demo />
    </Narrow>
  ),
};
