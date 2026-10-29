// Schema of the games tables on a real PostgreSQL (E02 phase 1, migration `games`): every CHECK,
// unique and partial unique index, and the foreign-key delete rules. Constraints are the last
// line of defence for BR-01, BR-13 and BR-22, and a mock cannot prove them. Runs only on the
// Testcontainers database from global-setup — never point it at another database.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

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
    [`schema-${n}@example.com`, `Sch_${n}`, `sch_${n}`, "x".repeat(60)],
  );
  return row!.id as string;
}

async function insertGame(extra: Record<string, unknown> = {}): Promise<string> {
  const columns = { origin: "invite", status: "waiting", ...extra };
  const names = Object.keys(columns);
  const [row] = await run(
    `insert into games (${names.join(", ")}) values (${names.map(() => "?").join(", ")}) returning id`,
    Object.values(columns),
  );
  return row!.id as string;
}

async function insertPlayer(gameId: string, extra: Record<string, unknown>): Promise<string> {
  const columns = { game_id: gameId, seat: 1, kind: "account", ...extra };
  const names = Object.keys(columns);
  const [row] = await run(
    `insert into game_players (${names.join(", ")}) values (${names.map(() => "?").join(", ")}) returning id`,
    Object.values(columns),
  );
  return row!.id as string;
}

/** The statement must fail with a violation of exactly this constraint. */
async function expectViolation(statement: Promise<unknown>, constraint: string) {
  await expect(statement).rejects.toThrow(constraint);
}

const hash = () => `${Date.now().toString(16)}${++counter}`.padEnd(64, "0");

describe("games", () => {
  it("applies the clock and status defaults", async () => {
    const id = await insertGame();
    const [row] = await run(`select clock_ms_1, clock_ms_2, turn_started_at, status from games where id = ?`, [id]);
    expect(row).toMatchObject({ clock_ms_1: 600000, clock_ms_2: 600000, turn_started_at: null, status: "waiting" });
  });

  it("rejects an unknown origin and status", async () => {
    await expectViolation(insertGame({ origin: "bot" }), "games_origin_check");
    await expectViolation(insertGame({ status: "paused" }), "games_status_check");
  });

  it("accepts the rematch origin", async () => {
    await expect(insertGame({ origin: "rematch" })).resolves.toBeTruthy();
  });

  it("requires started_at for active and finished, finished_at for finished", async () => {
    await expectViolation(insertGame({ status: "active" }), "games_started_at_check");
    await expectViolation(
      insertGame({ status: "finished", started_at: new Date() }),
      "games_finished_at_check",
    );
    await expect(
      insertGame({ status: "finished", started_at: new Date(), finished_at: new Date() }),
    ).resolves.toBeTruthy();
    await expect(insertGame({ status: "cancelled" })).resolves.toBeTruthy();
  });

  it("keeps the clocks within 0 and 600000 ms", async () => {
    await expectViolation(insertGame({ clock_ms_1: -1 }), "games_clock_ms_check");
    await expectViolation(insertGame({ clock_ms_2: 600001 }), "games_clock_ms_check");
    await expect(insertGame({ clock_ms_1: 0, clock_ms_2: 600000 })).resolves.toBeTruthy();
  });

  it("limits a rematch offer to finished games with its required fields", async () => {
    const finished = { status: "finished", started_at: new Date(), finished_at: new Date() };
    await expectViolation(insertGame({ rematch_state: "maybe", ...finished }), "games_rematch_state_check");
    await expectViolation(
      insertGame({ rematch_state: "declined", status: "waiting" }),
      "games_rematch_only_finished_check",
    );
    await expectViolation(
      insertGame({ rematch_state: "pending", rematch_offered_by_seat: 1, ...finished }),
      "games_rematch_pending_check",
    );
    await expectViolation(
      insertGame({ rematch_state: "pending", rematch_expires_at: new Date(), ...finished }),
      "games_rematch_pending_check",
    );
    await expectViolation(
      insertGame({ rematch_offered_by_seat: 3, ...finished }),
      "games_rematch_offered_by_seat_check",
    );
    await expect(
      insertGame({
        rematch_state: "pending",
        rematch_offered_by_seat: 2,
        rematch_expires_at: new Date(Date.now() + 300_000),
        ...finished,
      }),
    ).resolves.toBeTruthy();
  });

  it("clears the rematch link when the rematch game is deleted", async () => {
    const rematch = await insertGame({ origin: "rematch" });
    const finished = await insertGame({
      status: "finished",
      started_at: new Date(),
      finished_at: new Date(),
      rematch_state: "accepted",
      rematch_game_id: rematch,
    });
    await run(`delete from games where id = ?`, [rematch]);
    const [row] = await run(`select rematch_game_id, rematch_state from games where id = ?`, [finished]);
    expect(row).toEqual({ rematch_game_id: null, rematch_state: "accepted" });
  });
});

describe("game_players", () => {
  it("allows exactly two seats per game, one player each", async () => {
    const game = await insertGame();
    await insertPlayer(game, { seat: 1, user_id: await insertUser() });
    await expectViolation(
      insertPlayer(game, { seat: 1, user_id: await insertUser() }),
      "game_players_game_id_seat_unique",
    );
    await expectViolation(insertPlayer(game, { seat: 3 }), "game_players_seat_check");
    await expect(insertPlayer(game, { seat: 2, user_id: await insertUser() })).resolves.toBeTruthy();
  });

  it("does not seat one account twice in a game, but lets guests share a NULL user", async () => {
    const game = await insertGame();
    const user = await insertUser();
    await insertPlayer(game, { seat: 1, user_id: user });
    await expectViolation(
      insertPlayer(game, { seat: 2, user_id: user }),
      "game_players_game_id_user_id_unique",
    );
    const other = await insertGame();
    await insertPlayer(other, { seat: 1, kind: "guest", guest_token_hash: hash() });
    await expect(
      insertPlayer(other, { seat: 2, kind: "guest", guest_token_hash: hash() }),
    ).resolves.toBeTruthy();
  });

  it("allows only one occupied slot per account (BR-13)", async () => {
    const user = await insertUser();
    const first = await insertGame();
    await insertPlayer(first, { user_id: user, is_active: true });
    const second = await insertGame();
    await expectViolation(
      insertPlayer(second, { user_id: user, is_active: true }),
      "game_players_user_id_active_unique",
    );
    // An inactive row (a finished or cancelled game) does not occupy the slot.
    await expect(insertPlayer(second, { user_id: user, is_active: false })).resolves.toBeTruthy();
    // Releasing the slot lets the account take a new one.
    await run(`update game_players set is_active = false where game_id = ?`, [first]);
    const third = await insertGame();
    await expect(insertPlayer(third, { user_id: user, is_active: true })).resolves.toBeTruthy();
  });

  it("ties guests to NULL user and tokens to guests", async () => {
    const game = await insertGame();
    await expectViolation(
      insertPlayer(game, { kind: "guest", user_id: await insertUser() }),
      "game_players_guest_no_user_check",
    );
    await expectViolation(
      insertPlayer(game, { kind: "account", guest_token_hash: hash() }),
      "game_players_token_only_guest_check",
    );
    await expectViolation(insertPlayer(game, { kind: "robot" }), "game_players_kind_check");
    // A guest whose token was cleared (NULL) is valid.
    await expect(insertPlayer(game, { seat: 2, kind: "guest", guest_token_hash: null })).resolves.toBeTruthy();
  });

  it("keeps guest token hashes unique", async () => {
    const token = hash();
    await insertPlayer(await insertGame(), { kind: "guest", guest_token_hash: token });
    await expectViolation(
      insertPlayer(await insertGame(), { kind: "guest", guest_token_hash: token }),
      "game_players_guest_token_hash_unique",
    );
  });

  it("starts unseen and inactive, and keeps the player when the account is deleted", async () => {
    const user = await insertUser();
    const player = await insertPlayer(await insertGame(), { user_id: user });
    const [before] = await run(`select seen_at, is_active from game_players where id = ?`, [player]);
    expect(before).toEqual({ seen_at: null, is_active: false });
    await run(`delete from users where id = ?`, [user]);
    const [after] = await run(`select user_id from game_players where id = ?`, [player]);
    expect(after).toEqual({ user_id: null });
  });
});

describe("invitations", () => {
  const invite = (game: string, code: string, extra = "now() + interval '1 day'") =>
    run(`insert into invitations (game_id, code, expires_at) values (?, ?, ${extra}) returning id`, [game, code]);

  it("accepts a code of the invitation alphabet and rejects look-alikes and wrong lengths", async () => {
    await expect(invite(await insertGame(), "ABCD2345")).resolves.toBeTruthy();
    for (const bad of ["ABCD234", "abcd2345", "ABCD0345", "ABCDO345", "ABCD1345", "ABCDI345", "ABCDL345"]) {
      await expectViolation(invite(await insertGame(), bad), "invitations_code_check");
    }
  });

  it("cannot store more than eight symbols", async () => {
    await expectViolation(invite(await insertGame(), "ABCD23456"), "value too long");
  });

  it("allows one invitation per game and unique codes", async () => {
    const game = await insertGame();
    await invite(game, "KKKK2222");
    await expectViolation(invite(game, "KKKK3333"), "invitations_game_id_unique");
    await expectViolation(invite(await insertGame(), "KKKK2222"), "invitations_code_unique");
  });

  it("is removed with its game and survives the removal of the consuming player", async () => {
    const game = await insertGame();
    const player = await insertPlayer(game, { user_id: await insertUser() });
    await invite(game, "MMMM4444");
    await run(`update invitations set consumed_at = now(), consumed_by_id = ? where game_id = ?`, [player, game]);
    await run(`delete from game_players where id = ?`, [player]);
    const [kept] = await run(`select consumed_by_id from invitations where game_id = ?`, [game]);
    expect(kept).toEqual({ consumed_by_id: null });
    await run(`delete from games where id = ?`, [game]);
    expect(await run(`select 1 from invitations where game_id = ?`, [game])).toHaveLength(0);
  });

  it("deletes the players with their game", async () => {
    const game = await insertGame();
    await insertPlayer(game, { user_id: await insertUser() });
    await run(`delete from games where id = ?`, [game]);
    expect(await run(`select 1 from game_players where game_id = ?`, [game])).toHaveLength(0);
  });
});
