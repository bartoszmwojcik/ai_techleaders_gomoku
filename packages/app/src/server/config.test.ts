import { describe, expect, it } from "vitest";

import { readServerConfig } from "./config";

const MCP_DEFAULTS = { requestLimit: 300, joinLimit: 10, lookupLimit: 20, lookupGlobalLimit: 300, tokenLimit: 60, chatLimit: 30 };

const CHAT_DEFAULTS = {
  human: { maxLength: 200, minIntervalMs: 2000 },
  agent: { maxLength: 200, minIntervalMs: 2000 },
  maxMessagesPerGame: 500,
};

const production = {
  NODE_ENV: "production",
  TRUST_PROXY_HOPS: "1",
  APP_ORIGIN: "https://gomoku.byst.re",
};

describe("readServerConfig", () => {
  it("uses defaults outside production", () => {
    expect(readServerConfig({})).toEqual({
      production: false,
      trustProxyHops: undefined,
      clientIpHeader: "x-forwarded-for",
      appOrigin: undefined,
      sessionCookieSecure: true,
      passwordHashCost: 12,
      emailTransport: undefined,
      emailFrom: "Gomoku",
      emailOutboxPath: ".email-outbox.jsonl",
      emailDailyLimit: undefined,
      mcp: MCP_DEFAULTS,
      chat: CHAT_DEFAULTS,
    });
    expect(
      readServerConfig({
        TRUST_PROXY_HOPS: "",
        APP_ORIGIN: "",
        CLIENT_IP_HEADER: "",
      }),
    ).toMatchObject({
      trustProxyHops: undefined,
      appOrigin: undefined,
    });
  });

  it("reads a valid production configuration", () => {
    expect(
      readServerConfig({ ...production, CLIENT_IP_HEADER: "CF-Connecting-IP" }),
    ).toEqual({
      production: true,
      trustProxyHops: 1,
      clientIpHeader: "cf-connecting-ip",
      appOrigin: "https://gomoku.byst.re",
      sessionCookieSecure: true,
      passwordHashCost: 12,
      emailTransport: undefined,
      emailFrom: "Gomoku",
      emailOutboxPath: ".email-outbox.jsonl",
      emailDailyLimit: undefined,
      mcp: MCP_DEFAULTS,
      chat: CHAT_DEFAULTS,
    });
  });

  it("allows plain HTTP in production only with an insecure cookie (integration tests)", () => {
    const env = {
      ...production,
      APP_ORIGIN: "http://127.0.0.1:3000",
      SESSION_COOKIE_SECURE: "false",
    };
    expect(readServerConfig(env)).toMatchObject({ sessionCookieSecure: false });
    expect(() =>
      readServerConfig({ ...env, SESSION_COOKIE_SECURE: undefined }),
    ).toThrow(/https/);
  });

  it("reads the bcrypt cost and rejects values outside 4-31", () => {
    expect(readServerConfig({ PASSWORD_HASH_COST: "4" })).toMatchObject({
      passwordHashCost: 4,
    });
    expect(readServerConfig({ PASSWORD_HASH_COST: "" })).toMatchObject({
      passwordHashCost: 12,
      emailTransport: undefined,
      emailFrom: "Gomoku",
      emailOutboxPath: ".email-outbox.jsonl",
      emailDailyLimit: undefined,
      mcp: MCP_DEFAULTS,
      chat: CHAT_DEFAULTS,
    });
    for (const bad of ["3", "32", "abc", "12.5", "-4", "004", "1e1"]) {
      expect(() => readServerConfig({ PASSWORD_HASH_COST: bad })).toThrow(
        /PASSWORD_HASH_COST/,
      );
    }
  });

  it("rejects an insecure cookie with an https origin", () => {
    expect(() =>
      readServerConfig({ ...production, SESSION_COOKIE_SECURE: "false" }),
    ).toThrow(/SESSION_COOKIE_SECURE/);
  });

  it("requires TRUST_PROXY_HOPS and APP_ORIGIN in production", () => {
    expect(() =>
      readServerConfig({ ...production, TRUST_PROXY_HOPS: undefined }),
    ).toThrow(/TRUST_PROXY_HOPS/);
    expect(() =>
      readServerConfig({ ...production, APP_ORIGIN: undefined }),
    ).toThrow(/APP_ORIGIN/);
  });

  it.each(["0", "-1", "1.5", "abc", " 1"])(
    "rejects TRUST_PROXY_HOPS=%j",
    (value) => {
      expect(() => readServerConfig({ TRUST_PROXY_HOPS: value })).toThrow(
        /TRUST_PROXY_HOPS/,
      );
    },
  );

  it.each([
    "gomoku.byst.re",
    "https://gomoku.byst.re/",
    "https://gomoku.byst.re/x",
    "ftp://x.pl",
    "not a url",
  ])("rejects APP_ORIGIN=%j", (value) => {
    expect(() => readServerConfig({ APP_ORIGIN: value })).toThrow(/APP_ORIGIN/);
  });

  it("rejects an unknown CLIENT_IP_HEADER", () => {
    expect(() => readServerConfig({ CLIENT_IP_HEADER: "x-evil" })).toThrow(
      /CLIENT_IP_HEADER/,
    );
  });
});

describe("readServerConfig email settings", () => {
  it("reads the file transport and its options", () => {
    expect(
      readServerConfig({
        EMAIL_TRANSPORT: "file",
        EMAIL_FROM: "Gra <gra@example.com>",
        EMAIL_OUTBOX_PATH: "/tmp/outbox.jsonl",
        EMAIL_DAILY_LIMIT: "100",
      }),
    ).toMatchObject({
      emailTransport: "file",
      emailFrom: "Gra <gra@example.com>",
      emailOutboxPath: "/tmp/outbox.jsonl",
      emailDailyLimit: 100,
    });
    expect(readServerConfig({ EMAIL_TRANSPORT: "" })).toMatchObject({
      emailTransport: undefined,
    });
  });

  it("rejects an unknown transport and a bad daily limit", () => {
    expect(() => readServerConfig({ EMAIL_TRANSPORT: "smtp" })).toThrow(
      /EMAIL_TRANSPORT/,
    );
    for (const bad of ["0", "-1", "1.5", "abc", "1000000000"]) {
      expect(() => readServerConfig({ EMAIL_DAILY_LIMIT: bad })).toThrow(
        /EMAIL_DAILY_LIMIT/,
      );
    }
  });

  it("reads the brevo transport with its key, sender address and name", () => {
    const brevo = {
      EMAIL_TRANSPORT: "brevo",
      BREVO_API_KEY: "xkeysib-test",
      EMAIL_FROM_ADDRESS: "gra@example.com",
    };
    expect(readServerConfig(brevo)).toMatchObject({
      emailTransport: "brevo",
      brevoApiKey: "xkeysib-test",
      emailFromAddress: "gra@example.com",
      emailFrom: "Gomoku",
    });
    expect(
      readServerConfig({
        ...brevo,
        EMAIL_FROM: "Stara",
        EMAIL_FROM_NAME: "Nowa",
      }).emailFrom,
    ).toBe("Nowa");
    expect(readServerConfig({ ...brevo, EMAIL_FROM: "Stara" }).emailFrom).toBe(
      "Stara",
    );
    // Allowed in production over https (unlike the file transport).
    expect(readServerConfig({ ...production, ...brevo })).toMatchObject({
      emailTransport: "brevo",
    });
  });

  it("reads brevo settings as unset when missing (the sender factory warns)", () => {
    expect(readServerConfig({ EMAIL_TRANSPORT: "brevo" })).toMatchObject({
      emailTransport: "brevo",
      brevoApiKey: undefined,
      emailFromAddress: undefined,
    });
  });

  it("allows the file transport in production only with an http:// origin", () => {
    expect(() =>
      readServerConfig({ ...production, EMAIL_TRANSPORT: "file" }),
    ).toThrow(/http:\/\//);
    expect(
      readServerConfig({
        ...production,
        APP_ORIGIN: "http://127.0.0.1:3000",
        SESSION_COOKIE_SECURE: "false",
        EMAIL_TRANSPORT: "file",
      }),
    ).toMatchObject({ emailTransport: "file" });
  });
});

describe("readServerConfig MCP limits", () => {
  it("starts from the initial values of decision D-29", () => {
    expect(readServerConfig({}).mcp).toEqual(MCP_DEFAULTS);
    expect(readServerConfig({ MCP_REQUEST_LIMIT: "", MCP_JOIN_LIMIT: "" }).mcp).toEqual(MCP_DEFAULTS);
  });

  it("lets the environment override every limit", () => {
    expect(
      readServerConfig({
        MCP_REQUEST_LIMIT: "500",
        MCP_JOIN_LIMIT: "3",
        MCP_LOOKUP_LIMIT: "7",
        MCP_LOOKUP_GLOBAL_LIMIT: "99",
        MCP_TOKEN_LIMIT: "12",
        MCP_CHAT_LIMIT: "5",
      }).mcp,
    ).toEqual({ requestLimit: 500, joinLimit: 3, lookupLimit: 7, lookupGlobalLimit: 99, tokenLimit: 12, chatLimit: 5 });
  });

  it.each(["MCP_REQUEST_LIMIT", "MCP_JOIN_LIMIT", "MCP_LOOKUP_LIMIT", "MCP_LOOKUP_GLOBAL_LIMIT", "MCP_TOKEN_LIMIT", "MCP_CHAT_LIMIT"])(
    "rejects a bad %s",
    (name) => {
      for (const bad of ["0", "-1", "1.5", "abc", "1000000000"]) {
        expect(() => readServerConfig({ [name]: bad })).toThrow(new RegExp(name));
      }
    },
  );

  it("reads the chat limits: defaults, empty values, overrides for people and agents", () => {
    expect(readServerConfig({}).chat).toEqual(CHAT_DEFAULTS);
    expect(readServerConfig({ CHAT_MAX_LENGTH: "", CHAT_MIN_INTERVAL_MS: "" }).chat).toEqual(CHAT_DEFAULTS);
    expect(
      readServerConfig({
        CHAT_MAX_LENGTH: "100",
        CHAT_MIN_INTERVAL_MS: "0",
        CHAT_AGENT_MAX_LENGTH: "1000",
        CHAT_AGENT_MIN_INTERVAL_MS: "5000",
        CHAT_MAX_MESSAGES_PER_GAME: "10",
      }).chat,
    ).toEqual({
      human: { maxLength: 100, minIntervalMs: 0 },
      agent: { maxLength: 1000, minIntervalMs: 5000 },
      maxMessagesPerGame: 10,
    });
  });

  it.each([
    ["CHAT_MAX_LENGTH", ["0", "1001", "-1", "1.5", "abc"]],
    ["CHAT_AGENT_MAX_LENGTH", ["0", "1001", "x"]],
    ["CHAT_MIN_INTERVAL_MS", ["-1", "3600001", "1.5", "abc"]],
    ["CHAT_AGENT_MIN_INTERVAL_MS", ["-1", "x"]],
    ["CHAT_MAX_MESSAGES_PER_GAME", ["0", "100001", "abc", "1000000000"]],
  ])("rejects a bad %s", (name, bad) => {
    for (const value of bad) {
      expect(() => readServerConfig({ [name]: value })).toThrow(new RegExp(name));
    }
  });
});
