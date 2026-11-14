import type { Translation } from "../types";

/** Complete machine draft (status `draft`), awaiting native review (E15-S10). */
const errors: Translation<"errors"> = {
  zod: {
    invalid_type: "Ungültiger Wert.",
    too_small: {
      _: "Der Wert ist zu klein.",
      string: {
        inclusive: {
          one: "Gib mindestens {count} Zeichen ein.",
          other: "Gib mindestens {count} Zeichen ein.",
        },
        exclusive: {
          one: "Gib mehr als {count} Zeichen ein.",
          other: "Gib mehr als {count} Zeichen ein.",
        },
        exact: {
          one: "Gib genau {count} Zeichen ein.",
          other: "Gib genau {count} Zeichen ein.",
        },
      },
      number: {
        inclusive: "Gib eine Zahl ein, die nicht kleiner als {count} ist.",
        exclusive: "Gib eine Zahl größer als {count} ein.",
        exact: "Gib die Zahl {count} ein.",
      },
    },
    too_big: {
      _: "Der Wert ist zu groß.",
      string: {
        inclusive: {
          one: "Gib höchstens {count} Zeichen ein.",
          other: "Gib höchstens {count} Zeichen ein.",
        },
        exclusive: {
          one: "Gib weniger als {count} Zeichen ein.",
          other: "Gib weniger als {count} Zeichen ein.",
        },
        exact: {
          one: "Gib genau {count} Zeichen ein.",
          other: "Gib genau {count} Zeichen ein.",
        },
      },
      number: {
        inclusive: "Gib eine Zahl ein, die nicht größer als {count} ist.",
        exclusive: "Gib eine Zahl kleiner als {count} ein.",
        exact: "Gib die Zahl {count} ein.",
      },
    },
    invalid_format: {
      _: "Ungültiges Format.",
      email: "Gib eine gültige E-Mail-Adresse ein.",
      regex: "Der eingegebene Text enthält unzulässige Zeichen.",
    },
    invalid_value: "Wähle einen der verfügbaren Werte.",
    invalid_union: "Ungültiger Wert.",
    unrecognized_keys: "Das Formular enthält unbekannte Felder.",
    invalid_key: "Ungültiger Schlüssel.",
    invalid_element: "Ungültiges Element.",
    not_multiple_of: "Ungültiger Wert.",
    custom: "Ungültiger Wert.",
    unknown: "Ungültiger Wert.",
  },
  field: {
    email: {
      invalid_type: "Gib eine E-Mail-Adresse ein.",
      too_big: "Die E-Mail-Adresse darf höchstens {count} Zeichen haben.",
      invalid_format: "Gib eine gültige E-Mail-Adresse ein.",
    },
    newEmail: {
      invalid_type: "Gib eine E-Mail-Adresse ein.",
      too_big: "Die E-Mail-Adresse darf höchstens {count} Zeichen haben.",
      invalid_format: "Gib eine gültige E-Mail-Adresse ein.",
      EMAIL_UNCHANGED: "Das ist bereits die Adresse deines Kontos.",
    },
    password: {
      invalid_type: "Gib ein Passwort ein.",
      too_small: "Gib ein Passwort ein.",
      too_big: "Das Passwort darf höchstens {count} Zeichen haben.",
      PASSWORD_TOO_SHORT: "Das Passwort muss mindestens {count} Zeichen haben.",
      PASSWORD_TOO_LONG: "Das Passwort darf höchstens {count} Byte haben.",
      INVALID_PASSWORD: "Falsches Passwort.",
    },
    currentPassword: {
      invalid_type: "Gib dein aktuelles Passwort ein.",
      too_small: "Gib dein aktuelles Passwort ein.",
      too_big: "Das Passwort darf höchstens {count} Zeichen haben.",
      INVALID_CURRENT_PASSWORD: "Das aktuelle Passwort ist falsch.",
    },
    newPassword: {
      invalid_type: "Gib ein Passwort ein.",
      PASSWORD_TOO_SHORT: "Das Passwort muss mindestens {count} Zeichen haben.",
      PASSWORD_TOO_LONG: "Das Passwort darf höchstens {count} Byte haben.",
      PASSWORD_UNCHANGED: "Das neue Passwort muss sich vom aktuellen unterscheiden.",
    },
    displayName: {
      invalid_type: "Gib einen Spielernamen ein.",
      too_small: "Der Spielername muss mindestens {count} Zeichen haben.",
      too_big: "Der Spielername darf höchstens {count} Zeichen haben.",
      invalid_format: "Der Spielername darf nur Buchstaben, Ziffern sowie die Zeichen _ und - enthalten (keine Leerzeichen).",
      DISPLAY_NAME_RESERVED: "Dieser Name ist reserviert.",
      DISPLAY_NAME_TAKEN: "Dieser Spielername ist bereits vergeben.",
      DISPLAY_NAME_UNCHANGED: "Das ist bereits dein Spielername.",
    },
    nickname: {
      invalid_type: "Der Spitzname darf Buchstaben, Ziffern, Leerzeichen sowie die Zeichen _ und - enthalten.",
      NICKNAME_TOO_LONG: "Der Spitzname darf höchstens {count} Zeichen haben.",
      NICKNAME_INVALID: "Der Spitzname darf Buchstaben, Ziffern, Leerzeichen sowie die Zeichen _ und - enthalten.",
      NICKNAME_RESERVED: "Dieser Name ist reserviert.",
      NICKNAME_GUEST_ONLY: "Einen Spitznamen gibt nur ein Gast an.",
    },
    acknowledgedGuestWarning: {
      invalid_type: "Bestätige, dass du die Einschränkungen des Spielens ohne Konto verstehst.",
      GUEST_WARNING_REQUIRED: "Bestätige, dass du die Einschränkungen des Spielens ohne Konto verstehst.",
    },
    cancelOwnWaitingGame: {
      invalid_type: "Ungültiger Wert.",
    },
    isPublic: {
      invalid_type: "Ungültiger Wert.",
      BOT_PUBLIC: "Eine Partie gegen den Bot kann nicht öffentlich sein.",
    },
    confirm: {
      invalid_value: "Setze das Häkchen zur Bestätigung, um das Konto zu löschen.",
    },
    as: {
      invalid_value: "Wähle, wie du der Partie beitrittst.",
    },
    variant: {
      invalid_value: "Ungültige Variante der Partie.",
    },
    timeControlMs: {
      invalid_union: "Ungültige Bedenkzeit.",
      TIME_CONTROL_CLASSIC: "Die Bedenkzeit lässt sich nur in der Variante „Papier und Bleistift“ wählen.",
    },
    opponent: {
      invalid_value: "Ungültiger Gegner.",
      BOT_VARIANT_UNSUPPORTED: "Der Bot spielt nur die klassische Variante.",
    },
    botLevel: {
      invalid_union: "Ungültige Bot-Stufe.",
      BOT_LEVEL_REQUIRED: "Wähle die Stufe des Bots.",
      BOT_LEVEL_WITHOUT_BOT: "Die Stufe des Bots wählt man nur in einer Partie gegen den Bot.",
    },
    text: {
      invalid_type: "Die Nachricht muss ein Text sein.",
      too_big: "Die Nachricht ist zu lang.",
    },
  },
  api: {
    network: "Keine Verbindung zum Server. Prüfe deine Internetverbindung und versuche es erneut.",
    VALIDATION: "Korrigiere die markierten Felder.",
    UNAUTHORIZED: {
      _: "Melde dich an, um fortzufahren.",
      session_required: "Melde dich an, um fortzufahren.",
      join_sign_in: "Melde dich an, um der Partie beizutreten.",
    },
    FORBIDDEN: {
      _: "Du hast keinen Zugriff auf diese Aktion.",
      request_rejected: "Anfrage abgelehnt.",
      spectator_name_required: "Um im Chat zu schreiben, komm mit einem Spitznamen oder angemeldet mit einem Konto.",
      agent_settings: "Der Agent ändert die Chat-Einstellungen nicht.",
    },
    NOT_FOUND: "Partie nicht gefunden.",
    CONFLICT: {
      _: "Diese Aktion konnte nicht ausgeführt werden.",
      email_taken: "Das Konto konnte nicht erstellt werden. Wenn du schon ein Konto hast, melde dich an.",
      display_name_taken: "Dieser Spielername ist bereits vergeben.",
    },
    RATE_LIMITED: {
      _: "Zu viele Versuche. Versuche es später erneut.",
      attempts: "Zu viele Versuche. Versuche es später erneut.",
      chat_interval: "Warte einen Moment vor der nächsten Nachricht.",
    },
    PAYLOAD_TOO_LARGE: "Die Anfrage ist zu groß.",
    INTERNAL: "Ein unerwarteter Fehler ist aufgetreten.",
    ACTIVE_GAME: "Beende die Partie zuerst oder gib sie auf.",
    ACTIVE_GAME_EXISTS: "Du hast bereits eine Partie. Beende sie oder brich die wartende ab.",
    ADMIN_ACCOUNT_PROTECTED: "Dieses Konto kann nicht gelöscht werden.",
    ADMIN_EMAIL_LOCKED: "Die E-Mail-Adresse dieses Kontos kann nicht geändert werden.",
    ALREADY_VERIFIED: "Die E-Mail-Adresse ist bereits bestätigt.",
    AUDIENCE_CLOSED: "Der Ersteller hat das Publikum dieser Partie geschlossen.",
    BOT_UNAVAILABLE: "Der Bot ist gerade nicht verfügbar. Versuche es gleich noch einmal oder lade eine Person ein.",
    CANNOT_PICK_SELF: "Du kannst nicht gegen dich selbst spielen.",
    CELL_OCCUPIED: "Dieses Feld ist bereits besetzt.",
    CHAT_DISABLED: "Der Chat ist ausgeschaltet.",
    CHAT_FULL: "Diese Partie hat bereits die maximale Anzahl an Nachrichten.",
    CHAT_UNAVAILABLE: "Der Chat ist in dieser Partie gerade nicht verfügbar.",
    DISPLAY_NAME_COOLDOWN: "Der Spielername kann einmal pro Tag geändert werden. Versuche es später.",
    DISPLAY_NAME_TAKEN: "Der Spielername ist bereits vergeben.",
    EMAIL_QUOTA_EXCEEDED:
      "Der E-Mail-Versand ist vorübergehend nicht verfügbar. Versuche es morgen oder spiel als Gast über eine Einladung.",
    EMAIL_SEND_FAILED: "Die E-Mail konnte nicht gesendet werden. Versuche es später.",
    FIRST_MOVE_CENTER: "Der erste Stein kommt in die Mitte des Bretts.",
    GAME_FINISHED: "Diese Partie ist bereits beendet.",
    GAME_NOT_ACTIVE: {
      _: "Diese Partie läuft nicht.",
      game_not_active: "Diese Partie läuft nicht.",
      audience_not_closable: "Das Publikum kann nur in einer laufenden oder beendeten Partie geschlossen werden.",
      show_ended: "Diese Vorführung ist bereits beendet.",
    },
    GAME_NOT_CANCELLABLE: "Diese Partie kann nicht mehr abgebrochen werden.",
    GAME_NOT_FINISHED: "Eine Revanche ist erst nach dem Ende der Partie möglich.",
    GAME_NOT_PUBLIC: "Diese Partie ist nicht öffentlich.",
    GAME_NOT_STARTED: "Wir warten, bis der Gegner die Partie eröffnet.",
    GUEST_NOT_ALLOWED: "Du bist angemeldet — tritt mit deinem Konto bei. Spielen ohne Konto ist für Abgemeldete.",
    INVALID_CREDENTIALS: "E-Mail oder Passwort ist falsch.",
    INVALID_CURRENT_PASSWORD: "Das aktuelle Passwort ist falsch.",
    INVALID_INVITATION: "Diese Einladung ist nicht mehr gültig.",
    INVALID_PASSWORD: "Falsches Passwort.",
    INVALID_TOKEN: "Der Link ist abgelaufen oder wurde bereits verwendet.",
    LOBBY_SEEKER_EXPIRED: "Der Status dieses Spielers ist abgelaufen.",
    LOBBY_SEEKER_TAKEN: "Dieser Spieler spielt bereits mit jemand anderem. Wähle jemand anderen aus der Liste.",
    MOVE_TOO_FAR: "Ein Stein darf höchstens 3 Felder von einem anderen entfernt stehen.",
    NOT_YOUR_TURN: {
      _: "Dein Gegner ist am Zug.",
      opponent_turn: "Dein Gegner ist am Zug.",
      auto_turn: "Der Automat setzt einen Stein.",
    },
    OWN_INVITATION: "Das ist deine eigene Einladung — der Gegner muss jemand anderes sein.",
    OWN_WAITING_GAME: {
      _: "Du hast eine wartende Partie. Brich sie ab, um fortzufahren.",
      create: "Du hast eine wartende Partie. Brich sie ab, um eine neue zu erstellen.",
      join: "Du hast eine wartende Partie. Brich sie ab, um dieser beizutreten.",
    },
    REMATCH_ALREADY_OFFERED: "Eine Revanche wurde bereits angeboten.",
    REMATCH_EXPIRED: "Das Revanche-Angebot ist abgelaufen.",
    REMATCH_NOT_OFFERED: "Es gibt kein Revanche-Angebot, auf das du antworten kannst.",
    REMATCH_UNAVAILABLE: {
      _: "Eine Revanche ist nicht möglich.",
      opponent_gone: "Der Gegner ist nicht mehr verfügbar, eine Revanche ist nicht möglich.",
      bot: "Gegen den Bot gibt es keine Revanche. Spiel in einer neuen Partie erneut gegen den Bot.",
    },
    SHOW_RUNNING: "Es läuft bereits eine Vorführung. Beende sie oder kehre zu ihr zurück.",
    SHOW_UNAVAILABLE: "Die Vorführung ist gerade ausgeschaltet.",
    SPECTATORS_FULL: "Die Partie hat die maximale Anzahl an Zuschauern.",
    STALE_MOVE: "Das Brett hat sich geändert — lade die Ansicht neu.",
  },
};

export default errors;
