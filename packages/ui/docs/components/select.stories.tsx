import { Field } from "@gomoku/ui/game/field";
import { Select } from "@gomoku/ui/game/select";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { Narrow, StateMatrix } from "../../.storybook/blocks";

const options = [
  { value: "claude-code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "cursor", label: "Cursor" },
];

const meta = {
  title: "Prymitywy/Lista wyboru",
  component: Select,
  // The accessible name comes from aria-label here only because a bare select has no Field around it.
  args: { "aria-label": "Klient", options },
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WPoluFormularza: Story = {
  render: (args) => (
    <div className="max-w-sm">
      <Field label="Klient" hint="Instrukcja dotyczy tylko wybranego klienta.">
        {(control) => <Select options={args.options} {...control} />}
      </Field>
    </div>
  ),
};

export const Stany: Story = {
  render: (args) => (
    <StateMatrix
      rows={[
        { state: "default", label: "Domyślny", render: () => <Select {...args} /> },
        { state: "hover", label: "Najechanie", render: (s) => <Select {...args} data-preview-state={s} /> },
        { state: "focus", label: "Fokus", render: (s) => <Select {...args} data-preview-state={s} /> },
        { state: "disabled", label: "Zablokowany", render: () => <Select {...args} disabled /> },
        { state: "error", label: "Błąd", render: () => <Select {...args} aria-invalid /> },
      ]}
    />
  ),
};

export const DlugaEtykietaNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <Select
        {...args}
        options={[{ value: "long", label: "GitHub Copilot (VS Code) z bardzo długą nazwą, która nie mieści się w wierszu" }]}
      />
    </Narrow>
  ),
};

export const WyborKlawiatura: Story = {
  play: async ({ canvasElement }) => {
    const select = within(canvasElement).getByRole("combobox", { name: "Klient" });
    await expect(select).toHaveValue("claude-code");
    await userEvent.selectOptions(select, "cursor");
    await expect(select).toHaveValue("cursor");
  },
};
