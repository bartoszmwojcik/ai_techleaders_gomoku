/** Name of the MCP server entry in the agent's client (not the protocol-level server name). */
export const MCP_SERVER_NAME_FOR_CLIENT = "gomoku";

// A bare origin only: scheme, host, optional port. No path, query, quote or whitespace, so the
// address is safe to paste into a shell command.
const SAFE_ORIGIN = /^https?:\/\/[A-Za-z0-9.:[\]-]+$/;

/** Address of the MCP endpoint of this server (E06-S04); a trailing slash on the origin is ignored. */
export function agentMcpUrl(origin: string): string {
  const bare = origin.replace(/\/$/, "");
  if (!SAFE_ORIGIN.test(bare)) throw new Error("Invalid application origin.");
  return `${bare}/api/mcp`;
}

/** The Claude Code command that adds this server (`--transport http`, name, address). */
export function agentAddCommand(mcpUrl: string): string {
  return `claude mcp add --transport http ${MCP_SERVER_NAME_FOR_CLIENT} ${mcpUrl}`;
}

/** Agent clients the connect panel has instructions for (E07-S05). */
export const AGENT_CLIENTS = ["claude-code", "codex", "gemini-cli", "copilot-cli", "copilot-vscode", "cursor"] as const;

export type AgentClient = (typeof AGENT_CLIENTS)[number];

export const DEFAULT_AGENT_CLIENT: AgentClient = "claude-code";

/** A setup instruction: a shell command to run, or a config file content to paste. */
export type AgentClientSetup = { kind: "command" | "config"; text: string };

/** Type guard for values coming from a form control. */
export function isAgentClient(value: string): value is AgentClient {
  return (AGENT_CLIENTS as readonly string[]).includes(value);
}

/** What to run or paste to add this server to the given client; no credentials of any kind (D-29). */
export function agentClientSetup(client: AgentClient, mcpUrl: string): AgentClientSetup {
  const name = MCP_SERVER_NAME_FOR_CLIENT;
  switch (client) {
    case "claude-code":
      return { kind: "command", text: agentAddCommand(mcpUrl) };
    case "codex":
      return { kind: "command", text: `codex mcp add ${name} --url ${mcpUrl}` };
    case "gemini-cli":
      return { kind: "command", text: `gemini mcp add --transport http ${name} ${mcpUrl}` };
    case "copilot-cli":
      return { kind: "command", text: `copilot mcp add --transport http ${name} ${mcpUrl}` };
    case "copilot-vscode":
      return { kind: "config", text: JSON.stringify({ servers: { [name]: { type: "http", url: mcpUrl } } }, null, 2) };
    case "cursor":
      return { kind: "config", text: JSON.stringify({ mcpServers: { [name]: { url: mcpUrl } } }, null, 2) };
  }
}
