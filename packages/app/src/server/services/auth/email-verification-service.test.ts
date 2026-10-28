import { AppError, TooManyRequestsError, ValidationError } from "@gomoku/core";
import { EmailVerificationToken, User, type EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import type { ServerConfig } from "../../config";
import { hashOpaqueToken } from "../../http/opaque-token";
import type { EmailSender } from "../email/email-sender";
import type { RateLimiter } from "../rate-limit/rate-limiter";
import {
  ALREADY_VERIFIED_MESSAGE,
  DAILY_WINDOW_MS,
  EMAIL_QUOTA_EXCEEDED_MESSAGE,
  EMAIL_SEND_FAILED_MESSAGE,
  EmailVerificationService,
  INVALID_TOKEN_MESSAGE,
  RESEND_IP_LIMIT,
  RESEND_USER_LIMIT,
  RESEND_WINDOW_MS,
  VERIFICATION_DAILY_KEY,
  VERIFICATION_SEND_TIMEOUT_MS,
  VERIFICATION_TOKEN_TTL_MS,
  verificationDailyBudget,
} from "./email-verification-service";

const NOW = new Date("2026-10-28T10:00:00.000Z");
const recipient = {
  id: "user-1",
  email: "ala@example.com",
  displayName: "Ala",
};

function setup(
  options: {
    config?: Partial<ServerConfig>;
    sendError?: unknown;
    hitError?: unknown;
    consumed?: { user_id: string }[];
  } = {},
) {
  const calls: string[] = [];
  const tx = {
    execute: vi.fn(async () => options.consumed ?? []),
    nativeUpdate: vi.fn(async () => 1),
  };
  const em = {
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
  const rateLimiter = {
    hit: vi.fn(async () => {
      calls.push("hit");
      if (options.hitError) throw options.hitError;
      return { count: 1, retryAfterSeconds: 1 };
    }),
  };
  const service = new EmailVerificationService({
    em: em as unknown as EntityManager,
    emailSender: emailSender as unknown as EmailSender,
    clock: { now: () => NOW },
    serverConfig: {
      appOrigin: "https://gomoku.example",
      ...options.config,
    } as ServerConfig,
    rateLimiter: rateLimiter as unknown as RateLimiter,
  });
  return { em, tx, emailSender, rateLimiter, service, calls };
}

describe("EmailVerificationService.issue", () => {
  it("stores the hash with a 24 h expiry, sends the link, then invalidates older tokens", async () => {
    const { em, emailSender, service, calls } = setup();

    await service.issue(recipient, "/lobby");

    expect(calls).toEqual(["flush", "send", "invalidate"]);
    const data = em.create.mock.calls[0]?.[1] as {
      tokenHash: string;
      expiresAt: Date;
      user: unknown;
    };
    expect(em.create.mock.calls[0]?.[0]).toBe(EmailVerificationToken);
    expect(em.getReference).toHaveBeenCalledWith(User, "user-1");
    expect(data.user).toEqual({ ref: "user-1" });
    expect((data as unknown as { createdAt: Date }).createdAt).toBe(NOW);
    expect(data.expiresAt.getTime()).toBe(
      NOW.getTime() + VERIFICATION_TOKEN_TTL_MS,
    );
    expect(VERIFICATION_TOKEN_TTL_MS).toBe(24 * 3600 * 1000);

    const message = emailSender.send.mock.calls[0]?.[0] as unknown as {
      to: string;
      text: string;
    };
    expect(message.to).toBe("ala@example.com");
    const token = /token=([^&\s]+)/.exec(message.text)?.[1] as string;
    expect(hashOpaqueToken(decodeURIComponent(token))).toBe(data.tokenHash);
    expect(message.text).toContain("https://gomoku.example/verify-email");
    expect(message.text).toContain("next=%2Flobby");

    expect(em.nativeUpdate).toHaveBeenCalledExactlyOnceWith(
      EmailVerificationToken,
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
    await service.issue(recipient);
    const message = emailSender.send.mock.calls[0]?.[0] as unknown as {
      text: string;
    };
    expect(message.text).toContain("http://localhost:3000/verify-email");
  });

  it("keeps the previous link valid and removes the new token when sending fails", async () => {
    const { em, service, calls } = setup({ sendError: new Error("smtp down") });

    const error = await service.issue(recipient).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(502);
    expect((error as AppError).code).toBe("EMAIL_SEND_FAILED");
    expect((error as AppError).message).toBe(EMAIL_SEND_FAILED_MESSAGE);
    expect(calls).toEqual(["flush", "send", "delete"]);
    expect(em.nativeDelete).toHaveBeenCalledWith(EmailVerificationToken, {
      id: "token-1",
    });
    expect(em.nativeUpdate).not.toHaveBeenCalled();
  });

  it("does not count against any limit when EMAIL_DAILY_LIMIT is unset", async () => {
    const { rateLimiter, service } = setup();
    await service.issue(recipient);
    expect(rateLimiter.hit).not.toHaveBeenCalled();
  });

  it("uses at most 70% of the daily limit, checked before anything is stored", async () => {
    const { rateLimiter, service, calls } = setup({
      config: { emailDailyLimit: 100 },
    });
    await service.issue(recipient);
    expect(rateLimiter.hit).toHaveBeenCalledExactlyOnceWith(
      VERIFICATION_DAILY_KEY,
      70,
      DAILY_WINDOW_MS,
    );
    expect(calls[0]).toBe("hit");
  });

  it("never lets the verification budget drop to zero", () => {
    expect(verificationDailyBudget(1)).toBe(1);
    expect(verificationDailyBudget(2)).toBe(1);
    expect(verificationDailyBudget(10)).toBe(7);
    expect(verificationDailyBudget(100)).toBe(70);
  });

  it("allows one send per day with EMAIL_DAILY_LIMIT=1", async () => {
    const { rateLimiter, service } = setup({ config: { emailDailyLimit: 1 } });
    await service.issue(recipient);
    expect(rateLimiter.hit).toHaveBeenCalledWith(
      VERIFICATION_DAILY_KEY,
      1,
      DAILY_WINDOW_MS,
    );
  });

  it("passes the send options (abort signal) to the sender", async () => {
    const { emailSender, service } = setup();
    const signal = AbortSignal.timeout(1000);
    await service.issue(recipient, undefined, { signal });
    expect(emailSender.send.mock.calls[0]?.[1]).toEqual({ signal });
  });

  it("treats an aborted send as a failed send", async () => {
    const { em, service } = setup({
      sendError: new DOMException("timeout", "TimeoutError"),
    });
    await expect(service.issue(recipient)).rejects.toMatchObject({
      code: "EMAIL_SEND_FAILED",
    });
    expect(em.nativeDelete).toHaveBeenCalled();
    expect(em.nativeUpdate).not.toHaveBeenCalled();
  });

  it("answers 503 EMAIL_QUOTA_EXCEEDED and sends nothing when the share is used up", async () => {
    const { em, emailSender, service } = setup({
      config: { emailDailyLimit: 10 },
      hitError: new TooManyRequestsError("limit"),
    });

    const error = await service.issue(recipient).catch((e: unknown) => e);

    expect((error as AppError).status).toBe(503);
    expect((error as AppError).code).toBe("EMAIL_QUOTA_EXCEEDED");
    expect((error as AppError).message).toBe(EMAIL_QUOTA_EXCEEDED_MESSAGE);
    expect(em.create).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it("logs only the name and code of the send failure, never the address or the token", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = Object.assign(new Error("550 rejected ala@example.com"), {
      code: "EENVELOPE",
    });
    const { service } = setup({ sendError: cause });

    await expect(service.issue(recipient)).rejects.toMatchObject({
      status: 502,
      code: "EMAIL_SEND_FAILED",
    });

    expect(log).toHaveBeenCalledWith("Verification e-mail send failed", {
      name: "Error",
      code: "EENVELOPE",
    });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("ala@example.com");
    expect(logged).not.toContain("token=");
    log.mockRestore();
  });

  it("rethrows unexpected limiter failures", async () => {
    const failure = new Error("db down");
    const { service } = setup({
      config: { emailDailyLimit: 10 },
      hitError: failure,
    });
    await expect(service.issue(recipient)).rejects.toBe(failure);
  });
});

describe("EmailVerificationService.resend", () => {
  const unverified = { ...recipient, emailVerifiedAt: null };

  it("counts the account and the address, then issues with a bounded send", async () => {
    const { rateLimiter, emailSender, calls, service } = setup();

    await service.resend(unverified, "verification-resend:ip:abc");

    expect(rateLimiter.hit).toHaveBeenNthCalledWith(
      1,
      `verification-resend:user:${hashOpaqueToken("user-1")}`,
      RESEND_USER_LIMIT,
      RESEND_WINDOW_MS,
    );
    expect(rateLimiter.hit).toHaveBeenNthCalledWith(
      2,
      "verification-resend:ip:abc",
      RESEND_IP_LIMIT,
      RESEND_WINDOW_MS,
    );
    expect([RESEND_USER_LIMIT, RESEND_IP_LIMIT, RESEND_WINDOW_MS]).toEqual([
      3, 10, 3_600_000,
    ]);
    expect(calls).toEqual(["hit", "hit", "flush", "send", "invalidate"]);
    const options = emailSender.send.mock.calls[0]?.[1];
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(VERIFICATION_SEND_TIMEOUT_MS).toBe(5000);
  });

  it("answers 409 ALREADY_VERIFIED before spending any counter", async () => {
    const { rateLimiter, emailSender, service } = setup();

    const error = await service
      .resend({ ...recipient, emailVerifiedAt: NOW }, "k")
      .catch((e: unknown) => e);

    expect((error as AppError).status).toBe(409);
    expect((error as AppError).code).toBe("ALREADY_VERIFIED");
    expect((error as AppError).message).toBe(ALREADY_VERIFIED_MESSAGE);
    expect(rateLimiter.hit).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it("stops at the account limit before the address counter and before any work", async () => {
    const { rateLimiter, em, service } = setup({
      hitError: new TooManyRequestsError("limit"),
    });

    await expect(service.resend(unverified, "k")).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
    });

    expect(rateLimiter.hit).toHaveBeenCalledOnce();
    expect(em.create).not.toHaveBeenCalled();
  });

  it("stops at the address limit before any work", async () => {
    const { rateLimiter, em, service } = setup();
    rateLimiter.hit
      .mockResolvedValueOnce({ count: 1, retryAfterSeconds: 1 })
      .mockRejectedValueOnce(new TooManyRequestsError("limit"));

    await expect(service.resend(unverified, "k")).rejects.toMatchObject({
      status: 429,
    });

    expect(rateLimiter.hit).toHaveBeenCalledTimes(2);
    expect(em.create).not.toHaveBeenCalled();
  });

  it("keeps the counters and answers 502 when the send fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { rateLimiter, service } = setup({ sendError: new Error("down") });

    await expect(service.resend(unverified, "k")).rejects.toMatchObject({
      status: 502,
      code: "EMAIL_SEND_FAILED",
    });

    expect(rateLimiter.hit).toHaveBeenCalledTimes(2);
  });
});

describe("EmailVerificationService.confirm", () => {
  it("consumes the token conditionally and sets emailVerifiedAt in one transaction through tx", async () => {
    const { em, tx, service } = setup({ consumed: [{ user_id: "user-1" }] });

    await expect(service.confirm("raw-token")).resolves.toEqual({
      userId: "user-1",
    });

    expect(tx.execute).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(
        /update email_verification_tokens set used_at = \?[\s\S]*used_at is null and expires_at > \?[\s\S]*returning user_id/,
      ),
      [NOW, hashOpaqueToken("raw-token"), NOW],
      "all",
    );
    expect(tx.nativeUpdate).toHaveBeenCalledExactlyOnceWith(
      User,
      { id: "user-1", emailVerifiedAt: null },
      { emailVerifiedAt: NOW },
    );
    expect(em.nativeUpdate).not.toHaveBeenCalled();
  });

  it("answers 400 INVALID_TOKEN for an unknown, expired or used token and writes nothing", async () => {
    const { tx, service } = setup({ consumed: [] });

    const error = await service.confirm("nope").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe("INVALID_TOKEN");
    expect((error as ValidationError).message).toBe(INVALID_TOKEN_MESSAGE);
    expect(tx.nativeUpdate).not.toHaveBeenCalled();
  });
});
