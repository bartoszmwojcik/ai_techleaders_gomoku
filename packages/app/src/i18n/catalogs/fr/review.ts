import type { Translation } from "../types";

const review: Translation<"review"> = {
  meta: { title: "Revue de la partie — Gomoku" },
  heading: "Revue de la partie",
  banner: "{reason}. {detail}",
  finishedAt: "Terminée : {date}",
  players: "Joueurs",
  playerLine: "{side} : ",
  paperTitle: "La vue coup par coup n’est pas disponible",
  paperBody: "Cette partie a été jouée dans la variante « Papier et crayon ». Le résultat et les joueurs sont indiqués ci-dessus.",
  steps: "Parcourir les coups",
  start: "Début",
  previous: "Précédent",
  next: "Suivant",
  end: "Fin",
  emptyBoard: "Début de la partie — le plateau est vide",
  step: "Coup {step} sur {total} : {color}, colonne {column}, rangée {row}",
  color: { black: "noir", white: "blanc" },
  backHome: "Retour à l’accueil",
  backToHistory: "Retour à l’historique",
  notFoundTitle: "Impossible d’ouvrir cette partie",
  notFoundBody: "La partie n’existe pas, a été supprimée après la période de conservation ou vous n’y avez pas accès.",
};

export default review;
