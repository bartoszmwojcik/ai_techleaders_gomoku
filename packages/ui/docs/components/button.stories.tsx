import { Button } from "@gomoku/ui/game/button";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { Narrow, StateMatrix } from "../../.storybook/blocks";

const meta = {
  title: "Prymitywy/Przycisk",
  component: Button,
  args: { children: "Załóż konto", onClick: fn() },
  argTypes: { variant: { control: "inline-radio", options: ["primary", "secondary", "danger"] } },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Warianty: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-group">
      <Button {...args} variant="primary">Załóż konto</Button>
      <Button {...args} variant="secondary">Dołącz</Button>
      <Button {...args} variant="danger">Usuń konto na zawsze</Button>
    </div>
  ),
};

export const Stany: Story = {
  render: (args) => (
    <StateMatrix
      rows={[
        { state: "default", label: "Domyślny", render: () => <Button {...args}>Zaloguj się</Button> },
        { state: "hover", label: "Najechanie", render: (s) => <Button {...args} data-preview-state={s}>Zaloguj się</Button> },
        { state: "focus", label: "Fokus", render: (s) => <Button {...args} data-preview-state={s}>Zaloguj się</Button> },
        { state: "pressed", label: "Wciśnięty", render: (s) => <Button {...args} data-preview-state={s}>Zaloguj się</Button> },
        { state: "disabled", label: "Zablokowany", render: () => <Button {...args} disabled>Zaloguj się</Button> },
        { state: "loading", label: "Ładowanie", render: () => <Button {...args} loading>Zaloguj się</Button> },
      ]}
    />
  ),
};

export const DlugaTrescNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <Button {...args} className="w-full" variant="secondary">
        Anuluj moją partię i dołącz do zaproszenia
      </Button>
    </Narrow>
  ),
};

export const KlikniecieIKlawiatura: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole("button", { name: "Załóż konto" });
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onClick).toHaveBeenCalledTimes(1);
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};

export const ZablokowanyNieReaguje: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const LadowanieBlokujeDrugieWyslanie: Story = {
  args: { loading: true },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole("button");
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
