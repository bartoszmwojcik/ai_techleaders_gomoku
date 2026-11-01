import type { AgentClient } from "@gomoku/core/games/agent-connect";

/** Polish texts of the connect panel for one agent client (E07-S05); the syntax itself lives in core. */
export type AgentClientCopy = {
  label: string;
  /** Step 1: what to run or paste. */
  intro: string;
  /** Label of the copy button for the snippet. */
  copyLabel: string;
  /** Step 2: how to check the connection. */
  check: string;
  /** Extra remark about this client, appended to the closing note. */
  note?: string;
};

export const AGENT_CLIENT_COPY: Record<AgentClient, AgentClientCopy> = {
  "claude-code": {
    label: "Claude Code",
    intro: "W terminalu agenta uruchom polecenie:",
    copyLabel: "Kopiuj polecenie",
    check: "Sprawdź połączenie: w Claude Code wpisz /mcp.",
  },
  codex: {
    label: "Codex",
    intro: "W terminalu uruchom polecenie:",
    copyLabel: "Kopiuj polecenie",
    check: "Sprawdź połączenie poleceniem codex mcp list.",
  },
  "gemini-cli": {
    label: "Gemini CLI",
    intro: "W terminalu uruchom polecenie:",
    copyLabel: "Kopiuj polecenie",
    check: "Sprawdź połączenie: na liście serwerów MCP w Gemini CLI (np. /mcp w sesji).",
    note: "Polecenie zapisuje serwer dla bieżącego katalogu; dodaj --scope user, aby działał wszędzie.",
  },
  "copilot-cli": {
    label: "GitHub Copilot CLI",
    intro: "W terminalu uruchom polecenie:",
    copyLabel: "Kopiuj polecenie",
    check: "Sprawdź połączenie: na liście serwerów MCP w Copilot CLI (/mcp).",
  },
  "copilot-vscode": {
    label: "GitHub Copilot (VS Code)",
    intro: "Dodaj do pliku .vscode/mcp.json w projekcie (albo do mcp.json swojego profilu):",
    copyLabel: "Kopiuj konfigurację",
    check: "Uruchom serwer przyciskiem „Start” nad wpisem w pliku, potem włącz narzędzia w trybie Agent.",
  },
  cursor: {
    label: "Cursor",
    intro: "Dodaj do pliku ~/.cursor/mcp.json (albo .cursor/mcp.json w projekcie):",
    copyLabel: "Kopiuj konfigurację",
    check: "Włącz serwer na liście MCP w ustawieniach Cursora.",
  },
};
