export const CLIENT_IP_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
] as const;
export type ClientIpHeader = (typeof CLIENT_IP_HEADERS)[number];

export type ServerConfig = {
  production: boolean;
  /** Number of our own proxies in front of the app (>= 1); unset only outside production. */
  trustProxyHops?: number;
  clientIpHeader: ClientIpHeader;
  /** Exact origin of the app, e.g. `https://gomoku.byst.re`; unset only outside production. */
  appOrigin?: string;
  /** `false` only for the integration tests (plain HTTP); never together with an https origin. */
  sessionCookieSecure: boolean;
  /** bcrypt cost factor (4-31); 12 unless `PASSWORD_HASH_COST` lowers it (integration tests). */
  passwordHashCost: number;
  /** `file` writes to the outbox (dev/tests); unset means no transport (sending fails, #34 Q1). */
  emailTransport?: EmailTransport;
  /** Sender shown in outgoing mail. */
  emailFrom: string;
  /** Outbox file of the `file` transport (relative paths resolve against the process cwd). */
  emailOutboxPath: string;
  /** Global daily send limit (#34 Q10); unset means no limit is enforced. */
  emailDailyLimit?: number;
};

export const EMAIL_TRANSPORTS = ["file"] as const;
export type EmailTransport = (typeof EMAIL_TRANSPORTS)[number];

export const DEFAULT_EMAIL_FROM = "Gomoku";
export const DEFAULT_EMAIL_OUTBOX_PATH = ".email-outbox.jsonl";

export const DEFAULT_PASSWORD_HASH_COST = 12;

function parsePasswordHashCost(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_PASSWORD_HASH_COST;
  const cost = /^[0-9]{1,2}$/.test(raw) ? Number(raw) : NaN;
  if (!(cost >= 4 && cost <= 31)) {
    throw new Error("PASSWORD_HASH_COST must be an integer from 4 to 31.");
  }
  return cost;
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
  const sessionCookieSecure = env.SESSION_COOKIE_SECURE !== "false";
  if (!sessionCookieSecure && appOrigin?.startsWith("https://")) {
    throw new Error(
      "SESSION_COOKIE_SECURE=false is not allowed with an https APP_ORIGIN.",
    );
  }
  if (production && sessionCookieSecure && !appOrigin?.startsWith("https://")) {
    throw new Error("APP_ORIGIN must start with https:// in production.");
  }
  return {
    production,
    trustProxyHops,
    clientIpHeader,
    appOrigin,
    sessionCookieSecure,
    passwordHashCost: parsePasswordHashCost(env.PASSWORD_HASH_COST),
    emailTransport: parseEmailTransport(
      env.EMAIL_TRANSPORT,
      production,
      appOrigin,
    ),
    emailFrom: env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
    emailOutboxPath: env.EMAIL_OUTBOX_PATH || DEFAULT_EMAIL_OUTBOX_PATH,
    emailDailyLimit: parseEmailDailyLimit(env.EMAIL_DAILY_LIMIT),
  };
}
