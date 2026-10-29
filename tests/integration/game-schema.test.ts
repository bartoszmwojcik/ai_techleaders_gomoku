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

const FINISHED = {
  status: "finished",
  started_at: new Date(),
  finished_at: new Date(),
  black_seat: 1,
  end_reason: "draw",
};

/** Column values of a board with the given cells set, as `bit(225)` strings. */
function board(black: number[], white: number[]) {
  const bits = (cells: number[]) =>
    Array.from({ length: 225 }, (_, c) => (cells.includes(c) ? "1" : "0")).join("");
  return { stones_black: bits(black), stones_white: bits(white) };
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
    await expectViolation(insertGame({ status: "active", black_seat: 1 }), "games_started_at_check");
    await expectViolation(
      insertGame({ status: "finished", started_at: new Date(), black_seat: 1, end_reason: "draw" }),
      "games_finished_at_check",
    );
    await expect(insertGame(FINISHED)).resolves.toBeTruthy();
    await expect(insertGame({ status: "cancelled" })).resolves.toBeTruthy();
  });

  it("keeps the clocks within 0 and 600000 ms", async () => {
    await expectViolation(insertGame({ clock_ms_1: -1 }), "games_clock_ms_check");
    await expectViolation(insertGame({ clock_ms_2: 600001 }), "games_clock_ms_check");
    await expect(insertGame({ clock_ms_1: 0, clock_ms_2: 600000 })).resolves.toBeTruthy();
  });

  it("limits a rematch offer to finished games with its required fields", async () => {
    const finished = FINISHED;
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

  it("round-trips bit(225) boards and the bytea move log, byte 0x00 and empty ones included", async () => {
    const id = await insertGame();
    const [empty] = await run(
      `select stones_black::text as black, stones_white::text as white, move_count, moves from games where id = ?`,
      [id],
    );
    expect(empty).toMatchObject({ black: "0".repeat(225), white: "0".repeat(225), move_count: 0 });
    expect(Buffer.from(empty!.moves as Uint8Array)).toHaveLength(0);

    const full = await insertGame({ ...board([0, 224], [7, 8]), move_count: 4, moves: Buffer.from([0, 7, 224, 8]) });
    const [row] = await run(`select stones_black::text as black, moves from games where id = ?`, [full]);
    expect((row!.black as string)[0]).toBe("1");
    expect((row!.black as string)[224]).toBe("1");
    expect(Array.from(row!.moves as Uint8Array)).toEqual([0, 7, 224, 8]);
  });

  it("rejects boards that break the invariants (occupied cell, wrong counts, bad alternation)", async () => {
    // The same cell for both colours.
    await expectViolation(
      insertGame({ ...board([5], [5]), move_count: 2, moves: Buffer.from([5, 5]) }),
      "games_board_disjoint_check",
    );
    // A stone more than the move counter says (what a stone on an occupied cell would look like).
    await expectViolation(
      insertGame({ ...board([5, 6], [7]), move_count: 2, moves: Buffer.from([5, 7]) }),
      "games_stone_count_check",
    );
    // Log length differs from the counter.
    await expectViolation(
      insertGame({ ...board([5], []), move_count: 1, moves: Buffer.from([5, 6]) }),
      "games_moves_length_check",
    );
    // White ahead of black, and black two ahead.
    await expectViolation(
      insertGame({ ...board([], [5]), move_count: 1, moves: Buffer.from([5]) }),
      "games_alternation_check",
    );
    await expectViolation(
      insertGame({ ...board([5, 6], []), move_count: 2, moves: Buffer.from([5, 6]) }),
      "games_alternation_check",
    );
    await expectViolation(insertGame({ move_count: 226 }), "games_move_count_check");
    await expect(
      insertGame({ ...board([5, 6], [7]), move_count: 3, moves: Buffer.from([5, 7, 6]) }),
    ).resolves.toBeTruthy();
  });

  it("accepts a full 225-stone board", async () => {
    const cells = Array.from({ length: 225 }, (_, c) => c);
    const black = cells.filter((c) => (Math.floor((c % 15) / 2) + Math.floor(c / 15)) % 2 === 0);
    const white = cells.filter((c) => !black.includes(c));
    expect(black).toHaveLength(113);
    await expect(
      insertGame({ ...board(black, white), move_count: 225, moves: Buffer.from(cells) }),
    ).resolves.toBeTruthy();
  });

  it("ties the result columns together", async () => {
    await expectViolation(insertGame({ black_seat: 3 }), "games_black_seat_check");
    await expectViolation(insertGame({ ...FINISHED, end_reason: "timeout", winner_seat: 0 }), "games_winner_seat_check");
    await expectViolation(insertGame({ ...FINISHED, end_reason: "abandoned" }), "games_end_reason_check");
    // Finished needs a reason; a reason needs a finished game.
    await expectViolation(insertGame({ ...FINISHED, end_reason: null }), "games_finished_end_reason_check");
    await expectViolation(insertGame({ end_reason: "draw" }), "games_finished_end_reason_check");
    // Active and finished games know their black seat.
    await expectViolation(
      insertGame({ status: "active", started_at: new Date() }),
      "games_active_black_seat_check",
    );
    // A draw has no winner; every other ending has one.
    await expectViolation(insertGame({ ...FINISHED, winner_seat: 1 }), "games_draw_no_winner_check");
    for (const reason of ["five_in_row", "timeout", "resignation"]) {
      await expectViolation(
        insertGame({ ...FINISHED, end_reason: reason }),
        "games_winner_required_check",
      );
      await expect(
        insertGame({ ...FINISHED, end_reason: reason, winner_seat: 2 }),
      ).resolves.toBeTruthy();
    }
  });

  it("clears the rematch link when the rematch game is deleted", async () => {
    const rematch = await insertGame({ origin: "rematch" });
    const finished = await insertGame({
      ...FINISHED,
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
