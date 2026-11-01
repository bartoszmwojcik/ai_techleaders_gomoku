import { describe, expect, it } from "vitest";

import {
  AGENT_CLIENTS,
  agentAddCommand,
  agentClientSetup,
  agentMcpUrl,
  DEFAULT_AGENT_CLIENT,
  isAgentClient,
  MCP_SERVER_NAME_FOR_CLIENT,
} from "./agent-connect";

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

const URL = "https://gomoku.test/api/mcp";

describe("agentClientSetup", () => {
  it("lists six clients with Claude Code as the default", () => {
    expect(AGENT_CLIENTS).toHaveLength(6);
    expect(DEFAULT_AGENT_CLIENT).toBe("claude-code");
  });

  it.each([
    ["claude-code", `claude mcp add --transport http gomoku ${URL}`],
    ["codex", `codex mcp add gomoku --url ${URL}`],
    ["gemini-cli", `gemini mcp add --transport http gomoku ${URL}`],
    ["copilot-cli", `copilot mcp add --transport http gomoku ${URL}`],
  ] as const)("gives a command for %s", (client, text) => {
    expect(agentClientSetup(client, URL)).toEqual({ kind: "command", text });
  });

  it("gives a VS Code mcp.json with servers and type http", () => {
    const setup = agentClientSetup("copilot-vscode", URL);
    expect(setup.kind).toBe("config");
    expect(setup.text).toBe(`{\n  "servers": {\n    "gomoku": {\n      "type": "http",\n      "url": "${URL}"\n    }\n  }\n}`);
    expect(JSON.parse(setup.text)).toEqual({ servers: { gomoku: { type: "http", url: URL } } });
  });

  it("gives a Cursor mcp.json with mcpServers and url", () => {
    const setup = agentClientSetup("cursor", URL);
    expect(setup.kind).toBe("config");
    expect(JSON.parse(setup.text)).toEqual({ mcpServers: { gomoku: { url: URL } } });
    expect(setup.text.split("\n")).toHaveLength(7);
  });

  it.each(AGENT_CLIENTS)("never mentions credentials for %s (D-29)", (client) => {
    expect(agentClientSetup(client, URL).text).not.toMatch(/token|authorization|bearer|--header|secret|password/i);
  });
});

describe("isAgentClient", () => {
  it("accepts known clients only", () => {
    expect(isAgentClient("cursor")).toBe(true);
    expect(isAgentClient("windsurf")).toBe(false);
    expect(isAgentClient("")).toBe(false);
  });
});
