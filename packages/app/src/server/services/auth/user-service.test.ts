import { ConflictError } from "@gomoku/core";
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

    expect(calls).toEqual(["hash", "flush"]);
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

  it("rethrows other database errors", async () => {
    const failure = new Error("connection lost");
    const { service } = setup({ flushError: failure });
    await expect(service.register(input)).rejects.toBe(failure);
  });
});
