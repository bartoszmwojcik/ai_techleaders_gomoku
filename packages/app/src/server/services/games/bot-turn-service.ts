import {
  AppError,
  BOARD_CELLS,
  coordsOf,
  decodeBitboard,
  seatOnTurn,
  showPauseMs,
  type BotLevel,
  type Seat,
} from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

import type { ServerConfig } from "../../config";
import type { Clock } from "../email/email-sender";
import type { BotEngine } from "./bot-engine";
import type { GameMoveService } from "./game-move-service";

type Deps = {
  em: EntityManager;
  gameMoveService: GameMoveService;
  botEngine: BotEngine;
  clock: Clock;
  serverConfig: Pick<ServerConfig, "show">;
};

/** One row per bot of the game (0-2: two in a bot vs bot show, show-mode "Driver"). */
type PeekRow = {
  status: string;
  /** `show` waits for the pause before the move (P9); every other game plays at once. */
  origin: string;
  variant: string;
  black_seat: number | null;
  move_count: number;
  stones_black: string;
  stones_white: string;
  /** The clock runs: the player opened the game (R4, `START_CLOCK_SQL`). */
  started: boolean;
  bot_id: string;
  bot_seat: number;
  bot_level: number;
  bot_memory_mb: number | null;
  bot_depth_cap: number | null;
  /** What is left on the bot's clock now (R6); `null` before the clock starts. */
  remaining_ms: number | null;
  /** Milliseconds since the turn began (the pause counts from it); `null` before the clock starts. */
  elapsed_ms: number | null;
};

// A read without a lock (R1): the search must not hold the game row or a pooled connection. The
// move is written later by `GameMoveService.play`, whose conditional update refuses a stale one.
// Every bot of the game, one row each (show-mode "Driver": a show has two); the code picks the one on turn.
// `?` binds: now, now, the game id.
const PEEK_SQL = `
  select g.status, g.origin, g.variant, g.black_seat, g.move_count, g.stones_black::text as stones_black,
    g.stones_white::text as stones_white, g.turn_started_at is not null as started,
    p.id as bot_id, p.seat as bot_seat, p.bot_level, p.bot_memory_mb, p.bot_depth_cap,
    greatest(0, (case when p.seat = 1 then g.clock_ms_1 else g.clock_ms_2 end)
      - floor(extract(epoch from (?::timestamptz - g.turn_started_at)) * 1000))::int as remaining_ms,
    floor(extract(epoch from (?::timestamptz - g.turn_started_at)) * 1000)::int as elapsed_ms
  from games g join game_players p on p.game_id = g.id and p.kind = 'bot'
  where g.id = ?`;

/**
 * Refusals that mean "the bot's move is not needed any more": somebody else wrote it (two reads at
 * once across processes), the player resigned or the game ended on time meanwhile (Edge Cases).
 */
const LOST_RACE = new Set(["STALE_MOVE", "GAME_FINISHED", "NOT_YOUR_TURN", "GAME_NOT_ACTIVE", "GAME_NOT_STARTED"]);

/** What one call did; the routes ignore it, the tests read it. */
export type BotTurnOutcome = "played" | "idle" | "busy" | "lost" | "failed";

// The games whose bot move is being computed in this process. On `globalThis`, because pages and
// route handlers hold separate copies of the server modules (lesson 2026-10-27-next-layers-duplicate-modules):
// a module-level set would let a page read and a route read compute the same move twice.
const globalForBot = globalThis as typeof globalThis & { __gomokuBotTurns?: Set<string> };

export function botTurnsInFlight(): Set<string> {
  return (globalForBot.__gomokuBotTurns ??= new Set());
}

/** The bot whose seat is on turn, whichever order the rows came in; none before the colours are drawn. */
function botOnTurn(rows: readonly PeekRow[]): PeekRow | undefined {
  return rows.find((row) => row.black_seat !== null && seatOnTurn(row.move_count, row.black_seat as Seat) === row.bot_seat);
}

/**
 * The bot on turn may move: a classic game whose clock runs, on a board with a free cell; in a show only once
 * its pause since the start of the turn is over (P9: the move is "due" after the pause, the search starts then).
 */
function isDue(row: PeekRow, gameId: string, show: ServerConfig["show"]): boolean {
  if (row.status !== "active" || row.variant !== "classic" || !row.started || row.move_count >= BOARD_CELLS) return false;
  if (row.origin !== "show") return true;
  const pauseMs = showPauseMs(gameId, row.move_count + 1, { minMs: show.pauseMinMs, maxMs: show.pauseMaxMs });
  return row.elapsed_ms !== null && row.elapsed_ms >= pauseMs;
}

/**
 * Plays the bot's move when it is due (spec 2026-11-05-hosted-bot R1). Called after the player's move
 * and after every read of the state (`scheduleBotTurn`), so a computation lost to a restart is simply
 * done again by the next read; the seed depends on the game and the move number only (R16), so it is
 * the same move. Nothing is locked during the search; one computation per game at a time in this process.
 */
export class BotTurnService {
  readonly #em: EntityManager;
  readonly #gameMoveService: GameMoveService;
  readonly #engine: BotEngine;
  readonly #clock: Clock;
  readonly #show: ServerConfig["show"];

  constructor({ em, gameMoveService, botEngine, clock, serverConfig }: Deps) {
    this.#clock = clock;
    this.#show = serverConfig.show;
    this.#em = em;
    this.#gameMoveService = gameMoveService;
    this.#engine = botEngine;
  }

  async playDueMove(gameId: string): Promise<BotTurnOutcome> {
    const inFlight = botTurnsInFlight();
    if (inFlight.has(gameId)) return "busy";
    inFlight.add(gameId);
    try {
      const now = this.#clock.now();
      const row = botOnTurn(await this.#em.execute<PeekRow[]>(PEEK_SQL, [now, now, gameId]));
      if (!row || !isDue(row, gameId, this.#show)) return "idle";
      const moveNumber = row.move_count + 1;
      // In a worker thread, one search at a time in the process; the row is not locked meanwhile.
      const cell = await this.#engine.choose({
        gameId,
        moveNumber,
        position: {
          black: decodeBitboard(row.stones_black),
          white: decodeBitboard(row.stones_white),
          moveCount: row.move_count,
        },
        level: row.bot_level as BotLevel,
        depthCap: row.bot_depth_cap,
        memoryMb: row.bot_memory_mb,
        remainingClockMs: row.remaining_ms ?? 0,
      });
      // Written as the bot's seat: the same checks, clock charge and end of game as a person's move (BR-58).
      await this.#gameMoveService.play({ playerId: row.bot_id }, gameId, { ...coordsOf(cell), moveNumber });
      return "played";
    } catch (error) {
      if (error instanceof AppError && LOST_RACE.has(error.code)) return "lost";
      // No position in the log: only the game and what failed (with the code of an application error).
      console.error(
        JSON.stringify({
          event: "bot.turn_failed",
          ts: new Date().toISOString(),
          gameId,
          error: (error as Error).name,
          ...(error instanceof AppError && { code: error.code }),
        }),
      );
      return "failed";
    } finally {
      inFlight.delete(gameId);
    }
  }
}
