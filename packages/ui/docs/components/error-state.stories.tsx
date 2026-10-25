import { Button } from "@gomoku/ui/game/button";
import { ErrorState } from "@gomoku/ui/game/error-state";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Prymitywy/Stan błędu",
  component: ErrorState,
  args: {
    title: "Nie udało się wczytać listy partii",
    children: "Sprawdź połączenie z internetem i spróbuj ponownie.",
    action: <Button variant="secondary">Spróbuj ponownie</Button>,
  },
} satisfies Meta<typeof ErrorState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const BrakSieci: Story = {
  args: {
    title: "Brak połączenia z internetem",
    children: "Twój zegar nadal biegnie. Wróć do partii, gdy połączenie wróci.",
    action: <Button>Wróć do partii</Button>,
  },
};

export const BezNastepnegoKroku: Story = {
  args: { title: "To zaproszenie jest już nieważne", children: undefined, action: undefined },
};

export const DlugaTrescNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <ErrorState
        {...args}
        title="Nie udało się wczytać partii rozegranej z graczem Ala_Kowalska_Mistrzyni_Gomoku_2026"
      />
    </Narrow>
  ),
};

export const OglaszaBladIPozwalaPonowic: Story = {
  args: { action: <Button variant="secondary" onClick={fn()}>Spróbuj ponownie</Button> },
  play: async ({ canvasElement }) => {
    const alert = within(canvasElement).getByRole("alert");
    await expect(alert).toHaveTextContent("Nie udało się wczytać listy partii");
    const retry = within(alert).getByRole("button", { name: "Spróbuj ponownie" });
    await userEvent.tab();
    await expect(retry).toHaveFocus();
  },
};
