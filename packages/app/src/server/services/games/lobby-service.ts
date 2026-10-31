import {
  ConflictError,
  LOBBY_LIST_LIMIT,
  LOBBY_MARK_LIMIT,
  LOBBY_MARK_WINDOW_MS,
  SEEKING_TTL_MS,
  UnauthorizedError,
  type LobbyMeView,
  type LobbySeekerView,
  type LobbyView,
} from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

import type { GameParticipation } from "../auth/game-participation";
import type { Clock } from "../email/email-sender";
import type { RateLimiter } from "../rate-limit/rate-limiter";
import { ACTIVE_GAME_EXISTS_MESSAGE } from "./game-service";
import { closeStaleSlotsOfUser } from "./lazy-closing";
import { deleteSeekersSql } from "./lobby-seeker-sql";
import type { TimeoutSettler } from "./timeout-settler";

type Deps = {
  em: EntityManager;
  clock: Clock;
  rateLimiter: RateLimiter;
  timeoutSettler: TimeoutSettler;
  gameParticipation: GameParticipation;
};

const SESSION_REQUIRED_MESSAGE = "Zaloguj się, aby kontynuować.";

// First in the transaction: the lock order is users, then lobby_seekers, then games (#37, #21).
// It also turns a concurrent deletion of the account into a 401.
const LOCK_USER_SQL = `select id from users where id = ? for no key update`;

const ACTIVE_SLOT_SQL = `select game_id from game_players where user_id = ? and is_active`;

// Only a dead status is overwritten; a live one is left as it is (no renewal, #25 Q3).
// `?` binds: user, created_at, expires_at, now.
const UPSERT_SQL = `
  insert into lobby_seekers (user_id, created_at, expires_at) values (?, ?, ?)
  on conflict (user_id) do update
    set created_at = excluded.created_at, expires_at = excluded.expires_at
    where lobby_seekers.expires_at <= ?`;

// Times are computed in SQL (raw `em.execute` returns timestamps as text). `?` binds: now, user, now.
const READ_ME_SQL = `
  select id, created_at,
    (extract(epoch from (expires_at - ?::timestamptz)) * 1000)::int as expires_in_ms
  from lobby_seekers where user_id = ? and expires_at > ?::timestamptz`;

// Other valid seekers, oldest first. The slot filter is defensive: starting a game removes the status.
// `?` binds: now, now, now, user, limit.
const LIST_SQL = `
  select s.id, u.display_name,
    greatest(0, (extract(epoch from (?::timestamptz - s.created_at)) * 1000))::int as since_ms,
    (extract(epoch from (s.expires_at - ?::timestamptz)) * 1000)::int as expires_in_ms
  from lobby_seekers s join users u on u.id = s.user_id
  where s.expires_at > ?::timestamptz and s.user_id <> ?
    and not exists (select 1 from game_players p where p.user_id = s.user_id and p.is_active)
  order by s.created_at, s.id
  limit ?`;

type MeRow = { id: string; created_at: string | Date; expires_in_ms: number };
type SeekerRow = { id: string; display_name: string; since_ms: number; expires_in_ms: number };

const toMe = (row: MeRow): LobbyMeView => ({
  id: row.id,
  createdAt: new Date(row.created_at),
  expiresInMs: row.expires_in_ms,
});

/**
 * The "looking for a game" status and the lobby list (#25). Request-scoped. A status is one row
 * per account, valid for 5 minutes (BR-12); expiry is lazy (reads filter on `expires_at`), the
 * cleanup (#39) removes the dead rows.
 */
export class LobbyService {
  readonly #em: EntityManager;
  readonly #clock: Clock;
  readonly #rateLimiter: RateLimiter;
  readonly #timeoutSettler: TimeoutSettler;
  readonly #gameParticipation: GameParticipation;

  constructor({ em, clock, rateLimiter, timeoutSettler, gameParticipation }: Deps) {
    this.#em = em;
    this.#clock = clock;
    this.#rateLimiter = rateLimiter;
    this.#timeoutSettler = timeoutSettler;
    this.#gameParticipation = gameParticipation;
  }

  /**
   * Marks the account as looking for a game for 5 minutes. Repeating it while the status is
   * valid returns the same status (the time is not renewed); after it expired a new one starts.
   * The stale slots of the account are closed first, so an expired waiting game does not block.
   * @throws AppError 401 for a deleted account; 409 `ACTIVE_GAME_EXISTS` (BR-13, `data.gameId`)
   * when the account holds a waiting or running game; 429 `RATE_LIMITED`
   */
  async markSeeking(userId: string): Promise<LobbyMeView> {
    await this.#rateLimiter.hit(`lobby-mark:${userId}`, LOBBY_MARK_LIMIT, LOBBY_MARK_WINDOW_MS);
    await this.#timeoutSettler.settleFor(userId);

    const now = this.#clock.now();
    const expiresAt = new Date(now.getTime() + SEEKING_TTL_MS);
    // A refusal is returned out of the transaction and thrown after the commit, so the lazy
    // closings written on the way are kept.
    const outcome = await this.#em.transactional(
      async (tx): Promise<{ me: LobbyMeView } | { refusal: ConflictError }> => {
        const locked = await tx.execute<{ id: string }[]>(LOCK_USER_SQL, [userId]);
        if (locked.length === 0) throw new UnauthorizedError(SESSION_REQUIRED_MESSAGE);
        await closeStaleSlotsOfUser(tx, userId, now);
        const [slot] = await tx.execute<{ game_id: string }[]>(ACTIVE_SLOT_SQL, [userId]);
        if (slot) {
          return {
            refusal: new ConflictError(ACTIVE_GAME_EXISTS_MESSAGE, {
              code: "ACTIVE_GAME_EXISTS",
              data: { gameId: slot.game_id },
            }),
          };
        }
        await tx.execute(UPSERT_SQL, [userId, now, expiresAt, now], "run");
        const [row] = await tx.execute<MeRow[]>(READ_ME_SQL, [now, userId, now]);
        return { me: toMe(row!) };
      },
    );
    if ("refusal" in outcome) throw outcome.refusal;
    return outcome.me;
  }

  /** Withdraws the status. Idempotent: without one nothing happens. */
  async withdraw(userId: string): Promise<void> {
    await this.#em.execute(deleteSeekersSql(1), [userId], "run");
  }

  /**
   * What `/lobby` shows: the user's own valid status, the game they hold (stale slots are closed
   * first, so the page never claims a game where marking would succeed) and the other seekers.
   */
  async view(userId: string): Promise<LobbyView> {
    const currentGame = await this.#gameParticipation.currentGame(userId);
    const now = this.#clock.now();
    const [mine] = await this.#em.execute<MeRow[]>(READ_ME_SQL, [now, userId, now]);
    const rows = await this.#em.execute<SeekerRow[]>(LIST_SQL, [now, now, now, userId, LOBBY_LIST_LIMIT]);
    const seekers: LobbySeekerView[] = rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      sinceMs: row.since_ms,
      expiresInMs: row.expires_in_ms,
    }));
    return {
      me: mine ? toMe(mine) : null,
      currentGame: currentGame && { gameId: currentGame.gameId, status: currentGame.status },
      seekers,
    };
  }
}
