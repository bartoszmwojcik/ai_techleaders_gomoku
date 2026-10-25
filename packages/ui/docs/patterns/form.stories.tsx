import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { LoginForm, type LoginOutcome } from "./login-form";

// Simulated answers of POST /api/auth/login: success, waiting, a field error, a server error, no network.
const answers = {
  sukces: async (): Promise<LoginOutcome> => ({ ok: true }),
  oczekiwanie: () => new Promise<LoginOutcome>(() => undefined),
  bladPola: async (): Promise<LoginOutcome> => ({ ok: false, fieldErrors: { password: "Hasło jest niepoprawne: spróbuj ponownie albo ustaw nowe." } }),
  bladSerwera: async (): Promise<LoginOutcome> => ({ ok: false, message: "Zbyt wiele prób. Spróbuj za chwilę." }),
  brakSieci: async (): Promise<LoginOutcome> => {
    throw new TypeError("Failed to fetch");
  },
};

const meta = {
  title: "Wzorce/Formularz",
  component: LoginForm,
  args: { submit: answers.sukces },
} satisfies Meta<typeof LoginForm>;

export default meta;

type Story = StoryObj<typeof meta>;

async function fill(canvasElement: HTMLElement, { email = "ala@example.com", password = "bardzo-dlugie-haslo-123" } = {}) {
  const canvas = within(canvasElement);
  if (email) await userEvent.type(canvas.getByLabelText(/E-mail/), email);
  if (password) await userEvent.type(canvas.getByLabelText(/Hasło/), password);
  return canvas;
}

export const Pusty: Story = {};

export const Sukces: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await fill(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Zaloguj się" }));
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Zalogowano"));
  },
};

export const OczekiwanieNaOdpowiedz: Story = {
  args: { submit: answers.oczekiwanie },
  play: async ({ canvasElement }) => {
    const canvas = await fill(canvasElement);
    const button = canvas.getByRole("button", { name: "Zaloguj się" });
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await expect(button).toHaveAttribute("aria-busy", "true");
  },
};

export const BladPolaWracaFokusIZostajaDane: Story = {
  args: { submit: answers.bladPola },
  play: async ({ canvasElement }) => {
    const canvas = await fill(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Zaloguj się" }));
    const password = await canvas.findByLabelText(/Hasło/);
    await waitFor(() => expect(password).toHaveFocus());
    await expect(password).toHaveAccessibleDescription(/Hasło jest niepoprawne/);
    await expect(canvas.getByLabelText(/E-mail/)).toHaveValue("ala@example.com");
  },
};

export const BladSerwera: Story = {
  args: { submit: answers.bladSerwera },
  play: async ({ canvasElement }) => {
    const canvas = await fill(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Zaloguj się" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Zbyt wiele prób");
    await expect(canvas.getByLabelText(/E-mail/)).toHaveValue("ala@example.com");
  },
};

export const BrakSieci: Story = {
  args: { submit: answers.brakSieci },
  play: async ({ canvasElement }) => {
    const canvas = await fill(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Zaloguj się" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Brak połączenia z internetem");
    await expect(canvas.getByRole("button", { name: "Zaloguj się" })).toBeEnabled();
  },
};

export const WalidacjaPoOpuszczeniuPolaIPrzyWyslaniu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const email = canvas.getByLabelText(/E-mail/);
    await userEvent.type(email, "ala-bez-malpy");
    await userEvent.tab();
    await expect(email).toHaveAccessibleDescription(/brakuje znaku @/);
    await userEvent.click(canvas.getByRole("button", { name: "Zaloguj się" }));
    await waitFor(() => expect(email).toHaveFocus());
    await expect(canvas.getByLabelText(/Hasło/)).toHaveAccessibleDescription("Wpisz hasło.");
  },
};
