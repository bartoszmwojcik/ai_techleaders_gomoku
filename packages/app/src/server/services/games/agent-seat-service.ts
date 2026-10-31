import {
  AGENT_CODE_MAX_LENGTH,
  MCP_JOIN_WINDOW_MS,
  READY_DEADLINE_MS,
  ValidationError,
  extractInvitationCode,
  normalizeAgentName,
  type CreatorKind,
  type GameColor,
  type Seat,
} from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

import { createOpaqueToken, hashOpaqueToken } from "../../http/opaque-token";
import type { Clock } from "../email/email-sender";
import type { RateLimiter } from "../rate-limit/rate-limiter";
import type { ColorDraw } from "./color-draw";
import {
  READ_INVITATION_SQL,
  SEAT_CONSTRAINT,
  invalidInvitation,
  lockForJoin,
  seatSecondPlayer,
  withLookupAttempt,
  type InvitationRow,
  type LookupGuard,
} from "./join-core";
import { CANCEL_NOT_STARTED_OF_GAME, EXPIRE_WAITING_OF_GAME } from "./lazy-closing";

type Deps = {
  em: EntityManager;
  clock: Clock;
  rateLimiter: RateLimiter;
  colorDraw: ColorDraw;
};

export const INVALID_AGENT_INPUT_MESSAGE =
  "Nieprawidłowe dane. Podaj code (kod lub link zaproszenia) i opcjonalnie agentName (nazwa modelu: litery łacińskie, cyfry, spacja i znaki . - _ / : ( ) +, do 40 znaków, bez adresów).";

/**
 * The pools of one `join` call (E06-S01, D-29): the failed codes of agents (a pool of their own,
 * not the one of the browsers) and the successful joins per client address.
 */
export type AgentJoinGuard = { lookup: LookupGuard; join: { key: string; limit: number } };

export type AgentJoinResult = {
  /** The agent's token of this one game: shown here only, the database keeps its SHA-256. */
  token: string;
  gameId: string;
  you: { seat: 2; color: GameColor };
  status: "active";
  /** What the opponent is; never a name, an e-mail or an id (the text is human's, R6). */
  opponent: { kind: CreatorKind };
};

const INSERT_AGENT_SQL = `
  insert into game_players (game_id, seat, kind, agent_token_hash, agent_name, join_channel, is_active, joined_at, seen_at)
  values (?, 2, 'agent', ?, ?, 'mcp', true, ?, ?)
  returning id`;

/**
 * An agent takes the second seat of a private game over MCP (E06-S01, BR-31). It shares the
 * atomic join with `InvitationService` (`join-core`) and differs by what it does not do: no
 * slot of BR-13 (it has no account and no browser), no nickname, no "looking for a game" status
 * to remove. Request-scoped: it works through `em`.
 */
export class AgentSeatService {
  readonly #em: EntityManager;
  readonly #clock: Clock;
  readonly #rateLimiter: RateLimiter;
  readonly #colorDraw: ColorDraw;

  constructor({ em, clock, rateLimiter, colorDraw }: Deps) {
    this.#em = em;
    this.#clock = clock;
    this.#rateLimiter = rateLimiter;
    this.#colorDraw = colorDraw;
  }

  /**
   * Seats the agent behind `code` (a code in any form or a link to the invitation page). Order:
   * the shape of the input, then `agentName`, both before anything is counted or consumed (a
   * wrong name leaves the code valid and the pools untouched); the limit of joins per address;
   * the reservation of an attempt in the pool of failed codes; the atomic join; the attempt is
   * given back when the code was right. Any invalid code is the one uniform `INVALID_INVITATION`.
   * @throws AppError 400 `INVALID_INPUT`; 410 `INVALID_INVITATION`; 429 `RATE_LIMITED`
   */
  async join(code: unknown, agentName: unknown, guard: AgentJoinGuard): Promise<AgentJoinResult> {
    const text = typeof code === "string" ? code.trim() : "";
    const name = normalizeAgentName(agentName);
    if (text.length < 1 || text.length > AGENT_CODE_MAX_LENGTH || !name.ok) {
      throw new ValidationError(INVALID_AGENT_INPUT_MESSAGE, { code: "INVALID_INPUT" });
    }

    // Only successful joins count towards the limit: a failure gives its place back.
    await this.#rateLimiter.hit(guard.join.key, guard.join.limit, MCP_JOIN_WINDOW_MS);
    try {
      return await withLookupAttempt(this.#rateLimiter, guard.lookup, () =>
        this.#join(text, name.name),
      );
    } catch (error) {
      await this.#rateLimiter
        .release(guard.join.key, MCP_JOIN_WINDOW_MS)
        .catch(() => undefined);
      throw error;
    }
  }

  async #join(text: string, agentName: string | null): Promise<AgentJoinResult> {
    const code = extractInvitationCode(text);
    if (!code) throw invalidInvitation();
    const token = createOpaqueToken();
    try {
      return await this.#em.transactional((tx) => this.#seat(tx, code, token, agentName));
    } catch (error) {
      // A third player in the seat: the unique index is the last line of defence.
      const { code: sqlState, constraint } = error as { code?: string; constraint?: string };
      if (sqlState === "23505" && constraint === SEAT_CONSTRAINT) throw invalidInvitation();
      throw error;
    }
  }

  async #seat(
    tx: EntityManager,
    code: string,
    token: string,
    agentName: string | null,
  ): Promise<AgentJoinResult> {
    const peek = await this.#find(tx, code);
    if (!peek) throw invalidInvitation();
    const gameId = peek.game_id;
    // Same lock order as the other joins: the creator's account (if any), then the game.
    await lockForJoin(tx, peek.creator_id ? [peek.creator_id] : [], [gameId]);

    // Q16, Q21: an expired or never-opened game is closed before the invitation is judged.
    const now = this.#clock.now();
    await tx.execute(EXPIRE_WAITING_OF_GAME, [now, gameId], "run");
    await tx.execute(CANCEL_NOT_STARTED_OF_GAME, [new Date(now.getTime() - READY_DEADLINE_MS), gameId], "run");

    const invitation = await this.#find(tx, code);
    if (!invitation || invitation.status !== "waiting" || invitation.consumed_at !== null) {
      throw invalidInvitation();
    }

    const blackSeat: Seat = this.#colorDraw.drawBlackSeat();
    await seatSecondPlayer(tx, {
      code,
      invitationId: invitation.id,
      gameId,
      now,
      insert: {
        sql: INSERT_AGENT_SQL,
        params: [gameId, hashOpaqueToken(token), agentName, now, now],
      },
      drawBlackSeat: () => blackSeat,
    });
    return {
      token,
      gameId,
      you: { seat: 2, color: blackSeat === 2 ? "black" : "white" },
      status: "active",
      opponent: { kind: invitation.creator_kind as CreatorKind },
    };
  }

  async #find(em: EntityManager, code: string): Promise<InvitationRow | undefined> {
    return (await em.execute<InvitationRow[]>(READ_INVITATION_SQL, [this.#clock.now(), code]))[0];
  }
}
