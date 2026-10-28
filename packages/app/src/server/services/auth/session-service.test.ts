import { Session, User, type EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { hashOpaqueToken } from "../../http/opaque-token";
import { SESSION_TTL_MS, SessionService } from "./session-service";

const now = new Date("2026-10-27T12:00:00Z");
const expiresAt = new Date("2026-10-27T11:00:00Z");

function setup(found: unknown = null, activeGame = false) {
  const em = {
    create: vi.fn(),
    getReference: vi.fn((_entity: unknown, id: string) => ({ ref: id })),
    flush: vi.fn(async () => undefined),
    findOne: vi.fn(async () => found),
    nativeDelete: vi.fn(async () => 0),
  };
  const hasActiveGame = vi.fn(async () => activeGame);
  const service = new SessionService({
    em: em as unknown as EntityManager,
    hasActiveGame,
  });
  return { em, hasActiveGame, service };
}

describe("SessionService.create", () => {
  it("stores only the token hash and expires after 30 days", async () => {
    const { em, service } = setup();

    const result = await service.create("user-1", now);

    expect(SESSION_TTL_MS).toBe(30 * 24 * 3600 * 1000);
    expect(result.expiresAt).toEqual(new Date(now.getTime() + SESSION_TTL_MS));
    expect(em.getReference).toHaveBeenCalledWith(User, "user-1");
    expect(em.create).toHaveBeenCalledWith(Session, {
      user: { ref: "user-1" },
      tokenHash: hashOpaqueToken(result.token),
      expiresAt: result.expiresAt,
    });
    expect(em.flush).toHaveBeenCalledOnce();
  });

  it("defaults to the current time", async () => {
    const { service } = setup();
    const before = Date.now();
    const { expiresAt: created } = await service.create("user-1");
    expect(created.getTime()).toBeGreaterThanOrEqual(before + SESSION_TTL_MS);
  });
});

describe("SessionService.findValid", () => {
  it("looks the session up by token hash", async () => {
    const { em, service } = setup();
    await service.findValid("tok", now);
    expect(em.findOne).toHaveBeenCalledWith(
      Session,
      { tokenHash: hashOpaqueToken("tok") },
      { populate: ["user"] },
    );
  });

  it("returns null for an unknown token", async () => {
    const { service } = setup(null);
    expect(await service.findValid("tok", now)).toBeNull();
  });

  it("returns a session before expiry without asking about games", async () => {
    const session = {
      expiresAt: new Date(now.getTime() + 1),
      user: { id: "u" },
    };
    const { service, hasActiveGame } = setup(session);
    expect(await service.findValid("tok", now)).toBe(session);
    expect(hasActiveGame).not.toHaveBeenCalled();
  });

  it("treats the exact expiry instant as expired", async () => {
    const session = { expiresAt: now, user: { id: "u" } };
    const { service, hasActiveGame } = setup(session, false);
    expect(await service.findValid("tok", now)).toBeNull();
    expect(hasActiveGame).toHaveBeenCalledWith("u", now);
  });

  it("rejects an expired session without an active game", async () => {
    const { service } = setup({ expiresAt, user: { id: "u" } }, false);
    expect(await service.findValid("tok", now)).toBeNull();
  });

  it("keeps an expired session valid while a game started before expiry is running (G5)", async () => {
    const session = { expiresAt, user: { id: "u" } };
    const { service, hasActiveGame } = setup(session, true);
    expect(await service.findValid("tok", now)).toBe(session);
    expect(hasActiveGame).toHaveBeenCalledWith("u", expiresAt);
  });

  it("defaults to the current time", async () => {
    const session = {
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: "u" },
    };
    const { service } = setup(session);
    expect(await service.findValid("tok")).toBe(session);
  });
});

describe("SessionService.revoke", () => {
  it("deletes only the session with the token hash", async () => {
    const { em, service } = setup();
    await service.revoke("tok");
    expect(em.nativeDelete).toHaveBeenCalledExactlyOnceWith(Session, {
      tokenHash: hashOpaqueToken("tok"),
    });
  });

  it("is idempotent: an unknown or already revoked token is not an error", async () => {
    const { em, service } = setup();
    em.nativeDelete.mockResolvedValue(0);
    await expect(service.revoke("tok")).resolves.toBeUndefined();
    await expect(service.revoke("tok")).resolves.toBeUndefined();
    expect(em.nativeDelete).toHaveBeenCalledTimes(2);
  });
});

describe("SessionService with a transaction entity manager", () => {
  const fakeTx = () => ({
    create: vi.fn(),
    getReference: vi.fn((_entity: unknown, id: string) => ({ ref: id })),
    flush: vi.fn(async () => undefined),
    nativeDelete: vi.fn(async () => 4),
  });

  it("creates the session through the given em, not the injected one", async () => {
    const { em, service } = setup();
    const tx = fakeTx();

    await service.create("user-1", now, tx as unknown as EntityManager);

    expect(tx.create).toHaveBeenCalledOnce();
    expect(tx.flush).toHaveBeenCalledOnce();
    expect(em.create).not.toHaveBeenCalled();
    expect(em.flush).not.toHaveBeenCalled();
  });

  it("revokes others through the given em, not the injected one", async () => {
    const { em, service } = setup();
    const tx = fakeTx();

    await expect(
      service.revokeOthers("user-1", "sess-1", tx as unknown as EntityManager),
    ).resolves.toBe(4);

    expect(tx.nativeDelete).toHaveBeenCalledOnce();
    expect(em.nativeDelete).not.toHaveBeenCalled();
  });
});

describe("SessionService.revokeOthers", () => {
  it("deletes every session of the user except the current one", async () => {
    const { em, service } = setup();
    em.nativeDelete.mockResolvedValue(3);

    await expect(service.revokeOthers("user-1", "sess-1")).resolves.toBe(3);
    expect(em.nativeDelete).toHaveBeenCalledExactlyOnceWith(Session, {
      user: "user-1",
      id: { $ne: "sess-1" },
    });
  });
});

describe("SessionService.revokeAll", () => {
  it("deletes every session of the user", async () => {
    const { em, service } = setup();
    em.nativeDelete.mockResolvedValue(2);

    await expect(service.revokeAll("user-1")).resolves.toBe(2);
    expect(em.nativeDelete).toHaveBeenCalledExactlyOnceWith(Session, {
      user: "user-1",
    });
  });

  it("uses the given em (the transaction's tx) instead of the injected one", async () => {
    const { em, service } = setup();
    const tx = { nativeDelete: vi.fn(async () => 5) };

    await expect(
      service.revokeAll("user-1", tx as unknown as EntityManager),
    ).resolves.toBe(5);
    expect(tx.nativeDelete).toHaveBeenCalledOnce();
    expect(em.nativeDelete).not.toHaveBeenCalled();
  });
});
