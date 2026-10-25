import { Button } from "@gomoku/ui/game/button";
import { Dialog } from "@gomoku/ui/game/dialog";
import { Field } from "@gomoku/ui/game/field";
import { TextInput } from "@gomoku/ui/game/text-input";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent, within } from "storybook/test";

const meta = {
  title: "Prymitywy/Dialog",
  component: Dialog,
  args: {
    title: "Dołącz do partii kodem",
    description: "Wpisz kod, który dostałeś od znajomego.",
    closeLabel: "Zamknij",
    trigger: <Button>Mam kod zaproszenia</Button>,
    children: (
      <Field label="Kod zaproszenia">
        {(control) => <TextInput autoComplete="off" placeholder="ABCD-EFGH" {...control} />}
      </Field>
    ),
  },
  // The dialog renders in a portal outside the story root, so the accessibility check covers the whole page.
  parameters: { a11y: { context: "body" }, docs: { story: { inline: false, height: "420px" } } },
} satisfies Meta<typeof Dialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Otwarty: Story = { args: { defaultOpen: true, trigger: undefined } };

export const BezOpisu: Story = { args: { defaultOpen: true, trigger: undefined, description: undefined } };

export const DlugaTrescNaWaskimEkranie: Story = {
  args: {
    defaultOpen: true,
    trigger: undefined,
    title: "Dołącz do partii kodem zaproszenia, który dostałeś od znajomego",
    children: (
      <>
        <p className="m-0 text-body text-text-secondary">
          Kod ma osiem znaków i jest ważny do końca dnia. Jeśli go nie masz, poproś znajomego o nowy link albo oznacz się jako szukający gry w lobby.
        </p>
        <p className="m-0 text-body text-text-secondary">
          Zaproszony może zagrać bez konta, ale wtedy partia jest dostępna tylko w tej przeglądarce.
        </p>
      </>
    ),
  },
  parameters: { viewport: { defaultViewport: "phone" } },
};

export const OtwieranieIFokus: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "Mam kod zaproszenia" });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Dołącz do partii kodem" });
    await expect(dialog).toHaveAccessibleDescription("Wpisz kod, który dostałeś od znajomego.");
    await userEvent.keyboard("{Escape}");
    await expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(trigger).toHaveFocus();
  },
};
