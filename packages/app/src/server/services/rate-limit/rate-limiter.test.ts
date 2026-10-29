import { TooManyRequestsError } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { RateLimiter } from "./rate-limiter";

function setup(rows: unknown[]) {
  const execute = vi.fn(async () => rows);
  const txEm = { execute };
  const transactional = vi.fn(async (fn: (em: unknown) => Promise<unknown>) =>
    fn(txEm),
  );
  const limiter = new RateLimiter({
    em: { transactional } as unknown as EntityManager,
  });
  return { execute, transactional, limiter };
}

describe("RateLimiter.consume", () => {
  it("upserts the bucket in its own transaction with bound parameters", async () => {
    const { execute, transactional, limiter } = setup([
      { count: 1, retry_after_seconds: 3600 },
    ]);

    await limiter.consume("register:ip:abc", 5, 3_600_000);

    expect(transactional).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("on conflict"),
      ["register:ip:abc", 3_600_000, 3_600_000, 3_600_000],
      "all",
    );
  });

  it("allows exactly `limit` attempts", async () => {
    const { limiter } = setup([{ count: 5, retry_after_seconds: 10 }]);
    await expect(limiter.consume("k", 5, 1000)).resolves.toBeUndefined();
  });

  it("throws TooManyRequestsError with Retry-After above the limit", async () => {
    const { limiter } = setup([{ count: 6, retry_after_seconds: 42 }]);
    const error = await limiter.consume("k", 5, 1000).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect((error as TooManyRequestsError).retryAfterSeconds).toBe(42);
  });

  it("commits the counter before throwing (the throw is outside the transaction)", async () => {
    const { transactional, limiter } = setup([
      { count: 9, retry_after_seconds: 1 },
    ]);
    await expect(limiter.consume("k", 5, 1000)).rejects.toBeInstanceOf(
      TooManyRequestsError,
    );
    expect(transactional).toHaveReturned();
  });
});

describe("RateLimiter.hit", () => {
  it("returns count and retryAfterSeconds while within the limit", async () => {
    const { limiter, transactional } = setup([
      { count: 5, retry_after_seconds: 7 },
    ]);
    await expect(limiter.hit("k", 5, 1000)).resolves.toEqual({
      count: 5,
      retryAfterSeconds: 7,
    });
    expect(transactional).toHaveBeenCalledOnce();
  });

  it("starts a new window at count 1 and throws only above the limit", async () => {
    const first = setup([{ count: 1, retry_after_seconds: 1000 }]);
    await expect(first.limiter.hit("k", 1, 1000)).resolves.toMatchObject({
      count: 1,
    });
    const second = setup([{ count: 2, retry_after_seconds: 3 }]);
    await expect(second.limiter.hit("k", 1, 1000)).rejects.toMatchObject({
      retryAfterSeconds: 3,
    });
  });
});

describe("RateLimiter.reset", () => {
  it("deletes the bucket in its own transaction with a bound key", async () => {
    const { execute, transactional, limiter } = setup([]);
    await limiter.reset("login:email:a@b.c");
    expect(transactional).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("delete from rate_limit_buckets"),
      ["login:email:a@b.c"],
      "run",
    );
  });
});

describe("RateLimiter.release", () => {
  it("gives one attempt back in a live window, in its own transaction, with bound parameters", async () => {
    const { execute, transactional, limiter } = setup([]);
    await limiter.release("invite:ip:1", 1000);
    expect(transactional).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('greatest("count" - 1, 0)'),
      ["invite:ip:1", 1000],
      "run",
    );
  });
});
