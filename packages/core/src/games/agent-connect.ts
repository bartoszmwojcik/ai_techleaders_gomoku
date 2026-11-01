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
