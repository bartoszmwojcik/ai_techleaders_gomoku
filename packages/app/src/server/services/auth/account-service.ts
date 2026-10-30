import { ConflictError, UnauthorizedError, ValidationError } from "@gomoku/core";
import { User, type EntityManager } from "@gomoku/db";

import type { Clock } from "../email/email-sender";
import { closeStaleSlotsOfUser } from "../games/lazy-closing";
import type { TimeoutSettler } from "../games/timeout-settler";
import type { PasswordHasher } from "./password-hasher";

type Deps = {
  em: EntityManager;
  passwordHasher: PasswordHasher;
  timeoutSettler: TimeoutSettler;
  clock: Clock;
};

export const INVALID_PASSWORD_MESSAGE = "Nieprawidłowe hasło.";
export const ACTIVE_GAME_MESSAGE = "Najpierw dokończ albo poddaj partię.";
export const SESSION_REQUIRED_MESSAGE = "Zaloguj się, aby kontynuować.";

const placeholders = (count: number) => Array.from({ length: count }, () => "?").join(", ");

// Lock order of the whole application: users, then games (by id), then writes (#37, #22 Risks).
// `for no key update` does not block the foreign key checks of unrelated inserts that
// reference the user (sessions, game_players), only a concurrent deletion or lock like it.
const LOCK_USER_SQL = `select id from users where id = ? for no key update`;

// The games of the account that still matter: not yet played (`waiting`) or in progress.
const LOCK_OPEN_GAMES_SQL = `
  select g.id, g.status from games g join game_players p on p.game_id = g.id
  where p.user_id = ? and g.status in ('waiting', 'active')
  order by g.id for update of g`;

const deleteGamesSql = (count: number) => `delete from games where id in (${placeholders(count)})`;

// Offers of a rematch (E02-S06) the account is part of, locked in the same order.
const LOCK_PENDING_REMATCHES_SQL = `
  select g.id from games g join game_players p on p.game_id = g.id
  where p.user_id = ? and g.rematch_state = 'pending'
  order by g.id for update of g`;

const closeRematchesSql = (count: number) =>
  `update games set rematch_state = 'declined' where id in (${placeholders(count)})`;

// The condition on the verified hash protects against a concurrent password change.
const DELETE_USER_SQL = `delete from users where id = ? and password_hash = ? returning id`;

/**
 * Deletes an account on request (E01-S06, #37). The user row goes for good, with its sessions
 * and tokens (`on delete cascade`); the participant rows of finished games stay with
 * `user_id NULL` and show as "Usunięty gracz" (BR-17). Request-scoped.
 */
export class AccountService {
  readonly #em: EntityManager;
  readonly #passwordHasher: PasswordHasher;
  readonly #timeoutSettler: TimeoutSettler;
  readonly #clock: Clock;

  constructor({ em, passwordHasher, timeoutSettler, clock }: Deps) {
    this.#em = em;
    this.#passwordHasher = passwordHasher;
    this.#timeoutSettler = timeoutSettler;
    this.#clock = clock;
  }

  /**
   * The password is verified before the transaction (bcrypt must not hold a connection). Games
   * the clock or the 15-minute rule already ended are closed first, so only a game truly in
   * progress blocks. One transaction then locks the user, then the account's open games,
   * refuses on a game in progress (BR-21, before any write), removes the games still waiting
   * (with their invitations), closes pending rematch offers and deletes the user row.
   * @throws AppError 400 `INVALID_PASSWORD` (also when the password was changed meanwhile);
   * 401 when the account is already gone (a concurrent deletion won);
   * 409 `ACTIVE_GAME` with `data.gameId` of the game in progress.
   */
  async delete(userId: string, password: string): Promise<void> {
    const user = await this.#em.findOne(User, { id: userId });
    if (!user) throw new UnauthorizedError(SESSION_REQUIRED_MESSAGE);
    const passwordHash = user.passwordHash;
    if (!(await this.#passwordHasher.verify(password, passwordHash))) {
      throw invalidPassword();
    }

    await this.#timeoutSettler.settleFor(userId);
    await closeStaleSlotsOfUser(this.#em, userId, this.#clock.now());

    await this.#em.transactional(async (tx) => {
      const locked = await tx.execute<{ id: string }[]>(LOCK_USER_SQL, [userId]);
      if (locked.length === 0) throw new UnauthorizedError(SESSION_REQUIRED_MESSAGE);

      const games = await tx.execute<{ id: string; status: string }[]>(LOCK_OPEN_GAMES_SQL, [
        userId,
      ]);
      const playing = games.find(({ status }) => status === "active");
      if (playing) {
        throw new ConflictError(ACTIVE_GAME_MESSAGE, {
          code: "ACTIVE_GAME",
          data: { gameId: playing.id },
        });
      }
      if (games.length > 0) {
        await tx.execute(deleteGamesSql(games.length), games.map(({ id }) => id), "run");
      }

      const offers = await tx.execute<{ id: string }[]>(LOCK_PENDING_REMATCHES_SQL, [userId]);
      if (offers.length > 0) {
        await tx.execute(closeRematchesSql(offers.length), offers.map(({ id }) => id), "run");
      }

      const deleted = await tx.execute<{ id: string }[]>(DELETE_USER_SQL, [userId, passwordHash]);
      if (deleted.length === 0) throw invalidPassword();
    });
  }
}

function invalidPassword(): ValidationError {
  return new ValidationError(INVALID_PASSWORD_MESSAGE, {
    code: "INVALID_PASSWORD",
    fieldErrors: { password: [INVALID_PASSWORD_MESSAGE] },
  });
}
