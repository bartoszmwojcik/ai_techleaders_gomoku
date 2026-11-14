import type { Translation } from "../types";

const common: Translation<"common"> = {
  meta: {
    description: "Gomoku 1:1 en ligne — règles libres, plateau 15×15, pendule de 10 minutes par joueur.",
  },
  player: {
    guestDefault: "Joueur {seat}",
    deleted: "Joueur supprimé",
    agent: "Agent",
    agentDeclared: "Agent · {name} (déclaré)",
    declaredSuffix: "(déclaré)",
    guestSuffix: "(invité)",
    guestLabel: "{name} (invité)",
    you: "Vous",
    youAccount: "Vous ({name})",
    youGuestLead: "Vous\u202f: ",
  },
  bot: {
    plain: "Bot",
    name: "Bot · niveau {level}",
    nameWithTable: "Bot · niveau {level} · {table}",
  },
  rateLimited: {
    title: "Trop de tentatives",
    later: "Réessayez dans un moment.",
    inMinutes: "Réessayez dans {minutes}\u00a0min.",
  },
  connectionError: {
    title: "Impossible de joindre le serveur. Réessayez.",
    body: "Nous ne savons pas si cette partie existe\u202f: le serveur ne répond pas.",
    retry: "Réessayer",
    backHome: "Retour à l’accueil",
  },
};

export default common;
