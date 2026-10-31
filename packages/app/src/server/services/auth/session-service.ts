import { Session, User, type EntityManager } from "@gomoku/db";

import { createOpaqueToken, hashOpaqueToken } from "../../http/opaque-token";
import { DELETE_SEEKER_OF_SESSION_SQL } from "../games/lobby-seeker-sql";

/** Session lifetime: 30 days from creation, never extended (G5). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Tells whether the user has a game that was already running at `expiredAt` and has not
 * finished yet (G5). Games do not exist yet, so the container registers `async () => false`.
 */
export type HasActiveGame = (
  userId: string,
  expiredAt: Date,
) => Promise<boolean>;

type Deps = { em: EntityManager; hasActiveGame: HasActiveGame };

export class SessionService {
  readonly #em: EntityManager;
  readonly #hasActiveGame: HasActiveGame;

  constructor({ em, hasActiveGame }: Deps) {
    this.#em = em;
    this.#hasActiveGame = hasActiveGame;
  }

  /**
   * Creates a session and returns the raw token (for the cookie); only its hash is stored.
   * Inside `em.transactional` pass the callback's `tx` as `em`: the injected fork does not
   * join the transaction.
   */
  async create(
    userId: string,
    now: Date = new Date(),
    em: EntityManager = this.#em,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = createOpaqueToken();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    em.create(Session, {
      user: em.getReference(User, userId),
      tokenHash: hashOpaqueToken(token),
      expiresAt,
    });
    await em.flush();
    return { token, expiresAt };
  }

  /**
   * Returns the session for a token, or `null` when it is unknown or expired. An expired
   * session stays valid while a game that was active at `expiresAt` is still running (G5).
   */
  async findValid(token: string, now: Date = new Date()) {
    const session = await this.#em.findOne(
      Session,
      { tokenHash: hashOpaqueToken(token) },
      { populate: ["user"] },
    );
    if (!session) return null;
    if (session.expiresAt.getTime() > now.getTime()) return session;
    return (await this.#hasActiveGame(session.user.id, session.expiresAt))
      ? session
      : null;
  }

  /**
   * Revokes the session behind a token (logout). Only that session: the user's other
   * sessions stay valid (Q3). Idempotent: an unknown, expired or already revoked token
   * deletes nothing and is not an error.
   */
  async revoke(token: string): Promise<void> {
    const tokenHash = hashOpaqueToken(token);
    // Whoever logs out stops looking for a game (#25 Q6). Best effort: a failure here must not
    // keep the session alive, and the status expires on its own in 5 minutes.
    await this.#em.execute(DELETE_SEEKER_OF_SESSION_SQL, [tokenHash], "run").catch(() => undefined);
    await this.#em.nativeDelete(Session, { tokenHash });
  }

  /**
   * Revokes every session of the user except the current one (password change, Q4), also
   * those of a game in progress. Inside `em.transactional` pass the callback's `tx` as `em`;
   * the injected fork does not join the transaction (it has `useContext = false`).
   * @returns how many sessions were deleted.
   */
  async revokeOthers(
    userId: string,
    currentSessionId: string,
    em: EntityManager = this.#em,
  ): Promise<number> {
    return em.nativeDelete(Session, {
      user: userId,
      id: { $ne: currentSessionId },
    });
  }

  /**
   * Revokes every session of the user, also those of a game in progress (password reset,
   * Q9). Inside `em.transactional` pass the callback's `tx` as `em`.
   * @returns how many sessions were deleted.
   */
  async revokeAll(
    userId: string,
    em: EntityManager = this.#em,
  ): Promise<number> {
    return em.nativeDelete(Session, { user: userId });
  }
}
