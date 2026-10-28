import { describe, expect, it } from "vitest";

import { readServerConfig } from "./config";

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
