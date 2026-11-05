import { GoneError } from "@gomoku/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { withLookupAttempt } from "./join-core";

afterEach(() => vi.restoreAllMocks());

const guard = { key: "invitation-lookup:ip:deadbeefhash", limit: 20 };

function limiter() {
  return { hit: vi.fn(async () => ({ count: 1, retryAfterSeconds: 1 })), release: vi.fn(async () => undefined) };
}

describe("withLookupAttempt", () => {
  it("gives the attempt back after a successful lookup and logs nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rateLimiter = limiter();

    await expect(withLookupAttempt(rateLimiter, guard, async () => "ok")).resolves.toBe("ok");

    expect(rateLimiter.release).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps the attempt and logs a failed code lookup with the pool name, never the key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rateLimiter = limiter();

    await expect(
      withLookupAttempt(rateLimiter, guard, async () => {
        throw new GoneError("x", { code: "INVALID_INVITATION" });
      }),
    ).rejects.toBeInstanceOf(GoneError);

    expect(rateLimiter.release).not.toHaveBeenCalled();
    const line = warn.mock.calls[0]![0] as string;
    expect(JSON.parse(line)).toMatchObject({ event: "security.invitation_lookup_failed", scope: "invitation-lookup:ip" });
    expect(line).not.toContain("deadbeefhash");
  });

  it("gives the attempt back for any other error and logs nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rateLimiter = limiter();

    await expect(
      withLookupAttempt(rateLimiter, guard, async () => {
        throw new Error("db down");
      }),
    ).rejects.toThrow("db down");

    expect(rateLimiter.release).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not let a failing release mask the result", async () => {
    const rateLimiter = limiter();
    rateLimiter.release.mockRejectedValue(new Error("x"));
    await expect(withLookupAttempt(rateLimiter, guard, async () => 1)).resolves.toBe(1);
  });
});
