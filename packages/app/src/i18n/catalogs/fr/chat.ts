import type { Translation } from "../types";

const chat: Translation<"chat"> = {
  title: "Discussion",
  with: "avec",
  waiting: "La discussion sera disponible quand l’adversaire aura rejoint la partie.",
  closed: "La discussion est fermée.",
  disabledByYou:
    "Vous avez désactivé la discussion. Vous ne voyez pas les messages de votre interlocuteur et ne pouvez pas écrire. Il verra que la discussion est désactivée.",
  turnOff: "Désactiver la discussion",
  turnOn: "Activer la discussion",
  turnOffFailed: "Impossible de désactiver la discussion. Réessayez.",
  turnOnFailed: "Impossible d’activer la discussion. Réessayez.",
  disabledByOpponent: "Votre interlocuteur a désactivé la discussion. Vous ne pouvez pas écrire pour le moment.",
  disabledByOpponentReason: "Écriture bloquée : votre interlocuteur a désactivé la discussion.",
  opponentDisabledPublic:
    "Votre interlocuteur a désactivé la discussion et ne verra pas vos messages. Vous pouvez écrire aux spectateurs.",
  loading: "Chargement de la discussion…",
  infoLabel: "À propos des messages de la discussion",
  info: "Les messages ne sont pas conservés durablement : nous les supprimons environ une heure après la fin de la partie, et immédiatement à la suppression du compte. Seuls les participants de la partie les voient. Chacun d’eux peut désactiver la discussion dans cette partie. La discussion n’a ni modération ni signalement des abus.",
  spectatorInfo:
    "Les messages ne sont pas conservés durablement : nous les supprimons environ une heure après la fin de la partie, et immédiatement à la suppression du compte. Les joueurs et les spectateurs les voient. Un joueur peut désactiver la discussion pour lui-même — il ne verra alors plus vos messages, mais les autres continuent de discuter. La discussion n’a ni modération ni signalement des abus.",
  readOnly: "Pour écrire dans la discussion, entrez avec un pseudo ou connecté à un compte. Sinon, vous pouvez seulement lire.",
  collapse: "Réduire la discussion",
  expand: "Déplier la discussion",
  unread: { one: "Discussion ({count} nouveau)", many: "Discussion ({count} nouveaux)", other: "Discussion ({count} nouveaux)" },
  unreadStatus: { one: "Discussion : {count} nouveau", many: "Discussion : {count} nouveaux", other: "Discussion : {count} nouveaux" },
  refreshFailed: "Impossible d’actualiser la discussion. Nouvelles tentatives en cours.",
  retry: "Réessayer",
  empty: "Personne n’a encore rien écrit. Soyez le premier.",
  log: "Messages de la discussion",
  sending: "Envoi…",
  newMessages: "Nouveaux messages",
  you: "Vous",
  message: "Message",
  send: "Envoyer",
  resend: "Renvoyer",
  wait: "Patientez un instant avant le prochain message.",
  offline: "Non envoyé : pas de connexion.",
  left: { one: "{count} caractère restant", many: "{count} caractères restants", other: "{count} caractères restants" },
  over: { one: "{count} caractère de trop", many: "{count} caractères de trop", other: "{count} caractères de trop" },
  rejection: {
    not_text: "Le message doit être du texte.",
    empty: "Saisissez un message.",
    too_long: "Le message est trop long.",
    control_char: "Le message ne peut pas contenir de caractères de contrôle ni de retours à la ligne.",
    invisible_char: "Le message ne peut pas contenir de caractères invisibles.",
    combining_run: "Le message contient trop de caractères combinants.",
    url: "Le message ne peut pas contenir d’adresses web.",
  },
  refused: {
    CHAT_UNAVAILABLE: "La discussion n’est pas disponible dans cette partie pour le moment.",
    CHAT_DISABLED: "La discussion est désactivée.",
    CHAT_FULL: "Cette partie a déjà atteint le nombre maximal de messages.",
  },
};

export default chat;
