import { TooManyRequestsError, ValidationError } from "@gomoku/core";
import { PasswordResetToken, User, type EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import type { ServerConfig } from "../../config";
import { hashOpaqueToken } from "../../http/opaque-token";
import type { EmailSender } from "../email/email-sender";
import type { RateLimiter } from "../rate-limit/rate-limiter";
import {
  DAILY_WINDOW_MS,
  INVALID_TOKEN_MESSAGE,
  VERIFICATION_SEND_TIMEOUT_MS,
} from "./email-verification-service";
import type { PasswordHasher } from "./password-hasher";
import {
  PasswordResetService,
  RESET_DAILY_KEY,
  RESET_EMAIL_LIMIT,
  RESET_EMAIL_WINDOW_MS,
  RESET_TOKEN_TTL_MS,
} from "./password-reset-service";
import type { SessionService } from "./session-service";

const NOW = new Date("2026-10-28T10:00:00.000Z");
const account = {
  id: "user-1",
  email: "ala@example.com",
  displayName: "Ala",
  emailVerifiedAt: new Date("2026-10-01T00:00:00.000Z") as Date | null,
};

function setup(
  options: {
    user?: typeof account | null;
    config?: Partial<ServerConfig>;
    sendError?: unknown;
    hitErrors?: unknown[];
    consumed?: { user_id: string }[];
  } = {},
) {
  const user = options.user === undefined ? account : options.user;
  const calls: string[] = [];
  const tx = {
    execute: vi.fn(async () => options.consumed ?? []),
    nativeUpdate: vi.fn(async () => 1),
  };
  const em = {
    findOne: vi.fn(async () => user),
    create: vi.fn((_entity: unknown, data: object) => ({
      id: "token-1",
      ...data,
    })),
    getReference: vi.fn((_entity: unknown, id: string) => ({ ref: id })),
    flush: vi.fn(async () => {
      calls.push("flush");
    }),
    nativeDelete: vi.fn(async () => {
      calls.push("delete");
      return 1;
    }),
    nativeUpdate: vi.fn(async () => {
      calls.push("invalidate");
      return 1;
    }),
    transactional: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const emailSender = {
    send: vi.fn<EmailSender["send"]>(async () => {
      calls.push("send");
      if (options.sendError) throw options.sendError;
    }),
  };
  const hitErrors = [...(options.hitErrors ?? [])];
  const rateLimiter = {
    hit: vi.fn(async () => {
      calls.push("hit");
      const error = hitErrors.shift();
      if (error) throw error;
      return { count: 1, retryAfterSeconds: 1 };
    }),
  };
  const passwordHasher = {
    hash: vi.fn(async () => {
      calls.push("hash");
      return "new-hash";
    }),
  };
  const sessionService = {
    revokeAll: vi.fn(async () => 2),
  };
  const invalidateResetTokens = vi.fn(async () => undefined);
  const service = new PasswordResetService({
    em: em as unknown as EntityManager,
    emailSender: emailSender as unknown as EmailSender,
    passwordHasher: passwordHasher as unknown as PasswordHasher,
    sessionService: sessionService as unknown as SessionService,
    invalidateResetTokens,
    clock: { now: () => NOW },
    serverConfig: {
      appOrigin: "https://gomoku.example",
      ...options.config,
    } as ServerConfig,
    rateLimiter: rateLimiter as unknown as RateLimiter,
  });
  return {
    em,
    tx,
    emailSender,
    rateLimiter,
    passwordHasher,
    sessionService,
    invalidateResetTokens,
    service,
    calls,
  };
}

describe("PasswordResetService.request", () => {
  it("stores the hash with a 1 h expiry, sends the link, then invalidates older tokens", async () => {
    const { em, emailSender, service, calls } = setup();

    await service.request("Ala@Example.com");

    expect(em.findOne).toHaveBeenCalledWith(User, { email: "ala@example.com" });
    expect(calls).toEqual(["hit", "flush", "send", "invalidate"]);
    const data = em.create.mock.calls[0]?.[1] as {
      tokenHash: string;
      createdAt: Date;
      expiresAt: Date;
      user: unknown;
    };
    expect(em.create.mock.calls[0]?.[0]).toBe(PasswordResetToken);
    expect(em.getReference).toHaveBeenCalledWith(User, "user-1");
    expect(data.user).toEqual({ ref: "user-1" });
    expect(data.createdAt).toBe(NOW);
    expect(data.expiresAt.getTime()).toBe(NOW.getTime() + RESET_TOKEN_TTL_MS);
    expect(RESET_TOKEN_TTL_MS).toBe(3600 * 1000);

    const message = emailSender.send.mock.calls[0]?.[0] as unknown as {
      to: string;
      text: string;
    };
    expect(message.to).toBe("ala@example.com");
    expect(message.text).toContain("https://gomoku.example/reset-password");
    const token = /token=([^&\s]+)/.exec(message.text)?.[1] as string;
    expect(hashOpaqueToken(decodeURIComponent(token))).toBe(data.tokenHash);
    const options = emailSender.send.mock.calls[0]?.[1];
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(VERIFICATION_SEND_TIMEOUT_MS).toBe(5000);

    expect(em.nativeUpdate).toHaveBeenCalledExactlyOnceWith(
      PasswordResetToken,
      {
        user: "user-1",
        usedAt: null,
        $or: [
          { createdAt: { $lt: NOW } },
          { createdAt: NOW, id: { $lt: "token-1" } },
        ],
      },
      { usedAt: NOW },
    );
  });

  it("falls back to the local origin when APP_ORIGIN is unset", async () => {
    const { emailSender, service } = setup({
      config: { appOrigin: undefined },
    });
    await service.request("ala@example.com");
    const message = emailSender.send.mock.calls[0]?.[0] as unknown as {
      text: string;
    };
    expect(message.text).toContain("http://localhost:3000/reset-password");
  });

  it("does nothing for an unknown address", async () => {
    const { em, emailSender, rateLimiter, service } = setup({ user: null });

    await expect(service.request("who@example.com")).resolves.toBeUndefined();

    expect(rateLimiter.hit).not.toHaveBeenCalled();
    expect(em.create).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it("does nothing for an unconfirmed address (BR-27)", async () => {
    const { em, emailSender, rateLimiter, service } = setup({
      user: { ...account, emailVerifiedAt: null },
    });

    await expect(service.request("ala@example.com")).resolves.toBeUndefined();

    expect(rateLimiter.hit).not.toHaveBeenCalled();
    expect(em.create).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it("counts 3 messages per hour on sha256(e-mail) and has no daily limit by default", async () => {
    const { rateLimiter, service } = setup();
    await service.request("Ala@Example.com");
    expect(rateLimiter.hit).toHaveBeenCalledExactlyOnceWith(
      `password-reset:email:${hashOpaqueToken("ala@example.com")}`,
      RESET_EMAIL_LIMIT,
      RESET_EMAIL_WINDOW_MS,
    );
    expect([RESET_EMAIL_LIMIT, RESET_EMAIL_WINDOW_MS]).toEqual([3, 3_600_000]);
  });

  it("sends nothing and stores nothing after the address limit, leaving the previous link valid", async () => {
    const { em, emailSender, rateLimiter, service } = setup({
      hitErrors: [new TooManyRequestsError("limit")],
    });

    await expect(service.request("ala@example.com")).resolves.toBeUndefined();

    expect(rateLimiter.hit).toHaveBeenCalledOnce();
    expect(em.create).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
    expect(em.nativeUpdate).not.toHaveBeenCalled();
  });

  it("uses a separate daily pool of the whole EMAIL_DAILY_LIMIT, after the address limit", async () => {
    const { rateLimiter, service } = setup({
      config: { emailDailyLimit: 100 },
    });
    await service.request("ala@example.com");
    expect(rateLimiter.hit).toHaveBeenCalledTimes(2);
    expect(rateLimiter.hit).toHaveBeenNthCalledWith(
      2,
      RESET_DAILY_KEY,
      100,
      DAILY_WINDOW_MS,
    );
    expect(RESET_DAILY_KEY).toBe("email-daily:reset");
  });

  it("sends nothing when the daily pool is used up", async () => {
    const { em, emailSender, service } = setup({
      config: { emailDailyLimit: 10 },
      hitErrors: [undefined, new TooManyRequestsError("limit")],
    });

    await expect(service.request("ala@example.com")).resolves.toBeUndefined();

    expect(em.create).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it("rethrows unexpected limiter failures", async () => {
    const failure = new Error("db down");
    const { service } = setup({ hitErrors: [failure] });
    await expect(service.request("ala@example.com")).rejects.toBe(failure);
  });

  it("removes the new token and keeps the old link when sending fails, without an error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = Object.assign(new Error("550 rejected ala@example.com"), {
      code: "EENVELOPE",
    });
    const { em, service, calls } = setup({ sendError: cause });

    await expect(service.request("ala@example.com")).resolves.toBeUndefined();

    expect(calls).toEqual(["hit", "flush", "send", "delete"]);
    expect(em.nativeDelete).toHaveBeenCalledWith(PasswordResetToken, {
      id: "token-1",
    });
    expect(em.nativeUpdate).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Password reset e-mail send failed", {
      name: "Error",
      code: "EENVELOPE",
    });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("ala@example.com");
    expect(logged).not.toContain("token=");
    log.mockRestore();
  });
});

describe("PasswordResetService.confirm", () => {
  it("hashes first, then consumes the token and updates everything in one transaction through tx", async () => {
    const t = setup({ consumed: [{ user_id: "user-1" }] });

    await expect(
      t.service.confirm("raw-token", "new-secret1"),
    ).resolves.toBeUndefined();

    expect(t.calls[0]).toBe("hash");
    expect(t.passwordHasher.hash).toHaveBeenCalledWith("new-secret1");
    expect(t.tx.execute).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(
        /update password_reset_tokens set used_at = \?[\s\S]*used_at is null and expires_at > \?[\s\S]*users\.email_verified_at is not null[\s\S]*returning user_id/,
      ),
      [NOW, hashOpaqueToken("raw-token"), NOW],
      "all",
    );
    expect(t.tx.nativeUpdate).toHaveBeenCalledExactlyOnceWith(
      User,
      { id: "user-1" },
      { passwordHash: "new-hash" },
    );
    expect(t.sessionService.revokeAll).toHaveBeenCalledExactlyOnceWith(
      "user-1",
      t.tx,
    );
    expect(t.invalidateResetTokens).toHaveBeenCalledExactlyOnceWith(
      "user-1",
      t.tx,
    );
    expect(t.em.nativeUpdate).not.toHaveBeenCalled();
    expect(t.em.nativeDelete).not.toHaveBeenCalled();
  });

  it("never sets emailVerifiedAt", async () => {
    const { tx, service } = setup({ consumed: [{ user_id: "user-1" }] });
    await service.confirm("raw-token", "new-secret1");
    const changes = (tx.nativeUpdate.mock.calls as unknown[][]).map(
      (call) => call[2],
    );
    expect(changes).toEqual([{ passwordHash: "new-hash" }]);
  });

  it("answers 400 INVALID_TOKEN for an unknown, expired or used token and writes nothing", async () => {
    const { tx, sessionService, invalidateResetTokens, service } = setup({
      consumed: [],
    });

    const error = await service
      .confirm("nope", "new-secret1")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe("INVALID_TOKEN");
    expect((error as ValidationError).message).toBe(INVALID_TOKEN_MESSAGE);
    expect(tx.nativeUpdate).not.toHaveBeenCalled();
    expect(sessionService.revokeAll).not.toHaveBeenCalled();
    expect(invalidateResetTokens).not.toHaveBeenCalled();
  });
});
