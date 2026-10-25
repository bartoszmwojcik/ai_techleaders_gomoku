import { Button } from "@gomoku/ui/game/button";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, within } from "storybook/test";

const meta = {
  title: "Prymitywy/Dialog potwierdzenia",
  component: ConfirmDialog,
  args: {
    title: "Usunąć konto Ala_7?",
    description: "Twoje zakończone partie zostaną u przeciwników jako „Usunięty gracz”. Tego nie da się cofnąć.",
    confirmLabel: "Usuń konto na zawsze",
    cancelLabel: "Zostaw konto",
    onConfirm: fn(),
    onOpenChange: fn(),
    trigger: <Button variant="danger">Usuń konto</Button>,
  },
  // The dialog renders in a portal outside the story root, so the accessibility check covers the whole page.
  parameters: { a11y: { context: "body" }, docs: { story: { inline: false, height: "420px" } } },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const UsuniecieKonta: Story = { args: { defaultOpen: true, trigger: undefined } };

export const Ladowanie: Story = { args: { defaultOpen: true, trigger: undefined, confirming: true } };

export const PytanieZGlownymPrzyciskiem: Story = {
  args: {
    defaultOpen: true,
    trigger: undefined,
    tone: "primary",
    title: "Anulować Twoją oczekującą partię i dołączyć do tej?",
    description: "Zaproszenie dla Twojego znajomego przestanie działać.",
    confirmLabel: "Anuluj moją partię i dołącz",
    cancelLabel: "Wróć",
  },
};

export const DlugaTrescNaWaskimEkranie: Story = {
  args: {
    defaultOpen: true,
    trigger: undefined,
    title: "Usunąć konto gracza o bardzo długiej nazwie Ala_Kowalska_Mistrzyni_Gomoku_2026?",
    confirmLabel: "Usuń konto na zawsze razem ze wszystkimi danymi",
    cancelLabel: "Zostaw konto",
  },
  parameters: { viewport: { defaultViewport: "phone" } },
};

export const FokusNaRezygnacjiIPotwierdzenie: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Usuń konto" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Usunąć konto Ala_7?" });
    await expect(within(dialog).getByRole("button", { name: "Zostaw konto" })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole("button", { name: "Usuń konto na zawsze" }));
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
  },
};
