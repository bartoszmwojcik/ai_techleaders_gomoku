import { AgentConnectCard } from "@gomoku/ui/game/agent-connect-card";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const meta = {
  title: "Produkt/Partia/Karta podłączenia agenta",
  component: AgentConnectCard,
  args: {
    summary: "Jak podłączyć agenta",
    commandIntro: "W terminalu agenta uruchom polecenie:",
    command: "claude mcp add --transport http gomoku https://gomoku.example/api/mcp",
    copyCommandLabel: "Kopiuj polecenie",
    checkText: "Sprawdź połączenie: w Claude Code wpisz /mcp.",
    codeIntro: "Powiedz agentowi: „Dołącz do partii gomoku narzędziem join z kodem ABCD-EFGH”.",
    code: "ABCD-EFGH",
    copyCodeLabel: "Kopiuj kod",
    serverLabel: "Adres serwera",
    serverUrl: "https://gomoku.example/api/mcp",
    copiedLabel: "Skopiowano",
    note: "Inny klient MCP? Podaj mu adres serwera (Streamable HTTP, bez uwierzytelniania). Nie podawaj agentowi hasła ani tokenów.",
    onCopyCommand: fn(),
    onCopyCode: fn(),
  },
} satisfies Meta<typeof AgentConnectCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Zwiniety: Story = {};

export const Rozwiniety: Story = { args: { defaultOpen: true } };

export const SkopiowanoPolecenie: Story = { args: { defaultOpen: true, copied: "command" } };

export const SkopiowanoKod: Story = { args: { defaultOpen: true, copied: "code" } };

export const DlugiAdresNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <AgentConnectCard
        {...args}
        defaultOpen
        command="claude mcp add --transport http gomoku https://gomoku-bardzo-dluga-nazwa-domeny.example/api/mcp"
        serverUrl="https://gomoku-bardzo-dluga-nazwa-domeny.example/api/mcp"
      />
    </Narrow>
  ),
};

export const RozwijanieIKopiowanie: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Jak podłączyć agenta"));
    await userEvent.click(canvas.getByRole("button", { name: "Kopiuj polecenie" }));
    await userEvent.click(canvas.getByRole("button", { name: "Kopiuj kod" }));
    await expect(args.onCopyCommand).toHaveBeenCalledTimes(1);
    await expect(args.onCopyCode).toHaveBeenCalledTimes(1);
  },
};
