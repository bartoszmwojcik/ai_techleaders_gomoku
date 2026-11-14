import type { Translation } from "../types";

/** Complete machine draft (status `draft`), awaiting native review (E15-S10). */
const review: Translation<"review"> = {
  meta: { title: "Partieanalyse — Gomoku" },
  heading: "Partieanalyse",
  banner: "{reason}. {detail}",
  finishedAt: "Beendet: {date}",
  players: "Spieler",
  playerLine: "{side}: ",
  paperTitle: "Die Ansicht Zug für Zug ist nicht verfügbar",
  paperBody: "Diese Partie wurde in der Variante „Papier und Bleistift“ gespielt. Ergebnis und Spieler stehen oben.",
  steps: "Durch die Züge blättern",
  start: "Anfang",
  previous: "Zurück",
  next: "Weiter",
  end: "Ende",
  emptyBoard: "Anfang der Partie — das Brett ist leer",
  step: "Zug {step} von {total}: {color}, Spalte {column}, Reihe {row}",
  color: { black: "Schwarz", white: "Weiß" },
  backHome: "Zurück zur Startseite",
  backToHistory: "Zurück zum Verlauf",
  notFoundTitle: "Wir können diese Partie nicht öffnen",
  notFoundBody: "Die Partie existiert nicht, wurde nach Ablauf der Aufbewahrungsfrist gelöscht oder du hast keinen Zugang zu ihr.",
};

export default review;
