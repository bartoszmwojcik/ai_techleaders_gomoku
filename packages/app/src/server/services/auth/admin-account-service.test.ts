import { ValidationError } from "@gomoku/core";
import { UniqueConstraintViolationException, User, type EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { AdminAccountService } from "./admin-account-service";

const NOW = new Date("2026-11-02T10:00:00Z");

type Options = { existingId?: string; flushErrors?: unknown[]; found?: { display_name: string; created_at: Date | string }[] };

function setup(options: Options = {}) {
  const errors = [...(options.flushErrors ?? [])];
  const tx = {
    execute: vi.fn(async (sql: string) => {
      if (sql.startsWith("select id from users")) return options.existingId ? [{ id: options.existingId }] : [];
      return [];
    }),
    create: vi.fn((_entity: unknown, data: object) => ({ id: "new-1", ...data })),
    flush: vi.fn(async () => {
      const error = errors.shift();
      if (error) throw error;
    }),
  };
  const em = {
    execute: vi.fn(async () => options.found ?? []),
    clear: vi.fn(),
    transactional: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
  };
  const sessionService = { revokeAll: vi.fn(async () => 3) };
  const invalidateResetTokens = vi.fn(async () => undefined);
  const service = new AdminAccountService({
    em: em as unknown as EntityManager,
    sessionService,
    invalidateResetTokens,
    clock: { now: () => NOW },
  });
  return { service, em, tx, sessionService, invalidateResetTokens };
}

const violation = () => new UniqueConstraintViolationException(new Error("dup"));

describe("AdminAccountService.provision", () => {
  it("creates a confirmed account under the normalized e-mail", async () => {
    const { service, tx, sessionService } = setup();

    await expect(
      service.provision({ email: "  Admin@Example.com ", displayName: "Szef_7", passwordHash: "h" }),
    ).resolves.toEqual({ action: "created", userId: "new-1", revokedSessions: 0 });

    expect(tx.execute.mock.calls[0]).toEqual(["select id from users where email = ? for no key update", ["admin@example.com"]]);
    expect(tx.create).toHaveBeenCalledWith(User, {
      email: "admin@example.com",
      displayName: "Szef_7",
      displayNameKey: "szef7",
      passwordHash: "h",
      emailVerifiedAt: NOW,
    });
    expect(sessionService.revokeAll).not.toHaveBeenCalled();
  });

  it("requires a display name to create", async () => {
    const { service, tx } = setup();
    await expect(service.provision({ email: "a@b.pl", passwordHash: "h" })).rejects.toMatchObject({ code: "DISPLAY_NAME_REQUIRED" });
    expect(tx.create).not.toHaveBeenCalled();
  });

  it("takes over an existing account in one transaction and keeps its name", async () => {
    const { service, tx, sessionService, invalidateResetTokens, em } = setup({ existingId: "u-9" });

    await expect(service.provision({ email: "a@b.pl", displayName: "Inna", passwordHash: "new" })).resolves.toEqual({
      action: "taken_over",
      userId: "u-9",
      revokedSessions: 3,
    });

    expect(em.transactional).toHaveBeenCalledOnce();
    expect(tx.create).not.toHaveBeenCalled();
    const sqls = tx.execute.mock.calls.map(([sql]) => sql.split(" ").slice(0, 3).join(" "));
    expect(sqls).toEqual(["select id from", "update users set", "delete from email_verification_tokens"]);
    expect(tx.execute.mock.calls[1]).toEqual([expect.stringContaining("coalesce(email_verified_at, ?)"), ["new", NOW, "u-9"], "run"]);
    // Everything goes through tx, never the injected em.
    expect(sessionService.revokeAll).toHaveBeenCalledWith("u-9", tx);
    expect(invalidateResetTokens).toHaveBeenCalledWith("u-9", tx);
  });

  it("retries once after losing a unique index race", async () => {
    const { service, em, tx } = setup({ flushErrors: [violation()] });
    await expect(service.provision({ email: "a@b.pl", displayName: "Szef", passwordHash: "h" })).resolves.toMatchObject({
      action: "created",
    });
    expect(em.clear).toHaveBeenCalledOnce();
    expect(tx.flush).toHaveBeenCalledTimes(2);
  });

  it("reports a taken name after the retry failed too", async () => {
    const { service } = setup({ flushErrors: [violation(), violation()] });
    const error = await service
      .provision({ email: "a@b.pl", displayName: "Szef", passwordHash: "h" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ code: "DISPLAY_NAME_TAKEN" });
  });

  it("does not hide other errors", async () => {
    const { service } = setup({ flushErrors: [new Error("boom")] });
    await expect(service.provision({ email: "a@b.pl", displayName: "Szef", passwordHash: "h" })).rejects.toThrow("boom");
  });
});

describe("AdminAccountService.find", () => {
  it("returns the name and creation date of an existing account", async () => {
    const { service, em } = setup({ found: [{ display_name: "Ala", created_at: "2026-10-01T00:00:00Z" }] });
    await expect(service.find("A@B.pl")).resolves.toEqual({ displayName: "Ala", createdAt: "2026-10-01T00:00:00.000Z" });
    expect(em.execute).toHaveBeenCalledWith(expect.stringContaining("where email = ?"), ["a@b.pl"]);
  });

  it("returns null when there is no account", async () => {
    await expect(setup().service.find("a@b.pl")).resolves.toBeNull();
  });
});
