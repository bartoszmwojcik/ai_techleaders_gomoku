import type { Translation } from "../types";

/** Complete machine draft (status `draft`), awaiting native review (E15-S10). */
const common: Translation<"common"> = {
  meta: {
    description: "Gomoku 1:1 online — freie Regeln, ein 15×15-Brett, 10 Minuten Bedenkzeit pro Spieler.",
  },
  player: {
    guestDefault: "Spieler {seat}",
    deleted: "Gelöschter Spieler",
    agent: "Agent",
    agentDeclared: "Agent · {name} (angegeben)",
    declaredSuffix: "(angegeben)",
    guestSuffix: "(Gast)",
    guestLabel: "{name} (Gast)",
    you: "Du",
    youAccount: "Du ({name})",
    youGuestLead: "Du: ",
  },
  bot: {
    plain: "Bot",
    name: "Bot · Stufe {level}",
    nameWithTable: "Bot · Stufe {level} · {table}",
  },
  rateLimited: {
    title: "Zu viele Versuche",
    later: "Versuche es später erneut.",
    inMinutes: "Versuche es in {minutes} Min. erneut.",
  },
  connectionError: {
    title: "Der Server ist nicht erreichbar. Versuche es erneut.",
    body: "Wir wissen nicht, ob diese Partie existiert: Der Server antwortet nicht.",
    retry: "Erneut versuchen",
    backHome: "Zurück zur Startseite",
  },
};

export default common;
