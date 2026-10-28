import { AppError, TooManyRequestsError, ValidationError } from "@gomoku/core";
import { EmailVerificationToken, User, type EntityManager } from "@gomoku/db";

import type { ServerConfig } from "../../config";
import { createOpaqueToken, hashOpaqueToken } from "../../http/opaque-token";
import type { Clock, EmailSender } from "../email/email-sender";
import type { RateLimiter } from "../rate-limit/rate-limiter";
import {
  VERIFICATION_LINK_VALID_HOURS,
  buildVerificationMessage,
} from "./email-verification-message";

type Deps = {
  em: EntityManager;
  emailSender: EmailSender;
  clock: Clock;
  serverConfig: ServerConfig;
  rateLimiter: RateLimiter;
};

/** Who gets the message; only these fields are read. */
export type VerificationRecipient = {
  id: string;
  email: string;
  displayName: string;
};

export const VERIFICATION_TOKEN_TTL_MS =
  VERIFICATION_LINK_VALID_HOURS * 60 * 60 * 1000;
/** E-mail verification may use at most this share of `EMAIL_DAILY_LIMIT` (Q12). */
export const VERIFICATION_DAILY_SHARE = 0.7;
export const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const VERIFICATION_DAILY_KEY = "email-daily:verification";

export const INVALID_TOKEN_MESSAGE = "Link wygasł lub został już użyty.";
export const EMAIL_SEND_FAILED_MESSAGE =
  "Nie udało się wysłać wiadomości. Spróbuj później.";
export const EMAIL_QUOTA_EXCEEDED_MESSAGE =
  "Wysyłka wiadomości jest chwilowo niedostępna. Spróbuj jutro albo zagraj jako gość z zaproszenia.";

/** Used only outside production, where `APP_ORIGIN` may be unset. */
const DEV_ORIGIN = "http://localhost:3000";

// Consumes a token only while it is unused and unexpired; of parallel requests with the same
// token exactly one gets a row back. All values are bound parameters.
const CONSUME_TOKEN_SQL = `
  update email_verification_tokens set used_at = ?
  where token_hash = ? and used_at is null and expires_at > ?
  returning user_id`;

export class EmailVerificationService {
  readonly #em: EntityManager;
  readonly #emailSender: EmailSender;
  readonly #clock: Clock;
  readonly #serverConfig: ServerConfig;
  readonly #rateLimiter: RateLimiter;

  constructor({ em, emailSender, clock, serverConfig, rateLimiter }: Deps) {
    this.#em = em;
    this.#emailSender = emailSender;
    this.#clock = clock;
    this.#serverConfig = serverConfig;
    this.#rateLimiter = rateLimiter;
  }

  /**
   * Stores a fresh token (only its SHA-256) and sends the confirmation link. The user's
   * older unused tokens are invalidated only after the message was sent, so a failed send
   * leaves the previous link valid (Q7). The daily send limit (Q10, at most 70% of it for
   * this channel, Q12) is checked first; without `EMAIL_DAILY_LIMIT` nothing is limited.
   * @throws AppError 503 `EMAIL_QUOTA_EXCEEDED` when the daily share is used up;
   * 502 `EMAIL_SEND_FAILED` when the transport fails (the unsent token is removed).
   */
  async issue(user: VerificationRecipient, next?: string): Promise<void> {
    await this.#assertDailyQuota();

    const now = this.#clock.now();
    const token = createOpaqueToken();
    const record = this.#em.create(EmailVerificationToken, {
      user: this.#em.getReference(User, user.id),
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS),
    });
    await this.#em.flush();

    try {
      await this.#emailSender.send(
        buildVerificationMessage({
          to: user.email,
          name: user.displayName,
          token,
          origin: this.#serverConfig.appOrigin ?? DEV_ORIGIN,
          next,
        }),
      );
    } catch {
      await this.#em.nativeDelete(EmailVerificationToken, { id: record.id });
      throw new AppError(502, "EMAIL_SEND_FAILED", EMAIL_SEND_FAILED_MESSAGE);
    }

    await this.#em.nativeUpdate(
      EmailVerificationToken,
      { user: user.id, usedAt: null, id: { $ne: record.id } },
      { usedAt: now },
    );
  }

  /**
   * Consumes the token and confirms the account's e-mail in one transaction. An unknown,
   * expired, invalidated or already used token (also a second request with the same token,
   * Q11) is `400 INVALID_TOKEN`. An already confirmed account keeps its original
   * `emailVerifiedAt`; the token is still consumed and the call succeeds.
   * Writes only through the transaction's `tx` (the injected fork is outside it).
   * @returns the id of the confirmed user.
   */
  async confirm(token: string): Promise<{ userId: string }> {
    const now = this.#clock.now();
    return this.#em.transactional(async (tx) => {
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
      await tx.nativeUpdate(
        User,
        { id: row.user_id, emailVerifiedAt: null },
        { emailVerifiedAt: now },
      );
      return { userId: row.user_id };
    });
  }

  async #assertDailyQuota(): Promise<void> {
    const dailyLimit = this.#serverConfig.emailDailyLimit;
    if (dailyLimit === undefined) return;
    try {
      await this.#rateLimiter.hit(
        VERIFICATION_DAILY_KEY,
        Math.floor(dailyLimit * VERIFICATION_DAILY_SHARE),
        DAILY_WINDOW_MS,
      );
    } catch (error) {
      if (error instanceof TooManyRequestsError) {
        throw new AppError(
          503,
          "EMAIL_QUOTA_EXCEEDED",
          EMAIL_QUOTA_EXCEEDED_MESSAGE,
        );
      }
      throw error;
    }
  }
}
