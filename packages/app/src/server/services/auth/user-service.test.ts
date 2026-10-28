import { ConflictError, UnauthorizedError } from "@gomoku/core";
import {
  UniqueConstraintViolationException,
  User,
  type EntityManager,
} from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import type { PasswordHasher } from "./password-hasher";
import type { SessionService } from "./session-service";
import {
  DISPLAY_NAME_TAKEN_MESSAGE,
  EMAIL_TAKEN_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  UserService,
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
  const em = {
    create: vi.fn((_entity: unknown, data: object) => ({
      id: "user-1",
      ...data,
    })),
    flush: vi.fn(async () => {
      calls.push("flush");
      if (options.flushError) throw options.flushError;
    }),
    clear: vi.fn(() => calls.push("clear")),
    transactional: vi.fn(async (work: () => Promise<unknown>) => {
      calls.push("begin");
      try {
        return await work();
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
  const service = new UserService({
    em: em as unknown as EntityManager,
    passwordHasher: passwordHasher as unknown as PasswordHasher,
    sessionService: sessionService as unknown as SessionService,
  });
  return { em, passwordHasher, sessionService, service, session, calls };
}

describe("UserService.register", () => {
  it("hashes first, inserts only the schema fields and starts a session", async () => {
    const { em, sessionService, service, session, calls } = setup();

    const result = await service.register(input);

    expect(calls).toEqual(["hash", "begin", "flush", "end"]);
    expect(em.create).toHaveBeenCalledWith(User, {
      email: "ala@example.com",
      displayName: "Łukasz_7",
      displayNameKey: "lukasz7",
      passwordHash: "hashed",
    });
    expect(sessionService.create).toHaveBeenCalledWith("user-1");
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

    expect(calls).toEqual(["hash", "begin", "flush", "session", "end"]);
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
