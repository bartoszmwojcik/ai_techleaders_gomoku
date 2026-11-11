import type { Translation } from "../types";

const header: Translation<"header"> = {
  theme: {
    light: "Thème clair",
    dark: "Thème sombre",
  },
  language: {
    menuLabel: "Langue\u00a0: {language}, changer de langue",
  },
  session: {
    menuLabel: "Connecté en tant que {name}, menu du compte",
    account: "Compte",
    history: "Historique",
    logout: "Se déconnecter",
  },
  logout: {
    title: "Se déconnecter\u202f?",
    gameRunning: "Une partie est en cours — après la déconnexion, votre pendule continue de tourner. Se déconnecter\u202f?",
    gameUnknown:
      "Impossible de vérifier si une partie est en cours. Si c’est le cas, votre pendule continue de tourner après la déconnexion. Se déconnecter\u202f?",
    confirm: "Se déconnecter",
    cancel: "Rester connecté",
    failed: "La déconnexion a échoué. Réessayez.",
    failedTitle: "La déconnexion a échoué",
    failedRetry: "Réessayez.",
  },
};

export default header;
