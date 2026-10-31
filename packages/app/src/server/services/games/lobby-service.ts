import {
  ConflictError,
  LOBBY_LIST_LIMIT,
  LOBBY_MARK_LIMIT,
  LOBBY_MARK_WINDOW_MS,
  LOBBY_PICK_LIMIT,
  LOBBY_PICK_WINDOW_MS,
  SEEKING_TTL_MS,
  UnauthorizedError,
  type LobbyMeView,
  type LobbyPickView,
  type LobbySeekerView,
  type LobbyView,
} from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

import type { GameParticipation } from "../auth/game-participation";
import type { Clock } from "../email/email-sender";
import type { RateLimiter } from "../rate-limit/rate-limiter";
import type { ColorDraw } from "./color-draw";
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
  colorDraw: ColorDraw;
};

const SESSION_REQUIRED_MESSAGE = "Zaloguj się, aby kontynuować.";
export const CANNOT_PICK_SELF_MESSAGE = "Nie możesz zagrać sam ze sobą.";
export const SEEKER_TAKEN_MESSAGE = "Ten gracz zagrał już z kimś innym. Wybierz kogoś innego z listy.";
export const SEEKER_EXPIRED_MESSAGE = "Status tego gracza wygasł.";

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

// Pick (#26). The owner of a status, found without a lock; `?` binds: seeker id.
const SEEKER_OWNER_SQL = `select user_id from lobby_seekers where id = ?`;

// Both accounts, locked by id (the same order as every other path that puts accounts in a game).
const LOCK_PAIR_SQL = `select id from users where id in (?, ?) order by id for no key update`;

// The gate of the race: the locks above serialize everyone who wants this seeker, so the first
// one deletes the row and the rest get nothing back. `?` binds: seeker id, owner, now.
const TAKE_SEEKER_SQL = `
  delete from lobby_seekers where id = ? and user_id = ? and expires_at > ? returning id`;

// Why the gate returned nothing: the row is still there only when it ran out. `?` binds: now, id.
const SEEKER_EXPIRED_SQL = `select expires_at <= ? as expired from lobby_seekers where id = ?`;

const PAIR_SLOTS_SQL = `select game_id, user_id from game_players where user_id in (?, ?) and is_active`;

// `seen_at` stays NULL: the clock starts when both open the page (#21 Q20).
const INSERT_LOBBY_GAME_SQL = `
  insert into games (origin, status, created_at, started_at, black_seat)
  values ('lobby', 'active', ?, ?, ?)
  returning id`;

const INSERT_LOBBY_PLAYER_SQL = `
  insert into game_players (game_id, seat, kind, user_id, is_active, joined_at)
  values (?, ?, 'account', ?, true, ?)`;

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
  readonly #colorDraw: ColorDraw;

  constructor({ em, clock, rateLimiter, timeoutSettler, gameParticipation, colorDraw }: Deps) {
    this.#em = em;
    this.#clock = clock;
    this.#rateLimiter = rateLimiter;
    this.#timeoutSettler = timeoutSettler;
    this.#gameParticipation = gameParticipation;
    this.#colorDraw = colorDraw;
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

  /**
   * Picks a seeker as the opponent (#26): in ONE transaction the status of the seeker (and the
   * picker's own, if any) is removed and an `active` game with `origin = 'lobby'` is created for
   * both accounts. The accounts are locked by id first, so of many who pick the same seeker
   * exactly one wins; the rest are refused before anything is written. Every refusal throws
   * inside the transaction, which restores a status removed on the way.
   * @throws AppError 401 for a deleted account; 409 `CANNOT_PICK_SELF`,
   * `ACTIVE_GAME_EXISTS` (BR-13, `data.gameId`), `LOBBY_SEEKER_TAKEN`, `LOBBY_SEEKER_EXPIRED`;
   * 429 `RATE_LIMITED`
   */
  async pick(pickerId: string, seekerId: string): Promise<LobbyPickView> {
    await this.#rateLimiter.hit(`lobby-pick:${pickerId}`, LOBBY_PICK_LIMIT, LOBBY_PICK_WINDOW_MS);
    await this.#timeoutSettler.settleFor(pickerId);
    // An expired waiting game of the picker must not block them (idempotent, outside the transaction).
    await closeStaleSlotsOfUser(this.#em, pickerId, this.#clock.now());

    const [seeker] = await this.#em.execute<{ user_id: string }[]>(SEEKER_OWNER_SQL, [seekerId]);
    // No row: taken by someone, withdrawn, or cleaned up. Nobody can tell these from "never existed" (a uuid
    // nobody holds), so it is the same answer as losing the race.
    if (!seeker) throw seekerTaken();
    const ownerId = seeker.user_id;
    if (ownerId === pickerId) {
      throw new ConflictError(CANNOT_PICK_SELF_MESSAGE, { code: "CANNOT_PICK_SELF" });
    }

    return this.#em.transactional(async (tx) => {
      const now = this.#clock.now();
      const locked = await tx.execute<{ id: string }[]>(LOCK_PAIR_SQL, [pickerId, ownerId]);
      if (!locked.some((row) => row.id === pickerId)) throw new UnauthorizedError(SESSION_REQUIRED_MESSAGE);
      // A deleted owner took the status with them (cascade).
      if (!locked.some((row) => row.id === ownerId)) throw seekerTaken();

      const taken = await tx.execute<{ id: string }[]>(TAKE_SEEKER_SQL, [seekerId, ownerId, now]);
      if (taken.length === 0) {
        const [left] = await tx.execute<{ expired: boolean }[]>(SEEKER_EXPIRED_SQL, [now, seekerId]);
        throw left
          ? new ConflictError(SEEKER_EXPIRED_MESSAGE, { code: "LOBBY_SEEKER_EXPIRED" })
          : seekerTaken();
      }

      const slots = await tx.execute<{ game_id: string; user_id: string }[]>(PAIR_SLOTS_SQL, [pickerId, ownerId]);
      const own = slots.find((slot) => slot.user_id === pickerId);
      if (own) {
        throw new ConflictError(ACTIVE_GAME_EXISTS_MESSAGE, {
          code: "ACTIVE_GAME_EXISTS",
          data: { gameId: own.game_id },
        });
      }
      if (slots.length > 0) throw seekerTaken();

      await tx.execute(deleteSeekersSql(1), [pickerId], "run");
      const [created] = await tx.execute<{ id: string }[]>(INSERT_LOBBY_GAME_SQL, [
        now,
        now,
        this.#colorDraw.drawBlackSeat(),
      ]);
      const gameId = created!.id;
      await tx.execute(INSERT_LOBBY_PLAYER_SQL, [gameId, 1, pickerId, now], "run");
      await tx.execute(INSERT_LOBBY_PLAYER_SQL, [gameId, 2, ownerId, now], "run");
      return { gameId };
    });
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

const seekerTaken = () => new ConflictError(SEEKER_TAKEN_MESSAGE, { code: "LOBBY_SEEKER_TAKEN" });
