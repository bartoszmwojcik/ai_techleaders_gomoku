import { Alert } from "@gomoku/ui/game/alert";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Prymitywy/Alert",
  component: Alert,
  args: { title: "Potwierdź e-mail, aby grać", children: "Link wysyłamy na ala@example.com — sprawdź też folder spam." },
  argTypes: { status: { control: "inline-radio", options: ["info", "success", "warning", "danger"] } },
} satisfies Meta<typeof Alert>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Stany: Story = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-stack">
      <Alert status="info" title="Potwierdź e-mail, aby grać">Link wysyłamy na ala@example.com — sprawdź też folder spam.</Alert>
      <Alert status="success" title="Hasło zmienione">Inne urządzenia zostały wylogowane.</Alert>
      <Alert status="warning" title="Grasz bez konta">Nie zmieniaj przeglądarki w trakcie partii — stracisz do niej dostęp, a zegar będzie biegł dalej.</Alert>
      <Alert status="danger" title="Zbyt wiele prób">Spróbuj za chwilę.</Alert>
    </div>
  ),
};

export const BezSzczegolow: Story = { args: { children: undefined, status: "success", title: "Adres potwierdzony — możesz grać" } };

export const DlugaTrescNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <Alert {...args} status="warning" title="Masz oczekującą partię, więc najpierw ją anuluj albo dokończ">
        Zaproszenie, które chcesz przyjąć, wymaga anulowania Twojej oczekującej partii. Zegar nowej partii ruszy dopiero, gdy obaj gracze otworzą stronę.
      </Alert>
    </Narrow>
  ),
};

export const RoleDlaCzytnikaEkranu: Story = {
  render: () => (
    <div className="flex flex-col gap-stack">
      <Alert status="info" title="Informacja" />
      <Alert status="danger" title="Błąd" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("Informacja");
    await expect(canvas.getByRole("alert")).toHaveTextContent("Błąd");
  },
};
