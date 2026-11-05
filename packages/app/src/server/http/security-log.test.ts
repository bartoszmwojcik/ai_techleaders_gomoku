import { afterEach, describe, expect, it, vi } from "vitest";

import { limiterScope, logSecurityEvent } from "./security-log";

afterEach(() => vi.restoreAllMocks());

describe("logSecurityEvent", () => {
  it("writes one JSON line with a stable event code and a timestamp", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logSecurityEvent("login_failed");
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0]![0] as string;
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual({ event: "security.login_failed", ts: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) });
  });

  it("adds the scope and the reason", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logSecurityEvent("rate_limited", { scope: "login:ip", reason: "x" });
    expect(JSON.parse(warn.mock.calls[0]![0] as string)).toMatchObject({
      event: "security.rate_limited",
      scope: "login:ip",
      reason: "x",
    });
  });
});

describe("limiterScope", () => {
  it.each([
    ["login:ip:abcdef", "login:ip"],
    ["login:email-ip:abcdef", "login:email-ip"],
    ["invitation-lookup:global", "invitation-lookup:global"],
    ["lobby-mark:7d1c0f3e-user-id", "lobby-mark"],
    ["games-create:user-id", "games-create"],
    ["plain", "plain"],
  ])("%s -> %s", (key, scope) => {
    expect(limiterScope(key)).toBe(scope);
  });
});
