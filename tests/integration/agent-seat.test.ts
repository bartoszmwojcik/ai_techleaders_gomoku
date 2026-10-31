// AgentSeatService on a real PostgreSQL (E06-S01): the atomic join over MCP, races with accounts and
// other agents, the uniform refusal, the rollback, the lifetime of the agent token and its
// separation from the guest token. The conditional updates, locks and CHECKs live in SQL, so a
// fake `em` cannot prove them. Services are built like `withRequestScope` builds them.
import { GUEST_TOKEN_GRACE_MS } from "@gomoku/core";
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { hashOpaqueToken } from "../../packages/app/src/server/http/opaque-token";
import { systemClock } from "../../packages/app/src/server/services/email/email-sender";
import {
  AgentSeatService,
  type AgentJoinGuard,
} from "../../packages/app/src/server/services/games/agent-seat-service";
import { ColorDraw } from "../../packages/app/src/server/services/games/color-draw";
import { GameService } from "../../packages/app/src/server/services/games/game-service";
import { InvitationCodes } from "../../packages/app/src/server/services/games/invitation-codes";
import { InvitationService } from "../../packages/app/src/server/services/games/invitation-service";
import { SqlTimeoutSettler } from "../../packages/app/src/server/services/games/timeout-settler";
import { RateLimiter } from "../../packages/app/src/server/services/rate-limit/rate-limiter";

let orm: Orm;
let counter = 0;

beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await orm.close();
});

const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, unknown>[]>(text, params);

async function insertUser(): Promise<string> {
  const n = `${Date.now().toString(36)}${++counter}`;
  const [row] = await run(
    `insert into users (email, display_name, display_name_key, password_hash)
     values (?, ?, ?, ?) returning id`,
    [`agent-seat-${n}@example.com`, `As_${n}`, `as_${n}`, "x".repeat(60)],
  );
  return row!.id as string;
}

/** Fresh pools per test, so a test never spends another's budget. */
const guard = (over: { lookupLimit?: number; joinLimit?: number } = {}): AgentJoinGuard => {
  const n = `${Date.now()}:${++counter}`;
  return {
    lookup: { key: `agent-lookup:test:${n}`, limit: over.lookupLimit ?? 1000 },
    join: { key: `mcp-join:test:${n}`, limit: over.joinLimit ?? 1000 },
  };
};

function scope() {
  const em = orm.em.fork();
  const rateLimiter = new RateLimiter({ em });
  const timeoutSettler = new SqlTimeoutSettler({ em, clock: systemClock });
  return {
    agents: new AgentSeatService({ em, clock: systemClock, rateLimiter, colorDraw: new ColorDraw() }),
    invitations: new InvitationService({ em, clock: systemClock, rateLimiter, timeoutSettler, colorDraw: new ColorDraw() }),
    games: new GameService({
      em,
      clock: systemClock,
      rateLimiter,
      invitationCodes: new InvitationCodes(),
      timeoutSettler,
      serverConfig: { appOrigin: "https://gomoku.test" } as never,
    }),
  };
}

async function newGame() {
  const creator = await insertUser();
  const { gameId, invitation } = await scope().games.create({ kind: "account", userId: creator });
  return { creator, gameId, code: invitation.code };
}

async function newGuestGame() {
  const tokenHash = hashOpaqueToken(`guest-${Date.now()}-${++counter}`);
  const { gameId, invitation } = await scope().games.create({
    kind: "guest",
    tokenHash,
    limitKey: `games-create-guest:test:${Date.now()}:${++counter}`,
  });
  return { tokenHash, gameId, code: invitation.code };
}

const status = async (gameId: string) => (await run(`select status from games where id = ?`, [gameId]))[0]!.status;
const players = (gameId: string) =>
  run(
    `select seat, kind, user_id, is_active, seen_at, agent_token_hash, agent_name, join_channel, guest_token_hash, nickname
     from game_players where game_id = ? order by seat`,
    [gameId],
  );
const uniform = { status: 410, code: "INVALID_INVITATION" };

describe("AgentSeatService.join", () => {
  it("seats the agent in seat 2 with its own token, starts the game and consumes the invitation", async () => {
    const { creator, gameId, code } = await newGame();

    const result = await scope().agents.join(code, "claude opus 5.5", guard());

    expect(result).toMatchObject({
      gameId,
      status: "active",
      you: { seat: 2 },
      opponent: { kind: "account" },
    });
    expect(result.token).toMatch(/^[\w-]{43}$/);
    expect(await status(gameId)).toBe("active");
    const [first, second] = await players(gameId);
    expect(first).toMatchObject({ seat: 1, kind: "account", user_id: creator, is_active: true });
    expect(second).toMatchObject({
      seat: 2,
      kind: "agent",
      user_id: null,
      is_active: true,
      join_channel: "mcp",
      agent_name: "claude opus 5.5",
      agent_token_hash: hashOpaqueToken(result.token),
      guest_token_hash: null,
      nickname: null,
    });
    expect(second!.seen_at).not.toBeNull();
    const [game] = await run(`select black_seat, started_at from games where id = ?`, [gameId]);
    expect([1, 2]).toContain(game!.black_seat);
    expect(result.you.color).toBe(game!.black_seat === 2 ? "black" : "white");
    expect(game!.started_at).not.toBeNull();
    const [invitation] = await run(
      `select i.consumed_at, p.kind from invitations i join game_players p on p.id = i.consumed_by_id where i.game_id = ?`,
      [gameId],
    );
    expect(invitation).toMatchObject({ kind: "agent" });
    expect(invitation!.consumed_at).not.toBeNull();
    // The token is nowhere in plain.
    expect(JSON.stringify(await players(gameId))).not.toContain(result.token);
  });

  it("joins by a link and in any case, with no name; the creator can be a guest", async () => {
    const guest = await newGuestGame();
    const link = `https://elsewhere.example/invite/${guest.code.toLowerCase()}?x=1#y`;

    const result = await scope().agents.join(link, undefined, guard());

    expect(result).toMatchObject({ gameId: guest.gameId, opponent: { kind: "guest" } });
    const [, agent] = await players(guest.gameId);
    expect(agent).toMatchObject({ kind: "agent", agent_name: null });
  });

  it("accepts the creator's own code (the human with their own agent)", async () => {
    const { creator, gameId, code } = await newGame();
    const result = await scope().agents.join(code, undefined, guard());
    expect(result.gameId).toBe(gameId);
    const [first, second] = await players(gameId);
    expect(first).toMatchObject({ user_id: creator, kind: "account" });
    expect(second).toMatchObject({ kind: "agent" });
  });

  it("does not use up the creator's slot or the account's BR-13 for the agent", async () => {
    const first = await newGame();
    const second = await newGame();
    // One agent can hold several games: it has no slot (R3); each join has its own token.
    const a = await scope().agents.join(first.code, undefined, guard());
    const b = await scope().agents.join(second.code, undefined, guard());
    expect(a.token).not.toBe(b.token);
  });

  it.each([
    ["an unknown code", () => "ZZZZ-ZZZZ"],
    ["a malformed code", () => "ABCD-EF"],
    ["two codes", () => "ABCD-EFGH ABCD-EFGH"],
  ])("answers %s with the uniform 410", async (_label, code) => {
    await expect(scope().agents.join(code(), undefined, guard())).rejects.toMatchObject(uniform);
  });

  it("answers a used, expired and cancelled invitation with the uniform 410, and a third player too", async () => {
    const used = await newGame();
    await scope().agents.join(used.code, undefined, guard());
    await expect(scope().agents.join(used.code, undefined, guard())).rejects.toMatchObject(uniform);
    await expect(
      scope().invitations.accept(used.code, { userId: await insertUser() }, { as: "user" }, { key: `il:${++counter}`, limit: 100 }),
    ).rejects.toMatchObject(uniform);
    expect(await players(used.gameId)).toHaveLength(2);

    const expired = await newGame();
    await run(`update invitations set expires_at = now() - interval '1 minute' where game_id = ?`, [expired.gameId]);
    await expect(scope().agents.join(expired.code, undefined, guard())).rejects.toMatchObject(uniform);
    expect(await players(expired.gameId)).toHaveLength(1);

    const cancelled = await newGame();
    await scope().games.cancel(
      { playerId: (await run(`select id from game_players where game_id = ?`, [cancelled.gameId]))[0]!.id as string },
      cancelled.gameId,
    );
    await expect(scope().agents.join(cancelled.code, undefined, guard())).rejects.toMatchObject(uniform);
  });

  it("answers a game nobody opened within 15 minutes with the uniform 410 and closes it", async () => {
    const { code, gameId } = await newGame();
    await scope().agents.join(code, undefined, guard());
    // Not the agent's code any more; a lobby or a rematch game has no invitation at all.
    await run(`update games set started_at = now() - interval '16 minutes' where id = ?`, [gameId]);
    await run(`update game_players set seen_at = null where game_id = ? and seat = 1`, [gameId]);
    await expect(scope().agents.join(code, undefined, guard())).rejects.toMatchObject(uniform);
  });

  it("refuses a bad name before the code is used and before any pool is spent", async () => {
    const { code, gameId } = await newGame();
    const pools = guard({ lookupLimit: 1 });

    await expect(scope().agents.join(code, "evil.com", pools)).rejects.toMatchObject({
      status: 400,
      code: "INVALID_INPUT",
    });
    expect(await status(gameId)).toBe("waiting");
    expect(await run(`select 1 from rate_limit_buckets where key in (?, ?)`, [pools.lookup.key, pools.join.key])).toHaveLength(0);
    // The same code still works, with a good name or none, even with a pool of one attempt.
    await expect(scope().agents.join(code, "gpt-4.5", pools)).resolves.toMatchObject({ gameId });
  });

  it("lets exactly one of two agents win the same code", async () => {
    const { code, gameId } = await newGame();

    const outcomes = await Promise.allSettled([
      scope().agents.join(code, "a", guard()),
      scope().agents.join(code, "b", guard()),
    ]);

    expect(outcomes.filter(({ status: s }) => s === "fulfilled")).toHaveLength(1);
    const lost = outcomes.find(({ status: s }) => s === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toMatchObject(uniform);
    expect(await players(gameId)).toHaveLength(2);
  });

  it("lets exactly one of an agent and an account win the same code, in both orders of arrival", async () => {
    for (let round = 0; round < 4; round += 1) {
      const { code, gameId } = await newGame();
      const joiner = await insertUser();
      const attempts = [
        () => scope().agents.join(code, undefined, guard()),
        () => scope().invitations.accept(code, { userId: joiner }, { as: "user" }, { key: `il:${++counter}`, limit: 100 }),
      ];
      if (round % 2 === 1) attempts.reverse();

      const outcomes = await Promise.allSettled(attempts.map((attempt) => attempt()));

      expect(outcomes.filter(({ status: s }) => s === "fulfilled"), `round ${round}`).toHaveLength(1);
      const rows = await players(gameId);
      expect(rows).toHaveLength(2);
      expect(await status(gameId)).toBe("active");
    }
  });

  it("rolls everything back when seat 2 is taken: the invitation stays unused", async () => {
    const { code, gameId } = await newGame();
    // A third player in the seat, as only a bug could put it: the unique index refuses the agent.
    await run(
      `insert into game_players (game_id, seat, kind, guest_token_hash, is_active) values (?, 2, 'guest', ?, true)`,
      [gameId, hashOpaqueToken(`stray-${++counter}`)],
    );

    await expect(scope().agents.join(code, undefined, guard())).rejects.toMatchObject(uniform);

    expect((await players(gameId)).map(({ kind }) => kind)).toEqual(["account", "guest"]);
    const [invitation] = await run(`select consumed_at, consumed_by_id from invitations where game_id = ?`, [gameId]);
    expect(invitation).toEqual({ consumed_at: null, consumed_by_id: null });
    expect(await status(gameId)).toBe("waiting");
  });

  it("counts failed codes in the pool of the agents, gives the attempt back for a good code", async () => {
    const pools = guard({ lookupLimit: 2 });
    await expect(scope().agents.join("ZZZZ-ZZZZ", undefined, pools)).rejects.toMatchObject(uniform);
    await expect(scope().agents.join("ZZZZ-ZZZZ", undefined, pools)).rejects.toMatchObject(uniform);
    await expect(scope().agents.join("ZZZZ-ZZZZ", undefined, pools)).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
    // Spent: even a correct code is refused (no oracle).
    const { code } = await newGame();
    await expect(scope().agents.join(code, undefined, pools)).rejects.toMatchObject({ status: 429 });

    const fresh = guard({ lookupLimit: 1 });
    const { code: good } = await newGame();
    await scope().agents.join(good, undefined, fresh);
    const [bucket] = await run(`select "count" from rate_limit_buckets where key = ?`, [fresh.lookup.key]);
    expect(bucket!.count).toBe(0);
  });

  it("limits the successful joins per address and does not count the failed ones", async () => {
    const pools = guard({ joinLimit: 2 });
    for (let i = 0; i < 5; i += 1) {
      await expect(scope().agents.join("ZZZZ-ZZZZ", undefined, pools)).rejects.toMatchObject(uniform);
    }
    const [one, two, three] = [await newGame(), await newGame(), await newGame()];
    await scope().agents.join(one.code, undefined, pools);
    await scope().agents.join(two.code, undefined, pools);
    await expect(scope().agents.join(three.code, undefined, pools)).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
    expect(await status(three.gameId)).toBe("waiting");
  });
});

describe("the agent token (GameService.findParticipant)", () => {
  async function joined() {
    const game = await newGame();
    const result = await scope().agents.join(game.code, undefined, guard());
    return { ...game, token: result.token, hash: hashOpaqueToken(result.token) };
  }

  it("finds the agent by its token hash in its own game only", async () => {
    const mine = await joined();
    const other = await joined();
    const games = scope().games;

    const found = await games.findParticipant({ agentTokenHash: mine.hash }, mine.gameId);

    const [seat2] = await run(`select id from game_players where game_id = ? and seat = 2`, [mine.gameId]);
    expect(found).toEqual({ playerId: seat2!.id });
    expect(await games.findParticipant({ agentTokenHash: mine.hash }, other.gameId)).toBeNull();
    expect(await games.findParticipant({ agentTokenHash: hashOpaqueToken("nope") }, mine.gameId)).toBeNull();
  });

  it("does not take a guest token for an agent token, nor the other way round", async () => {
    const agent = await joined();
    const guest = await newGuestGame();
    const games = scope().games;
    expect(await games.findParticipant({ guestTokenHash: agent.hash }, agent.gameId)).toBeNull();
    expect(await games.findParticipant({ agentTokenHash: guest.tokenHash }, guest.gameId)).toBeNull();
    expect(await games.findParticipant({ guestTokenHash: guest.tokenHash }, guest.gameId)).not.toBeNull();
  });

  it("works while the game is on and for one hour after it finished, not longer (BR-22)", async () => {
    const { gameId, hash } = await joined();
    const games = scope().games;
    expect(await games.findParticipant({ agentTokenHash: hash }, gameId)).not.toBeNull();

    const finish = (agoMs: number) =>
      run(
        `update games set status = 'finished', winner_seat = 1, end_reason = 'resignation', finished_at = now() - (? * interval '1 millisecond') where id = ?`,
        [agoMs, gameId],
      );
    await finish(GUEST_TOKEN_GRACE_MS - 60_000);
    expect(await games.findParticipant({ agentTokenHash: hash }, gameId)).not.toBeNull();
    await finish(GUEST_TOKEN_GRACE_MS + 60_000);
    expect(await games.findParticipant({ agentTokenHash: hash }, gameId)).toBeNull();
  });

  it("stops working when the game is closed unplayed after the join (Q21)", async () => {
    const { gameId, hash } = await joined();
    await run(`update games set status = 'cancelled' where id = ?`, [gameId]);
    expect(await scope().games.findParticipant({ agentTokenHash: hash }, gameId)).toBeNull();
  });

  it("shows the agent to the human opponent by kind, with the declared name and no display name", async () => {
    const game = await newGame();
    await scope().agents.join(game.code, "llama3.1:8b", guard());
    const creatorSeat = { playerId: (await run(`select id from game_players where game_id = ? and seat = 1`, [game.gameId]))[0]!.id as string };

    const state = await scope().games.getState(creatorSeat, game.gameId);

    expect(state.players[1]).toEqual({ seat: 2, kind: "agent", displayName: null, agentName: "llama3.1:8b", seen: true });
    expect(JSON.stringify(state)).not.toMatch(/token|hash/i);
  });
});
