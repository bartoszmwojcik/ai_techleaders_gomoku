import type { Translation } from "../types";

/** Complete machine draft (status `draft`), awaiting native review (E15-S10). */
const chat: Translation<"chat"> = {
  title: "Chat",
  with: "mit",
  waiting: "Der Chat ist verfügbar, sobald der Gegner der Partie beitritt.",
  closed: "Der Chat ist geschlossen.",
  disabledByYou:
    "Du hast den Chat ausgeschaltet. Du siehst die Nachrichten der Gegenseite nicht und kannst nicht schreiben. Sie sieht, dass der Chat aus ist.",
  turnOff: "Chat ausschalten",
  turnOn: "Chat einschalten",
  turnOffFailed: "Der Chat konnte nicht ausgeschaltet werden. Versuche es erneut.",
  turnOnFailed: "Der Chat konnte nicht eingeschaltet werden. Versuche es erneut.",
  disabledByOpponent: "Die Gegenseite hat den Chat ausgeschaltet. Du kannst gerade nicht schreiben.",
  disabledByOpponentReason: "Schreiben gesperrt: Die Gegenseite hat den Chat ausgeschaltet.",
  opponentDisabledPublic: "Die Gegenseite hat den Chat ausgeschaltet und sieht deine Nachrichten nicht. Du kannst den Zuschauern schreiben.",
  loading: "Chat wird geladen…",
  infoLabel: "Hinweis zu Chatnachrichten",
  info: "Nachrichten werden nicht dauerhaft gespeichert: Wir löschen sie etwa eine Stunde nach Ende der Partie und sofort, wenn ein Konto gelöscht wird. Nur die Teilnehmer der Partie sehen sie. Jeder von ihnen kann den Chat in dieser Partie ausschalten. Der Chat hat keine Moderation und keine Meldefunktion.",
  spectatorInfo:
    "Nachrichten werden nicht dauerhaft gespeichert: Wir löschen sie etwa eine Stunde nach Ende der Partie und sofort, wenn ein Konto gelöscht wird. Spieler und Zuschauer sehen sie. Ein Spieler kann den Chat für sich ausschalten — dann sieht er deine Nachrichten nicht, die anderen schreiben aber weiter. Der Chat hat keine Moderation und keine Meldefunktion.",
  readOnly: "Um im Chat zu schreiben, komm mit einem Spitznamen oder angemeldet mit einem Konto. Sonst kannst du nur lesen.",
  collapse: "Chat einklappen",
  expand: "Chat ausklappen",
  unread: { one: "Chat ({count} neue)", other: "Chat ({count} neue)" },
  unreadStatus: { one: "Chat: {count} neue", other: "Chat: {count} neue" },
  refreshFailed: "Der Chat konnte nicht aktualisiert werden. Wir versuchen es weiter.",
  retry: "Erneut versuchen",
  empty: "Noch hat niemand etwas geschrieben. Schreib als Erster.",
  log: "Chatnachrichten",
  sending: "Wird gesendet…",
  newMessages: "Neue Nachrichten",
  you: "Du",
  message: "Nachricht",
  send: "Senden",
  resend: "Erneut senden",
  wait: "Warte kurz vor der nächsten Nachricht.",
  offline: "Nicht gesendet: keine Verbindung.",
  left: { one: "Noch {count} Zeichen", other: "Noch {count} Zeichen" },
  over: { one: "{count} Zeichen zu viel", other: "{count} Zeichen zu viel" },
  rejection: {
    not_text: "Die Nachricht muss Text sein.",
    empty: "Gib eine Nachricht ein.",
    too_long: "Die Nachricht ist zu lang.",
    control_char: "Die Nachricht darf keine Steuerzeichen oder Zeilenumbrüche enthalten.",
    invisible_char: "Die Nachricht darf keine unsichtbaren Zeichen enthalten.",
    combining_run: "Die Nachricht enthält zu viele kombinierende Zeichen.",
    url: "Die Nachricht darf keine Webadressen enthalten.",
  },
  refused: {
    CHAT_UNAVAILABLE: "Der Chat ist in dieser Partie gerade nicht verfügbar.",
    CHAT_DISABLED: "Der Chat ist ausgeschaltet.",
    CHAT_FULL: "Diese Partie hat bereits die maximale Anzahl an Nachrichten.",
  },
};

export default chat;
