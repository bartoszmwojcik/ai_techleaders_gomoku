import { TooManyRequestsError, ValidationError } from "@gomoku/core";
import {
  EmailChangeToken,
  EmailVerificationToken,
  UniqueConstraintViolationException,
  User,
  type EntityManager,
} from "@gomoku/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ServerConfig } from "../../config";
import { hashOpaqueToken } from "../../http/opaque-token";
import type { EmailSender } from "../email/email-sender";
import type { RateLimiter } from "../rate-limit/rate-limiter";
import {
  DAILY_WINDOW_MS,
  INVALID_TOKEN_MESSAGE,
  VERIFICATION_SEND_TIMEOUT_MS,
} from "./email-verification-service";
import {
  EMAIL_CHANGE_ACCOUNT_LIMIT,
  EMAIL_CHANGE_ADDRESS_LIMIT,
  EMAIL_CHANGE_DAILY_KEY,
  EMAIL_CHANGE_TOKEN_TTL_MS,
  EMAIL_CHANGE_WINDOW_MS,
  EmailChangeService,
  SAME_EMAIL_MESSAGE,
} from "./email-change-service";
import type { PasswordHasher } from "./password-hasher";
import type { SessionService } from "./session-service";

const NOW = new Date("2026-11-02T10:00:00.000Z");
const stored = {
  id: "user-1",
  email: "ala@example.com",
  displayName: "Ala",
  passwordHash: "hash",
  emailVerifiedAt: new Date("2026-10-01T00:00:00.000Z") as Date | null,
};
const user = { id: "user-1", email: "ala@example.com", displayName: "Ala" };

function violation() {
  return new UniqueConstraintViolationException(new Error("dup"));
}

function setup(
  options: {
    passwordOk?: boolean;
    taken?: number;
    config?: Partial<ServerConfig>;
    sendError?: unknown;
    hitErrors?: unknown[];
    consumed?: { user_id: string; new_email: string }[];
    txUser?: typeof stored;
    updateError?: unknown;
    sendErrors?: unknown[];
  } = {},
) {
  const calls: string[] = [];
  const tx = {
    execute: vi.fn(async () => options.consumed ?? []),
    findOneOrFail: vi.fn(async () => options.txUser ?? stored),
    nativeUpdate: vi.fn(async (entity: unknown) => {
      if (options.updateError && entity === User) throw options.updateError;
      return 1;
    }),
  };
  const em = {
    findOneOrFail: vi.fn(async () => stored),
    count: vi.fn(async () => options.taken ?? 0),
    create: vi.fn((_entity: unknown, data: object) => ({ id: "token-1", ...data })),
    getReference: vi.fn((_entity: unknown, id: string) => ({ ref: id })),
    flush: vi.fn(async () => {
      calls.push("flush");
    }),
    nativeDelete: vi.fn(async () => {
      calls.push("delete");
      return 1;
    }),
    nativeUpdate: vi.fn(async () => {
      calls.push("invalidate-older");
      return 1;
    }),
    transactional: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(tx)),
  };
  const emailSender = {
    send: vi.fn(async () => {
      calls.push("send");
      if (options.sendError) throw options.sendError;
    }),
  };
  const passwordHasher = { verify: vi.fn(async () => options.passwordOk ?? true) };
  const sessionService = { revokeAll: vi.fn(async () => 2) };
  const invalidateResetTokens = vi.fn(async () => undefined);
  const hits = [...(options.hitErrors ?? [])];
  const rateLimiter = {
    hit: vi.fn(async () => {
      const error = hits.shift();
      if (error) throw error;
      return { count: 1, retryAfterSeconds: 60 };
    }),
  };
  const serverConfig = { appOrigin: "https://gomoku.example", ...options.config } as ServerConfig;
  const service = new EmailChangeService({
    em: em as unknown as EntityManager,
    emailSender: emailSender as unknown as EmailSender,
    passwordHasher: passwordHasher as unknown as PasswordHasher,
    sessionService: sessionService as unknown as SessionService,
    invalidateResetTokens,
    clock: { now: () => NOW },
    serverConfig,
    rateLimiter: rateLimiter as unknown as RateLimiter,
  });
  return { service, em, tx, emailSender, passwordHasher, sessionService, invalidateResetTokens, rateLimiter, calls };
}

afterEach(() => vi.restoreAllMocks());

describe("EmailChangeService.request", () => {
  it("checks the password and the address, spends one account request and returns the account", async () => {
    const { service, passwordHasher, rateLimiter, em } = setup();
    expect(await service.request("user-1", "nowy@example.com", "secret")).toEqual(user);
    expect(passwordHasher.verify).toHaveBeenCalledWith("secret", "hash");
    expect(rateLimiter.hit).toHaveBeenCalledWith(
      `email-change:user:${hashOpaqueToken("user-1")}`,
      EMAIL_CHANGE_ACCOUNT_LIMIT,
      EMAIL_CHANGE_WINDOW_MS,
    );
    // Whether the address is free is not looked up before the answer (Q3).
    expect(em.count).not.toHaveBeenCalled();
  });

  it("refuses a wrong password with a field error and spends nothing", async () => {
    const { service, rateLimiter } = setup({ passwordOk: false });
    await expect(service.request("user-1", "nowy@example.com", "bad")).rejects.toMatchObject({
      status: 400,
      code: "INVALID_CURRENT_PASSWORD",
      fieldErrors: { currentPassword: ["Obecne hasło jest nieprawidłowe."] },
    });
    expect(rateLimiter.hit).not.toHaveBeenCalled();
  });

  it("refuses the current address", async () => {
    const { service, rateLimiter } = setup();
    await expect(service.request("user-1", "ala@example.com", "secret")).rejects.toMatchObject({
      status: 400,
      fieldErrors: { newEmail: [SAME_EMAIL_MESSAGE] },
    });
    expect(rateLimiter.hit).not.toHaveBeenCalled();
  });

  it("passes the account limit through as 429", async () => {
    const { service } = setup({ hitErrors: [new TooManyRequestsError("limit", { retryAfterSeconds: 5 })] });
    await expect(service.request("user-1", "nowy@example.com", "secret")).rejects.toBeInstanceOf(TooManyRequestsError);
  });
});

describe("EmailChangeService.deliver", () => {
  it("stores the hash with a 24 h expiry, sends the link to the new address, then invalidates older links", async () => {
    const { service, em, emailSender, calls, rateLimiter } = setup();
    await service.deliver(user, "Nowy@Example.com");

    expect(calls).toEqual(["flush", "send", "invalidate-older"]);
    const created = em.create.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(created[0]).toBe(EmailChangeToken);
    expect(created[1]).toMatchObject({
      newEmail: "nowy@example.com",
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + EMAIL_CHANGE_TOKEN_TTL_MS),
    });
    const [message, options] = emailSender.send.mock.calls[0] as unknown as [{ to: string; text: string }, { signal: AbortSignal }];
    expect(message.to).toBe("nowy@example.com");
    const token = /token=([^\s&]+)/.exec(message.text)![1]!;
    expect(created[1].tokenHash).toBe(hashOpaqueToken(decodeURIComponent(token)));
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(VERIFICATION_SEND_TIMEOUT_MS).toBeGreaterThan(0);
    expect(em.nativeUpdate).toHaveBeenCalledWith(
      EmailChangeToken,
      expect.objectContaining({ user: "user-1", usedAt: null }),
      { usedAt: NOW },
    );
    expect(rateLimiter.hit).toHaveBeenCalledTimes(1);
    expect(rateLimiter.hit).toHaveBeenCalledWith(
      `email-change:address:${hashOpaqueToken("nowy@example.com")}`,
      EMAIL_CHANGE_ADDRESS_LIMIT,
      EMAIL_CHANGE_WINDOW_MS,
    );
  });

  it("falls back to the local origin when APP_ORIGIN is unset", async () => {
    const { service, emailSender } = setup({ config: { appOrigin: undefined } });
    await service.deliver(user, "nowy@example.com");
    expect((emailSender.send.mock.calls[0] as unknown as [{ text: string }])[0].text).toContain("http://localhost:3000/confirm-email-change");
  });

  it("does nothing for a taken address, without a trace", async () => {
    const { service, em, emailSender } = setup({ taken: 1 });
    await service.deliver(user, "zajety@example.com");
    expect(em.create).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it("sends nothing after the per-address limit", async () => {
    const { service, em, emailSender } = setup({ hitErrors: [new TooManyRequestsError("limit")] });
    await service.deliver(user, "nowy@example.com");
    expect(em.count).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it("uses a separate daily pool of the whole EMAIL_DAILY_LIMIT, after the address limit", async () => {
    const { service, rateLimiter } = setup({ config: { emailDailyLimit: 50 } });
    await service.deliver(user, "nowy@example.com");
    expect(rateLimiter.hit).toHaveBeenNthCalledWith(2, EMAIL_CHANGE_DAILY_KEY, 50, DAILY_WINDOW_MS);
  });

  it("sends nothing when the daily pool is used up", async () => {
    const { service, emailSender } = setup({
      config: { emailDailyLimit: 1 },
      hitErrors: [undefined, new TooManyRequestsError("daily")],
    });
    await service.deliver(user, "nowy@example.com");
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it("rethrows unexpected limiter failures", async () => {
    const { service } = setup({ hitErrors: [new Error("db down")] });
    await expect(service.deliver(user, "nowy@example.com")).rejects.toThrow("db down");
  });

  it("removes the new token and keeps the old link when sending fails, without an error and without a leak", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service, calls } = setup({ sendError: new Error("smtp nowy@example.com") });
    await service.deliver(user, "nowy@example.com");
    expect(calls).toEqual(["flush", "send", "delete"]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("nowy@example.com");
  });
});

describe("EmailChangeService.confirm", () => {
  const consumed = [{ user_id: "user-1", new_email: "nowy@example.com" }];

  it("consumes the token and changes everything in one transaction through tx, then tells the old address", async () => {
    const { service, tx, em, sessionService, invalidateResetTokens, emailSender } = setup({ consumed });
    await service.confirm("raw-token");

    expect(em.transactional).toHaveBeenCalledOnce();
    expect(tx.execute).toHaveBeenCalledWith(expect.stringContaining("update email_change_tokens"), [NOW, hashOpaqueToken("raw-token"), NOW], "all");
    expect(tx.nativeUpdate).toHaveBeenCalledWith(User, { id: "user-1" }, { email: "nowy@example.com", emailVerifiedAt: NOW });
    expect(sessionService.revokeAll).toHaveBeenCalledWith("user-1", tx);
    expect(invalidateResetTokens).toHaveBeenCalledWith("user-1", tx);
    expect(tx.nativeUpdate).toHaveBeenCalledWith(EmailVerificationToken, { user: "user-1", usedAt: null }, { usedAt: NOW });
    const [notice] = emailSender.send.mock.calls[0] as unknown as [{ to: string; text: string }];
    expect(notice.to).toBe("ala@example.com");
    expect(notice.text).toContain("n***@example.com");
    expect(notice.text).not.toContain("nowy@example.com");
  });

  it("sends no notice when the old address was never confirmed", async () => {
    const { service, emailSender } = setup({ consumed, txUser: { ...stored, emailVerifiedAt: null } });
    await service.confirm("raw-token");
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it("logs a failed notice without the address and still succeeds", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service } = setup({ consumed, sendError: new Error("smtp ala@example.com") });
    await expect(service.confirm("raw-token")).resolves.toBeUndefined();
    expect(JSON.stringify(log.mock.calls)).not.toContain("ala@example.com");
  });

  it("answers INVALID_TOKEN for an unknown, expired or used token and writes nothing", async () => {
    const { service, tx, sessionService } = setup({ consumed: [] });
    const error = await service.confirm("nope").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ code: "INVALID_TOKEN", message: INVALID_TOKEN_MESSAGE });
    expect(tx.nativeUpdate).not.toHaveBeenCalled();
    expect(sessionService.revokeAll).not.toHaveBeenCalled();
  });

  it("answers INVALID_TOKEN when the address was taken meanwhile", async () => {
    const { service } = setup({ consumed, updateError: violation() });
    await expect(service.confirm("raw-token")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("rethrows any other failure", async () => {
    const { service } = setup({ consumed, updateError: new Error("db down") });
    await expect(service.confirm("raw-token")).rejects.toThrow("db down");
  });
});
