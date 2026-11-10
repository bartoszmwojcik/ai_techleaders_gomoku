import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  botDisplayName,
  botStrengthOf,
  resolveGameSettings,
  type BotLevel,
  type BotStrength,
  type BotStrengthView,
  type GameStatus,
  type Seat,
  type ShowCreateInput,
  type ShowLayout,
} from "@gomoku/core";
import { Game, GamePlayer, type EntityManager } from "@gomoku/db";

import type { ServerConfig } from "../../config";
import type { Clock } from "../email/email-sender";
import type { RateLimiter } from "../rate-limit/rate-limiter";
import { refuse, type BotAdmission } from "./bot-admission";
import type { ColorDraw } from "./color-draw";
import { GAME_NOT_FOUND_MESSAGE, watchableState, type WatchableState } from "./game-service";
import { EXPIRE_WAITING_OF_GAME } from "./lazy-closing";
import type { TimeoutSettler } from "./timeout-settler";

type Deps = {
  em: EntityManager;
  clock: Clock;
  rateLimiter: RateLimiter;
  timeoutSettler: TimeoutSettler;
  serverConfig: ServerConfig;
  colorDraw: ColorDraw;
  botAdmission: BotAdmission;
};

/** Pool `show-create:{userId}` (show-mode P10): a client in a loop cannot pile up shows. */
export const SHOW_CREATE_LIMIT = 10;
export const SHOW_CREATE_WINDOW_MS = 60 * 60 * 1000;

export const SHOW_RUNNING_MESSAGE = "Trwa już pokaz. Zakończ go albo wróć do niego.";
export const SHOW_UNAVAILABLE_MESSAGE = "Pokaz jest teraz wyłączony.";
export const SHOW_NOT_ACTIVE_MESSAGE = "Ten pokaz już się zakończył.";

/** Why a show cannot be created by a switch (`503 SHOW_UNAVAILABLE`, `data.reason`). */
export type ShowUnavailableReason = "disabled" | "bot_vs_bot_disabled";

/** A show in progress, as the console lists it. */
export type ShowSummary = { gameId: string; status: Extract<GameStatus, "waiting" | "active">; layout: ShowLayout };

/** One check of "will the show start" (P18); `ok: null` = not checked in this release (the engine, phase d). */
export type ShowCheck = {
  id: "show_enabled" | "bot_vs_bot_enabled" | "level2_enabled" | "bot_enabled" | "memory" | "slot" | "no_show_running" | "engine";
  ok: boolean | null;
  /** Numbers the console shows next to the check (MB of memory, games with the bot). */
  detail?: Record<string, number>;
};

export type ShowPreflight = { ok: boolean; checks: ShowCheck[] };

/** `GET /api/show`: the switches, the cheap checks for the default show (two bots of level 1) and the running show. */
export type ShowOverview = {
  enabled: boolean;
  botVsBotEnabled: boolean;
  level2Enabled: boolean;
  preflight: ShowPreflight;
  current: ShowSummary | null;
};

export type CreatedShow = {
  gameId: string;
  layout: ShowLayout;
  /** `name` is the Polish fallback (`botDisplayName`); the UI names the bot from `level`/`tableMb` (i18n I14). */
  bots: ({ seat: Seat; name: string } & BotStrengthView)[];
};

type ShowPlayer = Omit<WatchableState["players"][number], "seen" | "bot"> & {
  /** The bot's strength frozen at creation (BR-57), with the table of level 2 for its name (I14). */
  bot?: { level: BotLevel; memoryMb: number | null; tableMb: number | null };
};

/**
 * What the administrator reads of a show (show-mode, "API Contracts"): the state every reader of a game
 * sees, without who opened it (`seen`), with the layout and how it ended. No token, no e-mail.
 */
export type ShowState = Omit<WatchableState, "players"> & {
  players: ShowPlayer[];
  layout: ShowLayout;
  /** Only for `cancelled`: ended by the administrator (it had started) or expired before it did (P7). */
  closedReason?: "expired" | "ended";
  /** Only for `finished`. */
  finishedAt?: Date;
};

// Serializes the creations of a show (P6): the check "no show in progress" and the insert under one lock.
const LOCK_CREATE_SQL = `select pg_advisory_xact_lock(hashtext(?))`;
const LOCK_KEY = "show:create";

// The shows still open; normally none or one (P6).
const OPEN_SHOWS_SQL = `
  select g.id, g.status,
    (select count(*) from game_players p where p.game_id = g.id and p.kind = 'bot')::int as bots
  from games g
  where g.origin = 'show' and g.status in ('waiting', 'active')
  order by g.created_at desc, g.id`;

// Every read of a show starts from this: a game of another origin is "no such game" (404) for these routes.
const IS_SHOW_SQL = `select status from games where id = ? and origin = 'show'`;
const LOCK_SHOW_SQL = `select status from games where id = ? and origin = 'show' for update`;

// START_CLOCK_SQL of a participant (game-service.ts) without excluding the caller: the administrator is
// none of the seats, and a silent agent must get its clock too (show-mode, "Data Model").
const START_SHOW_CLOCK_SQL = `
  update games set turn_started_at = ?
  where id = ? and origin = 'show' and status = 'active' and turn_started_at is null
    and not exists (select 1 from game_players p where p.game_id = games.id and p.seen_at is null)`;

// P7: the administrator ends a show at any moment before its end; no result, no counter.
const END_SHOW_SQL = `
  update games set status = 'cancelled'
  where id = ? and origin = 'show' and status in ('waiting', 'active') returning id`;
const RELEASE_SLOTS_SQL = `update game_players set is_active = false where game_id = ? and is_active`;

/**
 * The show (spec 2026-11-09-show-mode, phase a): a private game without a human seat, created, read and
 * ended only by the administrator (the routes call `requireAdminApi` first). Bot vs bot only in this
 * phase; nothing moves the bots yet (phase b), so a show stands still and ends on time.
 */
export class ShowService {
  readonly #em: EntityManager;
  readonly #clock: Clock;
  readonly #rateLimiter: RateLimiter;
  readonly #timeoutSettler: TimeoutSettler;
  readonly #config: ServerConfig;
  readonly #colorDraw: ColorDraw;
  readonly #botAdmission: BotAdmission;

  constructor({ em, clock, rateLimiter, timeoutSettler, serverConfig, colorDraw, botAdmission }: Deps) {
    this.#em = em;
    this.#clock = clock;
    this.#rateLimiter = rateLimiter;
    this.#timeoutSettler = timeoutSettler;
    this.#config = serverConfig;
    this.#colorDraw = colorDraw;
    this.#botAdmission = botAdmission;
  }

  /** The console's first read: switches, the cheap checks for two bots of level 1, the running show. */
  async overview(): Promise<ShowOverview> {
    const current = await this.current();
    const { enabled, botVsBotEnabled, botLevel2Enabled } = this.#config.show;
    return {
      enabled,
      botVsBotEnabled,
      level2Enabled: botLevel2Enabled,
      preflight: await this.#checks([1, 1], current),
      current,
    };
  }

  /** The show in progress after the lazy closing (an expired wait, a clock run out), or `null`. */
  async current(): Promise<ShowSummary | null> {
    return this.#em.transactional((tx) => this.#settleOpen(tx, this.#clock.now()));
  }

  /**
   * "Will the show start" (P18) for these levels: the switches, the bot's flag, memory and free slot, no
   * show in progress. Cheap: no computation; the trial move of the engine comes with phase (d).
   */
  async preflight(input: ShowCreateInput): Promise<ShowPreflight> {
    return this.#checks(input.levels, await this.current());
  }

  /**
   * Creates a bot vs bot show (show-mode, "Tworzenie"): `active` at once with its clock running (nobody
   * "opens" it), both bots in their seats with the strength of one memory reading, colours drawn, private.
   * The check "no show in progress" and the insert run under one advisory lock, so of two concurrent
   * creations exactly one wins; a refusal is thrown after the commit, so the lazy closing is kept.
   * @throws AppError 503 `SHOW_UNAVAILABLE` (`data.reason`), 503 `BOT_UNAVAILABLE` (`data.reason`), 429
   * `RATE_LIMITED`, 409 `SHOW_RUNNING` (`data.gameId`)
   */
  async create(userId: string, input: ShowCreateInput): Promise<CreatedShow> {
    const { show } = this.#config;
    if (!show.enabled) throw unavailable("disabled");
    if (!show.botVsBotEnabled) throw unavailable("bot_vs_bot_disabled");
    if (!show.botLevel2Enabled && input.levels.includes(2)) throw refuse("level2_not_allowed", {}, true);
    // A show in progress is the answer before the pool and the admission: it holds a slot of the bot itself, so the
    // admission would otherwise refuse with `busy`, and every such refusal would spend the pool. The locked check
    // in the transaction below still decides a race.
    const open = await this.current();
    if (open) throw running(open.gameId);
    await this.#rateLimiter.hit(`show-create:${userId}`, SHOW_CREATE_LIMIT, SHOW_CREATE_WINDOW_MS);
    const bots = await this.#botAdmission.admitShow(input.levels);

    const outcome = await this.#em.transactional(async (tx): Promise<{ gameId: string } | { running: string }> => {
      await tx.execute(LOCK_CREATE_SQL, [LOCK_KEY], "run");
      const now = this.#clock.now();
      const running = await this.#settleOpen(tx, now);
      if (running) return { running: running.gameId };
      return { gameId: await this.#insert(tx, bots, now) };
    });
    if ("running" in outcome) throw running(outcome.running);
    return {
      gameId: outcome.gameId,
      layout: "bot-bot",
      bots: bots.map((bot, index) => ({
        seat: (index + 1) as Seat,
        name: botDisplayName(bot.level, bot.memoryMb),
        ...botStrengthOf(bot.level, bot.memoryMb),
      })),
    };
  }

  /**
   * The state of a show, in one transaction and in this order (show-mode, "API Contracts"): an expired wait
   * is closed, the clock starts once every seat is there, a clock run out finishes the game, then the read.
   * @throws AppError 404 (no such show), 400 when `after` is greater than the number of moves
   */
  async read(gameId: string, after = 0): Promise<ShowState> {
    return this.#em.transactional(async (tx) => {
      const [show] = await tx.execute<{ status: string }[]>(IS_SHOW_SQL, [gameId]);
      if (!show) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
      const now = this.#clock.now();
      await tx.execute(EXPIRE_WAITING_OF_GAME, [now, gameId], "run");
      await tx.execute(START_SHOW_CLOCK_SQL, [now, gameId], "run");
      await this.#timeoutSettler.settleExpired(gameId, tx, now);
      return this.#stateOf(tx, gameId, after, now);
    });
  }

  /**
   * Ends a show before its end (P7): `cancelled`, the seats released, no result and no counter. Repeating
   * it is harmless. A show whose clock ran out is settled first (and that result is kept).
   * @throws AppError 404 (no such show), 409 `GAME_NOT_ACTIVE` once the show finished
   */
  async end(gameId: string): Promise<ShowState> {
    const outcome = await this.#em.transactional(async (tx): Promise<{ state: ShowState } | { finished: true }> => {
      const [show] = await tx.execute<{ status: string }[]>(LOCK_SHOW_SQL, [gameId]);
      if (!show) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
      const now = this.#clock.now();
      await tx.execute(EXPIRE_WAITING_OF_GAME, [now, gameId], "run");
      await this.#timeoutSettler.settleGame(gameId, tx, now);
      const ended = await tx.execute<{ id: string }[]>(END_SHOW_SQL, [gameId]);
      if (ended.length > 0) await tx.execute(RELEASE_SLOTS_SQL, [gameId], "run");
      const state = await this.#stateOf(tx, gameId, 0, now);
      return state.status === "finished" ? { finished: true } : { state };
    });
    if ("finished" in outcome) throw new ConflictError(SHOW_NOT_ACTIVE_MESSAGE, { code: "GAME_NOT_ACTIVE" });
    return outcome.state;
  }

  /** Closes what lazily ended among the open shows and returns the one still open (the newest). */
  async #settleOpen(tx: EntityManager, now: Date): Promise<ShowSummary | null> {
    const open = await tx.execute<{ id: string }[]>(OPEN_SHOWS_SQL);
    for (const { id } of open) {
      await tx.execute(EXPIRE_WAITING_OF_GAME, [now, id], "run");
      await this.#timeoutSettler.settleExpired(id, tx, now);
    }
    if (open.length === 0) return null;
    const [row] = await tx.execute<{ id: string; status: ShowSummary["status"]; bots: number }[]>(OPEN_SHOWS_SQL);
    if (!row) return null;
    return { gameId: row.id, status: row.status, layout: layoutOf(row.bots) };
  }

  async #checks(levels: readonly BotLevel[], current: ShowSummary | null): Promise<ShowPreflight> {
    const { show } = this.#config;
    const capacity = await this.#botAdmission.inspect();
    const checks: ShowCheck[] = [
      { id: "show_enabled", ok: show.enabled },
      { id: "bot_vs_bot_enabled", ok: show.botVsBotEnabled },
      ...(levels.includes(2) ? [{ id: "level2_enabled" as const, ok: show.botLevel2Enabled }] : []),
      { id: "bot_enabled", ok: capacity.enabled },
      {
        id: "memory",
        ok: capacity.availableMb >= capacity.minAvailableMb,
        detail: { availableMb: capacity.availableMb, minAvailableMb: capacity.minAvailableMb },
      },
      {
        id: "slot",
        ok: capacity.activeGames < capacity.maxActiveGames,
        detail: { activeGames: capacity.activeGames, maxActiveGames: capacity.maxActiveGames },
      },
      { id: "no_show_running", ok: current === null },
      { id: "engine", ok: null },
    ];
    return { ok: checks.every((check) => check.ok !== false), checks };
  }

  /** Writes the game and both bots through `tx` (lesson 2026-10-28); the colours are drawn now. */
  async #insert(tx: EntityManager, bots: readonly BotStrength[], now: Date): Promise<string> {
    const settings = resolveGameSettings();
    const game = tx.create(Game, {
      origin: "show",
      isPublic: false,
      status: "active",
      startedAt: now,
      blackSeat: this.#colorDraw.drawBlackSeat(),
      turnStartedAt: now,
      variant: settings.variant,
      timeControlMs: settings.timeControlMs,
      clockMs1: settings.timeControlMs,
      clockMs2: settings.timeControlMs,
      createdAt: now,
    });
    for (const [index, bot] of bots.entries()) {
      // The only place a bot sits in seat 1 (show-mode P5: the CHECK is gone, this service holds the line).
      tx.create(GamePlayer, {
        game,
        seat: index + 1,
        kind: "bot",
        botLevel: bot.level,
        botMemoryMb: bot.memoryMb,
        botDepthCap: bot.depthCap,
        isActive: true,
        joinedAt: now,
        seenAt: now,
      });
    }
    await tx.flush();
    return game.id;
  }

  async #stateOf(tx: EntityManager, gameId: string, after: number, now: Date): Promise<ShowState> {
    // The cleanup may remove the game under the reader (lesson 2026-10-31): a 404, not an ORM error.
    const game = await tx.findOneOrFail(Game, gameId, { failHandler: () => new NotFoundError(GAME_NOT_FOUND_MESSAGE) });
    const players = await tx.find(GamePlayer, { game: gameId }, { orderBy: { seat: "asc" } });
    const { players: seats, ...view } = watchableState(game, players, after, now);
    const state: ShowState = {
      ...view,
      layout: layoutOf(players.filter((player) => player.kind === "bot").length),
      players: seats.map(({ seat, kind, displayName, agentName, bot }) => ({
        seat,
        kind,
        displayName,
        ...(agentName !== undefined && { agentName }),
        ...(bot && { bot: { ...bot, tableMb: botStrengthOf(bot.level, bot.memoryMb).tableMb } }),
      })),
    };
    if (game.status === "cancelled") state.closedReason = game.startedAt ? "ended" : "expired";
    if (game.status === "finished" && game.finishedAt) state.finishedAt = game.finishedAt;
    return state;
  }
}

function running(gameId: string): ConflictError {
  return new ConflictError(SHOW_RUNNING_MESSAGE, { code: "SHOW_RUNNING", data: { gameId } });
}

/** Two bots make bot vs bot; one bot (waiting for its agent, or with it) is bot vs agent. */
function layoutOf(bots: number): ShowLayout {
  return bots === 2 ? "bot-bot" : "bot-agent";
}

function unavailable(reason: ShowUnavailableReason): ServiceUnavailableError {
  return new ServiceUnavailableError(SHOW_UNAVAILABLE_MESSAGE, { code: "SHOW_UNAVAILABLE", data: { reason } });
}
