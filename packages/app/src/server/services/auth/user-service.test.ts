import {
  AppError,
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from "@gomoku/core";
import {
  UniqueConstraintViolationException,
  User,
  type EntityManager,
} from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import type { EmailVerificationService } from "./email-verification-service";
import type { PasswordHasher } from "./password-hasher";
import type { SessionService } from "./session-service";
import {
  DISPLAY_NAME_TAKEN_MESSAGE,
  EMAIL_TAKEN_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  INVALID_CURRENT_PASSWORD_MESSAGE,
  UserService,
  VERIFICATION_SEND_TIMEOUT_MS,
} from "./user-service";

const input = {
  email: "ala@example.com",
  displayName: "Łukasz_7",
  password: "secret123",
};

function uniqueViolation(constraint: string) {
  const error = new UniqueConstraintViolationException(new Error("dup"));
  Object.assign(error, { constraint });
  return error;
}

function setup(options: { flushError?: unknown; emailCount?: number } = {}) {
  const calls: string[] = [];
  // The transaction's em differs from the injected one, like in MikroORM 7 (the fork has
  // `useContext = false`): only writes through `tx` are part of the transaction.
  const tx = {
    create: vi.fn((_entity: unknown, data: object) => ({
      id: "user-1",
      ...data,
    })),
    flush: vi.fn(async () => {
      calls.push("flush");
      if (options.flushError) throw options.flushError;
    }),
  };
  const em = {
    create: vi.fn(),
    flush: vi.fn(),
    clear: vi.fn(() => calls.push("clear")),
    transactional: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
      calls.push("begin");
      try {
        return await work(tx);
      } finally {
        calls.push("end");
      }
    }),
    count: vi.fn(async () => options.emailCount ?? 0),
  };
  const passwordHasher = {
    hash: vi.fn(async () => {
      calls.push("hash");
      return "hashed";
    }),
  };
  const session = { token: "tok", expiresAt: new Date("2026-11-26T00:00:00Z") };
  const sessionService = { create: vi.fn(async () => session) };
  const emailVerificationService = {
    issue: vi.fn(async () => {
      calls.push("issue");
    }),
  };
  const service = new UserService({
    em: em as unknown as EntityManager,
    passwordHasher: passwordHasher as unknown as PasswordHasher,
    sessionService: sessionService as unknown as SessionService,
    invalidateResetTokens: vi.fn(async () => undefined),
    emailVerificationService:
      emailVerificationService as unknown as EmailVerificationService,
  });
  return {
    emailVerificationService,
    em,
    tx,
    passwordHasher,
    sessionService,
    service,
    session,
    calls,
  };
}

describe("UserService.register", () => {
  it("hashes first, inserts only the schema fields and starts a session", async () => {
    const { em, tx, sessionService, service, session, calls } = setup();

    const result = await service.register(input);

    expect(calls).toEqual(["hash", "begin", "flush", "end", "issue"]);
    expect(em.create).not.toHaveBeenCalled();
    expect(em.flush).not.toHaveBeenCalled();
    expect(tx.create).toHaveBeenCalledWith(User, {
      email: "ala@example.com",
      displayName: "Łukasz_7",
      displayNameKey: "lukasz7",
      passwordHash: "hashed",
    });
    expect(sessionService.create).toHaveBeenCalledExactlyOnceWith(
      "user-1",
      expect.any(Date),
      tx,
    );
    expect(result).toEqual({
      user: { id: "user-1", displayName: "Łukasz_7" },
      session,
    });
  });

  it("answers a taken e-mail uniformly, without a field", async () => {
    const { service, em, sessionService, passwordHasher } = setup({
      flushError: uniqueViolation("users_email_unique"),
    });

    const error = await service.register(input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toBe(EMAIL_TAKEN_MESSAGE);
    expect((error as ConflictError).fieldErrors).toBeUndefined();
    expect(passwordHasher.hash).toHaveBeenCalledOnce();
    expect(em.clear).toHaveBeenCalledOnce();
    expect(em.count).not.toHaveBeenCalled();
    expect(sessionService.create).not.toHaveBeenCalled();
  });

  it("reports a taken name at the field when the e-mail is free", async () => {
    const { service, em } = setup({
      flushError: uniqueViolation("users_display_name_key_unique"),
    });

    const error = await service.register(input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).fieldErrors).toEqual({
      displayName: [DISPLAY_NAME_TAKEN_MESSAGE],
    });
    expect(em.count).toHaveBeenCalledWith(User, { email: "ala@example.com" });
  });

  it("lets the uniform e-mail answer win when both are taken", async () => {
    const { service } = setup({
      flushError: uniqueViolation("users_display_name_key_unique"),
      emailCount: 1,
    });

    const error = await service.register(input).catch((e: unknown) => e);

    expect((error as ConflictError).message).toBe(EMAIL_TAKEN_MESSAGE);
    expect((error as ConflictError).fieldErrors).toBeUndefined();
  });

  it("treats an unknown unique constraint as the uniform conflict", async () => {
    const { service } = setup({ flushError: uniqueViolation("other") });
    const error = await service.register(input).catch((e: unknown) => e);
    expect((error as ConflictError).message).toBe(EMAIL_TAKEN_MESSAGE);
  });

  it("creates the user and the session in one transaction", async () => {
    const { sessionService, service, calls } = setup();
    sessionService.create.mockImplementation(async () => {
      calls.push("session");
      return { token: "tok", expiresAt: new Date() };
    });

    await service.register(input);

    expect(calls).toEqual([
      "hash",
      "begin",
      "flush",
      "session",
      "end",
      "issue",
    ]);
  });

  it("propagates a session failure so the transaction rolls back the account", async () => {
    const failure = new Error("session insert failed");
    const { sessionService, service, calls } = setup();
    sessionService.create.mockRejectedValue(failure);

    await expect(service.register(input)).rejects.toBe(failure);
    expect(calls).toEqual(["hash", "begin", "flush", "end"]);
  });

  it("rethrows other database errors", async () => {
    const failure = new Error("connection lost");
    const { service } = setup({ flushError: failure });
    await expect(service.register(input)).rejects.toBe(failure);
  });

  it("issues the confirmation link after the commit, with the registered address", async () => {
    const { emailVerificationService, service } = setup();

    await service.register(input);

    expect(emailVerificationService.issue).toHaveBeenCalledExactlyOnceWith(
      { id: "user-1", displayName: "Łukasz_7", email: "ala@example.com" },
      undefined,
      { signal: expect.any(AbortSignal) },
    );
  });

  it("does not issue a link when the registration fails", async () => {
    const { emailVerificationService, service } = setup({
      flushError: uniqueViolation("users_email_unique"),
    });
    await service.register(input).catch(() => undefined);
    expect(emailVerificationService.issue).not.toHaveBeenCalled();
  });

  it("still registers when sending fails and logs only the error class and code", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { emailVerificationService, service, session } = setup();
    emailVerificationService.issue.mockRejectedValue(
      Object.assign(new Error("boom ala@example.com"), { code: "ECONNRESET" }),
    );

    const result = await service.register(input);

    expect(result.session).toBe(session);
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "Verification e-mail not sent",
      { name: "Error", code: "ECONNRESET" },
    );
    consoleError.mockRestore();
  });
});

describe("UserService.register verification timeout", () => {
  it("bounds the send with a timeout signal", async () => {
    const { emailVerificationService, service } = setup();
    await service.register(input);
    const options = (
      emailVerificationService.issue.mock.calls as unknown[][]
    )[0]![2] as {
      signal: AbortSignal;
    };
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);
    expect(VERIFICATION_SEND_TIMEOUT_MS).toBe(5000);
  });

  it("still registers on a timeout and logs only the error class and domain code", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { emailVerificationService, service, session } = setup();
    emailVerificationService.issue.mockRejectedValue(
      new AppError(502, "EMAIL_SEND_FAILED", "timeout for ala@example.com"),
    );

    const result = await service.register(input);

    expect(result.session).toBe(session);
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "Verification e-mail not sent",
      { name: "AppError", code: "EMAIL_SEND_FAILED" },
    );
    consoleError.mockRestore();
  });
});

describe("UserService.authenticate", () => {
  function authSetup(user: object | null, matches: boolean) {
    const em = { findOne: vi.fn(async () => user) };
    const passwordHasher = {
      dummyHash: Promise.resolve("dummy-hash"),
      verify: vi.fn(async () => matches),
    };
    const sessionService = { create: vi.fn() };
    const service = new UserService({
      em: em as unknown as EntityManager,
      passwordHasher: passwordHasher as unknown as PasswordHasher,
      sessionService: sessionService as unknown as SessionService,
      invalidateResetTokens: vi.fn(async () => undefined),
      emailVerificationService: {} as unknown as EmailVerificationService,
    });
    return { em, passwordHasher, sessionService, service };
  }
  const stored = {
    id: "user-1",
    displayName: "Ala",
    passwordHash: "stored-hash",
    emailVerifiedAt: null,
  };

  it("returns the user for correct credentials, looked up by the normalized e-mail", async () => {
    const { em, passwordHasher, sessionService, service } = authSetup(
      stored,
      true,
    );

    const result = await service.authenticate(
      "  ALA@Example.com ",
      "secret123",
    );

    expect(result).toEqual({ id: "user-1", displayName: "Ala" });
    expect(em.findOne).toHaveBeenCalledWith(User, { email: "ala@example.com" });
    expect(passwordHasher.verify).toHaveBeenCalledWith(
      "secret123",
      "stored-hash",
    );
    expect(sessionService.create).not.toHaveBeenCalled();
  });

  it("accepts an account with an unconfirmed e-mail (BR-26)", async () => {
    const { service } = authSetup({ ...stored, emailVerifiedAt: null }, true);
    await expect(service.authenticate("ala@example.com", "x")).resolves.toEqual(
      {
        id: "user-1",
        displayName: "Ala",
      },
    );
  });

  it("rejects a wrong password", async () => {
    const { service } = authSetup(stored, false);
    const error = await service
      .authenticate("ala@example.com", "wrong")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect((error as UnauthorizedError).code).toBe("INVALID_CREDENTIALS");
    expect((error as UnauthorizedError).message).toBe(
      INVALID_CREDENTIALS_MESSAGE,
    );
  });

  it("verifies against the dummy hash for an unknown e-mail and rejects identically", async () => {
    const { passwordHasher, service } = authSetup(null, false);

    const error = await service
      .authenticate("nobody@example.com", "secret123")
      .catch((e: unknown) => e);

    expect(passwordHasher.verify).toHaveBeenCalledWith(
      "secret123",
      "dummy-hash",
    );
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect((error as UnauthorizedError).message).toBe(
      INVALID_CREDENTIALS_MESSAGE,
    );
  });

  it("rejects an unknown e-mail even if the dummy comparison were to succeed", async () => {
    const { service } = authSetup(null, true);
    await expect(
      service.authenticate("nobody@example.com", "x"),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("UserService.changePassword", () => {
  function changeSetup(
    options: { user?: object | null; matches?: boolean; updated?: number } = {},
  ) {
    const calls: string[] = [];
    const user =
      options.user === undefined
        ? { id: "user-1", passwordHash: "old-hash" }
        : options.user;
    // Differs from the injected `em`: only writes through `tx` are transactional.
    const tx = {
      nativeUpdate: vi.fn(async () => {
        calls.push("update");
        return options.updated ?? 1;
      }),
    };
    const em = {
      findOne: vi.fn(async () => user),
      nativeUpdate: vi.fn(),
      transactional: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
        calls.push("begin");
        try {
          return await work(tx);
        } finally {
          calls.push("end");
        }
      }),
    };
    const passwordHasher = {
      verify: vi.fn(async () => {
        calls.push("verify");
        return options.matches ?? true;
      }),
      hash: vi.fn(async () => {
        calls.push("hash");
        return "new-hash";
      }),
    };
    const sessionService = {
      revokeOthers: vi.fn(async () => {
        calls.push("revokeOthers");
        return 2;
      }),
    };
    const invalidateResetTokens = vi.fn(async () => {
      calls.push("invalidateResetTokens");
    });
    const service = new UserService({
      em: em as unknown as EntityManager,
      passwordHasher: passwordHasher as unknown as PasswordHasher,
      sessionService: sessionService as unknown as SessionService,
      invalidateResetTokens,
      emailVerificationService: {} as unknown as EmailVerificationService,
    });
    return {
      em,
      tx,
      passwordHasher,
      sessionService,
      invalidateResetTokens,
      service,
      calls,
    };
  }

  it("verifies, hashes, then updates conditionally and revokes others in one transaction", async () => {
    const { em, tx, sessionService, invalidateResetTokens, service, calls } =
      changeSetup();

    await expect(
      service.changePassword("user-1", "sess-1", "old-pass", "new-pass-1"),
    ).resolves.toBeUndefined();

    expect(em.findOne).toHaveBeenCalledWith(User, { id: "user-1" });
    expect(em.nativeUpdate).not.toHaveBeenCalled();
    expect(tx.nativeUpdate).toHaveBeenCalledExactlyOnceWith(
      User,
      { id: "user-1", passwordHash: "old-hash" },
      { passwordHash: "new-hash" },
    );
    expect(sessionService.revokeOthers).toHaveBeenCalledExactlyOnceWith(
      "user-1",
      "sess-1",
      tx,
    );
    expect(invalidateResetTokens).toHaveBeenCalledExactlyOnceWith("user-1", tx);
    expect(calls).toEqual([
      "verify",
      "hash",
      "begin",
      "update",
      "revokeOthers",
      "invalidateResetTokens",
      "end",
    ]);
  });

  it("rejects a wrong current password before hashing or writing anything", async () => {
    const {
      em,
      passwordHasher,
      sessionService,
      invalidateResetTokens,
      service,
    } = changeSetup({ matches: false });

    const error = await service
      .changePassword("user-1", "sess-1", "wrong", "new-pass-1")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({
      status: 400,
      code: "INVALID_CURRENT_PASSWORD",
      fieldErrors: { currentPassword: [INVALID_CURRENT_PASSWORD_MESSAGE] },
    });
    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(em.transactional).not.toHaveBeenCalled();
    expect(sessionService.revokeOthers).not.toHaveBeenCalled();
    expect(invalidateResetTokens).not.toHaveBeenCalled();
  });

  it("answers INVALID_CURRENT_PASSWORD and revokes nothing when a parallel change won (0 rows)", async () => {
    const { sessionService, invalidateResetTokens, service, calls } =
      changeSetup({ updated: 0 });

    await expect(
      service.changePassword("user-1", "sess-1", "old-pass", "new-pass-1"),
    ).rejects.toMatchObject({
      status: 400,
      code: "INVALID_CURRENT_PASSWORD",
      fieldErrors: { currentPassword: [INVALID_CURRENT_PASSWORD_MESSAGE] },
    });
    expect(sessionService.revokeOthers).not.toHaveBeenCalled();
    expect(invalidateResetTokens).not.toHaveBeenCalled();
    expect(calls.slice(-2)).toEqual(["update", "end"]);
  });

  it("propagates a failure of the later steps (the transaction rolls back)", async () => {
    const failure = new Error("reset tokens failed");
    const { invalidateResetTokens, service } = changeSetup();
    invalidateResetTokens.mockRejectedValue(failure);

    await expect(
      service.changePassword("user-1", "sess-1", "old-pass", "new-pass-1"),
    ).rejects.toBe(failure);
  });

  it("answers 401 when the user no longer exists", async () => {
    const { passwordHasher, service } = changeSetup({ user: null });

    await expect(
      service.changePassword("user-1", "sess-1", "old-pass", "new-pass-1"),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(passwordHasher.verify).not.toHaveBeenCalled();
  });
});
