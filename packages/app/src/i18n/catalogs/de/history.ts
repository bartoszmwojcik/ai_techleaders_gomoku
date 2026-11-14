import type { Translation } from "../types";

/** Complete machine draft (status `draft`), awaiting native review (E15-S10). */
const history: Translation<"history"> = {
  meta: { title: "Partieverlauf — Gomoku" },
  heading: "Partieverlauf",
  listTitle: "Beendete Partien",
  loading: "Partieverlauf wird geladen",
  emptyTitle: "Du hast noch keine Partie gespielt",
  emptyBody: "Spiel gegen eine Freundin oder einen Freund oder wähle einen Gegner in der Lobby — deine beendeten Partien erscheinen dann hier.",
  review: "Partie ansehen",
  added: { one: "{count} ältere Partie hinzugefügt.", other: "{count} ältere Partien hinzugefügt." },
  sessionExpired: "Sitzung abgelaufen",
  loginAgain: "Melde dich erneut an",
  signedOut: "{link}, um ältere Partien zu sehen.",
  more: "Ältere anzeigen",
  retry: "Erneut versuchen",
  moreFailedTitle: "Ältere Partien konnten nicht geladen werden",
  moreFailedBody: "Prüfe deine Internetverbindung und versuche es erneut.",
  backHome: "Zurück zur Startseite",
  result: { win: "Sieg", loss: "Niederlage", draw: "Remis" },
  reason: { five_in_row: "5 in einer Reihe", timeout: "Zeit abgelaufen", resignation: "Aufgabe", draw: "Brett voll", points: "Punkte" },
  paperDetail: "{variant} · {score}",
  paperDetailWithReason: "{variant} · {score} · {reason}",
};

export default history;
