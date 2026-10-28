// Atomicity on a real PostgreSQL: the callback of `em.transactional` on a request-scoped fork
// must write through its `tx` argument (a fork has `useContext = false`, so the injected em
// is outside the transaction). Mocks cannot show that, so the services run against the
// container database with a forced failure of the second step.
import { Session, User, createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { PasswordHasher } from "../../packages/app/src/server/services/auth/password-hasher";
import { SessionService } from "../../packages/app/src/server/services/auth/session-service";
import {
  UserService,
  type InvalidateResetTokens,
} from "../../packages/app/src/server/services/auth/user-service";

let orm: Orm;
const passwordHasher = new PasswordHasher({ passwordHashCost: 4 });
let counter = 0;
const uniqueInput = () => {
  const n = `${Date.now().toString(36)}${++counter}`;
  return {
    email: `tx-${n}@example.com`,
    displayName: `Tx_${n}`,
    password: "secret123",
  };
};

beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await orm.close();
});

/** Services on a fresh request-scoped fork, like `withRequestScope` builds them. */
function scope(options: {
  failSessionCreate?: boolean;
  invalidateResetTokens?: InvalidateResetTokens;
}) {
  const em = orm.em.fork();
  const real = new SessionService({ em, hasActiveGame: async () => false });
  const sessionService = options.failSessionCreate
    ? Object.assign(Object.create(real), {
        create: async () => {
          throw new Error("forced session failure");
        },
      })
    : real;
  const userService = new UserService({
    em,
    passwordHasher,
    sessionService,
    invalidateResetTokens: options.invalidateResetTokens ?? (async () => {}),
  });
  return { em, sessionService: real, userService };
}

describe("transactions on PostgreSQL", () => {
  it("register: a failing session creation leaves no account", async () => {
    const input = uniqueInput();

    await expect(
      scope({ failSessionCreate: true }).userService.register(input),
    ).rejects.toThrow("forced session failure");

    expect(await orm.em.fork().count(User, { email: input.email })).toBe(0);
  });

  it("register: the happy path stores the account and its session together", async () => {
    const input = uniqueInput();

    const { user } = await scope({}).userService.register(input);

    const em = orm.em.fork();
    expect(await em.count(User, { email: input.email })).toBe(1);
    expect(await em.count(Session, { user: user.id })).toBe(1);
  });

  async function registered() {
    const input = uniqueInput();
    const { user, session } = await scope({}).userService.register(input);
    const em = orm.em.fork();
    const first = await em.findOneOrFail(Session, { user: user.id });
    // A second session that a password change would revoke.
    await scope({}).sessionService.create(user.id);
    expect(await em.count(Session, { user: user.id })).toBe(2);
    return { input, userId: user.id, currentSessionId: first.id, session };
  }

  it("changePassword: a failing invalidateResetTokens keeps the password and the sessions", async () => {
    const { input, userId, currentSessionId } = await registered();
    const before = await orm.em.fork().findOneOrFail(User, { id: userId });

    await expect(
      scope({
        invalidateResetTokens: async () => {
          throw new Error("forced reset tokens failure");
        },
      }).userService.changePassword(
        userId,
        currentSessionId,
        input.password,
        "brand-new-pass1",
      ),
    ).rejects.toThrow("forced reset tokens failure");

    const em = orm.em.fork();
    expect((await em.findOneOrFail(User, { id: userId })).passwordHash).toBe(
      before.passwordHash,
    );
    expect(await em.count(Session, { user: userId })).toBe(2);
  });

  it("changePassword: a failing revokeOthers keeps the password", async () => {
    const { input, userId, currentSessionId } = await registered();
    const before = await orm.em.fork().findOneOrFail(User, { id: userId });
    const failing = scope({});
    failing.sessionService.revokeOthers = async () => {
      throw new Error("forced revoke failure");
    };
    const service = new UserService({
      em: failing.em,
      passwordHasher,
      sessionService: failing.sessionService,
      invalidateResetTokens: async () => {},
    });

    await expect(
      service.changePassword(
        userId,
        currentSessionId,
        input.password,
        "brand-new-pass1",
      ),
    ).rejects.toThrow("forced revoke failure");

    const em = orm.em.fork();
    expect((await em.findOneOrFail(User, { id: userId })).passwordHash).toBe(
      before.passwordHash,
    );
    expect(await em.count(Session, { user: userId })).toBe(2);
  });

  it("changePassword: success replaces the hash and removes only the other sessions", async () => {
    const { input, userId, currentSessionId } = await registered();
    const before = await orm.em.fork().findOneOrFail(User, { id: userId });

    await scope({}).userService.changePassword(
      userId,
      currentSessionId,
      input.password,
      "brand-new-pass1",
    );

    const em = orm.em.fork();
    expect(
      (await em.findOneOrFail(User, { id: userId })).passwordHash,
    ).not.toBe(before.passwordHash);
    const left = await em.find(Session, { user: userId });
    expect(left.map((session) => session.id)).toEqual([currentSessionId]);
  });
});
