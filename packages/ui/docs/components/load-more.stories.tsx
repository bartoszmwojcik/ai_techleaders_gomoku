import { LoadMore } from "@gomoku/ui/game/load-more";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Prymitywy/Pokaż więcej",
  component: LoadMore,
  args: {
    status: "idle",
    onLoadMore: fn(),
    label: "Pokaż starsze",
    retryLabel: "Spróbuj ponownie",
    errorTitle: "Nie udało się wczytać starszych partii",
    errorMessage: "Sprawdź połączenie z internetem i spróbuj ponownie.",
    doneMessage: "To już wszystkie partie.",
  },
  argTypes: { status: { control: "inline-radio", options: ["idle", "loading", "error", "done"] } },
} satisfies Meta<typeof LoadMore>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Ladowanie: Story = {
  args: { status: "loading" },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole("button", { name: "Pokaż starsze" });
    await expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    await expect(args.onLoadMore).not.toHaveBeenCalled();
  },
};

export const BladZPonowieniem: Story = {
  args: { status: "error" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("Nie udało się wczytać starszych partii");
    await userEvent.click(canvas.getByRole("button", { name: "Spróbuj ponownie" }));
    await expect(args.onLoadMore).toHaveBeenCalledTimes(1);
  },
};

export const KoniecListy: Story = {
  args: { status: "done" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("button")).toBeNull();
    await expect(within(canvasElement).getByText("To już wszystkie partie.")).toBeVisible();
  },
};

export const KlawiaturaZachowujeFokus: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole("button", { name: "Pokaż starsze" });
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onLoadMore).toHaveBeenCalledTimes(1);
  },
};

export const BladNaWaskimEkranie: Story = {
  args: { status: "error" },
  render: (args) => (
    <Narrow>
      <LoadMore {...args} />
    </Narrow>
  ),
};
