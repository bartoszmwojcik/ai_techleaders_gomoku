// The game chat on a real PostgreSQL (E07-S01): `ChatService` and the `chat_messages` schema
// against the Testcontainers database. The numbering under the game's advisory lock, the
// interval measured by the database, idempotence, the window of a finished game and the cascades
// live in SQL, so a fake `em` cannot prove them. Services are built like `withRequestScope` builds them.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import type { ChatConfig } from "../../packages/app/src/server/config";
import { ChatService } from "../../packages/app/src/server/services/chat/chat-service";

let orm: Orm;
let counter = 0;

const FAST: ChatConfig = {
  human: { maxLength: 200, minIntervalMs: 0 },
  agent: { maxLength: 200, minIntervalMs: 0 },
  maxMessagesPerGame: 500,
};
const SLOW: ChatConfig = { ...FAST, human: { maxLength: 200, minIntervalMs: 2000 } };

beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await orm.close();
});

const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any
const service = (chatConfig: ChatConfig = FAST) => new ChatService({ em: orm.em.fork(), chatConfig });
const id = () => crypto.randomUUID();

type Status = "waiting" | "active" | "finished" | "cancelled";

/** A game with two guests (one for `waiting`); `finishedAgo` is how long ago a finished game ended. */
async function setup(status: Status = "active", { finishedAgoMs = 1000, second = true } = {}) {
  const n = `${Date.now().toString(36)}${++counter}`;
  const [game] = await run(
    status === "finished"
      ? `insert into games (origin, status, started_at, finished_at, black_seat, end_reason)
         values ('invite', 'finished', now() - interval '1 hour', now() - (? * interval '1 millisecond'), 1, 'draw') returning id`
      : status === "active"
        ? `insert into games (origin, status, started_at, black_seat) values ('invite', 'active', now(), 1) returning id`
        : status === "cancelled"
          ? `insert into games (origin, status) values ('invite', 'cancelled') returning id`
          : `insert into games (origin, status) values ('invite', 'waiting') returning id`,
    status === "finished" ? [finishedAgoMs] : [],
  );
  const players: string[] = [];
  for (const seat of second ? [1, 2] : [1]) {
    const [player] = await run(
      `insert into game_players (game_id, seat, kind, guest_token_hash, nickname, is_active)
       values (?, ?, 'guest', ?, ?, false) returning id`,
      [game!.id, seat, `${n}${seat}`.padEnd(64, "0"), `Gracz_${seat}`],
    );
    players.push(player!.id);
  }
  return { gameId: game!.id as string, one: { playerId: players[0]! }, two: { playerId: players[1] ?? "" } };
}

const send = (who: { playerId: string }, gameId: string, text: string, clientId = id(), config?: ChatConfig) =>
  service(config).send(who, gameId, { text, clientId });
const read = (who: { playerId: string }, gameId: string, afterId?: number, limit = 50) =>
  service().read(who, gameId, { afterId, limit });

describe("chat on PostgreSQL: sending and reading", () => {
  it("numbers messages 1, 2, 3 in the game, signs them by seat and shows them to both players", async () => {
    const { gameId, one, two } = await setup();

    const first = await send(one, gameId, "  Cześć  ");
    await send(two, gameId, "Hej");
    await send(one, gameId, "Gramy");

    expect(first).toMatchObject({ created: true, message: { id: 1, seat: 1, text: "Cześć" } });
    for (const who of [one, two]) {
      const data = await read(who, gameId);
      expect(data.state).toBe("open");
      expect(data.messages.map(({ id, seat, text }) => [id, seat, text])).toEqual([
        [1, 1, "Cześć"],
        [2, 2, "Hej"],
        [3, 1, "Gramy"],
      ]);
      expect(data.lastId).toBe(3);
      expect(data.messages[0]!.createdAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      expect(Object.keys(data.messages[0]!).sort()).toEqual(["createdAt", "id", "seat", "text"]);
    }
  });

  it("reads only the messages after the cursor, the latest page without one, and an empty list beyond the end", async () => {
    const { gameId, one } = await setup();
    for (let i = 1; i <= 5; i++) await send(one, gameId, `m${i}`);

    expect((await read(one, gameId, 3)).messages.map((m) => m.id)).toEqual([4, 5]);
    expect((await read(one, gameId, undefined, 2)).messages.map((m) => m.id)).toEqual([4, 5]);
    expect((await read(one, gameId, 0, 2)).messages.map((m) => m.id)).toEqual([1, 2]);
    expect(await read(one, gameId, 99)).toMatchObject({ messages: [], lastId: 99 });
  });

  it("stores quotes, markup and SQL as plain text", async () => {
    const { gameId, one } = await setup();
    const text = `'; drop table chat_messages; -- <script>alert("x")</script> ?`;

    await send(one, gameId, text);

    expect((await read(one, gameId)).messages[0]!.text).toBe(text);
    expect((await run("select count(*)::int as n from chat_messages"))[0]!.n).toBeGreaterThan(0);
  });

  it("numbers concurrent messages of two senders without gaps or duplicates, and a cursor misses none", async () => {
    const { gameId, one, two } = await setup();

    const sends = Array.from({ length: 24 }, (_, i) => send(i % 2 === 0 ? one : two, gameId, `c${i}`));
    await Promise.all(sends);

    const all = (await read(one, gameId)).messages;
    expect(all.map((m) => m.id)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    // Reading page by page with the cursor returns every message once, in order.
    const seen: number[] = [];
    let cursor = 0;
    for (;;) {
      const page = await read(two, gameId, cursor, 5);
      if (page.messages.length === 0) break;
      seen.push(...page.messages.map((m) => m.id));
      cursor = page.lastId;
    }
    expect(seen).toEqual(all.map((m) => m.id));
  });

  it("stores a message once when the same attempt is sent concurrently or again", async () => {
    const { gameId, one } = await setup();
    const clientId = id();

    const results = await Promise.all([send(one, gameId, "raz", clientId), send(one, gameId, "raz", clientId), send(one, gameId, "raz", clientId)]);
    const again = await send(one, gameId, "raz", clientId);

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set([...results, again].map((r) => r.message.id))).toEqual(new Set([1]));
    expect(again.created).toBe(false);
    expect((await read(one, gameId)).messages).toHaveLength(1);
  });

  it("answers a retry with the stored message even after the chat was switched off or the interval is running", async () => {
    const { gameId, one, two } = await setup();
    const clientId = id();
    await send(one, gameId, "pierwsza", clientId, SLOW);
    await run("update game_players set chat_enabled = false where id = ?", [two.playerId]);

    const again = await send(one, gameId, "pierwsza", clientId, SLOW);

    expect(again).toMatchObject({ created: false, message: { id: 1, text: "pierwsza" } });
    expect(again.retryAfterMs).toBeGreaterThan(0);
    await expect(send(one, gameId, "nowa", id(), SLOW)).rejects.toMatchObject({ code: "CHAT_DISABLED" });
  });

  it("refuses a text with a reason and stores nothing", async () => {
    const { gameId, one } = await setup();

    await expect(send(one, gameId, "zobacz example.com")).rejects.toMatchObject({ status: 400, data: { reason: "url" } });
    await expect(send(one, gameId, "a\u0000b")).rejects.toMatchObject({ data: { reason: "control_char" } });
    await expect(send(one, gameId, "a".repeat(201))).rejects.toMatchObject({ data: { reason: "too_long" } });
    expect((await run("select count(*)::int as n from chat_messages where game_id = ?", [gameId]))[0]!.n).toBe(0);
  });
});

describe("chat on PostgreSQL: limits", () => {
  it("measures the interval per sender with the database's clock", async () => {
    const { gameId, one, two } = await setup();

    await send(one, gameId, "a", id(), SLOW);
    const refused = await send(one, gameId, "b", id(), SLOW).catch((e) => e);

    expect(refused).toMatchObject({ status: 429, code: "RATE_LIMITED", retryAfterSeconds: expect.any(Number) });
    expect(refused.data.retryAfterMs).toBeGreaterThan(0);
    expect(refused.data.retryAfterMs).toBeLessThanOrEqual(2000);
    // The other player has their own interval.
    await expect(send(two, gameId, "c", id(), SLOW)).resolves.toMatchObject({ created: true });
    expect(await service(SLOW).read(one, gameId, { limit: 50 })).toMatchObject({ retryAfterMs: expect.any(Number) });

    await run("update chat_messages set created_at = created_at - interval '3 seconds' where game_id = ?", [gameId]);
    await expect(send(one, gameId, "d", id(), SLOW)).resolves.toMatchObject({ created: true });
    expect(await service(SLOW).read(two, gameId, { limit: 50 })).toMatchObject({ state: "open" });
  });

  it("answers CHAT_FULL at the cap of the game", async () => {
    const { gameId, one } = await setup();
    const capped: ChatConfig = { ...FAST, maxMessagesPerGame: 2 };

    await send(one, gameId, "1", id(), capped);
    await send(one, gameId, "2", id(), capped);

    await expect(send(one, gameId, "3", id(), capped)).rejects.toMatchObject({ status: 409, code: "CHAT_FULL" });
  });

  it("reads a long conversation quickly", async () => {
    const { gameId, one } = await setup();
    await run(
      `insert into chat_messages (game_id, seq, sender_id, client_id, body)
       select ?, n, ?, gen_random_uuid(), 'wiadomosc ' || n from generate_series(1, 500) n`,
      [gameId, one.playerId],
    );

    const started = performance.now();
    const data = await read(one, gameId);
    const elapsed = performance.now() - started;

    expect(data.messages).toHaveLength(50);
    expect(data.lastId).toBe(500);
    expect(elapsed).toBeLessThan(1000);
    await expect(send(one, gameId, "501")).rejects.toMatchObject({ code: "CHAT_FULL" });
  });
});

describe("chat on PostgreSQL: states", () => {
  it("is unavailable while the game waits and when it was cancelled", async () => {
    for (const status of ["waiting", "cancelled"] as const) {
      const { gameId, one } = await setup(status, { second: false });
      expect(await read(one, gameId)).toMatchObject({ state: "unavailable", messages: [] });
      await expect(send(one, gameId, "hej")).rejects.toMatchObject({ status: 409, code: "CHAT_UNAVAILABLE" });
    }
  });

  it("stays open for an hour after the game ended, and not a second longer", async () => {
    const inside = await setup("finished", { finishedAgoMs: 60 * 60 * 1000 - 1500 });
    const outside = await setup("finished", { finishedAgoMs: 60 * 60 * 1000 + 1500 });
    await run(
      `insert into chat_messages (game_id, seq, sender_id, client_id, body) values (?, 1, ?, gen_random_uuid(), 'stara')`,
      [outside.gameId, outside.one.playerId],
    );

    expect(await read(inside.one, inside.gameId)).toMatchObject({ state: "open" });
    await expect(send(inside.one, inside.gameId, "jeszcze")).resolves.toMatchObject({ created: true });
    // After the window nothing of the conversation is returned, even before the cleanup removed it.
    expect(await read(outside.one, outside.gameId)).toMatchObject({ state: "closed", messages: [] });
    await expect(send(outside.one, outside.gameId, "za późno")).rejects.toMatchObject({ code: "CHAT_UNAVAILABLE" });
  });

  it("lets the one whose opponent turned the chat off read but not write, and hides it from the one who turned it off", async () => {
    const { gameId, one, two } = await setup();
    await send(one, gameId, "przed");
    await run("update game_players set chat_enabled = false where id = ?", [two.playerId]);

    expect(await read(one, gameId)).toMatchObject({ state: "disabled_by_opponent", messages: [{ text: "przed" }] });
    expect(await read(two, gameId)).toMatchObject({ state: "disabled_by_you", messages: [] });
    await expect(send(one, gameId, "po")).rejects.toMatchObject({ status: 409, code: "CHAT_DISABLED" });
    await expect(send(two, gameId, "po")).rejects.toMatchObject({ code: "CHAT_DISABLED" });

    await run("update game_players set chat_enabled = true where id = ?", [two.playerId]);
    expect((await read(two, gameId)).messages).toHaveLength(1);
  });

  it("answers 404 for a participant or a game that is gone, never a 500", async () => {
    const { gameId, one } = await setup();
    await send(one, gameId, "hej");
    await run("delete from games where id = ?", [gameId]);

    await expect(read(one, gameId)).rejects.toMatchObject({ status: 404 });
    await expect(send(one, gameId, "hej")).rejects.toMatchObject({ status: 404 });
    expect((await run("select count(*)::int as n from chat_messages where game_id = ?", [gameId]))[0]!.n).toBe(0);
  });
});

const turn = (who: { playerId: string }, gameId: string, enabled: boolean) => service().setEnabled(who, gameId, enabled);
const enabledOf = async (who: { playerId: string }) =>
  (await run("select chat_enabled from game_players where id = ?", [who.playerId]))[0]!.chat_enabled as boolean;

describe("chat on PostgreSQL: turning the chat off and on (E07-S02)", () => {
  it("answers each of the four combinations of the two settings as the matrix says", async () => {
    const { gameId, one, two } = await setup();
    await send(one, gameId, "przed");

    expect(await turn(one, gameId, false)).toEqual({ state: "disabled_by_you" });
    expect(await read(one, gameId)).toMatchObject({ state: "disabled_by_you", messages: [] });
    expect(await read(two, gameId)).toMatchObject({ state: "disabled_by_opponent", messages: [{ text: "przed" }] });
    await expect(send(two, gameId, "po")).rejects.toMatchObject({ status: 409, code: "CHAT_DISABLED" });

    // Both off: each still sees "you turned it off"; the one who turns it back on learns about the other.
    expect(await turn(two, gameId, false)).toEqual({ state: "disabled_by_you" });
    expect((await read(one, gameId)).state).toBe("disabled_by_you");
    expect(await turn(one, gameId, true)).toEqual({ state: "disabled_by_opponent" });
    expect((await read(two, gameId)).state).toBe("disabled_by_you");

    expect(await turn(two, gameId, true)).toEqual({ state: "open" });
    expect((await read(one, gameId)).messages.map((m) => m.text)).toEqual(["przed"]);
    await expect(send(two, gameId, "znowu")).resolves.toMatchObject({ created: true });
  });

  it("is idempotent and writes nothing when the value does not change", async () => {
    const { gameId, one, two } = await setup();
    expect(await turn(one, gameId, true)).toEqual({ state: "open" });
    expect(await turn(one, gameId, false)).toEqual({ state: "disabled_by_you" });
    expect(await turn(one, gameId, false)).toEqual({ state: "disabled_by_you" });
    expect(await enabledOf(one)).toBe(false);
    expect(await enabledOf(two)).toBe(true);
  });

  it("works before the first message, and in the hour after a finished game", async () => {
    const early = await setup();
    expect(await turn(early.one, early.gameId, false)).toEqual({ state: "disabled_by_you" });
    await expect(send(early.two, early.gameId, "pierwsza")).rejects.toMatchObject({ code: "CHAT_DISABLED" });

    const finished = await setup("finished", { finishedAgoMs: 1000 });
    expect(await turn(finished.one, finished.gameId, false)).toEqual({ state: "disabled_by_you" });
  });

  it("refuses with CHAT_UNAVAILABLE while the game waits, after cancel and after the window, and changes nothing", async () => {
    const waiting = await setup("waiting", { second: false });
    const cancelled = await setup("cancelled");
    const late = await setup("finished", { finishedAgoMs: 60 * 60 * 1000 + 1000 });
    for (const { gameId, one } of [waiting, cancelled, late]) {
      await expect(turn(one, gameId, false)).rejects.toMatchObject({ status: 409, code: "CHAT_UNAVAILABLE" });
      expect(await enabledOf(one)).toBe(true);
    }
  });

  it("refuses an agent and leaves its setting alone", async () => {
    const { gameId, one } = await setup();
    // The guest in seat 2 is replaced by an agent's row.
    await run("delete from game_players where game_id = ? and seat = 2", [gameId]);
    const [agent] = await run(
      `insert into game_players (game_id, seat, kind, agent_token_hash, join_channel, is_active)
       values (?, 2, 'agent', ?, 'mcp', false) returning id`,
      [gameId, "a".repeat(64)],
    );
    await expect(turn({ playerId: agent!.id }, gameId, false)).rejects.toMatchObject({ status: 403 });
    expect(await enabledOf({ playerId: agent!.id })).toBe(true);
    expect(await enabledOf(one)).toBe(true);
  });

  it("serializes with a concurrent send: a message is stored before the change or refused after it, none is lost", async () => {
    for (let round = 0; round < 8; round++) {
      const { gameId, one, two } = await setup();
      const [sent, change] = await Promise.allSettled([send(two, gameId, `r${round}`), turn(one, gameId, false)]);

      expect(change.status).toBe("fulfilled");
      const stored = (await run("select count(*)::int as n from chat_messages where game_id = ?", [gameId]))[0]!.n;
      if (sent.status === "fulfilled") expect(stored).toBe(1);
      else {
        expect(sent.reason).toMatchObject({ code: "CHAT_DISABLED" });
        expect(stored).toBe(0);
      }
      // Whatever the order, nothing can be sent after the change.
      await expect(send(two, gameId, "po zmianie")).rejects.toMatchObject({ code: "CHAT_DISABLED" });
    }
  });

  it("answers 404 for a game that is gone", async () => {
    const { gameId, one } = await setup();
    await run("delete from games where id = ?", [gameId]);
    await expect(turn(one, gameId, false)).rejects.toMatchObject({ status: 404 });
  });

  it("gives a new game (a rematch) the setting on for both seats, whatever the earlier game had", async () => {
    const earlier = await setup();
    await turn(earlier.one, earlier.gameId, false);
    const next = await setup();
    expect(await enabledOf(next.one)).toBe(true);
    expect(await enabledOf(next.two)).toBe(true);
  });
});

describe("chat_messages schema", () => {
  it("defaults chat_enabled to true for new seats and keeps no personal columns", async () => {
    const { one } = await setup();

    expect((await run("select chat_enabled from game_players where id = ?", [one.playerId]))[0]!.chat_enabled).toBe(true);
    const columns = await run(
      `select column_name from information_schema.columns where table_name = 'chat_messages' order by column_name`,
    );
    expect(columns.map((c) => c.column_name)).toEqual(["body", "client_id", "created_at", "game_id", "id", "sender_id", "seq"]);
  });

  it("enforces the checks, the uniques and the cascades", async () => {
    const { gameId, one, two } = await setup();
    const insert = (seq: number, sender: string, body: string, clientId = id()) =>
      run(`insert into chat_messages (game_id, seq, sender_id, client_id, body) values (?, ?, ?, ?, ?)`, [
        gameId,
        seq,
        sender,
        clientId,
        body,
      ]);

    await expect(insert(0, one.playerId, "x")).rejects.toThrow("chat_messages_seq_check");
    await expect(insert(1, one.playerId, "")).rejects.toThrow("chat_messages_body_length_check");
    await expect(insert(1, one.playerId, "x".repeat(1001))).rejects.toThrow();
    await insert(1, one.playerId, "x".repeat(1000));
    await expect(insert(1, two.playerId, "y")).rejects.toThrow("chat_messages_game_id_seq_unique");
    const clientId = id();
    await insert(2, one.playerId, "a", clientId);
    await expect(insert(3, one.playerId, "b", clientId)).rejects.toThrow("chat_messages_sender_id_client_id_unique");
    await insert(3, two.playerId, "b", clientId);

    // A seat that leaves takes its messages along; the game takes the rest.
    await run("delete from game_players where id = ?", [two.playerId]);
    expect((await run("select count(*)::int as n from chat_messages where game_id = ?", [gameId]))[0]!.n).toBe(2);
    await run("delete from games where id = ?", [gameId]);
    expect((await run("select count(*)::int as n from chat_messages where game_id = ?", [gameId]))[0]!.n).toBe(0);
  });
});
