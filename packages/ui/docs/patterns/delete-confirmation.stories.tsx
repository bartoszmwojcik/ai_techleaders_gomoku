import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Checkbox } from "@gomoku/ui/game/checkbox";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { Panel } from "@gomoku/ui/game/panel";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";

// "Potwierdzenie usunięcia": the object's name in the question, an easy way out, a verb on the button,
// and success only after the server answers.
const meta = {
  title: "Wzorce/Potwierdzenie usunięcia",
  parameters: { layout: "padded", a11y: { context: "body" }, docs: { story: { inline: false, height: "520px" } } },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

type Phase = "idle" | "confirming" | "error";

function DeleteAccount({ checked = false, open = false, phase = "idle" }: { checked?: boolean; open?: boolean; phase?: Phase }) {
  const [isChecked, setChecked] = useState(checked);
  const [isOpen, setOpen] = useState(open);
  return (
    <Panel title="Usuń konto" className="max-w-xl">
      <Alert status="warning" title="Tego nie da się cofnąć">
        Twoje konto, e-mail i hasło zostaną usunięte od razu. Zakończone partie zostaną u przeciwników jako „Usunięty gracz”.
      </Alert>
      <Checkbox label="Rozumiem, że konta nie da się odzyskać" checked={isChecked} onCheckedChange={(value) => setChecked(value === true)} />
      <div className="flex flex-col items-start gap-group">
        <Button variant="danger" disabled={!isChecked} aria-describedby="delete-account-reason" onClick={() => setOpen(true)}>
          Usuń konto na zawsze
        </Button>
        {!isChecked && <p id="delete-account-reason" className="m-0 text-meta text-text-muted">Zaznacz potwierdzenie, aby usunąć konto.</p>}
      </div>
      <ConfirmDialog
        open={isOpen}
        onOpenChange={setOpen}
        title="Usunąć konto Ala_7?"
        description={
          phase === "error"
            ? "Nie udało się usunąć konta. Nic nie zostało zmienione. Spróbuj ponownie."
            : "Twoje zakończone partie zostaną u przeciwników jako „Usunięty gracz”. Tego nie da się cofnąć."
        }
        confirmLabel="Usuń konto na zawsze"
        cancelLabel="Zostaw konto"
        confirming={phase === "confirming"}
        onConfirm={() => undefined}
      />
    </Panel>
  );
}

export const PrzyciskZablokowanyZPowodem: Story = {
  render: () => <DeleteAccount />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Usuń konto na zawsze" })).toBeDisabled();
    await expect(canvas.getByText("Zaznacz potwierdzenie, aby usunąć konto.")).toBeVisible();
  },
};

export const PotwierdzenieZaznaczone: Story = { render: () => <DeleteAccount checked /> };

export const PytanieZNazwaObiektu: Story = {
  render: () => <DeleteAccount checked open />,
};

export const UsuwanieTrwa: Story = {
  render: () => <DeleteAccount checked open phase="confirming" />,
};

export const BladSerweraDialogZostajeOtwarty: Story = {
  render: () => <DeleteAccount checked open phase="error" />,
};

export const OdCheckboxaDoDialogu: Story = {
  render: () => <DeleteAccount />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Rozumiem, że konta nie da się odzyskać"));
    const button = canvas.getByRole("button", { name: "Usuń konto na zawsze" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    const dialog = await screen.findByRole("alertdialog", { name: "Usunąć konto Ala_7?" });
    await expect(within(dialog).getByRole("button", { name: "Zostaw konto" })).toHaveFocus();
  },
};

export const AnulowanieWlasnejPartiiPrzyDolaczaniu: Story = {
  render: () => (
    <ConfirmDialog
      defaultOpen
      tone="primary"
      title="Anulować Twoją oczekującą partię i dołączyć do tej?"
      description="Zaproszenie dla Twojego znajomego przestanie działać."
      confirmLabel="Anuluj moją partię i dołącz"
      cancelLabel="Wróć"
      onConfirm={() => undefined}
    />
  ),
};

export const WylogowanieWTrakciePartii: Story = {
  render: () => (
    <ConfirmDialog
      defaultOpen
      tone="primary"
      title="Wylogować się w trakcie partii?"
      description="Po wylogowaniu Twój zegar biegnie dalej."
      confirmLabel="Wyloguj"
      cancelLabel="Zostań w partii"
      onConfirm={() => undefined}
    />
  ),
};
