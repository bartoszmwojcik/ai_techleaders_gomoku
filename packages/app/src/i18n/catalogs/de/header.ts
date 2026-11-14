import type { Translation } from "../types";

/**
 * Complete machine draft (status `draft`), awaiting native review (E15-S10). German is selectable with `?lang=de`,
 * but hidden from the switch until every namespace is reviewed.
 */
const header: Translation<"header"> = {
  theme: {
    light: "Helles Design",
    dark: "Dunkles Design",
  },
  language: {
    menuLabel: "Sprache: {language}, Sprache ändern",
  },
  session: {
    menuLabel: "Angemeldet als {name}, Kontomenü",
    account: "Konto",
    history: "Verlauf",
    logout: "Abmelden",
  },
  logout: {
    title: "Abmelden?",
    gameRunning: "Eine Partie läuft — nach dem Abmelden läuft deine Uhr weiter. Abmelden?",
    gameUnknown: "Wir konnten nicht prüfen, ob eine Partie läuft. Falls ja, läuft deine Uhr nach dem Abmelden weiter. Abmelden?",
    confirm: "Abmelden",
    cancel: "Angemeldet bleiben",
    failed: "Abmelden fehlgeschlagen. Versuche es erneut.",
    failedTitle: "Abmelden fehlgeschlagen",
    failedRetry: "Versuche es erneut.",
  },
};

export default header;
