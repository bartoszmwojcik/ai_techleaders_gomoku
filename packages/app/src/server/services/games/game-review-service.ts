import {
  boardView,
  normalizeInvitationCode,
  gameIdSchema,
  type EndReason,
  type GameReview,
  type ParticipantKind,
  type Seat,
} from "@gomoku/core";
import { Game, GamePlayer, Invitation, type EntityManager } from "@gomoku/db";

import { displayNameOf } from "./game-service";

type Deps = { em: EntityManager };

/**
 * Who asks to review a game: a participant with an account (E09-S01), or anybody holding the
 * invitation code of the game (E09-S02). `canReview` below is the only place that decides.
 */
export type ReviewAccess = { kind: "account"; userId: string } | { kind: "code"; code: string };

type Player = { kind: string; user?: { id: string } | null };

/** What the rule needs to know about the game besides its players. */
export type ReviewSubject = {
  /** The creator did not close the audience (BR-40, BR-43): the flag is read on every open. */
  isPublic: boolean;
  /** The code of `access` is the invitation code of this very game. */
  codeMatches: boolean;
};

/**
 * The one rule of who may read a finished game (BR-44). A participant with an account reads their
 * own game; a guest and an agent have no history (BR-24, BR-31). A `code` access is allowed when
 * the game is public, the creator did not close the audience and the code belongs to the game.
 */
export function canReview(access: ReviewAccess, players: readonly Player[], subject: ReviewSubject): boolean {
  if (access.kind === "code") return subject.isPublic && subject.codeMatches;
  return players.some((player) => player.kind === "account" && player.user?.id === access.userId);
}

export class GameReviewService {
  readonly #em: EntityManager;

  constructor({ em }: Deps) {
    this.#em = em;
  }

  /**
   * The finished game for a reader who may see it, or `null`. `null` is one answer for every
   * "no": a malformed id, no such game (also one removed by `db:cleanup`), a game that is not
   * finished and a game of somebody else, so the caller can answer `404` without confirming that a
   * game exists. Read only.
   */
  async open(access: ReviewAccess, gameId: string): Promise<GameReview | null> {
    if (!gameIdSchema.safeParse(gameId).success) return null;
    const game = await this.#em.findOne(Game, { id: gameId, status: "finished" });
    if (!game) return null;
    const players = await this.#em.find(GamePlayer, { game: gameId }, { populate: ["user"], orderBy: { seat: "asc" } });
    // A game removed between the two reads has no players left: nobody may read it.
    const codeMatches = await this.#holdsCode(access, gameId);
    if (!canReview(access, players, { isPublic: game.isPublic, codeMatches })) return null;

    const board = boardView(
      {
        // CHECKs of the table: a finished game has a black seat, an end reason and (but a draw) a winner.
        status: "finished",
        blackSeat: game.blackSeat as number | null,
        moveCount: game.moveCount,
        stonesBlack: game.stonesBlack,
        stonesWhite: game.stonesWhite,
        moves: game.moves,
        winnerSeat: game.winnerSeat as number | null,
        endReason: game.endReason as EndReason | null,
      },
      0,
    );
    // A reader with a code takes no seat: no "you", and nothing is recorded for them (N-13).
    const viewer =
      access.kind === "account"
        ? players.find((player) => player.kind === "account" && player.user?.id === access.userId)!
        : null;
    return {
      gameId: game.id,
      finishedAt: game.finishedAt!.toISOString(),
      blackSeat: board.blackSeat!,
      moves: board.moves,
      result: board.result!,
      players: players.map((player) => ({
        seat: player.seat as Seat,
        kind: player.kind as ParticipantKind,
        displayName: displayNameOf(player),
        ...(player.kind === "agent" && { agentName: player.agentName ?? null }),
      })),
      viewerSeat: viewer ? (viewer.seat as Seat) : null,
    };
  }

  async #holdsCode(access: ReviewAccess, gameId: string): Promise<boolean> {
    if (access.kind !== "code") return false;
    const normalized = normalizeInvitationCode(access.code);
    if (!normalized) return false;
    return (await this.#em.findOne(Invitation, { game: gameId, code: normalized })) !== null;
  }
}
