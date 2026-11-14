import type { Translation } from "../types";

/** Draft (status `draft`), awaiting native review. */
const errors: Translation<"errors"> = {
  zod: {
    invalid_type: "Invalid value.",
    too_small: {
      _: "The value is too small.",
      string: {
        inclusive: {
          one: "Enter at least {count} character.",
          other: "Enter at least {count} characters.",
        },
        exclusive: {
          one: "Enter more than {count} character.",
          other: "Enter more than {count} characters.",
        },
        exact: {
          one: "Enter exactly {count} character.",
          other: "Enter exactly {count} characters.",
        },
      },
      number: {
        inclusive: "Enter a number no less than {count}.",
        exclusive: "Enter a number greater than {count}.",
        exact: "Enter the number {count}.",
      },
    },
    too_big: {
      _: "The value is too large.",
      string: {
        inclusive: {
          one: "Enter at most {count} character.",
          other: "Enter at most {count} characters.",
        },
        exclusive: {
          one: "Enter fewer than {count} character.",
          other: "Enter fewer than {count} characters.",
        },
        exact: {
          one: "Enter exactly {count} character.",
          other: "Enter exactly {count} characters.",
        },
      },
      number: {
        inclusive: "Enter a number no greater than {count}.",
        exclusive: "Enter a number less than {count}.",
        exact: "Enter the number {count}.",
      },
    },
    invalid_format: {
      _: "Invalid format.",
      email: "Enter a valid email address.",
      regex: "The text contains characters that are not allowed.",
    },
    invalid_value: "Choose one of the available values.",
    invalid_union: "Invalid value.",
    unrecognized_keys: "The form contains unknown fields.",
    invalid_key: "Invalid key.",
    invalid_element: "Invalid element.",
    not_multiple_of: "Invalid value.",
    custom: "Invalid value.",
    unknown: "Invalid value.",
  },
  field: {
    email: {
      invalid_type: "Enter an email address.",
      too_big: "The email address can have at most {count} characters.",
      invalid_format: "Enter a valid email address.",
    },
    newEmail: {
      invalid_type: "Enter an email address.",
      too_big: "The email address can have at most {count} characters.",
      invalid_format: "Enter a valid email address.",
      EMAIL_UNCHANGED: "This is already your account's address.",
    },
    password: {
      invalid_type: "Enter a password.",
      too_small: "Enter a password.",
      too_big: "The password can have at most {count} characters.",
      PASSWORD_TOO_SHORT: "The password must have at least {count} characters.",
      PASSWORD_TOO_LONG: "The password can have at most {count} bytes.",
      INVALID_PASSWORD: "Incorrect password.",
    },
    currentPassword: {
      invalid_type: "Enter your current password.",
      too_small: "Enter your current password.",
      too_big: "The password can have at most {count} characters.",
      INVALID_CURRENT_PASSWORD: "The current password is incorrect.",
    },
    newPassword: {
      invalid_type: "Enter a password.",
      PASSWORD_TOO_SHORT: "The password must have at least {count} characters.",
      PASSWORD_TOO_LONG: "The password can have at most {count} bytes.",
      PASSWORD_UNCHANGED: "The new password must differ from the current one.",
    },
    displayName: {
      invalid_type: "Enter a player name.",
      too_small: "The player name must have at least {count} characters.",
      too_big: "The player name can have at most {count} characters.",
      invalid_format: "The player name can contain only letters, digits and the characters _ and - (no spaces).",
      DISPLAY_NAME_RESERVED: "This name is reserved.",
      DISPLAY_NAME_TAKEN: "This player name is already taken.",
      DISPLAY_NAME_UNCHANGED: "This is already your player name.",
    },
    nickname: {
      invalid_type: "The nickname can contain letters, digits, spaces and the characters _ and -.",
      NICKNAME_TOO_LONG: "The nickname can have at most {count} characters.",
      NICKNAME_INVALID: "The nickname can contain letters, digits, spaces and the characters _ and -.",
      NICKNAME_RESERVED: "This name is reserved.",
      NICKNAME_GUEST_ONLY: "Only a guest gives a nickname.",
    },
    acknowledgedGuestWarning: {
      invalid_type: "Confirm that you understand the limits of playing without an account.",
      GUEST_WARNING_REQUIRED: "Confirm that you understand the limits of playing without an account.",
    },
    cancelOwnWaitingGame: {
      invalid_type: "Invalid value.",
    },
    isPublic: {
      invalid_type: "Invalid value.",
      BOT_PUBLIC: "A game against the bot cannot be public.",
    },
    confirm: {
      invalid_value: "Tick the confirmation to delete the account.",
    },
    as: {
      invalid_value: "Choose how you join the game.",
    },
    variant: {
      invalid_value: "Invalid game variant.",
    },
    timeControlMs: {
      invalid_union: "Invalid game time.",
      TIME_CONTROL_CLASSIC: "The game time can be chosen only in the “Pen and paper” variant.",
    },
    opponent: {
      invalid_value: "Invalid opponent.",
      BOT_VARIANT_UNSUPPORTED: "The bot plays only the classic variant.",
    },
    botLevel: {
      invalid_union: "Invalid bot level.",
      BOT_LEVEL_REQUIRED: "Choose the bot level.",
      BOT_LEVEL_WITHOUT_BOT: "The bot level is chosen only in a game against the bot.",
    },
    text: {
      invalid_type: "The message must be text.",
      too_big: "The message is too long.",
    },
  },
  api: {
    network: "No connection to the server. Check your internet connection and try again.",
    VALIDATION: "Correct the marked fields.",
    UNAUTHORIZED: {
      _: "Sign in to continue.",
      session_required: "Sign in to continue.",
      join_sign_in: "Sign in to join the game.",
    },
    FORBIDDEN: {
      _: "You do not have access to this operation.",
      request_rejected: "Request rejected.",
      spectator_name_required: "To write in the chat, come in with a nickname or signed in to an account.",
      agent_settings: "The agent does not change the chat settings.",
    },
    NOT_FOUND: "Game not found.",
    CONFLICT: {
      _: "Could not complete this operation.",
      email_taken: "Could not create the account. If you already have an account, sign in.",
      display_name_taken: "This player name is already taken.",
    },
    RATE_LIMITED: {
      _: "Too many attempts. Try again later.",
      attempts: "Too many attempts. Try again later.",
      chat_interval: "Wait a moment before the next message.",
    },
    PAYLOAD_TOO_LARGE: "The request is too large.",
    INTERNAL: "An unexpected error occurred.",
    ACTIVE_GAME: "First finish or resign the game.",
    ACTIVE_GAME_EXISTS: "You already have a game. Finish it or cancel the waiting one.",
    ADMIN_ACCOUNT_PROTECTED: "This account cannot be deleted.",
    ADMIN_EMAIL_LOCKED: "The email address of this account cannot be changed.",
    ALREADY_VERIFIED: "The email address is already confirmed.",
    AUDIENCE_CLOSED: "The creator closed the audience of this game.",
    BOT_UNAVAILABLE: "The bot is unavailable right now. Try again in a moment or invite a person.",
    CANNOT_PICK_SELF: "You cannot play against yourself.",
    CELL_OCCUPIED: "This field is already taken.",
    CHAT_DISABLED: "The chat is switched off.",
    CHAT_FULL: "This game already has the maximum number of messages.",
    CHAT_UNAVAILABLE: "The chat is unavailable in this game right now.",
    DISPLAY_NAME_COOLDOWN: "The player name can be changed once a day. Try again later.",
    DISPLAY_NAME_TAKEN: "The player name is already taken.",
    EMAIL_QUOTA_EXCEEDED:
      "Sending emails is temporarily unavailable. Try again tomorrow or play as a guest from an invitation.",
    EMAIL_SEND_FAILED: "Could not send the email. Try again later.",
    FIRST_MOVE_CENTER: "The first stone goes in the centre of the board.",
    GAME_FINISHED: "This game has already ended.",
    GAME_NOT_ACTIVE: {
      _: "This game is not in progress.",
      game_not_active: "This game is not in progress.",
      audience_not_closable: "The audience can be closed only in a game that is in progress or has ended.",
      show_ended: "This show has already ended.",
    },
    GAME_NOT_CANCELLABLE: "This game can no longer be cancelled.",
    GAME_NOT_FINISHED: "A rematch is possible only after the game ends.",
    GAME_NOT_PUBLIC: "This game is not public.",
    GAME_NOT_STARTED: "Waiting for the opponent to open the game.",
    GUEST_NOT_ALLOWED: "You are signed in — join as yourself. Playing without an account is for signed-out users.",
    INVALID_CREDENTIALS: "Incorrect email or password.",
    INVALID_CURRENT_PASSWORD: "The current password is incorrect.",
    INVALID_INVITATION: "This invitation is no longer valid.",
    INVALID_PASSWORD: "Incorrect password.",
    INVALID_TOKEN: "The link has expired or has already been used.",
    LOBBY_SEEKER_EXPIRED: "This player's status expired.",
    LOBBY_SEEKER_TAKEN: "This player is already playing someone else. Pick someone else from the list.",
    MOVE_TOO_FAR: "A stone can be at most 3 fields from another one.",
    NOT_YOUR_TURN: {
      _: "It is your opponent's move.",
      opponent_turn: "It is your opponent's move.",
      auto_turn: "The automat is placing a stone.",
    },
    OWN_INVITATION: "This is your own invitation — the opponent must be someone else.",
    OWN_WAITING_GAME: {
      _: "You have a waiting game. Cancel it to continue.",
      create: "You have a waiting game. Cancel it to create a new one.",
      join: "You have a waiting game. Cancel it to join this one.",
    },
    REMATCH_ALREADY_OFFERED: "A rematch has already been offered.",
    REMATCH_EXPIRED: "The rematch offer expired.",
    REMATCH_NOT_OFFERED: "There is no rematch offer to answer.",
    REMATCH_UNAVAILABLE: {
      _: "A rematch is not possible.",
      opponent_gone: "Your opponent is no longer available, so a rematch is not possible.",
      bot: "There is no rematch with the bot. Play the bot again in a new game.",
    },
    SHOW_RUNNING: "A show is already in progress. End it or go back to it.",
    SHOW_UNAVAILABLE: "The show is switched off right now.",
    SPECTATORS_FULL: "The game has the maximum number of spectators.",
    STALE_MOVE: "The board has changed — refresh the view.",
  },
};

export default errors;
