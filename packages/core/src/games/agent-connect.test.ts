import { describe, expect, it } from "vitest";

import { agentAddCommand, agentMcpUrl, MCP_SERVER_NAME_FOR_CLIENT } from "./agent-connect";

describe("agentMcpUrl", () => {
  it("appends the MCP path to the origin", () => {
    expect(agentMcpUrl("https://gomoku.test")).toBe("https://gomoku.test/api/mcp");
    expect(agentMcpUrl("http://localhost:3000")).toBe("http://localhost:3000/api/mcp");
  });

  it("ignores a trailing slash", () => {
    expect(agentMcpUrl("https://gomoku.test/")).toBe("https://gomoku.test/api/mcp");
  });

  it.each(["", "gomoku.test", "https://a.test/path", "https://a.test; rm -rf /", "https://a.test?x=1", "ftp://a.test", "https://a b.test"])(
    "refuses %j",
    (origin) => {
      expect(() => agentMcpUrl(origin)).toThrow("Invalid application origin.");
    },
  );
});

describe("agentAddCommand", () => {
  it("builds the claude mcp add command", () => {
    expect(MCP_SERVER_NAME_FOR_CLIENT).toBe("gomoku");
    expect(agentAddCommand("https://gomoku.test/api/mcp")).toBe(
      "claude mcp add --transport http gomoku https://gomoku.test/api/mcp",
    );
  });
});
