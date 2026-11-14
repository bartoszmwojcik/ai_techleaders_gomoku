import type { Translation } from "../types";

/** Draft (status `draft`), awaiting native review. */
const errors: Translation<"errors"> = {
  zod: {
    invalid_type: "Valeur incorrecte.",
    too_small: {
      _: "La valeur est trop petite.",
      string: {
        inclusive: {
          one: "Saisissez au moins {count} caractère.",
          many: "Saisissez au moins {count} caractères.",
          other: "Saisissez au moins {count} caractères.",
        },
        exclusive: {
          one: "Saisissez plus de {count} caractère.",
          many: "Saisissez plus de {count} caractères.",
          other: "Saisissez plus de {count} caractères.",
        },
        exact: {
          one: "Saisissez exactement {count} caractère.",
          many: "Saisissez exactement {count} caractères.",
          other: "Saisissez exactement {count} caractères.",
        },
      },
      number: {
        inclusive: "Indiquez un nombre supérieur ou égal à {count}.",
        exclusive: "Indiquez un nombre supérieur à {count}.",
        exact: "Indiquez le nombre {count}.",
      },
    },
    too_big: {
      _: "La valeur est trop grande.",
      string: {
        inclusive: {
          one: "Saisissez au plus {count} caractère.",
          many: "Saisissez au plus {count} caractères.",
          other: "Saisissez au plus {count} caractères.",
        },
        exclusive: {
          one: "Saisissez moins de {count} caractère.",
          many: "Saisissez moins de {count} caractères.",
          other: "Saisissez moins de {count} caractères.",
        },
        exact: {
          one: "Saisissez exactement {count} caractère.",
          many: "Saisissez exactement {count} caractères.",
          other: "Saisissez exactement {count} caractères.",
        },
      },
      number: {
        inclusive: "Indiquez un nombre inférieur ou égal à {count}.",
        exclusive: "Indiquez un nombre inférieur à {count}.",
        exact: "Indiquez le nombre {count}.",
      },
    },
    invalid_format: {
      _: "Format incorrect.",
      email: "Indiquez une adresse e-mail valide.",
      regex: "Le texte saisi contient des caractères non autorisés.",
    },
    invalid_value: "Choisissez l’une des valeurs proposées.",
    invalid_union: "Valeur incorrecte.",
    unrecognized_keys: "Le formulaire contient des champs inconnus.",
    invalid_key: "Clé incorrecte.",
    invalid_element: "Élément incorrect.",
    not_multiple_of: "Valeur incorrecte.",
    custom: "Valeur incorrecte.",
    unknown: "Valeur incorrecte.",
  },
  field: {
    email: {
      invalid_type: "Indiquez une adresse e-mail.",
      too_big: "L’adresse e-mail peut comporter au plus {count} caractères.",
      invalid_format: "Indiquez une adresse e-mail valide.",
    },
    newEmail: {
      invalid_type: "Indiquez une adresse e-mail.",
      too_big: "L’adresse e-mail peut comporter au plus {count} caractères.",
      invalid_format: "Indiquez une adresse e-mail valide.",
      EMAIL_UNCHANGED: "C’est déjà l’adresse de votre compte.",
    },
    password: {
      invalid_type: "Indiquez un mot de passe.",
      too_small: "Indiquez un mot de passe.",
      too_big: "Le mot de passe peut comporter au plus {count} caractères.",
      PASSWORD_TOO_SHORT: "Le mot de passe doit comporter au moins {count} caractères.",
      PASSWORD_TOO_LONG: "Le mot de passe peut comporter au plus {count} octets.",
      INVALID_PASSWORD: "Mot de passe incorrect.",
    },
    currentPassword: {
      invalid_type: "Indiquez votre mot de passe actuel.",
      too_small: "Indiquez votre mot de passe actuel.",
      too_big: "Le mot de passe peut comporter au plus {count} caractères.",
      INVALID_CURRENT_PASSWORD: "Le mot de passe actuel est incorrect.",
    },
    newPassword: {
      invalid_type: "Indiquez un mot de passe.",
      PASSWORD_TOO_SHORT: "Le mot de passe doit comporter au moins {count} caractères.",
      PASSWORD_TOO_LONG: "Le mot de passe peut comporter au plus {count} octets.",
      PASSWORD_UNCHANGED: "Le nouveau mot de passe doit être différent de l’actuel.",
    },
    displayName: {
      invalid_type: "Indiquez un nom de joueur.",
      too_small: "Le nom de joueur doit comporter au moins {count} caractères.",
      too_big: "Le nom de joueur peut comporter au plus {count} caractères.",
      invalid_format:
        "Le nom de joueur ne peut contenir que des lettres, des chiffres et les caractères _ et - (sans espaces).",
      DISPLAY_NAME_RESERVED: "Ce nom est réservé.",
      DISPLAY_NAME_TAKEN: "Ce nom de joueur est déjà pris.",
      DISPLAY_NAME_UNCHANGED: "C’est déjà votre nom de joueur.",
    },
    nickname: {
      invalid_type: "Le pseudo peut contenir des lettres, des chiffres, des espaces et les caractères _ et -.",
      NICKNAME_TOO_LONG: "Le pseudo peut comporter au plus {count} caractères.",
      NICKNAME_INVALID: "Le pseudo peut contenir des lettres, des chiffres, des espaces et les caractères _ et -.",
      NICKNAME_RESERVED: "Ce nom est réservé.",
      NICKNAME_GUEST_ONLY: "Seul un invité indique un pseudo.",
    },
    acknowledgedGuestWarning: {
      invalid_type: "Confirmez que vous comprenez les limites du jeu sans compte.",
      GUEST_WARNING_REQUIRED: "Confirmez que vous comprenez les limites du jeu sans compte.",
    },
    cancelOwnWaitingGame: {
      invalid_type: "Valeur incorrecte.",
    },
    isPublic: {
      invalid_type: "Valeur incorrecte.",
      BOT_PUBLIC: "Une partie contre le bot ne peut pas être publique.",
    },
    confirm: {
      invalid_value: "Cochez la confirmation pour supprimer le compte.",
    },
    as: {
      invalid_value: "Choisissez comment vous rejoignez la partie.",
    },
    variant: {
      invalid_value: "Variante de partie incorrecte.",
    },
    timeControlMs: {
      invalid_union: "Durée de partie incorrecte.",
      TIME_CONTROL_CLASSIC: "La durée de la partie ne se choisit que dans la variante « Papier et crayon ».",
    },
    opponent: {
      invalid_value: "Adversaire incorrect.",
      BOT_VARIANT_UNSUPPORTED: "Le bot ne joue que dans la variante classique.",
    },
    botLevel: {
      invalid_union: "Niveau du bot incorrect.",
      BOT_LEVEL_REQUIRED: "Choisissez le niveau du bot.",
      BOT_LEVEL_WITHOUT_BOT: "Le niveau du bot ne se choisit que dans une partie contre le bot.",
    },
    text: {
      invalid_type: "Le message doit être un texte.",
      too_big: "Le message est trop long.",
    },
  },
  api: {
    network: "Pas de connexion au serveur. Vérifiez votre connexion Internet et réessayez.",
    VALIDATION: "Corrigez les champs signalés.",
    UNAUTHORIZED: {
      _: "Connectez-vous pour continuer.",
      session_required: "Connectez-vous pour continuer.",
      join_sign_in: "Connectez-vous pour rejoindre la partie.",
    },
    FORBIDDEN: {
      _: "Vous n’avez pas accès à cette opération.",
      request_rejected: "Requête refusée.",
      spectator_name_required: "Pour écrire dans la discussion, entrez avec un pseudo ou connecté à un compte.",
      agent_settings: "L’agent ne modifie pas les réglages de la discussion.",
    },
    NOT_FOUND: "Partie introuvable.",
    CONFLICT: {
      _: "Impossible d’effectuer cette opération.",
      email_taken: "Impossible de créer le compte. Si vous avez déjà un compte, connectez-vous.",
      display_name_taken: "Ce nom de joueur est déjà pris.",
    },
    RATE_LIMITED: {
      _: "Trop de tentatives. Réessayez plus tard.",
      attempts: "Trop de tentatives. Réessayez plus tard.",
      chat_interval: "Attendez un instant avant le prochain message.",
    },
    PAYLOAD_TOO_LARGE: "La requête est trop volumineuse.",
    INTERNAL: "Une erreur inattendue s’est produite.",
    ACTIVE_GAME: "Terminez ou abandonnez d’abord la partie.",
    ACTIVE_GAME_EXISTS: "Vous avez déjà une partie. Terminez-la ou annulez celle en attente.",
    ADMIN_ACCOUNT_PROTECTED: "Ce compte ne peut pas être supprimé.",
    ADMIN_EMAIL_LOCKED: "L’adresse e-mail de ce compte ne peut pas être modifiée.",
    ALREADY_VERIFIED: "L’adresse e-mail est déjà confirmée.",
    AUDIENCE_CLOSED: "Le créateur a fermé le public de cette partie.",
    BOT_UNAVAILABLE: "Le bot est indisponible pour le moment. Réessayez dans un instant ou invitez une personne.",
    CANNOT_PICK_SELF: "Vous ne pouvez pas jouer contre vous-même.",
    CELL_OCCUPIED: "Cette case est déjà occupée.",
    CHAT_DISABLED: "La discussion est désactivée.",
    CHAT_FULL: "Cette partie a déjà atteint le nombre maximal de messages.",
    CHAT_UNAVAILABLE: "La discussion est indisponible pour le moment dans cette partie.",
    DISPLAY_NAME_COOLDOWN: "Le nom de joueur peut être changé une fois par jour. Réessayez plus tard.",
    DISPLAY_NAME_TAKEN: "Le nom de joueur est déjà pris.",
    EMAIL_QUOTA_EXCEEDED:
      "L’envoi d’e-mails est momentanément indisponible. Réessayez demain ou jouez en invité depuis une invitation.",
    EMAIL_SEND_FAILED: "Impossible d’envoyer l’e-mail. Réessayez plus tard.",
    FIRST_MOVE_CENTER: "La première pierre se pose au centre du plateau.",
    GAME_FINISHED: "Cette partie est déjà terminée.",
    GAME_NOT_ACTIVE: {
      _: "Cette partie n’est pas en cours.",
      game_not_active: "Cette partie n’est pas en cours.",
      audience_not_closable: "Le public ne peut être fermé que dans une partie en cours ou terminée.",
      show_ended: "Cette démonstration est déjà terminée.",
    },
    GAME_NOT_CANCELLABLE: "Cette partie ne peut plus être annulée.",
    GAME_NOT_FINISHED: "Une revanche n’est possible qu’après la fin de la partie.",
    GAME_NOT_PUBLIC: "Cette partie n’est pas publique.",
    GAME_NOT_STARTED: "En attente de l’ouverture de la partie par l’adversaire.",
    GUEST_NOT_ALLOWED:
      "Vous êtes connecté — rejoignez la partie avec votre compte. Le jeu sans compte est réservé aux personnes non connectées.",
    INVALID_CREDENTIALS: "E-mail ou mot de passe incorrect.",
    INVALID_CURRENT_PASSWORD: "Le mot de passe actuel est incorrect.",
    INVALID_INVITATION: "Cette invitation n’est plus valable.",
    INVALID_PASSWORD: "Mot de passe incorrect.",
    INVALID_TOKEN: "Le lien a expiré ou a déjà été utilisé.",
    LOBBY_SEEKER_EXPIRED: "Le statut de ce joueur a expiré.",
    LOBBY_SEEKER_TAKEN: "Ce joueur joue déjà avec quelqu’un d’autre. Choisissez une autre personne dans la liste.",
    MOVE_TOO_FAR: "Une pierre peut être placée au plus à 3 cases d’une autre.",
    NOT_YOUR_TURN: {
      _: "C’est au tour de l’adversaire.",
      opponent_turn: "C’est au tour de l’adversaire.",
      auto_turn: "L’automate pose une pierre.",
    },
    OWN_INVITATION: "C’est votre propre invitation — l’adversaire doit être quelqu’un d’autre.",
    OWN_WAITING_GAME: {
      _: "Vous avez une partie en attente. Annulez-la pour continuer.",
      create: "Vous avez une partie en attente. Annulez-la pour en créer une nouvelle.",
      join: "Vous avez une partie en attente. Annulez-la pour rejoindre celle-ci.",
    },
    REMATCH_ALREADY_OFFERED: "Une revanche a déjà été proposée.",
    REMATCH_EXPIRED: "La proposition de revanche a expiré.",
    REMATCH_NOT_OFFERED: "Aucune proposition de revanche en attente de réponse.",
    REMATCH_UNAVAILABLE: {
      _: "La revanche est impossible.",
      opponent_gone: "L’adversaire n’est plus disponible, la revanche est impossible.",
      bot: "Pas de revanche contre le bot. Rejouez contre le bot dans une nouvelle partie.",
    },
    SHOW_RUNNING: "Une démonstration est déjà en cours. Terminez-la ou revenez-y.",
    SHOW_UNAVAILABLE: "La démonstration est désactivée pour le moment.",
    SPECTATORS_FULL: "La partie a atteint le nombre maximal de spectateurs.",
    STALE_MOVE: "Le plateau a changé — actualisez l’affichage.",
  },
};

export default errors;
