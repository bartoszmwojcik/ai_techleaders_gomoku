import { ForbiddenError, TooManyRequestsError, ValidationError, isInstallationAdmin, normalizeEmail } from "@gomoku/core";
import {
  EmailChangeToken,
  EmailVerificationToken,
  UniqueConstraintViolationException,
  User,
  type EntityManager,
} from "@gomoku/db";

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
  EMAIL_CHANGE_LINK_VALID_HOURS,
  buildEmailChangeMessage,
  buildEmailChangedNotice,
  maskEmail,
} from "./email-change-message";
import type { PasswordHasher } from "./password-hasher";
import type { SessionService } from "./session-service";
import {
  INVALID_CURRENT_PASSWORD_MESSAGE,
  type InvalidateResetTokens,
} from "./user-service";

type Deps = {
  em: EntityManager;
  emailSender: EmailSender;
  passwordHasher: PasswordHasher;
  sessionService: SessionService;
  invalidateResetTokens: InvalidateResetTokens;
  clock: Clock;
  serverConfig: ServerConfig;
  rateLimiter: RateLimiter;
  adminEmail?: string;
};

export const EMAIL_CHANGE_TOKEN_TTL_MS = EMAIL_CHANGE_LINK_VALID_HOURS * 60 * 60 * 1000;
/** Q4: 3 link messages per hour per account (a 429 for the caller) and per target address (silent). */
export const EMAIL_CHANGE_ACCOUNT_LIMIT = 3;
export const EMAIL_CHANGE_ADDRESS_LIMIT = 3;
export const EMAIL_CHANGE_WINDOW_MS = 60 * 60 * 1000;
/** Q4: its own pool of `EMAIL_DAILY_LIMIT`, like the reset's. */
export const EMAIL_CHANGE_DAILY_KEY = "email-daily:email-change";
export const SAME_EMAIL_MESSAGE = "To już jest adres Twojego konta.";
/** BR-35: the installation administrator's address follows `ADMIN_EMAIL` and never changes through the app. */
export const ADMIN_EMAIL_LOCKED_MESSAGE = "Adresu e-mail tego konta nie można zmienić.";
export const EMAIL_CHANGE_RATE_MESSAGE = "Za dużo próśb o zmianę adresu. Spróbuj później.";

/** Used only outside production, where `APP_ORIGIN` may be unset. */
const DEV_ORIGIN = "http://localhost:3000";

// Consumes a token only while it is unused and unexpired; of parallel requests with the same
// token exactly one gets a row back. All values are bound parameters.
const CONSUME_TOKEN_SQL = `
  update email_change_tokens set used_at = ?
  where token_hash = ? and used_at is null and expires_at > ?
  returning user_id, new_email`;

export type EmailChangeUser = { id: string; email: string; displayName: string };

export class EmailChangeService {
  readonly #em: EntityManager;
  readonly #emailSender: EmailSender;
  readonly #passwordHasher: PasswordHasher;
  readonly #sessionService: SessionService;
  readonly #invalidateResetTokens: InvalidateResetTokens;
  readonly #clock: Clock;
  readonly #serverConfig: ServerConfig;
  readonly #rateLimiter: RateLimiter;
  readonly #adminEmail: string | undefined;

  constructor({
    em,
    emailSender,
    passwordHasher,
    sessionService,
    invalidateResetTokens,
    clock,
    serverConfig,
    rateLimiter,
    adminEmail,
  }: Deps) {
    this.#em = em;
    this.#emailSender = emailSender;
    this.#passwordHasher = passwordHasher;
    this.#sessionService = sessionService;
    this.#invalidateResetTokens = invalidateResetTokens;
    this.#clock = clock;
    this.#serverConfig = serverConfig;
    this.#rateLimiter = rateLimiter;
    this.#adminEmail = adminEmail;
  }

  /**
   * The synchronous part of a request: checks the current password and that the address differs,
   * then spends one of the account's 3 requests per hour. Whether the address is free is NOT
   * decided here (Q3): `deliver` does that after the answer. `newEmail` must come from
   * `emailChangeSchema`. The caller counts the password attempts (shared pool with the password change).
   * @returns the account, for `deliver`.
   * @throws ValidationError `INVALID_CURRENT_PASSWORD` (`fieldErrors.currentPassword`) or
   * `fieldErrors.newEmail` for the current address; ForbiddenError `ADMIN_EMAIL_LOCKED` for the
   * installation administrator; TooManyRequestsError for the account limit.
   */
  async request(userId: string, newEmail: string, currentPassword: string): Promise<EmailChangeUser> {
    const user = await this.#em.findOneOrFail(User, { id: userId });
    if (!(await this.#passwordHasher.verify(currentPassword, user.passwordHash))) {
      throw new ValidationError(INVALID_CURRENT_PASSWORD_MESSAGE, {
        code: "INVALID_CURRENT_PASSWORD",
        fieldErrors: { currentPassword: [INVALID_CURRENT_PASSWORD_MESSAGE] },
        fieldIssues: { currentPassword: [{ code: "INVALID_CURRENT_PASSWORD" }] },
      });
    }
    // BR-35, Q7: after the password check (so it is not an oracle without it) and before any write.
    if (isInstallationAdmin(user.email, this.#adminEmail)) {
      throw new ForbiddenError(ADMIN_EMAIL_LOCKED_MESSAGE, { code: "ADMIN_EMAIL_LOCKED" });
    }
    if (user.email === newEmail) {
      throw new ValidationError(SAME_EMAIL_MESSAGE, {
        fieldErrors: { newEmail: [SAME_EMAIL_MESSAGE] },
        fieldIssues: { newEmail: [{ code: "EMAIL_UNCHANGED" }] },
      });
    }
    await this.#rateLimiter.hit(
      `email-change:user:${hashOpaqueToken(userId)}`,
      EMAIL_CHANGE_ACCOUNT_LIMIT,
      EMAIL_CHANGE_WINDOW_MS,
    );
    return { id: user.id, email: user.email, displayName: user.displayName };
  }

  /**
   * Sends the link to the new address. Meant to run after the response (`after()`), so nothing
   * about the address (taken, limited, failing) reaches the caller (Q3): a taken address, an
   * exhausted limit (3 per hour per address; the earlier link stays valid) or a failed send all
   * resolve without a result. The token is stored as its SHA-256 only; the user's older unused
   * change tokens die only after the message was sent, so a failed send keeps the old link valid.
   * Unexpected failures (the database) are rethrown.
   */
  async deliver(user: EmailChangeUser, newEmail: string): Promise<void> {
    const address = normalizeEmail(newEmail);
    // Q7: nobody may take the administrator's address; answered like a taken one, with no trace.
    if (isInstallationAdmin(address, this.#adminEmail)) return;
    if (!(await this.#allowed(address))) return;
    if ((await this.#em.count(User, { email: address })) > 0) return;

    const now = this.#clock.now();
    const token = createOpaqueToken();
    const record = this.#em.create(EmailChangeToken, {
      user: this.#em.getReference(User, user.id),
      newEmail: address,
      tokenHash: hashOpaqueToken(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + EMAIL_CHANGE_TOKEN_TTL_MS),
    });
    await this.#em.flush();

    try {
      await this.#emailSender.send(
        buildEmailChangeMessage({
          to: address,
          name: user.displayName,
          token,
          origin: this.#serverConfig.appOrigin ?? DEV_ORIGIN,
        }),
        { signal: AbortSignal.timeout(VERIFICATION_SEND_TIMEOUT_MS) },
      );
    } catch (cause) {
      // Only the class name and driver code: the message may carry the address or the token.
      console.error("E-mail change message send failed", describeError(cause));
      await this.#em.nativeDelete(EmailChangeToken, { id: record.id });
      return;
    }

    await this.#em.nativeUpdate(
      EmailChangeToken,
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
   * Applies the change with the link token (Q8-Q11). One transaction consumes the token (a
   * conditional `UPDATE ... RETURNING`: of parallel calls exactly one wins), sets the new address
   * as confirmed, kills the unused reset, verification and change tokens and every session
   * (also in a running game, like a password change). An address taken meanwhile violates the
   * unique index and is `INVALID_TOKEN` too (Q11). Afterwards, after the commit, the previous
   * address gets a notice - but only when it had been confirmed (Q2); a failure of that message
   * is logged and never fails the change. Writes only through the transaction's `tx`.
   * @throws ValidationError `INVALID_TOKEN`.
   */
  async confirm(token: string): Promise<void> {
    const now = this.#clock.now();
    const changed = await this.#applyChange(token, now);
    if (changed.notify === null) return;
    try {
      await this.#emailSender.send(
        buildEmailChangedNotice({
          to: changed.notify.oldEmail,
          name: changed.notify.displayName,
          newEmailMasked: maskEmail(changed.notify.newEmail),
        }),
        { signal: AbortSignal.timeout(VERIFICATION_SEND_TIMEOUT_MS) },
      );
    } catch (cause) {
      console.error("E-mail change notice send failed", describeError(cause));
    }
  }

  async #applyChange(
    token: string,
    now: Date,
  ): Promise<{ notify: { oldEmail: string; newEmail: string; displayName: string } | null }> {
    try {
      return await this.#em.transactional(async (tx) => {
        const rows = await tx.execute<{ user_id: string; new_email: string }[]>(
          CONSUME_TOKEN_SQL,
          [now, hashOpaqueToken(token), now],
          "all",
        );
        const row = rows[0];
        if (!row) throw invalidToken();
        const user = await tx.findOneOrFail(User, { id: row.user_id });
        const oldEmail = user.email;
        // Q7 again under the transaction (the role may have been assigned after the request):
        // rolls back, the token stays unused and expires.
        if (isInstallationAdmin(oldEmail, this.#adminEmail) || isInstallationAdmin(row.new_email, this.#adminEmail)) {
          throw invalidToken();
        }
        const wasVerified = user.emailVerifiedAt !== null;
        await tx.nativeUpdate(User, { id: row.user_id }, { email: row.new_email, emailVerifiedAt: now });
        await this.#sessionService.revokeAll(row.user_id, tx);
        await this.#invalidateResetTokens(row.user_id, tx);
        await tx.nativeUpdate(
          EmailVerificationToken,
          { user: row.user_id, usedAt: null },
          { usedAt: now },
        );
        return {
          notify: wasVerified
            ? { oldEmail, newEmail: row.new_email, displayName: user.displayName }
            : null,
        };
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) throw invalidToken();
      throw error;
    }
  }

  /** Per-address hourly limit first (a throttled address must not use up the daily pool), then the daily pool. */
  async #allowed(address: string): Promise<boolean> {
    try {
      await this.#rateLimiter.hit(
        `email-change:address:${hashOpaqueToken(address)}`,
        EMAIL_CHANGE_ADDRESS_LIMIT,
        EMAIL_CHANGE_WINDOW_MS,
      );
      const dailyLimit = this.#serverConfig.emailDailyLimit;
      if (dailyLimit !== undefined) {
        await this.#rateLimiter.hit(EMAIL_CHANGE_DAILY_KEY, dailyLimit, DAILY_WINDOW_MS);
      }
      return true;
    } catch (error) {
      if (error instanceof TooManyRequestsError) return false;
      throw error;
    }
  }
}

function invalidToken(): ValidationError {
  return new ValidationError(INVALID_TOKEN_MESSAGE, { code: "INVALID_TOKEN" });
}
