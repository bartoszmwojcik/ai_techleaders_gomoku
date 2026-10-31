import { READY_DEADLINE_MS } from "@gomoku/core";
import { User, type EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { AccountService } from "./account-service";

const NOW = new Date("2026-10-30T12:00:00Z");
const HASH = "hash-1";

type Options = {
  user?: { passwordHash: string } | null;
  passwordOk?: boolean;
  userLocked?: boolean;
  games?: { id: string; status: string }[];
  offers?: { id: string }[];
  deleted?: boolean;
  failOn?: string;
};

/** Fake `em`: `transactional` hands out a separate `tx`, so a write through `em` is visible. */
function setup(options: Options = {}) {
  const calls: { via: "em" | "tx"; sql: string; params: unknown[]; mode?: string }[] = [];
  const order: string[] = [];
  const answer = (via: "em" | "tx") =>
    vi.fn(async (sql: string, params: unknown[] = [], mode?: string) => {
      const text = sql.trim().replace(/\s+/g, " ");
      calls.push({ via, sql: text, params, mode });
      const name = text.split(" ").slice(0, 3).join(" ");
      order.push(`${via}:${name}`);
      if (options.failOn && text.includes(options.failOn)) throw new Error("boom");
      if (text.startsWith("select id from users")) return options.userLocked === false ? [] : [{ id: "user-1" }];
      if (text.includes("p.user_id = ? and g.status in")) return options.games ?? [];
      if (text.includes("rematch_state = 'pending'") && text.startsWith("select")) return options.offers ?? [];
      if (text.startsWith("delete from users")) return options.deleted === false ? [] : [{ id: "user-1" }];
      return [];
    });
  const tx = { execute: answer("tx") };
  const em = {
    findOne: vi.fn(async () => (options.user === undefined ? { passwordHash: HASH } : options.user)),
    execute: answer("em"),
    transactional: vi.fn(async (fn: (tx: unknown) => unknown) => {
      order.push("transaction");
      return fn(tx);
    }),
  };
  const passwordHasher = {
    verify: vi.fn(async () => {
      order.push("verify");
      return options.passwordOk !== false;
    }),
  };
  const timeoutSettler = {
    settleFor: vi.fn(async () => {
      order.push("settleFor");
    }),
  };
  const service = new AccountService({
    em: em as unknown as EntityManager,
    passwordHasher: passwordHasher as never,
    timeoutSettler: timeoutSettler as never,
    clock: { now: () => NOW },
  });
  return { service, em, tx, calls, order, passwordHasher, timeoutSettler };
}

const txCalls = (calls: ReturnType<typeof setup>["calls"]) => calls.filter(({ via }) => via === "tx");

describe("AccountService.delete", () => {
  it("verifies the password and closes stale games before the transaction, then deletes the user", async () => {
    const { service, em, calls, order, passwordHasher, timeoutSettler } = setup();

    await service.delete("user-1", "secret");

    expect(em.findOne).toHaveBeenCalledWith(User, { id: "user-1" });
    expect(passwordHasher.verify).toHaveBeenCalledWith("secret", HASH);
    expect(timeoutSettler.settleFor).toHaveBeenCalledWith("user-1");
    expect(order.slice(0, 5)).toEqual(["verify", "settleFor", "em:with expired as", "em:with stale as", "transaction"]);
    expect(calls[0]!.params).toEqual([NOW, "user-1"]);
    expect(calls[1]!.params).toEqual([new Date(NOW.getTime() - READY_DEADLINE_MS), "user-1"]);
    // Lock order: user, games, rematch offers, the delete; all through `tx`.
    expect(txCalls(calls).map(({ sql }) => sql.split(" ").slice(0, 4).join(" "))).toEqual([
      "select id from users",
      "select g.id, g.status from",
      "select g.id from games",
      "delete from users where",
    ]);
    expect(calls.filter(({ via }) => via === "em")).toHaveLength(2);
    expect(txCalls(calls)[0]!.sql).toContain("for no key update");
    expect(txCalls(calls)[1]!.sql).toContain("order by g.id for update of g");
    expect(txCalls(calls)[3]!.params).toEqual(["user-1", HASH]);
  });

  it("answers 401 when the account is already gone and checks nothing else", async () => {
    const { service, order } = setup({ user: null });
    await expect(service.delete("user-1", "secret")).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(order).toEqual([]);
  });

  it("answers INVALID_PASSWORD with a field error and does not touch games", async () => {
    const { service, order } = setup({ passwordOk: false });
    await expect(service.delete("user-1", "wrong")).rejects.toMatchObject({
      status: 400,
      code: "INVALID_PASSWORD",
      fieldErrors: { password: ["Nieprawidłowe hasło."] },
    });
    expect(order).toEqual(["verify"]);
  });

  it("answers 401 when a concurrent deletion won the lock of the user row", async () => {
    const { service, calls } = setup({ userLocked: false });
    await expect(service.delete("user-1", "secret")).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(txCalls(calls)).toHaveLength(1);
  });

  it("refuses with the id of the game in progress before any write (BR-21)", async () => {
    const { service, calls } = setup({
      games: [
        { id: "game-w", status: "waiting" },
        { id: "game-a", status: "active" },
      ],
    });
    await expect(service.delete("user-1", "secret")).rejects.toMatchObject({
      status: 409,
      code: "ACTIVE_GAME",
      message: "Najpierw dokończ albo poddaj partię.",
      data: { gameId: "game-a" },
    });
    expect(txCalls(calls).map(({ sql }) => sql.split(" ")[0])).toEqual(["select", "select"]);
  });

  it("deletes the waiting games of the account with one statement", async () => {
    const { service, calls } = setup({
      games: [
        { id: "game-1", status: "waiting" },
        { id: "game-2", status: "waiting" },
      ],
    });
    await service.delete("user-1", "secret");
    const deleteGames = txCalls(calls).find(({ sql }) => sql.startsWith("delete from games"))!;
    expect(deleteGames.sql).toBe("delete from games where id in (?, ?)");
    expect(deleteGames.params).toEqual(["game-1", "game-2"]);
    expect(deleteGames.mode).toBe("run");
  });

  it("declines the pending rematch offers the account is part of, locked first", async () => {
    const { service, calls } = setup({ offers: [{ id: "game-9" }, { id: "game-8" }] });
    await service.delete("user-1", "secret");
    const tx = txCalls(calls).map(({ sql }) => sql.split(" ").slice(0, 3).join(" "));
    expect(tx.indexOf("select g.id from")).toBeLessThan(tx.indexOf("update games set"));
    const close = txCalls(calls).find(({ sql }) => sql.startsWith("update games"))!;
    expect(close.sql).toBe("update games set rematch_state = 'declined' where id in (?, ?)");
    expect(close.params).toEqual(["game-9", "game-8"]);
  });

  it("writes nothing extra without waiting games or offers", async () => {
    const { service, calls } = setup();
    await service.delete("user-1", "secret");
    expect(txCalls(calls).some(({ sql }) => sql.startsWith("update") || sql.startsWith("delete from games"))).toBe(false);
  });

  it("answers INVALID_PASSWORD when the hash changed meanwhile, so the transaction rolls back", async () => {
    const { service, em } = setup({ deleted: false, games: [{ id: "game-1", status: "waiting" }] });
    await expect(service.delete("user-1", "secret")).rejects.toMatchObject({
      status: 400,
      code: "INVALID_PASSWORD",
    });
    // The error leaves `transactional`, which is what rolls back the writes made before it.
    expect(em.transactional).toHaveBeenCalledTimes(1);
  });

  it("lets a database failure through", async () => {
    const { service } = setup({ failOn: "delete from users" });
    await expect(service.delete("user-1", "secret")).rejects.toThrow("boom");
  });
});
