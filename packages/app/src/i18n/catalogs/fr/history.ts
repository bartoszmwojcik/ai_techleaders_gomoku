import type { Translation } from "../types";

const history: Translation<"history"> = {
  meta: { title: "Historique des parties — Gomoku" },
  heading: "Historique des parties",
  listTitle: "Parties terminées",
  loading: "Chargement de l’historique des parties",
  emptyTitle: "Vous n’avez encore joué aucune partie",
  emptyBody: "Jouez avec un ami ou choisissez un adversaire dans le salon, et vos parties terminées apparaîtront ici.",
  review: "Revoir la partie",
  added: {
    one: "{count} partie plus ancienne ajoutée.",
    many: "{count} parties plus anciennes ajoutées.",
    other: "{count} parties plus anciennes ajoutées.",
  },
  sessionExpired: "Session expirée",
  loginAgain: "Reconnectez-vous",
  signedOut: "{link} pour voir les parties plus anciennes.",
  more: "Afficher les plus anciennes",
  retry: "Réessayer",
  moreFailedTitle: "Impossible de charger les parties plus anciennes",
  moreFailedBody: "Vérifiez votre connexion Internet et réessayez.",
  backHome: "Retour à l’accueil",
  result: { win: "Victoire", loss: "Défaite", draw: "Match nul" },
  reason: { five_in_row: "5 alignés", timeout: "Temps écoulé", resignation: "Abandon", draw: "Plateau plein", points: "Points" },
  paperDetail: "{variant} · {score}",
  paperDetailWithReason: "{variant} · {score} · {reason}",
};

export default history;
