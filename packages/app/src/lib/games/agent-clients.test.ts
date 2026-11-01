import { AGENT_CLIENTS, agentClientSetup } from "@gomoku/core/games/agent-connect";
import { describe, expect, it } from "vitest";

import { AGENT_CLIENT_COPY } from "./agent-clients";

describe("AGENT_CLIENT_COPY", () => {
  it.each(AGENT_CLIENTS)("has Polish texts for %s and no credentials in them", (client) => {
    const copy = AGENT_CLIENT_COPY[client];
    expect(copy.label).not.toBe("");
    expect(copy.intro).not.toBe("");
    expect(copy.check).not.toBe("");
    const all = [copy.label, copy.intro, copy.copyLabel, copy.check, copy.note ?? "", agentClientSetup(client, "https://a.test/api/mcp").text].join("\n");
    expect(all).not.toMatch(/token|authorization|bearer|--header/i);
  });

  it("labels config clients with a configuration button and command clients with a command button", () => {
    for (const client of AGENT_CLIENTS) {
      const kind = agentClientSetup(client, "https://a.test/api/mcp").kind;
      expect(AGENT_CLIENT_COPY[client].copyLabel).toBe(kind === "config" ? "Kopiuj konfigurację" : "Kopiuj polecenie");
    }
  });

  it("warns about the project scope of Gemini CLI", () => {
    expect(AGENT_CLIENT_COPY["gemini-cli"].note).toContain("--scope user");
  });
});
