import {
  boardView,
  gameIdSchema,
  type EndReason,
  type GameReview,
  type ParticipantKind,
  type Seat,
} from "@gomoku/core";
import { Game, GamePlayer, type EntityManager } from "@gomoku/db";

import { displayNameOf } from "./game-service";

type Deps = { em: EntityManager };

/**
 * Who asks to review a game. E09-S02 adds the variant of a reader who holds the code of a public
 * game; every place that must learn about it is `canReview` below, nothing else decides access.
 */
export type ReviewAccess = { kind: "account"; userId: string };

type Player = { kind: string; user?: { id: string } | null };

/**
 * The one rule of who may read a finished game (BR-44). S01: a participant with an account reads
 * their own game; a guest and an agent have no history (BR-24, BR-31). Extension point of S02: a
 * `code` access is allowed when the game is public and the creator did not close the audience (BR-40, BR-43).
 */
export function canReview(access: ReviewAccess, players: readonly Player[]): boolean {
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
    if (!canReview(access, players)) return null;

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
    const viewer = players.find((player) => player.kind === "account" && player.user?.id === access.userId)!;
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
      viewerSeat: viewer.seat as Seat,
    };
  }
}
