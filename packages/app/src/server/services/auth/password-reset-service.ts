import {
  TooManyRequestsError,
  ValidationError,
  normalizeEmail,
} from "@gomoku/core";
import { PasswordResetToken, User, type EntityManager } from "@gomoku/db";

import type { ServerConfig } from "../../config";
import { describeError } from "../../http/describe-error";
import { createOpaqueToken, hashOpaqueToken } from "../../http/opaque-token";
import type { Clock, EmailSender } from "../email/email-sender";
import type { RateLimiter } from "../rate-limit/rate-limiter";
import {
  DAILY_WINDOW_MS,
  INVALID_TOKEN_MESSAGE,
  VERIFICATION_SEND_TIMEOUT_MS,
} from "./email-verification-service";
import {
  RESET_LINK_VALID_HOURS,
  buildResetMessage,
} from "./password-reset-message";
import type { PasswordHasher } from "./password-hasher";
import type { SessionService } from "./session-service";
import type { InvalidateResetTokens } from "./user-service";

type Deps = {
  em: EntityManager;
  emailSender: EmailSender;
  passwordHasher: PasswordHasher;
  sessionService: SessionService;
  invalidateResetTokens: InvalidateResetTokens;
  clock: Clock;
  serverConfig: ServerConfig;
  rateLimiter: RateLimiter;
};

export const RESET_TOKEN_TTL_MS = RESET_LINK_VALID_HOURS * 60 * 60 * 1000;
/** Q7: at most 3 reset messages per hour to one e-mail address (counted as `sha256(e-mail)`). */
export const RESET_EMAIL_LIMIT = 3;
export const RESET_EMAIL_WINDOW_MS = 60 * 60 * 1000;
/** Q8: reset has its own pool of `EMAIL_DAILY_LIMIT`, separate from e-mail verification. */
export const RESET_DAILY_KEY = "email-daily:reset";

/** Used only outside production, where `APP_ORIGIN` may be unset. */
const DEV_ORIGIN = "http://localhost:3000";

// Consumes a token only while it is unused and unexpired; of parallel requests with the same
// token exactly one gets a row back. All values are bound parameters.
const CONSUME_TOKEN_SQL = `
  update password_reset_tokens set used_at = ?
  where token_hash = ? and used_at is null and expires_at > ?
    and exists (
      select 1 from users
      where users.id = password_reset_tokens.user_id and users.email_verified_at is not null
    )
  returning user_id`;

export class PasswordResetService {
  readonly #em: EntityManager;
  readonly #emailSender: EmailSender;
  readonly #passwordHasher: PasswordHasher;
  readonly #sessionService: SessionService;
  readonly #invalidateResetTokens: InvalidateResetTokens;
  readonly #clock: Clock;
  readonly #serverConfig: ServerConfig;
  readonly #rateLimiter: RateLimiter;

  constructor({
    em,
    emailSender,
    passwordHasher,
    sessionService,
    invalidateResetTokens,
    clock,
    serverConfig,
    rateLimiter,
  }: Deps) {
    this.#em = em;
    this.#emailSender = emailSender;
    this.#passwordHasher = passwordHasher;
    this.#sessionService = sessionService;
    this.#invalidateResetTokens = invalidateResetTokens;
    this.#clock = clock;
    this.#serverConfig = serverConfig;
    this.#rateLimiter = rateLimiter;
  }

  /**
   * Sends a reset link to the owner of a confirmed address (BR-27). It never tells the
   * caller what happened: an unknown or unconfirmed address, an exhausted limit (3 messages
   * per hour per address, Q7; the earlier link stays valid) or a failed send all resolve
   * without a result, and nothing but the token of a sent message is stored. Intended to
   * run after the response (`after()`), so the answer never depends on the account.
   * The token is stored as its SHA-256 only. The user's older unused tokens are invalidated
   * after the message was sent, only those older by `(createdAt, id)`, so of parallel calls
   * the newest link always stays valid. A failed or timed-out send removes the new token
   * and keeps the previous link valid; it is logged without the address or the token.
   * The daily send limit has its own pool (Q8); without `EMAIL_DAILY_LIMIT` nothing is
   * limited. Unexpected failures (e.g. the database) are rethrown.
   */
  async request(email: string): Promise<void> {
    const address = normalizeEmail(email);
    const user = await this.#em.findOne(User, { email: address });
    if (!user || user.emailVerifiedAt === null) return;

    if (!(await this.#allowed(address))) return;

    const now = this.#clock.now();
    const token = createOpaqueToken();
    const record = this.#em.create(PasswordResetToken, {
      user: this.#em.getReference(User, user.id),
      tokenHash: hashOpaqueToken(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
    });
    await this.#em.flush();

    try {
      await this.#emailSender.send(
        buildResetMessage({
          to: user.email,
          name: user.displayName,
          token,
          origin: this.#serverConfig.appOrigin ?? DEV_ORIGIN,
        }),
        { signal: AbortSignal.timeout(VERIFICATION_SEND_TIMEOUT_MS) },
      );
    } catch (cause) {
      // Only the class name and driver code: the message may carry the address or the token.
      console.error("Password reset e-mail send failed", describeError(cause));
      await this.#em.nativeDelete(PasswordResetToken, { id: record.id });
      return;
    }

    await this.#em.nativeUpdate(
      PasswordResetToken,
      {
        user: user.id,
        usedAt: null,
        $or: [
          { createdAt: { $lt: record.createdAt } },
          { createdAt: record.createdAt, id: { $lt: record.id } },
        ],
      },
      { usedAt: now },
    );
  }

  /**
   * Sets a new password with a reset token. `newPassword` must come from
   * `passwordResetConfirmSchema`. The password is hashed before the transaction (bcrypt must
   * not hold a connection; also for an invalid token, so timing says nothing). One
   * transaction then consumes the token (a conditional `UPDATE ... RETURNING`: of parallel
   * calls exactly one wins), replaces the hash, deletes all of the user's sessions - also
   * in a running game (Q9) - and invalidates their other unused reset tokens. It does not
   * touch `emailVerifiedAt` (reset is only for confirmed addresses). Writes only through
   * the transaction's `tx`.
   * @throws ValidationError `INVALID_TOKEN` for an unknown, expired or used token.
   */
  async confirm(token: string, newPassword: string): Promise<void> {
    const passwordHash = await this.#passwordHasher.hash(newPassword);
    const now = this.#clock.now();
    await this.#em.transactional(async (tx) => {
      const rows = await tx.execute<{ user_id: string }[]>(
        CONSUME_TOKEN_SQL,
        [now, hashOpaqueToken(token), now],
        "all",
      );
      const row = rows[0];
      if (!row) {
        throw new ValidationError(INVALID_TOKEN_MESSAGE, {
          code: "INVALID_TOKEN",
        });
      }
      await tx.nativeUpdate(User, { id: row.user_id }, { passwordHash });
      await this.#sessionService.revokeAll(row.user_id, tx);
      await this.#invalidateResetTokens(row.user_id, tx);
    });
  }

  /** Per-address hourly limit first (a throttled address must not use up the daily pool), then the daily pool. */
  async #allowed(address: string): Promise<boolean> {
    try {
      await this.#rateLimiter.hit(
        `password-reset:email:${hashOpaqueToken(address)}`,
        RESET_EMAIL_LIMIT,
        RESET_EMAIL_WINDOW_MS,
      );
      const dailyLimit = this.#serverConfig.emailDailyLimit;
      if (dailyLimit !== undefined) {
        await this.#rateLimiter.hit(
          RESET_DAILY_KEY,
          dailyLimit,
          DAILY_WINDOW_MS,
        );
      }
      return true;
    } catch (error) {
      if (error instanceof TooManyRequestsError) return false;
      throw error;
    }
  }
}
