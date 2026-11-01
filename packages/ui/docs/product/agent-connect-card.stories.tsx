import { AgentConnectCard, type AgentConnectCardProps } from "@gomoku/ui/game/agent-connect-card";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { Narrow } from "../../.storybook/blocks";

const URL = "https://gomoku.example/api/mcp";
const LONG_URL = "https://gomoku-bardzo-dluga-nazwa-domeny.example/api/mcp";

const clients = [
  { value: "claude-code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "gemini-cli", label: "Gemini CLI" },
  { value: "copilot-cli", label: "GitHub Copilot CLI" },
  { value: "copilot-vscode", label: "GitHub Copilot (VS Code)" },
  { value: "cursor", label: "Cursor" },
];

const cursorConfig = JSON.stringify({ mcpServers: { gomoku: { url: URL } } }, null, 2);

// The page owns the choice; here a story does (no persistence, like the real page).
function withClientState(args: AgentConnectCardProps) {
  return <StatefulCard {...args} />;
}

function StatefulCard(props: AgentConnectCardProps) {
  const [client, setClient] = useState(props.client);
  return (
    <AgentConnectCard
      {...props}
      client={client}
      onClientChange={(value) => {
        setClient(value);
        props.onClientChange(value);
      }}
    />
  );
}

const meta = {
  title: "Produkt/Partia/Karta podłączenia agenta",
  component: AgentConnectCard,
  args: {
    summary: "Jak podłączyć agenta",
    clientLabel: "Klient",
    clients,
    client: "claude-code",
    onClientChange: fn(),
    snippetIntro: "W terminalu agenta uruchom polecenie:",
    snippet: `claude mcp add --transport http gomoku ${URL}`,
    copySnippetLabel: "Kopiuj polecenie",
    checkText: "Sprawdź połączenie: w Claude Code wpisz /mcp.",
    codeIntro: "Powiedz agentowi: „Dołącz do partii gomoku narzędziem join z kodem ABCD-EFGH”.",
    code: "ABCD-EFGH",
    copyCodeLabel: "Kopiuj kod",
    serverLabel: "Adres serwera",
    serverUrl: URL,
    copiedLabel: "Skopiowano",
    note: "Inny klient MCP? Podaj mu adres serwera (Streamable HTTP, bez uwierzytelniania). Nie podawaj agentowi hasła ani tokenów.",
    onCopySnippet: fn(),
    onCopyCode: fn(),
  },
  render: (args) => withClientState(args),
} satisfies Meta<typeof AgentConnectCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Zwiniety: Story = {};

export const Rozwiniety: Story = { args: { defaultOpen: true } };

export const SkopiowanoFragment: Story = { args: { defaultOpen: true, copied: "snippet" } };

export const SkopiowanoKod: Story = { args: { defaultOpen: true, copied: "code" } };

export const Cursor: Story = {
  args: {
    defaultOpen: true,
    client: "cursor",
    snippetIntro: "Dodaj do pliku ~/.cursor/mcp.json (albo .cursor/mcp.json w projekcie):",
    snippet: cursorConfig,
    copySnippetLabel: "Kopiuj konfigurację",
    checkText: "Włącz serwer na liście MCP w ustawieniach Cursora.",
  },
};

export const DlugiAdresNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <AgentConnectCard
        {...args}
        defaultOpen
        snippet={`claude mcp add --transport http gomoku ${LONG_URL}`}
        serverUrl={LONG_URL}
      />
    </Narrow>
  ),
};

export const CursorNaWaskimEkranie: Story = {
  render: (args) => (
    <Narrow>
      <AgentConnectCard
        {...args}
        defaultOpen
        client="cursor"
        snippet={JSON.stringify({ mcpServers: { gomoku: { url: LONG_URL } } }, null, 2)}
        copySnippetLabel="Kopiuj konfigurację"
        serverUrl={LONG_URL}
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
    await expect(args.onCopySnippet).toHaveBeenCalledTimes(1);
    await expect(args.onCopyCode).toHaveBeenCalledTimes(1);
  },
};

export const ZmianaKlienta: Story = {
  args: {
    defaultOpen: true,
    onClientChange: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByRole("combobox", { name: "Klient" });
    await expect(select).toHaveValue("claude-code");
    await userEvent.selectOptions(select, "cursor");
    await expect(args.onClientChange).toHaveBeenCalledWith("cursor");
  },
};
