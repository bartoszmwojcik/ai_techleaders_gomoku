// E-mail verification on a real PostgreSQL: registration over HTTP delivers the link to the
// file outbox; confirmation, expiry, parallel use, rollback and the daily limit run through
// the service against the container database.
import { AppError } from "@gomoku/core";
import { EmailVerificationToken, User, createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";

import { hashOpaqueToken } from "../../packages/app/src/server/http/opaque-token";
import { EmailVerificationService } from "../../packages/app/src/server/services/auth/email-verification-service";
import { PasswordHasher } from "../../packages/app/src/server/services/auth/password-hasher";
import { SessionService } from "../../packages/app/src/server/services/auth/session-service";
import { UserService } from "../../packages/app/src/server/services/auth/user-service";
import type { EmailSender } from "../../packages/app/src/server/services/email/email-sender";
import { RateLimiter } from "../../packages/app/src/server/services/rate-limit/rate-limiter";
import { verificationLink, waitForMessages } from "./outbox";

const baseUrl = inject("baseUrl");
const outbox = inject("emailOutboxPath");
let orm: Orm;
let counter = 0;
const uniqueUser = () => {
  const n = `${Date.now().toString(36)}${++counter}`;
  return {
    email: `ver-${n}@example.com`,
    displayName: `Ver_${n}`,
    password: "secret123",
  };
};

beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await orm.close();
});

function verification(
  options: {
    emailSender?: EmailSender;
    emailDailyLimit?: number;
    em?: ReturnType<Orm["em"]["fork"]>;
  } = {},
) {
  const em = options.em ?? orm.em.fork();
  const service = new EmailVerificationService({
    em,
    emailSender: options.emailSender ?? { send: async () => {} },
    clock: { now: () => new Date() },
    serverConfig: {
      appOrigin: baseUrl,
      emailDailyLimit: options.emailDailyLimit,
    } as never,
    rateLimiter: new RateLimiter({ em }),
  });
  return { em, service };
}

/** Registers over HTTP (the real server, file transport) and returns the mailed token. */
async function registerOverHttp() {
  const user = uniqueUser();
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      "x-gomoku-request": "1",
      "x-forwarded-for": `203.0.113.${(counter % 250) + 1}`,
    },
    body: JSON.stringify(user),
  });
  expect(response.status).toBe(201);
  const { data } = (await response.json()) as {
    data: { user: { id: string } };
  };
  const [message] = await waitForMessages(outbox, user.email);
  return {
    user,
    userId: data.user.id,
    message: message!,
    ...verificationLink(message!),
  };
}

const verifiedAt = async (userId: string) =>
  (await orm.em.fork().findOneOrFail(User, { id: userId })).emailVerifiedAt;

describe("e-mail verification on PostgreSQL", () => {
  it("registration mails a link; confirming it sets emailVerifiedAt, once", async () => {
    const { userId, message, link, token } = await registerOverHttp();

    expect(link.startsWith(`${baseUrl}/verify-email?token=`)).toBe(true);
    expect(message.subject).toContain("Potwierdź");
    expect(message.text).toContain("zignoruj");
    expect(await verifiedAt(userId)).toBeNull();
    // Only the hash is stored.
    const rows = await orm.em
      .fork()
      .find(EmailVerificationToken, { user: userId });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]!.tokenHash).not.toBe(token);

    await expect(verification().service.confirm(token)).resolves.toEqual({
      userId,
    });
    expect(await verifiedAt(userId)).toBeInstanceOf(Date);

    // A used token is INVALID_TOKEN, always (Q11).
    await expect(verification().service.confirm(token)).rejects.toMatchObject({
      status: 400,
      code: "INVALID_TOKEN",
    });
  });

  it("rejects an unknown token", async () => {
    await expect(
      verification().service.confirm("definitely-not-a-token"),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("rejects an expired token and leaves the account unconfirmed", async () => {
    const { userId, token } = await registerOverHttp();
    await orm.em
      .fork()
      .nativeUpdate(
        EmailVerificationToken,
        { user: userId },
        { expiresAt: new Date(Date.now() - 1000) },
      );

    await expect(verification().service.confirm(token)).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
    expect(await verifiedAt(userId)).toBeNull();
  });

  it("lets exactly one of parallel confirmations win", async () => {
    const { userId, token } = await registerOverHttp();

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => verification().service.confirm(token)),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason).toMatchObject({ code: "INVALID_TOKEN" });
      }
    }
    expect(await verifiedAt(userId)).toBeInstanceOf(Date);
  });

  it("rolls the token consumption back when setting emailVerifiedAt fails (tx is used)", async () => {
    const { userId, token } = await registerOverHttp();
    const { em } = verification();
    const realTransactional = em.transactional.bind(em);
    vi.spyOn(em, "transactional").mockImplementation(((
      work: (tx: never) => unknown,
    ) =>
      realTransactional(async (tx) => {
        const failing = new Proxy(tx, {
          get(target, property) {
            if (property === "nativeUpdate") {
              return async () => {
                throw new Error("forced user update failure");
              };
            }
            const value = Reflect.get(target, property, target) as unknown;
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        return work(failing as never);
      })) as never);
    const { service } = verification({ em });

    await expect(service.confirm(token)).rejects.toThrow(
      "forced user update failure",
    );

    expect(await verifiedAt(userId)).toBeNull();
    // The token is still usable: the consumption was rolled back with the rest.
    await expect(verification().service.confirm(token)).resolves.toEqual({
      userId,
    });
  });

  it("a new link invalidates the old one only after a successful send", async () => {
    const { userId, token: first } = await registerOverHttp();
    const recipient = { id: userId, email: "x@example.com", displayName: "X" };

    const failing = verification({
      emailSender: {
        send: async () => {
          throw new Error("smtp down");
        },
      },
    });
    await expect(failing.service.issue(recipient)).rejects.toMatchObject({
      code: "EMAIL_SEND_FAILED",
    });
    // The failed attempt neither left a token nor invalidated the first link.
    expect(
      await orm.em.fork().count(EmailVerificationToken, { user: userId }),
    ).toBe(1);

    const sent: string[] = [];
    await verification({
      emailSender: { send: async (m) => void sent.push(m.text) },
    }).service.issue(recipient);
    const second = verificationLink({ text: sent[0]! } as never).token;

    await expect(verification().service.confirm(first)).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
    await expect(verification().service.confirm(second)).resolves.toEqual({
      userId,
    });
  });

  it("parallel issues never kill each other: the newest link stays valid", async () => {
    const { userId, token: registered } = await registerOverHttp();
    const recipient = { id: userId, email: "p@example.com", displayName: "P" };
    const sent: string[] = [];
    const emailSender: EmailSender = {
      send: async (m) => {
        // Both sends overlap in time, as with two simultaneous resend requests.
        await new Promise((resolveWait) => setTimeout(resolveWait, 50));
        sent.push(m.text);
      },
    };

    await Promise.all([
      verification({ emailSender }).service.issue(recipient),
      verification({ emailSender }).service.issue(recipient),
    ]);

    expect(sent).toHaveLength(2);
    const tokens = sent.map(
      (text) => verificationLink({ text } as never).token,
    );
    const rows = await orm.em
      .fork()
      .find(EmailVerificationToken, { user: userId });
    expect(rows).toHaveLength(3);
    const byCreated = [...rows].sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
    // Only the newest token must be unused; older ones may be invalidated.
    expect(byCreated.at(-1)!.usedAt).toBeNull();
    const live = rows.filter((row) => row.usedAt === null);
    expect(live.length).toBeGreaterThanOrEqual(1);
    const unusedHashes = new Set(live.map((row) => row.tokenHash));
    const newestToken = tokens.find(
      (t) => byCreated.at(-1)!.tokenHash === hashOpaqueToken(t),
    );
    expect(newestToken).toBeDefined();
    expect(unusedHashes.has(hashOpaqueToken(newestToken!))).toBe(true);
    // The registration token is older than both and has been invalidated.
    await expect(
      verification().service.confirm(registered),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await expect(verification().service.confirm(newestToken!)).resolves.toEqual(
      {
        userId,
      },
    );
  });

  it("an already confirmed account keeps its timestamp and the token is consumed", async () => {
    const { userId, token } = await registerOverHttp();
    const earlier = new Date("2026-01-01T00:00:00.000Z");
    await orm.em
      .fork()
      .nativeUpdate(User, { id: userId }, { emailVerifiedAt: earlier });

    await expect(verification().service.confirm(token)).resolves.toEqual({
      userId,
    });

    expect((await verifiedAt(userId))?.toISOString()).toBe(
      earlier.toISOString(),
    );
    await expect(verification().service.confirm(token)).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it("deleting the user removes its tokens (cascade)", async () => {
    const { userId } = await registerOverHttp();
    await orm.em.fork().nativeDelete(User, { id: userId });
    expect(
      await orm.em.fork().count(EmailVerificationToken, { user: userId }),
    ).toBe(0);
  });

  it("a failing send does not break the registration", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const em = orm.em.fork();
    const userService = new UserService({
      em,
      passwordHasher: new PasswordHasher({ passwordHashCost: 4 }),
      sessionService: new SessionService({
        em,
        hasActiveGame: async () => false,
      }),
      invalidateResetTokens: async () => {},
      emailVerificationService: verification({
        em,
        emailSender: {
          send: async () => {
            throw new Error("smtp down for secret@example.com");
          },
        },
      }).service,
    });
    const input = uniqueUser();

    const { user } = await userService.register(input);

    expect(await orm.em.fork().count(User, { id: user.id })).toBe(1);
    expect(
      await orm.em.fork().count(EmailVerificationToken, { user: user.id }),
    ).toBe(0);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "example.com",
    );
    consoleError.mockRestore();
  });

  it("stops sending once the verification share of the daily limit is used", async () => {
    const { userId } = await registerOverHttp();
    const recipient = { id: userId, email: "q@example.com", displayName: "Q" };
    // limit 2 -> 70% = 1 send per day for verification.
    await verification({ emailDailyLimit: 2 }).service.issue(recipient);

    const error = await verification({ emailDailyLimit: 2 })
      .service.issue(recipient)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 503, code: "EMAIL_QUOTA_EXCEEDED" });
  });
});
