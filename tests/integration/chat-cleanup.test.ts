// The chat vanishes with the game (E07-S03, BR-34) on a real PostgreSQL: the `chatMessages` cleanup
// rule (thresholds of every branch to the second, games with accounts that stay as history, tokens,
// batches, the budget, parallel runs), the deletion of a chat with the account (transaction and
// rollback), the read window against the deletion (R9 vs BR-34), the server log and the `pg_dump`
// command of the README. Runs only on the Testcontainers database from global-setup.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

import { INITIAL_CLOCK_MS } from "@gomoku/core";
import { cleanupExpired, createOrm, type Orm } from "@gomoku/db";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import type { ChatConfig } from "../../packages/app/src/server/config";
import { AccountService } from "../../packages/app/src/server/services/auth/account-service";
import { PasswordHasher } from "../../packages/app/src/server/services/auth/password-hasher";
import { systemClock } from "../../packages/app/src/server/services/email/email-sender";
import { ChatService } from "../../packages/app/src/server/services/chat/chat-service";
import { SqlTimeoutSettler } from "../../packages/app/src/server/services/games/timeout-settler";
import { hashOpaqueToken } from "../../packages/app/src/server/http/opaque-token";
import { SERVER_LOG } from "./global-setup";

const baseUrl = inject("baseUrl");
const execFileAsync = promisify(execFile);
const HOUR = 3_600_000;
const SECOND = 1_000;
const PASSWORD = "secret123";
const CONFIG: ChatConfig = {
  human: { maxLength: 200, minIntervalMs: 0 },
  agent: { maxLength: 200, minIntervalMs: 0 },
  maxMessagesPerGame: 500,
};
const hasher = new PasswordHasher({ passwordHashCost: 4 });

let orm: Orm;
let hash: string;
let counter = 0;
const clients: Client[] = [];

beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  hash = await hasher.hash(PASSWORD);
});
// Counts are exact because the table starts empty (the files run one after another).
beforeEach(async () => {
  await run("delete from chat_messages");
});
afterAll(async () => {
  await Promise.all(clients.map((client) => client.end().catch(() => undefined)));
  await orm.close();
});

const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any
const ago = (now: Date, ms: number) => new Date(now.getTime() - ms);
const next = () => `${Date.now().toString(36)}${++counter}`;
const chat = () => new ChatService({ em: orm.em.fork(), chatConfig: CONFIG });
const sweep = (now: Date, options: { batchSize?: number; ruleTimeLimitMs?: number } = {}) =>
  cleanupExpired({ em: orm.em.fork(), now, ...options });

async function connect(): Promise<Client> {
  const client = new Client({ connectionString: inject("databaseUrl") });
  await client.connect();
  clients.push(client);
  return client;
}

async function user(): Promise<string> {
  const n = next();
  const [row] = await run(
    `insert into users (email, display_name, display_name_key, password_hash, email_verified_at)
     values (?, ?, ?, ?, now()) returning id`,
    [`chatclean-${n}@example.com`, `cc_${n}`.slice(0, 24), `cc_${n}`.slice(0, 24), hash],
  );
  return row!.id as string;
}

type Kind = "account" | "guest" | "agent";
type Spec = {
  status: "finished" | "cancelled" | "active";
  /** finished: how long ago it ended; cancelled: how long ago it was created; active: how long ago the clock ran out (negative = still running). */
  agoMs: number;
  kinds?: [Kind, Kind];
  messages?: number;
  token?: string;
};

/** A game with two participants and messages from them; accounts are real users so the game stays as history. */
async function game(now: Date, { status, agoMs, kinds = ["account", "account"], messages = 1, token }: Spec) {
  const [row] = await run(
    status === "finished"
      ? `insert into games (origin, status, created_at, started_at, finished_at, black_seat, winner_seat, end_reason)
         values ('invite', 'finished', ?, ?, ?, 1, 1, 'resignation') returning id`
      : status === "cancelled"
        ? `insert into games (origin, status, created_at) values ('invite', 'cancelled', ?) returning id`
        : `insert into games (origin, status, created_at, started_at, black_seat, clock_ms_1, clock_ms_2, turn_started_at)
           values ('invite', 'active', ?, ?, 1, ?, ?, ?) returning id`,
    status === "finished"
      ? [ago(now, 5 * HOUR), ago(now, 4 * HOUR), ago(now, agoMs)]
      : status === "cancelled"
        ? [ago(now, agoMs)]
        : [ago(now, 10 * HOUR), ago(now, 10 * HOUR), INITIAL_CLOCK_MS, INITIAL_CLOCK_MS, ago(now, agoMs + INITIAL_CLOCK_MS)],
  );
  const gameId = row!.id as string;
  const players: string[] = [];
  const users: (string | null)[] = [];
  for (const [index, kind] of kinds.entries()) {
    const userId = kind === "account" ? await user() : null;
    users.push(userId);
    const [player] = await run(
      kind === "account"
        ? `insert into game_players (game_id, seat, kind, user_id, is_active) values (?, ?, 'account', ?, false) returning id`
        : kind === "guest"
          ? `insert into game_players (game_id, seat, kind, guest_token_hash, nickname, is_active) values (?, ?, 'guest', ?, ?, false) returning id`
          : `insert into game_players (game_id, seat, kind, agent_token_hash, agent_name, join_channel, is_active) values (?, ?, 'agent', ?, 'claude', 'mcp', false) returning id`,
      kind === "account"
        ? [gameId, index + 1, userId]
        : kind === "guest"
          ? [gameId, index + 1, hashOpaqueToken(index === 0 && token ? token : next()), `Gracz_${index + 1}`]
          : [gameId, index + 1, hashOpaqueToken(next())],
    );
    players.push(player!.id as string);
  }
  for (let seq = 1; seq <= messages; seq++) {
    await run(
      `insert into chat_messages (game_id, seq, sender_id, client_id, body) values (?, ?, ?, ?, ?)`,
      [gameId, seq, players[seq % 2]!, crypto.randomUUID(), `wiadomosc ${seq} ${next()}`],
    );
  }
  return { gameId, players, users };
}

const messagesOf = async (gameId: string) =>
  Number((await run("select count(*)::int as n from chat_messages where game_id = ?", [gameId]))[0]!.n);
const exists = async (table: string, column: string, id: string) =>
  (await run(`select 1 from ${table} where ${column} = ?`, [id])).length > 0;

describe("chatMessages rule: thresholds on PostgreSQL (BR-34)", () => {
  // [label, how long ago, whether the messages go]: past the 1 h threshold, exactly on it, inside it.
  const edges: [string, number, boolean][] = [
    ["1 h + 1 s", HOUR + SECOND, true],
    ["exactly 1 h (the cutoff stays)", HOUR, false],
    ["59 min", HOUR - 60 * SECOND, false],
  ];

  it.each(["finished", "cancelled", "active"] as const)("%s game: the messages go 1 h past the threshold, not a second sooner", async (status) => {
    const now = new Date();
    const games = [];
    for (const [, agoMs, goes] of edges) games.push({ goes, ...(await game(now, { status, agoMs, messages: 2 })) });

    const result = await sweep(now);

    expect(result.errors).toEqual([]);
    expect(result.chatMessages).toBe(2);
    for (const { gameId, goes } of games) expect(await messagesOf(gameId), `${gameId}`).toBe(goes ? 0 : 2);
  });

  it("an active game with a running clock keeps its messages whatever their age", async () => {
    const now = new Date();
    const { gameId } = await game(now, { status: "active", agoMs: -10 * 60 * SECOND, messages: 3 });
    await run("update chat_messages set created_at = ? where game_id = ?", [ago(now, 30 * HOUR), gameId]);

    const result = await sweep(now);

    expect(result.chatMessages).toBe(0);
    expect(await messagesOf(gameId)).toBe(3);
  });

  it("an active game whose clock never started within the ready deadline loses its messages once it is long dead", async () => {
    const now = new Date();
    const { gameId } = await game(now, { status: "active", agoMs: 0 });
    await run(`update games set turn_started_at = null, started_at = ? where id = ?`, [ago(now, 2 * HOUR), gameId]);

    await sweep(now);

    expect(await messagesOf(gameId)).toBe(0);
  });

  it("keeps the game, its moves and its participants when it has an account: only the messages go", async () => {
    const now = new Date();
    const { gameId, players } = await game(now, { status: "finished", agoMs: 2 * HOUR, kinds: ["account", "guest"], messages: 3 });

    const result = await sweep(now);

    expect(result.chatMessages).toBe(3);
    expect(await exists("games", "id", gameId)).toBe(true);
    for (const id of players) expect(await exists("game_players", "id", id)).toBe(true);
    expect(await messagesOf(gameId)).toBe(0);
  });

  it("counts the messages of a game of guests, whose game goes in the same run, and has nothing left for a second run", async () => {
    const now = new Date();
    const { gameId } = await game(now, { status: "finished", agoMs: 2 * HOUR, kinds: ["guest", "guest"], messages: 4 });

    const first = await sweep(now);
    const second = await sweep(now);

    expect(first.chatMessages).toBe(4);
    expect(first.guestOnlyFinishedGames).toBeGreaterThanOrEqual(1);
    expect(await exists("games", "id", gameId)).toBe(false);
    expect(second.chatMessages).toBe(0);
  });

  it("scans the games by their own columns: a message of another game is never matched by the clock term", async () => {
    const now = new Date();
    const dead = await game(now, { status: "active", agoMs: 2 * HOUR });
    const alive = await game(now, { status: "active", agoMs: -5 * 60 * SECOND });

    await sweep(now);

    expect(await messagesOf(dead.gameId)).toBe(0);
    expect(await messagesOf(alive.gameId)).toBe(1);
  });
});

describe("chatMessages rule: tokens and access go in the same run as the content", () => {
  it("clears the guest and agent hashes of a game if and only if its messages go (one threshold)", async () => {
    const now = new Date();
    const ages = [HOUR + SECOND, HOUR, HOUR - 60 * SECOND, 3 * HOUR, 10 * 60 * SECOND];
    const games = [];
    for (const agoMs of ages) {
      for (const kinds of [["guest", "account"], ["account", "agent"]] as [Kind, Kind][]) {
        games.push({ agoMs, kinds, ...(await game(now, { status: "finished", agoMs, kinds, messages: 2 })) });
      }
    }

    await sweep(now);

    for (const { gameId, agoMs, kinds } of games) {
      const kind = kinds.includes("guest") ? "guest" : "agent";
      const [player] = await run(`select ${kind}_token_hash as hash from game_players where game_id = ? and kind = ?`, [gameId, kind]);
      const goneContent = (await messagesOf(gameId)) === 0;
      expect(goneContent, `${kind} ${agoMs}`).toBe(agoMs > HOUR);
      expect(player!.hash === null, `${kind} ${agoMs}`).toBe(goneContent);
      expect(await exists("games", "id", gameId)).toBe(true); // the history of the account stays
    }
  });
});

describe("chatMessages rule: batches, budget and parallel runs", () => {
  it("deletes everything when there are more messages than the batch size", async () => {
    const now = new Date();
    const { gameId } = await game(now, { status: "finished", agoMs: 2 * HOUR, messages: 5 });

    const result = await sweep(now, { batchSize: 2 });

    expect(result).toMatchObject({ chatMessages: 5, truncated: false, errors: [] });
    expect(await messagesOf(gameId)).toBe(0);
  });

  it("stops on the budget with truncated and no error, and the next run finishes", async () => {
    const now = new Date();
    const { gameId } = await game(now, { status: "finished", agoMs: 2 * HOUR, messages: 3 });

    const cut = await sweep(now, { ruleTimeLimitMs: 0 });
    expect(cut).toMatchObject({ chatMessages: 0, truncated: true, errors: [] });
    expect(await messagesOf(gameId)).toBe(3);

    const rest = await sweep(now);
    expect(rest).toMatchObject({ chatMessages: 3, truncated: false });
    expect(await messagesOf(gameId)).toBe(0);
  });

  it("two parallel runs do not fail and together delete every message exactly once", async () => {
    const now = new Date();
    const games = [];
    for (let i = 0; i < 4; i++) games.push(await game(now, { status: "finished", agoMs: 2 * HOUR, messages: 10 }));

    const [a, b] = await Promise.all([sweep(now, { batchSize: 3 }), sweep(now, { batchSize: 3 })]);

    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect((a.chatMessages ?? 0) + (b.chatMessages ?? 0)).toBe(40);
    for (const { gameId } of games) expect(await messagesOf(gameId)).toBe(0);
  });
});

describe("the chat goes with the account (BR-34, exception to BR-18)", () => {
  function accounts(overrides: { passwordHasher?: Pick<PasswordHasher, "verify"> } = {}) {
    const em = orm.em.fork();
    return new AccountService({
      em,
      passwordHasher: (overrides.passwordHasher ?? hasher) as PasswordHasher,
      timeoutSettler: new SqlTimeoutSettler({ em, clock: systemClock }),
      clock: systemClock,
    });
  }

  it("deletes the whole chat of the account's games and leaves the chats of other games", async () => {
    const now = new Date();
    const mine = await game(now, { status: "finished", agoMs: 5 * 60 * SECOND, kinds: ["account", "guest"], messages: 4 });
    const other = await game(now, { status: "finished", agoMs: 5 * 60 * SECOND, messages: 3 });

    await accounts().delete(mine.users[0]!, PASSWORD);

    expect(await messagesOf(mine.gameId)).toBe(0);
    expect(await messagesOf(other.gameId)).toBe(3);
    expect(await exists("games", "id", mine.gameId)).toBe(true); // the game stays as the opponent's history
    expect(await exists("users", "id", mine.users[0]!)).toBe(false);
  });

  it("answers ACTIVE_GAME for a game in progress and leaves its chat as it was", async () => {
    const now = new Date();
    const playing = await game(now, { status: "active", agoMs: -10 * 60 * SECOND, messages: 2 });
    // Both opened the page: a game nobody opened within 15 minutes would be closed lazily and not block.
    await run("update games set started_at = ? where id = ?", [ago(now, 60 * SECOND), playing.gameId]);
    await run("update game_players set is_active = true, seen_at = ? where game_id = ?", [now, playing.gameId]);

    await expect(accounts().delete(playing.users[0]!, PASSWORD)).rejects.toMatchObject({ status: 409, code: "ACTIVE_GAME" });

    expect(await messagesOf(playing.gameId)).toBe(2);
    expect(await exists("users", "id", playing.users[0]!)).toBe(true);
  });

  it("rolls the chat back with the account when the password changes after it was verified", async () => {
    const now = new Date();
    const finished = await game(now, { status: "finished", agoMs: 5 * 60 * SECOND, messages: 2 });
    const racing = {
      verify: async (password: string, passwordHash: string) => {
        const ok = await hasher.verify(password, passwordHash);
        await run(`update users set password_hash = ? where id = ?`, [await hasher.hash("other-pass1"), finished.users[0]]);
        return ok;
      },
    };

    await expect(accounts({ passwordHasher: racing }).delete(finished.users[0]!, PASSWORD)).rejects.toMatchObject({
      code: "INVALID_PASSWORD",
    });

    expect(await messagesOf(finished.gameId)).toBe(2);
  });

  it("rolls the chat back when the deletion of the user row itself fails", async () => {
    const now = new Date();
    const finished = await game(now, { status: "finished", agoMs: 5 * 60 * SECOND, messages: 2 });
    const admin = await connect();
    const name = `fail_${Date.now().toString(36)}${++counter}`;
    await admin.query(`create function ${name}() returns trigger language plpgsql as $$ begin raise exception 'forced failure'; end $$`);
    await admin.query(`create trigger ${name} before delete on users for each row when (old.id = '${finished.users[0]}') execute function ${name}()`);
    try {
      await expect(accounts().delete(finished.users[0]!, PASSWORD)).rejects.toThrow();
      expect(await messagesOf(finished.gameId)).toBe(2);
      expect(await exists("users", "id", finished.users[0]!)).toBe(true);
    } finally {
      await admin.query(`drop trigger ${name} on users`);
      await admin.query(`drop function ${name}()`);
    }
  });

  it("closes the chat for the opponent who stays: unavailable to read, CHAT_UNAVAILABLE to write", async () => {
    const now = new Date();
    const finished = await game(now, { status: "finished", agoMs: 5 * 60 * SECOND, kinds: ["account", "guest"], messages: 2 });
    const opponent = { playerId: finished.players[1]! };
    expect((await chat().read(opponent, finished.gameId, { limit: 50 })).state).toBe("open");

    await accounts().delete(finished.users[0]!, PASSWORD);

    expect(await chat().read(opponent, finished.gameId, { limit: 50 })).toMatchObject({ state: "unavailable", messages: [] });
    await expect(chat().send(opponent, finished.gameId, { text: "halo?", clientId: crypto.randomUUID() })).rejects.toMatchObject({
      code: "CHAT_UNAVAILABLE",
    });
    expect(await messagesOf(finished.gameId)).toBe(0);
  });
});

describe("the read window against the deletion (R9 vs BR-34)", () => {
  it("hides the content after 1 h before the cleanup and after it, though the database holds it until the run", async () => {
    const now = new Date();
    const old = await game(now, { status: "finished", agoMs: HOUR + SECOND, messages: 2 });
    const fresh = await game(now, { status: "finished", agoMs: 60 * SECOND, messages: 2 });
    const reader = { playerId: old.players[0]! };

    const before = await chat().read(reader, old.gameId, { limit: 50 });
    expect(before).toMatchObject({ state: "closed", messages: [] });
    expect(await messagesOf(old.gameId)).toBe(2); // in the database, not given out by the application

    await sweep(new Date());

    expect(await chat().read(reader, old.gameId, { limit: 50 })).toMatchObject({ state: "closed", messages: [] });
    expect(await messagesOf(old.gameId)).toBe(0);
    expect((await chat().read({ playerId: fresh.players[0]! }, fresh.gameId, { limit: 50 })).state).toBe("open");
  });

  it("a game of an account settled lazily after its clock ran out takes the deadline as the end, so the window is counted from it", async () => {
    const now = new Date();
    const dead = await game(now, { status: "active", agoMs: 30 * 60 * SECOND, messages: 2 });
    await run("update game_players set is_active = true where game_id = ?", [dead.gameId]);
    const em = orm.em.fork();
    await new SqlTimeoutSettler({ em, clock: systemClock }).settleFor(dead.users[0]!);

    const [row] = await run("select status, finished_at from games where id = ?", [dead.gameId]);
    expect(row!.status).toBe("finished");
    // `finished_at` is the moment the clock ran out (30 min ago), not the moment of settling.
    expect(now.getTime() - new Date(row!.finished_at).getTime()).toBeGreaterThan(29 * 60 * SECOND);
    expect(now.getTime() - new Date(row!.finished_at).getTime()).toBeLessThan(31 * 60 * SECOND + 10 * SECOND);
    expect((await chat().read({ playerId: dead.players[0]! }, dead.gameId, { limit: 50 })).state).toBe("open");
  });
});

describe("no content outside the database (#148)", () => {
  const MARKER = `znacznik-${Date.now().toString(36)}-czatu`;

  it("keeps a message out of the server log through the cleanup and the account deletion", async () => {
    const now = new Date();
    const token = `chat-cleanup-${next()}`;
    const { gameId, players, users } = await game(now, {
      status: "finished",
      agoMs: 5 * 60 * SECOND,
      kinds: ["guest", "account"],
      messages: 0,
      token,
    });
    const sent = await fetch(`${baseUrl}/api/games/${gameId}/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        "x-gomoku-request": "1",
        "x-forwarded-for": "198.58.0.77",
        cookie: `gomoku_guest=${token}`,
      },
      body: JSON.stringify({ text: MARKER, clientId: crypto.randomUUID() }),
    });
    expect(sent.status).toBe(201);
    expect(await messagesOf(gameId)).toBe(1);

    await run("update games set finished_at = ? where id = ?", [ago(now, 2 * HOUR), gameId]);
    await sweep(now);
    expect(await messagesOf(gameId)).toBe(0);
    const em = orm.em.fork();
    await new AccountService({
      em,
      passwordHasher: hasher,
      timeoutSettler: new SqlTimeoutSettler({ em, clock: systemClock }),
      clock: systemClock,
    }).delete(users[1]!, PASSWORD);

    expect(players).toHaveLength(2);
    expect(readFileSync(SERVER_LOG, "utf8")).not.toContain(MARKER);
  });
});

describe("pg_dump without the data of chat_messages (README, 'Kopie zapasowe bazy')", () => {
  const container = inject("postgresContainerId");
  const url = new URL(inject("databaseUrl"));
  const [dbUser, database] = [decodeURIComponent(url.username), url.pathname.slice(1)];
  const inContainer = (script: string) => execFileAsync("docker", ["exec", container, "sh", "-c", script]);

  it("keeps the table structure and drops the data; the same dump without the flag carries the message", async () => {
    const now = new Date();
    const marker = `dump-${next()}-tresc`;
    const { gameId, players } = await game(now, { status: "finished", agoMs: 60 * SECOND, messages: 0 });
    await run(`insert into chat_messages (game_id, seq, sender_id, client_id, body) values (?, 1, ?, ?, ?)`, [
      gameId,
      players[0]!,
      crypto.randomUUID(),
      marker,
    ]);
    // The command of the README (database and user of the test container instead of the production ones).
    const dump = `pg_dump -U ${dbUser} -Fc --exclude-table-data=chat_messages ${database}`;
    const plain = `pg_dump -U ${dbUser} -Fc ${database}`;

    await inContainer(`${dump} > /tmp/with-flag.dump && ${plain} > /tmp/without-flag.dump`);

    const listed = (await inContainer("pg_restore -l /tmp/with-flag.dump")).stdout;
    expect(listed).toMatch(/TABLE public chat_messages /);
    const dataOf = async (file: string) => (await inContainer(`pg_restore -a -t chat_messages -f - ${file}`)).stdout;
    expect(await dataOf("/tmp/with-flag.dump")).not.toContain(marker);
    expect(await dataOf("/tmp/with-flag.dump")).not.toMatch(/^COPY /m); // the README check: no data block at all
    expect(await dataOf("/tmp/without-flag.dump")).toContain(marker); // positive control: the check can fail
    expect(await dataOf("/tmp/without-flag.dump")).toMatch(/^COPY public\.chat_messages /m);
    await inContainer("rm -f /tmp/with-flag.dump /tmp/without-flag.dump");
  });
});
