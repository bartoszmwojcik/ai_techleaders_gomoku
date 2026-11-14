import type { AgentClient } from "@gomoku/core/games/agent-connect";

import { PL_GAME, type GameTranslator } from "./play";

/** Texts of the connect panel for one agent client (E07-S05); the syntax itself lives in core. */
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

/** The copy of every client in the reader's language. */
export function agentClientCopyOf(t: GameTranslator): Record<AgentClient, AgentClientCopy> {
  const command = { intro: t("agentClients.runCommand"), copyLabel: t("agentClients.copyCommand") };
  const config = { copyLabel: t("agentClients.copyConfig") };
  return {
    "claude-code": {
      label: "Claude Code",
      intro: t("agentClients.runCommandAgent"),
      copyLabel: t("agentClients.copyCommand"),
      check: t("agentClients.claudeCheck"),
    },
    codex: { label: "Codex", ...command, check: t("agentClients.codexCheck") },
    "gemini-cli": { label: "Gemini CLI", ...command, check: t("agentClients.geminiCheck"), note: t("agentClients.geminiNote") },
    "copilot-cli": { label: "GitHub Copilot CLI", ...command, check: t("agentClients.copilotCliCheck") },
    "copilot-vscode": {
      label: "GitHub Copilot (VS Code)",
      intro: t("agentClients.vscodeIntro"),
      ...config,
      check: t("agentClients.vscodeCheck"),
    },
    cursor: { label: "Cursor", intro: t("agentClients.cursorIntro"), ...config, check: t("agentClients.cursorCheck") },
  };
}

export const AGENT_CLIENT_COPY: Record<AgentClient, AgentClientCopy> = agentClientCopyOf(PL_GAME);
