import {
  emailSchema,
  CHAT_HARD_MAX_LENGTH,
  CHAT_MAX_LENGTH,
  CHAT_MAX_MESSAGES_PER_GAME,
  CHAT_MIN_INTERVAL_MS,
  type ChatLimits,
  AGENT_LOOKUP_GLOBAL_LIMIT,
  AGENT_LOOKUP_LIMIT,
  MCP_CHAT_LIMIT,
  MCP_JOIN_LIMIT,
  MCP_REQUEST_LIMIT,
  MCP_TOKEN_LIMIT,
  BOT_MEMORY_MB_MAX,
  BOT_MIN_MEMORY_MB,
  DEFAULT_BOT_TIME_LIMITS,
  type BotLevel,
  type BotTimeLimits,
} from "@gomoku/core";

export const CLIENT_IP_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
] as const;
export type ClientIpHeader = (typeof CLIENT_IP_HEADERS)[number];

/** Limits of the MCP endpoint for agents (E06-S01); initial values, see `MCP_*` in `.env.example`. */
export type McpLimits = {
  /** Requests per client address per minute. */
  requestLimit: number;
  /** Successful joins per client address per hour. */
  joinLimit: number;
  /** Failed invitation codes per client address per 15 minutes. */
  lookupLimit: number;
  /** The same for all agents together, when the address cannot be trusted. */
  lookupGlobalLimit: number;
  /** Requests per agent token per minute (E06-S02). */
  tokenLimit: number;
  /** `send_message` requests per agent token per minute: a pool apart from `tokenLimit` (E07-S04). */
  chatLimit: number;
};

/** Limits of the game chat (E07-S01): one set for people, one for agents, the same initial values (R5). */
export type ChatConfig = {
  human: ChatLimits;
  agent: ChatLimits;
  /** Messages in one game before `CHAT_FULL` (R6). */
  maxMessagesPerGame: number;
};

/** Resource policy of the bot (spec 2026-11-05-hosted-bot R6-R8, R10); see `BOT_*` in `.env.example`. */
export type BotConfig = {
  /** Games with the bot in progress at once; one more is refused with `503 BOT_UNAVAILABLE` (R8). */
  maxActiveGames: number;
  /** Below this much available memory no game with the bot starts (R7); never under the lowest tier. */
  minAvailableMb: number;
  /** Replaces the memory reading (tests, an operator on a host that reports it wrong, R10). */
  fixedMemoryMb?: number;
  /** The soft target and the ceiling of one move per level (R6). */
  limits: Record<BotLevel, BotTimeLimits>;
};

/**
 * The show: a private game without a human seat (spec 2026-11-09-show-mode, P2, P9); see `SHOW_*` and
 * `BOT_SHOW_PAUSE_*` in `.env.example`. Every flag is off by default; `botEnabled` is still required.
 */
export type ShowConfig = {
  /** The whole feature (`SHOW_ENABLED`); turning it off does not stop a running show. */
  enabled: boolean;
  /** The bot vs bot layout (`SHOW_BOT_VS_BOT_ENABLED`). */
  botVsBotEnabled: boolean;
  /** Level 2 in bot vs bot (`SHOW_BOT_LEVEL2_ENABLED`), off until the pace is tuned (P17). */
  botLevel2Enabled: boolean;
  /** Range of the bot's pause before a move in a show (`BOT_SHOW_PAUSE_MIN_MS` <= `_MAX_MS`). */
  pauseMinMs: number;
  pauseMaxMs: number;
};

export const DEFAULT_SHOW_PAUSE_MIN_MS = 1000;
export const DEFAULT_SHOW_PAUSE_MAX_MS = 2000;
/** The longest pause of the bot in a show (approved with the spec, 2026-11-09). */
export const SHOW_PAUSE_MAX_CEILING_MS = 8000;

export const DEFAULT_BOT_MAX_ACTIVE_GAMES = 3;
/** The longest ceiling of one move an operator may set: a minute is already far beyond any use. */
export const BOT_MAX_CEILING_MS = 60_000;

export type ServerConfig = {
  production: boolean;
  /** Number of our own proxies in front of the app (>= 1); unset only outside production. */
  trustProxyHops?: number;
  clientIpHeader: ClientIpHeader;
  /** Exact origin of the app, e.g. `https://gomoku.byst.re`; unset only outside production. */
  appOrigin?: string;
  /** Installation administrator's e-mail, normalized (`ADMIN_EMAIL`, BR-35); unset only outside production. */
  adminEmail?: string;
  /** `false` only for the integration tests (plain HTTP); never together with an https origin. */
  sessionCookieSecure: boolean;
  /** bcrypt cost factor (4-31); 12 unless `PASSWORD_HASH_COST` lowers it (integration tests). */
  passwordHashCost: number;
  /** `file` writes to the outbox (dev/tests); unset means no transport (sending fails, #34 Q1). */
  emailTransport?: EmailTransport;
  /** Sender name shown in outgoing mail (`EMAIL_FROM_NAME`, else `EMAIL_FROM`, default "Gomoku"). */
  emailFrom: string;
  /** Verified sender address of the `brevo` transport (`EMAIL_FROM_ADDRESS`); without it the sender is the failing one (see `createEmailSender`). */
  emailFromAddress?: string;
  /** Brevo API key (`BREVO_API_KEY`); a secret, never log it; needed by `brevo`. */
  brevoApiKey?: string;
  /** Outbox file of the `file` transport (relative paths resolve against the process cwd). */
  emailOutboxPath: string;
  /** Global daily send limit (#34 Q10); unset means no limit is enforced. */
  emailDailyLimit?: number;
  mcp: McpLimits;
  chat: ChatConfig;
  /**
   * Games against the bot hosted by us (`BOT_ENABLED`, spec 2026-11-05-hosted-bot R19): off by default;
   * off refuses new games with the bot (`503 BOT_UNAVAILABLE`) and lets the running ones finish.
   */
  botEnabled: boolean;
  bot: BotConfig;
  show: ShowConfig;
};

export const EMAIL_TRANSPORTS = ["file", "brevo"] as const;
export type EmailTransport = (typeof EMAIL_TRANSPORTS)[number];

export const DEFAULT_EMAIL_FROM = "Gomoku";
export const DEFAULT_EMAIL_OUTBOX_PATH = ".email-outbox.jsonl";

export const DEFAULT_PASSWORD_HASH_COST = 12;

export function parsePasswordHashCost(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_PASSWORD_HASH_COST;
  const cost = /^[0-9]{1,2}$/.test(raw) ? Number(raw) : NaN;
  if (!(cost >= 4 && cost <= 31)) {
    throw new Error("PASSWORD_HASH_COST must be an integer from 4 to 31.");
  }
  return cost;
}

/**
 * Reads `ADMIN_EMAIL`: normalized by `emailSchema` (the registration rules). Unset or empty means
 * nobody is an administrator outside production and an error in production (fail closed).
 * Also used by the `admin:create` command.
 */
export function readAdminEmail(
  env: Record<string, string | undefined>,
  production: boolean,
): string | undefined {
  const raw = env.ADMIN_EMAIL;
  if (raw === undefined || raw.trim() === "") {
    if (production) throw new Error("ADMIN_EMAIL is required in production.");
    return undefined;
  }
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("ADMIN_EMAIL must be a valid e-mail address.");
  }
  return parsed.data;
}

function parseEmailTransport(
  raw: string | undefined,
  production: boolean,
  appOrigin: string | undefined,
): EmailTransport | undefined {
  if (raw === undefined || raw === "") return undefined;
  const transport = EMAIL_TRANSPORTS.find((candidate) => candidate === raw);
  if (!transport) {
    throw new Error(
      `EMAIL_TRANSPORT must be one of: ${EMAIL_TRANSPORTS.join(", ")} (or unset).`,
    );
  }
  if (transport === "file" && production && !appOrigin?.startsWith("http://")) {
    throw new Error(
      "EMAIL_TRANSPORT=file is allowed in production only with an http:// APP_ORIGIN.",
    );
  }
  return transport;
}

function parseEmailDailyLimit(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (!/^[1-9][0-9]{0,8}$/.test(raw)) {
    throw new Error("EMAIL_DAILY_LIMIT must be a positive integer.");
  }
  return Number(raw);
}

function parsePositiveLimit(
  name: string,
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  if (!/^[1-9][0-9]{0,8}$/.test(raw)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return Number(raw);
}

function parseIntInRange(
  name: string,
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  const value = /^[0-9]{1,9}$/.test(raw) ? Number(raw) : NaN;
  if (!(value >= min && value <= max)) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

/** A feature flag: `true` turns it on; unset, empty or `false` leaves it off. */
export function parseFlag(name: string, raw: string | undefined): boolean {
  if (raw === undefined || raw === "" || raw === "false") return false;
  if (raw === "true") return true;
  throw new Error(`${name} must be true or false (or unset).`);
}

/** `BOT_ENABLED`: `true` turns the bot on; unset, empty or `false` leaves it off. */
export function parseBotEnabled(raw: string | undefined): boolean {
  return parseFlag("BOT_ENABLED", raw);
}

/** `SHOW_*` and `BOT_SHOW_PAUSE_*` (show-mode P2, P9): flags off, pause 1000-2000 ms, at most 8000 ms. */
export function readShowConfig(env: Record<string, string | undefined>): ShowConfig {
  const pauseMaxMs = parseIntInRange(
    "BOT_SHOW_PAUSE_MAX_MS",
    env.BOT_SHOW_PAUSE_MAX_MS,
    DEFAULT_SHOW_PAUSE_MAX_MS,
    0,
    SHOW_PAUSE_MAX_CEILING_MS,
  );
  const pauseMinMs = parseIntInRange(
    "BOT_SHOW_PAUSE_MIN_MS",
    env.BOT_SHOW_PAUSE_MIN_MS,
    Math.min(DEFAULT_SHOW_PAUSE_MIN_MS, pauseMaxMs),
    0,
    SHOW_PAUSE_MAX_CEILING_MS,
  );
  if (pauseMinMs > pauseMaxMs) {
    throw new Error("BOT_SHOW_PAUSE_MIN_MS must not be greater than BOT_SHOW_PAUSE_MAX_MS.");
  }
  return {
    enabled: parseFlag("SHOW_ENABLED", env.SHOW_ENABLED),
    botVsBotEnabled: parseFlag("SHOW_BOT_VS_BOT_ENABLED", env.SHOW_BOT_VS_BOT_ENABLED),
    botLevel2Enabled: parseFlag("SHOW_BOT_LEVEL2_ENABLED", env.SHOW_BOT_LEVEL2_ENABLED),
    pauseMinMs,
    pauseMaxMs,
  };
}

function readBotLimits(env: Record<string, string | undefined>, level: BotLevel): BotTimeLimits {
  const prefix = `BOT_L${level}_`;
  const defaults = DEFAULT_BOT_TIME_LIMITS[level];
  const softMs = parseIntInRange(`${prefix}SOFT_MS`, env[`${prefix}SOFT_MS`], defaults.softMs, 1, BOT_MAX_CEILING_MS);
  const ceilingMs = parseIntInRange(
    `${prefix}CEILING_MS`,
    env[`${prefix}CEILING_MS`],
    Math.max(defaults.ceilingMs, softMs),
    1,
    BOT_MAX_CEILING_MS,
  );
  if (ceilingMs < softMs) throw new Error(`${prefix}CEILING_MS must not be lower than ${prefix}SOFT_MS.`);
  return { softMs, ceilingMs };
}

/** `BOT_*` (hosted-bot R6-R8, R10): empty or unset means the starting values of the spec. */
export function readBotConfig(env: Record<string, string | undefined>): BotConfig {
  const fixed = env.BOT_FIXED_MEMORY_MB;
  return {
    maxActiveGames: parseIntInRange("BOT_MAX_ACTIVE_GAMES", env.BOT_MAX_ACTIVE_GAMES, DEFAULT_BOT_MAX_ACTIVE_GAMES, 1, 1000),
    minAvailableMb: parseIntInRange(
      "BOT_MIN_AVAILABLE_MB",
      env.BOT_MIN_AVAILABLE_MB,
      BOT_MIN_MEMORY_MB,
      BOT_MIN_MEMORY_MB,
      BOT_MEMORY_MB_MAX,
    ),
    ...(fixed !== undefined && fixed !== "" && {
      fixedMemoryMb: parseIntInRange("BOT_FIXED_MEMORY_MB", fixed, 0, 1, 1_000_000),
    }),
    limits: { 1: readBotLimits(env, 1), 2: readBotLimits(env, 2) },
  };
}

function readChatConfig(env: Record<string, string | undefined>): ChatConfig {
  const limits = (prefix: string): ChatLimits => ({
    maxLength: parseIntInRange(`${prefix}MAX_LENGTH`, env[`${prefix}MAX_LENGTH`], CHAT_MAX_LENGTH, 1, CHAT_HARD_MAX_LENGTH),
    minIntervalMs: parseIntInRange(
      `${prefix}MIN_INTERVAL_MS`,
      env[`${prefix}MIN_INTERVAL_MS`],
      CHAT_MIN_INTERVAL_MS,
      0,
      3_600_000,
    ),
  });
  return {
    human: limits("CHAT_"),
    agent: limits("CHAT_AGENT_"),
    maxMessagesPerGame: parseIntInRange(
      "CHAT_MAX_MESSAGES_PER_GAME",
      env.CHAT_MAX_MESSAGES_PER_GAME,
      CHAT_MAX_MESSAGES_PER_GAME,
      1,
      100_000,
    ),
  };
}

function parseTrustProxyHops(
  raw: string | undefined,
  production: boolean,
): number | undefined {
  if (raw === undefined || raw === "") {
    if (production)
      throw new Error("TRUST_PROXY_HOPS is required in production.");
    return undefined;
  }
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error("TRUST_PROXY_HOPS must be an integer >= 1.");
  }
  return Number(raw);
}

function parseClientIpHeader(raw: string | undefined): ClientIpHeader {
  const value = (
    raw === undefined || raw === "" ? "x-forwarded-for" : raw
  ).toLowerCase();
  const header = CLIENT_IP_HEADERS.find((candidate) => candidate === value);
  if (!header) {
    throw new Error(
      `CLIENT_IP_HEADER must be one of: ${CLIENT_IP_HEADERS.join(", ")}.`,
    );
  }
  return header;
}

function parseAppOrigin(
  raw: string | undefined,
  production: boolean,
): string | undefined {
  if (raw === undefined || raw === "") {
    if (production) throw new Error("APP_ORIGIN is required in production.");
    return undefined;
  }
  let origin: string | undefined;
  try {
    const url = new URL(raw);
    origin =
      url.protocol === "http:" || url.protocol === "https:"
        ? url.origin
        : undefined;
  } catch {
    origin = undefined;
  }
  if (origin !== raw) {
    throw new Error(
      "APP_ORIGIN must be a bare origin such as https://example.com.",
    );
  }
  return origin;
}

/**
 * Reads and validates the proxy/origin/cookie settings. In production a missing or invalid
 * `TRUST_PROXY_HOPS` or `APP_ORIGIN` throws (fail closed: there is no shared fallback key
 * that one attacker could exhaust for everybody).
 */
export function readServerConfig(
  env: Record<string, string | undefined>,
): ServerConfig {
  const production = env.NODE_ENV === "production";
  const trustProxyHops = parseTrustProxyHops(env.TRUST_PROXY_HOPS, production);
  const clientIpHeader = parseClientIpHeader(env.CLIENT_IP_HEADER);
  const appOrigin = parseAppOrigin(env.APP_ORIGIN, production);
  const adminEmail = readAdminEmail(env, production);
  const sessionCookieSecure = env.SESSION_COOKIE_SECURE !== "false";
  if (!sessionCookieSecure && appOrigin?.startsWith("https://")) {
    throw new Error(
      "SESSION_COOKIE_SECURE=false is not allowed with an https APP_ORIGIN.",
    );
  }
  if (production && sessionCookieSecure && !appOrigin?.startsWith("https://")) {
    throw new Error("APP_ORIGIN must start with https:// in production.");
  }
  const emailTransport = parseEmailTransport(
    env.EMAIL_TRANSPORT,
    production,
    appOrigin,
  );
  return {
    production,
    trustProxyHops,
    clientIpHeader,
    appOrigin,
    adminEmail,
    sessionCookieSecure,
    passwordHashCost: parsePasswordHashCost(env.PASSWORD_HASH_COST),
    emailTransport,
    emailFrom: env.EMAIL_FROM_NAME || env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
    brevoApiKey: env.BREVO_API_KEY || undefined,
    emailFromAddress: env.EMAIL_FROM_ADDRESS || undefined,
    emailOutboxPath: env.EMAIL_OUTBOX_PATH || DEFAULT_EMAIL_OUTBOX_PATH,
    emailDailyLimit: parseEmailDailyLimit(env.EMAIL_DAILY_LIMIT),
    mcp: {
      requestLimit: parsePositiveLimit("MCP_REQUEST_LIMIT", env.MCP_REQUEST_LIMIT, MCP_REQUEST_LIMIT),
      joinLimit: parsePositiveLimit("MCP_JOIN_LIMIT", env.MCP_JOIN_LIMIT, MCP_JOIN_LIMIT),
      lookupLimit: parsePositiveLimit("MCP_LOOKUP_LIMIT", env.MCP_LOOKUP_LIMIT, AGENT_LOOKUP_LIMIT),
      lookupGlobalLimit: parsePositiveLimit(
        "MCP_LOOKUP_GLOBAL_LIMIT",
        env.MCP_LOOKUP_GLOBAL_LIMIT,
        AGENT_LOOKUP_GLOBAL_LIMIT,
      ),
      tokenLimit: parsePositiveLimit("MCP_TOKEN_LIMIT", env.MCP_TOKEN_LIMIT, MCP_TOKEN_LIMIT),
      chatLimit: parsePositiveLimit("MCP_CHAT_LIMIT", env.MCP_CHAT_LIMIT, MCP_CHAT_LIMIT),
    },
    chat: readChatConfig(env),
    botEnabled: parseBotEnabled(env.BOT_ENABLED),
    bot: readBotConfig(env),
    show: readShowConfig(env),
  };
}
