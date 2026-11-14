/**
 * Inventory of every error a player can meet on the way through the screens (E15-S07, C5; spec
 * 2026-11-13-e15-completion, Phase 5 step 1). It is data for the tests only: `error-inventory.test.ts` searches the
 * sources and fails on anything found there but missing here (and on entries without a source), and checks that each
 * entry has a code and a text in Polish, English and French. A new form, rule or refusal without an entry fails CI.
 */

/** One rule of a schema as the client sees it: the field (`_form` for a scalar schema) and the code of the issue. */
export type InventoryRule = { field: string; code: string; origin?: string; variant?: string };

export type SchemaSource = {
  /** The schema's name, exported by `@gomoku/core`. */
  schema: string;
  /** Invalid inputs that, together, yield every rule below (and every issue they yield is a rule or exempt). */
  samples: readonly unknown[];
  rules: readonly InventoryRule[];
  /** Parameters the player never types, each with the reason they need no text of their own. */
  exempt?: Readonly<Record<string, string>>;
  /** The field a scalar schema is shown under (its issues come under `_form`). */
  as?: string;
};

const NOT_TYPED = "a parameter of the request, never typed by the player (a fixed choice or a value of the page)";

/**
 * Every Zod schema reached from the player's path: imported by a route of `app/api` (outside MCP) or by a file of
 * `app/(frontend)` or `components`. Schemas embedded in another one (`emailSchema`, `newPasswordSchema`,
 * `nicknameSchema` inside the game inputs) show their rules through the samples of the schema that embeds them.
 */
export const SCHEMA_SOURCES: readonly SchemaSource[] = [
  {
    schema: "loginSchema",
    samples: [{}, { email: "x".repeat(300), password: "p".repeat(1100) }, { email: "bad", password: "" }],
    rules: [
      { field: "email", code: "invalid_type" },
      { field: "email", code: "too_big", origin: "string", variant: "inclusive" },
      { field: "email", code: "invalid_format", origin: "string", variant: "email" },
      { field: "password", code: "invalid_type" },
      { field: "password", code: "too_small", origin: "string", variant: "inclusive" },
      { field: "password", code: "too_big", origin: "string", variant: "inclusive" },
    ],
  },
  {
    schema: "registerSchema",
    samples: [
      {},
      { email: "x".repeat(300), displayName: "ab", password: "short" },
      { email: "bad", displayName: "x".repeat(30), password: "ą".repeat(40) },
      { email: "a@b.pl", displayName: "a b!", password: "x" },
      { email: "a@b.pl", displayName: "admin", password: "long-enough" },
    ],
    rules: [
      { field: "email", code: "invalid_type" },
      { field: "email", code: "too_big", origin: "string", variant: "inclusive" },
      { field: "email", code: "invalid_format", origin: "string", variant: "email" },
      { field: "displayName", code: "invalid_type" },
      { field: "displayName", code: "too_small", origin: "string", variant: "inclusive" },
      { field: "displayName", code: "too_big", origin: "string", variant: "inclusive" },
      { field: "displayName", code: "invalid_format", origin: "string", variant: "regex" },
      { field: "displayName", code: "DISPLAY_NAME_RESERVED" },
      { field: "password", code: "invalid_type" },
      { field: "password", code: "PASSWORD_TOO_SHORT" },
      { field: "password", code: "PASSWORD_TOO_LONG" },
    ],
  },
  {
    schema: "passwordResetRequestSchema",
    samples: [{}, { email: "bad" }, { email: `${"x".repeat(300)}@b.pl` }],
    rules: [
      { field: "email", code: "invalid_type" },
      { field: "email", code: "invalid_format", origin: "string", variant: "email" },
      { field: "email", code: "too_big", origin: "string", variant: "inclusive" },
    ],
  },
  {
    schema: "passwordResetConfirmSchema",
    samples: [{}, { token: "", newPassword: "short" }, { token: "x".repeat(600), newPassword: "ą".repeat(40) }],
    rules: [
      { field: "newPassword", code: "invalid_type" },
      { field: "newPassword", code: "PASSWORD_TOO_SHORT" },
      { field: "newPassword", code: "PASSWORD_TOO_LONG" },
    ],
    exempt: { token: "the token comes from the link in the e-mail, never typed" },
  },
  {
    schema: "passwordChangeSchema",
    samples: [
      {},
      { currentPassword: "", newPassword: "short" },
      { currentPassword: "p".repeat(1100), newPassword: "ą".repeat(40) },
      { currentPassword: "same-password", newPassword: "same-password" },
    ],
    rules: [
      { field: "currentPassword", code: "invalid_type" },
      { field: "currentPassword", code: "too_small", origin: "string", variant: "inclusive" },
      { field: "currentPassword", code: "too_big", origin: "string", variant: "inclusive" },
      { field: "newPassword", code: "invalid_type" },
      { field: "newPassword", code: "PASSWORD_TOO_SHORT" },
      { field: "newPassword", code: "PASSWORD_TOO_LONG" },
      { field: "newPassword", code: "PASSWORD_UNCHANGED" },
    ],
  },
  {
    schema: "emailChangeSchema",
    samples: [{}, { newEmail: "bad", currentPassword: "" }, { newEmail: "x".repeat(300), currentPassword: "p".repeat(1100) }],
    rules: [
      { field: "newEmail", code: "invalid_type" },
      { field: "newEmail", code: "invalid_format", origin: "string", variant: "email" },
      { field: "newEmail", code: "too_big", origin: "string", variant: "inclusive" },
      { field: "currentPassword", code: "invalid_type" },
      { field: "currentPassword", code: "too_small", origin: "string", variant: "inclusive" },
      { field: "currentPassword", code: "too_big", origin: "string", variant: "inclusive" },
    ],
  },
  {
    schema: "displayNameChangeSchema",
    samples: [{}, { displayName: "ab" }, { displayName: "x".repeat(30) }, { displayName: "a b!" }, { displayName: "admin" }],
    rules: [
      { field: "displayName", code: "invalid_type" },
      { field: "displayName", code: "too_small", origin: "string", variant: "inclusive" },
      { field: "displayName", code: "too_big", origin: "string", variant: "inclusive" },
      { field: "displayName", code: "invalid_format", origin: "string", variant: "regex" },
      { field: "displayName", code: "DISPLAY_NAME_RESERVED" },
    ],
  },
  {
    schema: "accountDeleteSchema",
    samples: [{}, { password: "", confirm: false }, { password: "p".repeat(1100), confirm: true }],
    rules: [
      { field: "password", code: "invalid_type" },
      { field: "password", code: "too_small", origin: "string", variant: "inclusive" },
      { field: "password", code: "too_big", origin: "string", variant: "inclusive" },
      { field: "confirm", code: "invalid_value" },
    ],
  },
  {
    schema: "emailVerificationConfirmSchema",
    samples: [{}, { token: "", next: 5 }],
    rules: [],
    exempt: { token: "the token comes from the link in the e-mail, never typed", next: NOT_TYPED },
  },
  {
    schema: "emailChangeConfirmSchema",
    samples: [{}, { token: "" }],
    rules: [],
    exempt: { token: "the token comes from the link in the e-mail, never typed" },
  },
  {
    schema: "nicknameSchema",
    as: "nickname",
    samples: [5, "x".repeat(30), "a<b", "Admin"],
    rules: [
      { field: "_form", code: "invalid_type" },
      { field: "_form", code: "NICKNAME_TOO_LONG" },
      { field: "_form", code: "NICKNAME_INVALID" },
      { field: "_form", code: "NICKNAME_RESERVED" },
    ],
  },
  {
    schema: "createGuestGameSchema",
    samples: [
      {},
      {
        acknowledgedGuestWarning: "x",
        cancelOwnWaitingGame: 1,
        isPublic: 1,
        variant: "x",
        timeControlMs: 5,
        opponent: "x",
        botLevel: 7,
        nickname: 3,
      },
      { acknowledgedGuestWarning: true, opponent: "bot", variant: "paper", isPublic: true, nickname: "x".repeat(30) },
      { acknowledgedGuestWarning: true, botLevel: 1, timeControlMs: 60_000, nickname: "a<b" },
      { acknowledgedGuestWarning: true, nickname: "Admin" },
    ],
    rules: [
      { field: "acknowledgedGuestWarning", code: "invalid_type" },
      { field: "acknowledgedGuestWarning", code: "GUEST_WARNING_REQUIRED" },
      { field: "cancelOwnWaitingGame", code: "invalid_type" },
      { field: "isPublic", code: "invalid_type" },
      { field: "isPublic", code: "BOT_PUBLIC" },
      { field: "nickname", code: "invalid_type" },
      { field: "nickname", code: "NICKNAME_TOO_LONG" },
      { field: "nickname", code: "NICKNAME_INVALID" },
      { field: "nickname", code: "NICKNAME_RESERVED" },
      { field: "variant", code: "invalid_value" },
      { field: "timeControlMs", code: "invalid_union" },
      { field: "timeControlMs", code: "TIME_CONTROL_CLASSIC" },
      { field: "opponent", code: "invalid_value" },
      { field: "opponent", code: "BOT_VARIANT_UNSUPPORTED" },
      { field: "botLevel", code: "invalid_union" },
      { field: "botLevel", code: "BOT_LEVEL_REQUIRED" },
      { field: "botLevel", code: "BOT_LEVEL_WITHOUT_BOT" },
    ],
  },
  {
    schema: "createAccountGameSchema",
    samples: [
      { isPublic: 1, variant: "x", timeControlMs: 5, opponent: "x", botLevel: 7 },
      { opponent: "bot", variant: "paper", isPublic: true },
      { botLevel: 1, timeControlMs: 60_000 },
    ],
    rules: [
      { field: "isPublic", code: "invalid_type" },
      { field: "isPublic", code: "BOT_PUBLIC" },
      { field: "variant", code: "invalid_value" },
      { field: "timeControlMs", code: "invalid_union" },
      { field: "timeControlMs", code: "TIME_CONTROL_CLASSIC" },
      { field: "opponent", code: "invalid_value" },
      { field: "opponent", code: "BOT_VARIANT_UNSUPPORTED" },
      { field: "botLevel", code: "invalid_union" },
      { field: "botLevel", code: "BOT_LEVEL_REQUIRED" },
      { field: "botLevel", code: "BOT_LEVEL_WITHOUT_BOT" },
    ],
  },
  {
    schema: "createGameSettingsSchema",
    samples: [{ variant: "x", timeControlMs: 5 }, { timeControlMs: 60_000 }],
    rules: [
      { field: "variant", code: "invalid_value" },
      { field: "timeControlMs", code: "invalid_union" },
      { field: "timeControlMs", code: "TIME_CONTROL_CLASSIC" },
    ],
  },
  {
    schema: "acceptInvitationSchema",
    samples: [
      {},
      { as: "user", nickname: "Zbyszek" },
      { as: "guest", acknowledgedGuestWarning: "x", cancelOwnWaitingGame: 1, nickname: 3 },
      { as: "guest", nickname: "x".repeat(30) },
      { as: "guest", nickname: "a<b" },
      { as: "guest", nickname: "Admin" },
    ],
    rules: [
      { field: "as", code: "invalid_value" },
      { field: "acknowledgedGuestWarning", code: "invalid_type" },
      { field: "acknowledgedGuestWarning", code: "GUEST_WARNING_REQUIRED" },
      { field: "cancelOwnWaitingGame", code: "invalid_type" },
      { field: "nickname", code: "invalid_type" },
      { field: "nickname", code: "NICKNAME_TOO_LONG" },
      { field: "nickname", code: "NICKNAME_INVALID" },
      { field: "nickname", code: "NICKNAME_RESERVED" },
      { field: "nickname", code: "NICKNAME_GUEST_ONLY" },
    ],
  },
  {
    schema: "spectateInvitationSchema",
    samples: [{ nickname: 3 }, { nickname: "x".repeat(30) }, { nickname: "a<b" }, { nickname: "Admin" }],
    rules: [
      { field: "nickname", code: "invalid_type" },
      { field: "nickname", code: "NICKNAME_TOO_LONG" },
      { field: "nickname", code: "NICKNAME_INVALID" },
      { field: "nickname", code: "NICKNAME_RESERVED" },
    ],
  },
  {
    schema: "chatSendSchema",
    samples: [{ text: 5, extra: 1 }, { text: "x".repeat(5000), clientId: "x" }],
    rules: [
      { field: "text", code: "invalid_type" },
      { field: "text", code: "too_big", origin: "string", variant: "inclusive" },
    ],
    exempt: { clientId: "generated by the page for each message", _form: "keys the page never sends" },
  },
  {
    schema: "chatSettingsSchema",
    samples: [{ enabled: "x", extra: 1 }],
    rules: [],
    exempt: { enabled: "a switch of the page", _form: "keys the page never sends" },
  },
  {
    schema: "chatReadQuerySchema",
    samples: [{ after_id: "x", limit: "0" }],
    rules: [],
    exempt: { after_id: NOT_TYPED, limit: NOT_TYPED },
  },
  {
    schema: "gameStateQuerySchema",
    samples: [{ after: "x" }],
    rules: [],
    exempt: { after: NOT_TYPED },
  },
  {
    schema: "historyQuerySchema",
    samples: [{ cursor: 5 }],
    rules: [],
    exempt: { cursor: NOT_TYPED },
  },
  {
    schema: "moveCreateSchema",
    samples: [{}, { x: -1, y: 99, moveNumber: 0 }],
    rules: [],
    exempt: { x: "a click on the board", y: "a click on the board", moveNumber: NOT_TYPED },
  },
  {
    schema: "seekerIdSchema",
    samples: ["x"],
    rules: [],
    exempt: { _form: "an id in the address" },
  },
  {
    schema: "gameIdSchema",
    samples: ["x"],
    rules: [],
    exempt: { _form: "an id in the address" },
  },
  {
    schema: "showCreateSchema",
    samples: [{}, { layout: "bot-bot", levels: [3] }, { layout: "bot-agent", botLevel: 3, extra: 1 }],
    rules: [],
    exempt: {
      _form: "the administrator's console sends a fixed layout (its refusals have texts of their own in `show`)",
      levels: "picked from fixed buttons of the administrator's console",
      botLevel: "picked from fixed buttons of the administrator's console",
      layout: "picked from fixed buttons of the administrator's console",
    },
  },
];

/** A form that checks its input with a schema of `core` before sending it (`safeParse` in the browser). */
export type ClientParseSite = { file: string; schema: string; fields: readonly string[] };

/** The ten local checks of `(frontend)` (paths relative to `packages/app/src`). */
export const CLIENT_PARSE_SITES: readonly ClientParseSite[] = [
  { file: "app/(frontend)/login/login-form.tsx", schema: "loginSchema", fields: ["email", "password"] },
  { file: "app/(frontend)/register/register-form.tsx", schema: "registerSchema", fields: ["email", "displayName", "password"] },
  { file: "app/(frontend)/forgot-password/forgot-password-form.tsx", schema: "passwordResetRequestSchema", fields: ["email"] },
  { file: "app/(frontend)/reset-password/reset-password-form.tsx", schema: "passwordResetConfirmSchema", fields: ["newPassword"] },
  { file: "app/(frontend)/account/change-email-form.tsx", schema: "emailChangeSchema", fields: ["newEmail", "currentPassword"] },
  { file: "app/(frontend)/account/change-display-name-form.tsx", schema: "displayNameChangeSchema", fields: ["displayName"] },
  { file: "app/(frontend)/account/change-password-form.tsx", schema: "passwordChangeSchema", fields: ["currentPassword", "newPassword"] },
  { file: "app/(frontend)/play/guest-create-form.tsx", schema: "nicknameSchema", fields: ["nickname"] },
  { file: "app/(frontend)/invite/[code]/join-actions.tsx", schema: "nicknameSchema", fields: ["nickname"] },
  { file: "app/(frontend)/invite/[code]/watch-actions.tsx", schema: "nicknameSchema", fields: ["nickname"] },
];

/** `safeParse` calls that are not a form: an id in the address, answered with a 404. */
export const ROUTE_PARSE_SITES: readonly { file: string; schema: string; reason: string }[] = [
  { file: "app/(frontend)/games/[gameId]/review/page.tsx", schema: "gameIdSchema", reason: "an id in the address; a bad one is a 404" },
  { file: "app/(frontend)/show/[gameId]/page.tsx", schema: "gameIdSchema", reason: "an id in the address; a bad one is a 404" },
];

/** A field error thrown by a service outside Zod, with the code it carries in `fieldIssues`. */
export type ServiceFieldError = { file: string; field: string; code: string };

/** Paths relative to `packages/app/src`. One entry per place of the throw. */
export const SERVICE_FIELD_ERRORS: readonly ServiceFieldError[] = [
  { file: "server/services/auth/user-service.ts", field: "displayName", code: "DISPLAY_NAME_UNCHANGED" },
  { file: "server/services/auth/user-service.ts", field: "displayName", code: "DISPLAY_NAME_TAKEN" },
  { file: "server/services/auth/user-service.ts", field: "displayName", code: "DISPLAY_NAME_TAKEN" },
  { file: "server/services/auth/user-service.ts", field: "currentPassword", code: "INVALID_CURRENT_PASSWORD" },
  { file: "server/services/auth/email-change-service.ts", field: "currentPassword", code: "INVALID_CURRENT_PASSWORD" },
  { file: "server/services/auth/email-change-service.ts", field: "newEmail", code: "EMAIL_UNCHANGED" },
  { file: "server/services/auth/account-service.ts", field: "password", code: "INVALID_PASSWORD" },
  { file: "server/services/auth/admin-account-service.ts", field: "displayName", code: "DISPLAY_NAME_TAKEN" },
  { file: "server/services/games/invitation-service.ts", field: "nickname", code: "NICKNAME_GUEST_ONLY" },
  { file: "server/services/games/invitation-service.ts", field: "acknowledgedGuestWarning", code: "GUEST_WARNING_REQUIRED" },
  { file: "server/services/games/spectator-service.ts", field: "nickname", code: "NICKNAME_GUEST_ONLY" },
  // The text of a refused chat message is `chat.rejection.{reason}` (typed `Record<ChatRejection, string>`).
  { file: "server/services/chat/chat-service.ts", field: "text", code: "CHAT_REJECTED" },
  { file: "server/services/chat/chat-service.ts", field: "text", code: "CHAT_REJECTED" },
];

/** Field codes whose text lives in another namespace (named), not in `errors`. */
export const FIELD_CODES_TRANSLATED_ELSEWHERE: Readonly<Record<string, string>> = {
  CHAT_REJECTED: "chat.rejection.{reason}",
};

/**
 * Codes other than `VALIDATION` that carry more than one message, with the `data.reason` of each message (its Polish
 * text, as thrown). `VALIDATION` never gets a new reason: MCP copies it into the tool's `reason` (Q8).
 */
export const MULTI_MESSAGE_CODES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  CONFLICT: {
    email_taken: "Nie udało się założyć konta. Jeśli masz już konto, zaloguj się.",
    display_name_taken: "Ta nazwa gracza jest już zajęta.",
  },
  FORBIDDEN: {
    request_rejected: "Żądanie odrzucone.",
    spectator_name_required: "Aby pisać na czacie, wejdź z nickiem lub zalogowany jako konto.",
    agent_settings: "Agent nie zmienia ustawień czatu.",
  },
  GAME_NOT_ACTIVE: {
    game_not_active: "Ta partia nie jest w toku.",
    audience_not_closable: "Publiczność można zamknąć tylko w trwającej albo zakończonej partii.",
    show_ended: "Ten pokaz już się zakończył.",
  },
  ILLEGAL_MOVE: {
    classic_board: "Pole jest poza planszą (współrzędne 0–14).",
    paper_board: "`Pole jest poza planszą (współrzędne 0–${PAPER_BOARD_SIZE - 1}).`",
  },
  INVALID_INPUT: {
    invalid_field: "`Nieprawidłowe pole: ${field}.`",
    invalid_join:
      "Nieprawidłowe dane. Podaj code (kod lub link zaproszenia) i opcjonalnie agentName (nazwa modelu: litery łacińskie, cyfry, spacja i znaki . - _ / : ( ) +, do 40 znaków, bez adresów).",
  },
  NOT_YOUR_TURN: {
    opponent_turn: "Teraz ruch przeciwnika.",
    auto_turn: "Automat stawia kamień.",
  },
  OWN_WAITING_GAME: {
    create: "Masz oczekującą partię. Anuluj ją, aby utworzyć nową.",
    join: "Masz oczekującą partię. Anuluj ją, aby dołączyć do tej.",
  },
  RATE_LIMITED: {
    attempts: "Zbyt wiele prób. Spróbuj ponownie później.",
    chat_interval: "Poczekaj chwilę przed następną wiadomością.",
  },
  REMATCH_UNAVAILABLE: {
    opponent_gone: "Przeciwnik nie jest już dostępny, rewanż jest niemożliwy.",
    bot: "Z botem nie ma rewanżu. Zagraj ponownie z botem w nowej partii.",
  },
  UNAUTHORIZED: {
    session_required: "Zaloguj się, aby kontynuować.",
    join_sign_in: "Zaloguj się, aby dołączyć do partii.",
  },
};

/** Codes no player screen shows, each with the reason; every other code needs `errors.api.{code}`. */
export const NOT_FOR_USER_CODES: Readonly<Record<string, string>> = {
  INVALID_INPUT: "the agents' API (MCP and `(backend)`) only; agents read the Polish message",
  ILLEGAL_MOVE: "the agents' API only (a person's board never offers a cell off the board)",
  DISPLAY_NAME_REQUIRED: "the `admin:create` command line only",
};
