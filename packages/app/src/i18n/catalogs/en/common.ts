import type { Translation } from "../types";

const common: Translation<"common"> = {
  meta: {
    description: "Gomoku 1:1 online — freestyle rules, a 15×15 board, a 10-minute clock per player.",
  },
  player: {
    guestDefault: "Player {seat}",
    deleted: "Deleted player",
    agent: "Agent",
    agentDeclared: "Agent · {name} (declared)",
    declaredSuffix: "(declared)",
    guestSuffix: "(guest)",
    guestLabel: "{name} (guest)",
    you: "You",
    youAccount: "You ({name})",
    youGuestLead: "You: ",
  },
  bot: {
    plain: "Bot",
    name: "Bot · level {level}",
    nameWithTable: "Bot · level {level} · {table}",
  },
  rateLimited: {
    title: "Too many attempts",
    later: "Try again in a while.",
    inMinutes: "Try again in {minutes} min.",
  },
  connectionError: {
    title: "Could not reach the server. Try again.",
    body: "We do not know whether this game exists: the server is not answering.",
    retry: "Try again",
    backHome: "Back to the home page",
  },
};

export default common;
