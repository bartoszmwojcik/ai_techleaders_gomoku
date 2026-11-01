import { ConflictError, NotFoundError, TooManyRequestsError, ValidationError } from "@gomoku/core";
import { ForeignKeyConstraintViolationException, type EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import type { ChatConfig } from "../../config";
import { ChatService } from "./chat-service";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";
const CLIENT_ID = "3f1c1d1e-4a4b-4c4d-8e8f-0a0b0c0d0e0f";
const PARTICIPANT = { playerId: "player-1" };
const CONFIG: ChatConfig = {
  human: { maxLength: 200, minIntervalMs: 2000 },
  agent: { maxLength: 10, minIntervalMs: 5000 },
  maxMessagesPerGame: 3,
};

type Context = Partial<{
  kind: string;
  mine: boolean;
  theirs: boolean | null;
  status: string;
  window_open: boolean;
  since_last_ms: number | null;
  total: number;
}>;
const contextRow = (context: Context = {}) => ({
  sender_id: "player-1",
  seat: 1,
  kind: "account",
  mine: true,
  theirs: true,
  status: "active",
  window_open: false,
  since_last_ms: null,
  total: 0,
  ...context,
});
const row = (seq: number, seat = 1) => ({ seq, seat, body: `msg ${seq}`, created_at: `2026-11-01T10:00:0${seq}.000Z` });

type Setup = {
  context?: Context | null;
  messages?: ReturnType<typeof row>[];
  repeat?: ReturnType<typeof row>;
  stored?: ReturnType<typeof row>;
  kind?: string | null;
  insertError?: Error;
};

/** A fake `em`: answers each statement by what it selects; `calls` records the SQL and parameters. */
function setup({ context = {}, messages = [], repeat, stored = row(1), kind = "account", insertError }: Setup = {}) {
  const calls: { sql: string; params: unknown[]; mode?: string }[] = [];
  let inserted = false;
  const execute = vi.fn(async (sql: string, params: unknown[] = [], mode?: string) => {
    calls.push({ sql, params, mode });
    if (sql.includes("pg_advisory_xact_lock")) return [];
    if (sql.startsWith("select kind from game_players")) return kind === null ? [] : [{ kind }];
    if (sql.includes("from game_players p") && sql.includes("window_open")) {
      return context === null ? [] : [contextRow(context)];
    }
    if (sql.includes("m.sender_id = ?")) return inserted ? [stored] : repeat ? [repeat] : [];
    if (sql.startsWith("\n  insert into chat_messages")) {
      if (insertError) throw insertError;
      inserted = true;
      return [];
    }
    return messages;
  });
  const em = {
    execute,
    transactional: vi.fn(async (fn: (tx: unknown) => unknown) => fn(em)),
  } as unknown as EntityManager;
  return { service: new ChatService({ em, chatConfig: CONFIG }), calls, execute };
}

const messageQueries = <T extends { sql: string }>(calls: T[]) => calls.filter(({ sql }) => sql.includes("m.game_id = ?"));

describe("ChatService.read", () => {
  it("returns the latest page of an open chat, in order, with the limits of a person", async () => {
    const { service, calls } = setup({ messages: [row(1), row(2, 2)] });

    expect(await service.read(PARTICIPANT, GAME, { limit: 50 })).toEqual({
      state: "open",
      messages: [
        { id: 1, seat: 1, text: "msg 1", createdAt: "2026-11-01T10:00:01.000Z" },
        { id: 2, seat: 2, text: "msg 2", createdAt: "2026-11-01T10:00:02.000Z" },
      ],
      lastId: 2,
      limits: { maxLength: 200, minIntervalMs: 2000 },
    });
    const latest = messageQueries(calls).at(-1)!;
    expect(latest.sql).toContain("order by m.seq desc limit ?");
    expect(latest.params).toEqual([GAME, 50]);
  });

  it("asks only for what is newer than the cursor and keeps the cursor when nothing is", async () => {
    const { service, calls } = setup({ messages: [] });

    const data = await service.read(PARTICIPANT, GAME, { afterId: 7, limit: 10 });

    expect(data).toMatchObject({ state: "open", messages: [], lastId: 7 });
    expect(messageQueries(calls).at(-1)!.params).toEqual([GAME, 7, 10]);
    expect(await setup().service.read(PARTICIPANT, GAME, { limit: 50 })).toMatchObject({ lastId: 0 });
  });

  it("says how long the asker still has to wait after their own message", async () => {
    const { service } = setup({ context: { since_last_ms: 500.2 } });
    expect(await service.read(PARTICIPANT, GAME, { limit: 50 })).toMatchObject({ retryAfterMs: 1500 });
    const later = setup({ context: { since_last_ms: 2000 } });
    expect(await later.service.read(PARTICIPANT, GAME, { limit: 50 })).not.toHaveProperty("retryAfterMs");
  });

  it("uses the limits of an agent", async () => {
    const { service } = setup({ context: { kind: "agent" } });
    expect((await service.read(PARTICIPANT, GAME, { limit: 50 })).limits).toEqual(CONFIG.agent);
  });

  it("shows the conversation to the one whose opponent turned the chat off, and no wait", async () => {
    const { service } = setup({ context: { theirs: false, since_last_ms: 10 }, messages: [row(1)] });
    const data = await service.read(PARTICIPANT, GAME, { limit: 50 });
    expect(data.state).toBe("disabled_by_opponent");
    expect(data.messages).toHaveLength(1);
    expect(data).not.toHaveProperty("retryAfterMs");
  });

  it.each([
    ["unavailable", { status: "waiting", theirs: null }],
    ["unavailable", { status: "cancelled" }],
    ["closed", { status: "finished", window_open: false }],
    ["disabled_by_you", { mine: false }],
  ] as [string, Context][])("returns no messages and does not query them when the chat is %s", async (state, context) => {
    const { service, calls } = setup({ context, messages: [row(1)] });

    expect(await service.read(PARTICIPANT, GAME, { afterId: 4, limit: 50 })).toMatchObject({
      state,
      messages: [],
      lastId: 4,
    });
    expect(messageQueries(calls)).toHaveLength(0);
  });

  it("reads a finished game within the window", async () => {
    const { service } = setup({ context: { status: "finished", window_open: true }, messages: [row(1)] });
    expect(await service.read(PARTICIPANT, GAME, { limit: 50 })).toMatchObject({ state: "open" });
  });

  it("answers 404 when the participant or the game is gone", async () => {
    await expect(setup({ context: null }).service.read(PARTICIPANT, GAME, { limit: 50 })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("measures the window with the retention of the chat, in the database", async () => {
    const { service, calls } = setup();
    await service.read(PARTICIPANT, GAME, { limit: 50 });
    expect(calls[0]!.params).toEqual([3_600_000, "player-1", GAME]);
    expect(calls[0]!.sql).toContain("now()");
  });
});

describe("ChatService.send", () => {
  const input = { text: "  hej  ", clientId: CLIENT_ID };

  it("stores the normalized text under the game's lock and answers with the stored message", async () => {
    const { service, calls } = setup({ context: { total: 2 } });

    const result = await service.send(PARTICIPANT, GAME, input);

    expect(result).toEqual({
      message: { id: 1, seat: 1, text: "msg 1", createdAt: "2026-11-01T10:00:01.000Z" },
      retryAfterMs: 2000,
      created: true,
    });
    expect(calls.findIndex(({ sql }) => sql.includes("pg_advisory_xact_lock"))).toBeLessThan(
      calls.findIndex(({ sql }) => sql.includes("insert into chat_messages")),
    );
    const insert = calls.find(({ sql }) => sql.includes("insert into chat_messages"))!;
    expect(insert.params).toEqual([GAME, GAME, "player-1", CLIENT_ID, "hej"]);
    expect(insert.mode).toBe("run");
    expect(insert.sql).toContain("clock_timestamp()");
  });

  it("refuses a text with 400, a field error and a reason, and never repeats it", async () => {
    const { service, execute } = setup();

    const error = await service.send(PARTICIPANT, GAME, { text: "zobacz example.com", clientId: CLIENT_ID }).catch((e) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error.toBody()).toEqual({
      code: "VALIDATION",
      message: "Wiadomość nie może zawierać adresów internetowych.",
      fieldErrors: { text: ["Wiadomość nie może zawierać adresów internetowych."] },
      data: { reason: "url" },
    });
    expect(JSON.stringify(error)).not.toContain("example");
    expect(execute.mock.calls.some(([sql]) => String(sql).includes("pg_advisory_xact_lock"))).toBe(false);
  });

  it("refuses a non-text value and applies the agent's length", async () => {
    const { service } = setup({ kind: "agent" });
    await expect(service.send(PARTICIPANT, GAME, { text: 5, clientId: CLIENT_ID })).rejects.toMatchObject({
      toBody: expect.any(Function),
    });
    await expect(service.send(PARTICIPANT, GAME, { text: "x".repeat(11), clientId: CLIENT_ID })).rejects.toMatchObject({
      data: { reason: "too_long" },
    });
  });

  it("answers 404 when the participant is gone, before and under the lock", async () => {
    await expect(setup({ kind: null }).service.send(PARTICIPANT, GAME, input)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setup({ context: null }).service.send(PARTICIPANT, GAME, input)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("answers a retry of the same attempt with the message that exists, even when the chat is off now", async () => {
    const { service, calls } = setup({ context: { mine: false, since_last_ms: 100 }, repeat: row(4) });

    const result = await service.send(PARTICIPANT, GAME, input);

    expect(result).toMatchObject({ message: { id: 4 }, created: false, retryAfterMs: 1900 });
    expect(calls.some(({ sql }) => sql.includes("insert into chat_messages"))).toBe(false);
  });

  it.each([
    ["waiting", { status: "waiting", theirs: null }],
    ["cancelled", { status: "cancelled" }],
    ["closed", { status: "finished", window_open: false }],
  ] as [string, Context][])("answers 409 CHAT_UNAVAILABLE in a %s game", async (_name, context) => {
    const error = await setup({ context }).service.send(PARTICIPANT, GAME, input).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.code).toBe("CHAT_UNAVAILABLE");
  });

  it.each([
    ["you", { mine: false }],
    ["the opponent", { theirs: false }],
  ] as [string, Context][])("answers 409 CHAT_DISABLED when %s turned the chat off", async (_who, context) => {
    const error = await setup({ context }).service.send(PARTICIPANT, GAME, input).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.code).toBe("CHAT_DISABLED");
  });

  it("answers 409 CHAT_FULL at the cap of the game, and still takes the last message below it", async () => {
    const full = await setup({ context: { total: 3 } }).service.send(PARTICIPANT, GAME, input).catch((e) => e);
    expect(full.code).toBe("CHAT_FULL");
    expect(await setup({ context: { total: 2 } }).service.send(PARTICIPANT, GAME, input)).toMatchObject({ created: true });
  });

  it("answers 429 with the time left, in seconds for the header and in milliseconds in the body", async () => {
    const error = await setup({ context: { since_last_ms: 600 } }).service.send(PARTICIPANT, GAME, input).catch((e) => e);

    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect(error).toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 2, data: { retryAfterMs: 1400 } });
  });

  it("lets the next message through exactly at the interval and uses the agent's interval", async () => {
    expect(await setup({ context: { since_last_ms: 2000 } }).service.send(PARTICIPANT, GAME, input)).toMatchObject({
      created: true,
    });
    const agent = setup({ kind: "agent", context: { kind: "agent", since_last_ms: 4000 } });
    await expect(agent.service.send(PARTICIPANT, GAME, { text: "hej", clientId: CLIENT_ID })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("answers an interval of zero without waiting", async () => {
    const em = setup({ context: { since_last_ms: 0 } });
    const service = new ChatService({
      em: { execute: em.execute, transactional: (fn: (tx: unknown) => unknown) => fn({ execute: em.execute }) } as unknown as EntityManager,
      chatConfig: { ...CONFIG, human: { maxLength: 200, minIntervalMs: 0 } },
    });
    expect(await service.send(PARTICIPANT, GAME, input)).toMatchObject({ created: true, retryAfterMs: 0 });
  });

  it("maps a game that vanished under the insert to 404 and rethrows anything else", async () => {
    const vanished = new ForeignKeyConstraintViolationException(new Error("fk") as never);
    await expect(setup({ insertError: vanished }).service.send(PARTICIPANT, GAME, input)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const broken = new Error("boom");
    await expect(setup({ insertError: broken }).service.send(PARTICIPANT, GAME, input)).rejects.toBe(broken);
  });
});
