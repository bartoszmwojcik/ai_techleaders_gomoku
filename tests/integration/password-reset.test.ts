// Password reset on a real PostgreSQL: the service runs against the container database and
// mails through the file outbox; confirmation, limits, races and rollback are checked there.
import {
  Session,
  User,
  PasswordResetToken,
  createOrm,
  type Orm,
} from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { hashOpaqueToken } from "../../packages/app/src/server/http/opaque-token";
import { PasswordHasher } from "../../packages/app/src/server/services/auth/password-hasher";
import { createInvalidateResetTokens } from "../../packages/app/src/server/services/auth/invalidate-reset-tokens";
import { PasswordResetService } from "../../packages/app/src/server/services/auth/password-reset-service";
import { SessionService } from "../../packages/app/src/server/services/auth/session-service";
import { UserService } from "../../packages/app/src/server/services/auth/user-service";
import type { EmailSender } from "../../packages/app/src/server/services/email/email-sender";
import { FileEmailSender } from "../../packages/app/src/server/services/email/file-email-sender";
import { RateLimiter } from "../../packages/app/src/server/services/rate-limit/rate-limiter";
import { waitForMessages, type OutboxMessage } from "./outbox";

const baseUrl = inject("baseUrl");
const outbox = inject("emailOutboxPath");
const passwordHasher = new PasswordHasher({ passwordHashCost: 4 });
const invalidateResetTokens = createInvalidateResetTokens({
  clock: { now: () => new Date() },
});
const OLD_PASSWORD = "secret123";
const NEW_PASSWORD = "brand-new-pass1";
let orm: Orm;
let counter = 0;

beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await orm.close();
});

async function createUser(verified = true) {
  const n = `${Date.now().toString(36)}${++counter}`;
  const em = orm.em.fork();
  const user = em.create(User, {
    email: `reset-${n}@example.com`,
    displayName: `Reset_${n}`,
    displayNameKey: `reset_${n}`,
    passwordHash: await passwordHasher.hash(OLD_PASSWORD),
    emailVerifiedAt: verified ? new Date() : null,
  });
  await em.flush();
  await new SessionService({ em, hasActiveGame: async () => false }).create(
    user.id,
  );
  return { id: user.id, email: user.email };
}

function reset(
  options: {
    emailSender?: EmailSender;
    emailDailyLimit?: number;
    em?: ReturnType<Orm["em"]["fork"]>;
  } = {},
) {
  const em = options.em ?? orm.em.fork();
  const sessionService = new SessionService({
    em,
    hasActiveGame: async () => false,
  });
  const service = new PasswordResetService({
    em,
    emailSender:
      options.emailSender ??
      new FileEmailSender({
        outboxPath: outbox,
        from: "Gomoku",
        clock: { now: () => new Date() },
      }),
    passwordHasher,
    sessionService,
    invalidateResetTokens,
    clock: { now: () => new Date() },
    serverConfig: {
      appOrigin: baseUrl,
      emailDailyLimit: options.emailDailyLimit,
    } as never,
    rateLimiter: new RateLimiter({ em }),
  });
  return { em, service, sessionService };
}

const tokenOf = (message: Pick<OutboxMessage, "text">): string => {
  const link = /https?:\/\/\S+\/reset-password\?\S+/.exec(
    message.text,
  )?.[0] as string;
  return new URL(link).searchParams.get("token") as string;
};

const tokenRows = (userId: string) =>
  orm.em.fork().find(PasswordResetToken, { user: userId });

/** Requests a reset that is expected to be mailed and returns the raw token. */
async function requestAndRead(email: string, nth = 1) {
  await reset().service.request(email);
  const messages = await waitForMessages(outbox, email, nth);
  return tokenOf(messages[nth - 1]!);
}

describe("password reset on PostgreSQL", () => {
  it("mails a link to a confirmed account and stores only the hash", async () => {
    const user = await createUser();

    await reset().service.request(user.email);

    const [message] = await waitForMessages(outbox, user.email);
    expect(message!.subject).toBe("Reset hasła w Gomoku");
    expect(message!.text).toContain(`${baseUrl}/reset-password?token=`);
    expect(message!.text).toContain("zignoruj");
    const rows = await tokenRows(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashOpaqueToken(tokenOf(message!)));
    expect(rows[0]!.expiresAt.getTime() - rows[0]!.createdAt.getTime()).toBe(
      3_600_000,
    );
  });

  it("an unconfirmed or unknown address gets nothing and the service answers the same", async () => {
    const unconfirmed = await createUser(false);
    const sent: string[] = [];
    const emailSender: EmailSender = {
      send: async (m) => void sent.push(m.to),
    };

    const results = await Promise.all([
      reset({ emailSender }).service.request(unconfirmed.email),
      reset({ emailSender }).service.request("nobody-here@example.com"),
    ]);

    expect(results).toEqual([undefined, undefined]);
    expect(sent).toEqual([]);
    expect(await tokenRows(unconfirmed.id)).toHaveLength(0);
    expect(
      await orm.em.fork().count(PasswordResetToken, {
        user: { email: "nobody-here@example.com" },
      }),
    ).toBe(0);
  });

  it("limits to 3 messages per hour; the fourth is not sent and the old link stays valid", async () => {
    const user = await createUser();
    const sent: string[] = [];
    const emailSender: EmailSender = {
      send: async (m) => void sent.push(m.text),
    };
    for (let i = 0; i < 4; i++) {
      await reset({ emailSender }).service.request(user.email);
    }

    expect(sent).toHaveLength(3);
    const rows = await tokenRows(user.id);
    expect(rows).toHaveLength(3);
    const newest = tokenOf({ text: sent[2]! });
    await expect(
      reset().service.confirm(newest, NEW_PASSWORD),
    ).resolves.toBeUndefined();
  });

  it("a failed send leaves no token and keeps the previous link valid", async () => {
    const user = await createUser();
    const first = await requestAndRead(user.email);

    await reset({
      emailSender: {
        send: async () => {
          throw new Error("smtp down");
        },
      },
    }).service.request(user.email);

    expect(await tokenRows(user.id)).toHaveLength(1);
    await expect(
      reset().service.confirm(first, NEW_PASSWORD),
    ).resolves.toBeUndefined();
  });

  it("a newer link invalidates the older one; parallel requests keep the newest valid", async () => {
    const user = await createUser();
    const first = await requestAndRead(user.email);
    const sent: string[] = [];
    const emailSender: EmailSender = {
      send: async (m) => {
        await new Promise((resolveWait) => setTimeout(resolveWait, 50));
        sent.push(m.text);
      },
    };
    await Promise.all([
      reset({ emailSender }).service.request(user.email),
      reset({ emailSender }).service.request(user.email),
    ]);

    expect(sent).toHaveLength(2);
    const rows = await tokenRows(user.id);
    const newest = [...rows]
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .at(-1)!;
    expect(newest.usedAt).toBeNull();
    await expect(
      reset().service.confirm(first, NEW_PASSWORD),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    const newestToken = sent
      .map((text) => tokenOf({ text }))
      .find((t) => hashOpaqueToken(t) === newest.tokenHash)!;
    await expect(
      reset().service.confirm(newestToken, NEW_PASSWORD),
    ).resolves.toBeUndefined();
  });

  it("the daily pool for reset is separate and caps the sends", async () => {
    const limiter = new RateLimiter({ em: orm.em.fork() });
    await limiter.reset("email-daily:reset");
    const a = await createUser();
    const b = await createUser();
    const sent: string[] = [];
    const emailSender: EmailSender = {
      send: async (m) => void sent.push(m.to),
    };

    await reset({ emailSender, emailDailyLimit: 1 }).service.request(a.email);
    await reset({ emailSender, emailDailyLimit: 1 }).service.request(b.email);

    expect(sent).toEqual([a.email]);
    await limiter.reset("email-daily:reset");
  });

  it("confirm sets the new password, deletes all sessions and uses the token once", async () => {
    const user = await createUser();
    await new SessionService({
      em: orm.em.fork(),
      hasActiveGame: async () => true,
    }).create(user.id);
    expect(await orm.em.fork().count(Session, { user: user.id })).toBe(2);
    const token = await requestAndRead(user.email);

    await reset().service.confirm(token, NEW_PASSWORD);

    const stored = await orm.em.fork().findOneOrFail(User, { id: user.id });
    expect(await passwordHasher.verify(OLD_PASSWORD, stored.passwordHash)).toBe(
      false,
    );
    expect(await passwordHasher.verify(NEW_PASSWORD, stored.passwordHash)).toBe(
      true,
    );
    expect(stored.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await orm.em.fork().count(Session, { user: user.id })).toBe(0);
    await expect(
      reset().service.confirm(token, "another-pass12"),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_TOKEN" });
  });

  it("rejects unknown and expired tokens and leaves the password", async () => {
    const user = await createUser();
    const token = await requestAndRead(user.email);
    await orm.em
      .fork()
      .nativeUpdate(
        PasswordResetToken,
        { user: user.id },
        { expiresAt: new Date(Date.now() - 1000) },
      );

    await expect(
      reset().service.confirm(token, NEW_PASSWORD),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await expect(
      reset().service.confirm("not-a-token", NEW_PASSWORD),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    const stored = await orm.em.fork().findOneOrFail(User, { id: user.id });
    expect(await passwordHasher.verify(OLD_PASSWORD, stored.passwordHash)).toBe(
      true,
    );
  });

  it("does not accept a token once the account's e-mail is no longer confirmed, and leaves it unused", async () => {
    const user = await createUser();
    const token = await requestAndRead(user.email);
    await orm.em
      .fork()
      .nativeUpdate(User, { id: user.id }, { emailVerifiedAt: null });

    await expect(
      reset().service.confirm(token, NEW_PASSWORD),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_TOKEN" });
    const [row] = await tokenRows(user.id);
    expect(row?.usedAt).toBeNull();
    const stored = await orm.em.fork().findOneOrFail(User, { id: user.id });
    expect(await passwordHasher.verify(OLD_PASSWORD, stored.passwordHash)).toBe(
      true,
    );

    await orm.em
      .fork()
      .nativeUpdate(User, { id: user.id }, { emailVerifiedAt: new Date() });
    await expect(
      reset().service.confirm(token, NEW_PASSWORD),
    ).resolves.toBeUndefined();
  });

  it("lets exactly one of parallel confirmations win", async () => {
    const user = await createUser();
    const token = await requestAndRead(user.email);

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        reset().service.confirm(token, NEW_PASSWORD),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason).toMatchObject({ code: "INVALID_TOKEN" });
      }
    }
  });

  it("confirm also invalidates the user's other unused reset tokens", async () => {
    const user = await createUser();
    const token = await requestAndRead(user.email);
    const em = orm.em.fork();
    em.create(PasswordResetToken, {
      user: em.getReference(User, user.id),
      tokenHash: hashOpaqueToken("spare-token"),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    await em.flush();

    await reset().service.confirm(token, NEW_PASSWORD);

    await expect(
      reset().service.confirm("spare-token", NEW_PASSWORD),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    expect(
      await orm.em.fork().count(PasswordResetToken, {
        user: user.id,
        usedAt: null,
      }),
    ).toBe(0);
  });

  it("rolls everything back when a later step fails (tx is used)", async () => {
    const user = await createUser();
    const token = await requestAndRead(user.email);
    const failing = reset();
    failing.sessionService.revokeAll = async () => {
      throw new Error("forced revoke failure");
    };
    const service = new PasswordResetService({
      em: failing.em,
      emailSender: { send: async () => {} },
      passwordHasher,
      sessionService: failing.sessionService,
      invalidateResetTokens,
      clock: { now: () => new Date() },
      serverConfig: {} as never,
      rateLimiter: {} as never,
    });

    await expect(service.confirm(token, NEW_PASSWORD)).rejects.toThrow(
      "forced revoke failure",
    );

    const stored = await orm.em.fork().findOneOrFail(User, { id: user.id });
    expect(await passwordHasher.verify(OLD_PASSWORD, stored.passwordHash)).toBe(
      true,
    );
    expect(await orm.em.fork().count(Session, { user: user.id })).toBe(1);
    // The consumption was rolled back too: the link still works.
    await expect(
      reset().service.confirm(token, NEW_PASSWORD),
    ).resolves.toBeUndefined();
  });

  it("changePassword invalidates the reset link", async () => {
    const user = await createUser();
    const token = await requestAndRead(user.email);
    const em = orm.em.fork();
    const sessionService = new SessionService({
      em,
      hasActiveGame: async () => false,
    });
    const session = await em.findOneOrFail(Session, { user: user.id });
    const userService = new UserService({
      em,
      passwordHasher,
      sessionService,
      invalidateResetTokens,
      emailVerificationService: {} as never,
    });

    await userService.changePassword(
      user.id,
      session.id,
      OLD_PASSWORD,
      "changed-pass123",
    );

    await expect(
      reset().service.confirm(token, NEW_PASSWORD),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });
});
