import { normalizeDisplayName, normalizeEmail, ValidationError } from "@gomoku/core";
import { User, UniqueConstraintViolationException, type EntityManager } from "@gomoku/db";

import type { Clock } from "../email/email-sender";
import type { SessionService } from "./session-service";
import type { InvalidateResetTokens } from "./user-service";

type Deps = {
  em: EntityManager;
  sessionService: Pick<SessionService, "revokeAll">;
  invalidateResetTokens: InvalidateResetTokens;
  clock: Clock;
};

export type ProvisionInput = {
  /** Already validated against `ADMIN_EMAIL`; normalized again here. */
  email: string;
  /** Used only when the account is created; an existing account keeps its name. */
  displayName?: string;
  /** bcrypt hash computed before the transaction (the password never reaches this service). */
  passwordHash: string;
};

export type ProvisionResult = {
  action: "created" | "taken_over";
  userId: string;
  revokedSessions: number;
};

export type ExistingAccount = { displayName: string; createdAt: string };

const LOCK_BY_EMAIL_SQL = `select id from users where email = ? for no key update`;
const SELECT_BY_EMAIL_SQL = `select display_name, created_at from users where email = ?`;
const TAKE_OVER_SQL = `update users set password_hash = ?, email_verified_at = coalesce(email_verified_at, ?) where id = ?`;
const DELETE_VERIFICATION_TOKENS_SQL = `delete from email_verification_tokens where user_id = ? and used_at is null`;

export const DISPLAY_NAME_REQUIRED_MESSAGE = "Podaj nazwę gracza (--name), aby założyć konto.";
export const DISPLAY_NAME_TAKEN_BY_OPERATOR_MESSAGE = "Nazwa gracza jest już zajęta.";

const UNIQUE_RETRIES = 1;

/**
 * Creates or takes over the installation administrator's account (E08-S01, BR-35): the only way
 * that account comes to exist. One transaction under a row lock; taking over rotates the password,
 * confirms the e-mail and revokes every session and unused token. Idempotent: repeating it is
 * another takeover (also the way to regain access, A-12).
 */
export class AdminAccountService {
  readonly #em: EntityManager;
  readonly #sessionService: Pick<SessionService, "revokeAll">;
  readonly #invalidateResetTokens: InvalidateResetTokens;
  readonly #clock: Clock;

  constructor({ em, sessionService, invalidateResetTokens, clock }: Deps) {
    this.#em = em;
    this.#sessionService = sessionService;
    this.#invalidateResetTokens = invalidateResetTokens;
    this.#clock = clock;
  }

  /** Unlocked read for the operator's confirmation prompt; `null` when no such account exists. */
  async find(email: string): Promise<ExistingAccount | null> {
    const rows = await this.#em.execute<{ display_name: string; created_at: Date | string }[]>(
      SELECT_BY_EMAIL_SQL,
      [normalizeEmail(email)],
    );
    const row = rows[0];
    if (!row) return null;
    return { displayName: row.display_name, createdAt: new Date(row.created_at).toISOString() };
  }

  /**
   * @throws ValidationError `DISPLAY_NAME_REQUIRED` / `DISPLAY_NAME_TAKEN` (creation only);
   * database errors as they are. A parallel run that wins the unique index is retried once.
   */
  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.#provisionOnce(input);
      } catch (error) {
        if (!(error instanceof UniqueConstraintViolationException)) throw error;
        this.#em.clear();
        if (attempt >= UNIQUE_RETRIES) throw nameTaken();
      }
    }
  }

  async #provisionOnce({ email, displayName, passwordHash }: ProvisionInput): Promise<ProvisionResult> {
    const normalized = normalizeEmail(email);
    return this.#em.transactional(async (tx) => {
      const now = this.#clock.now();
      const locked = await tx.execute<{ id: string }[]>(LOCK_BY_EMAIL_SQL, [normalized]);
      const existing = locked[0];
      if (!existing) {
        if (!displayName) {
          throw new ValidationError(DISPLAY_NAME_REQUIRED_MESSAGE, { code: "DISPLAY_NAME_REQUIRED" });
        }
        const user = tx.create(User, {
          email: normalized,
          displayName,
          displayNameKey: normalizeDisplayName(displayName),
          passwordHash,
          emailVerifiedAt: now,
        });
        await tx.flush();
        return { action: "created" as const, userId: user.id, revokedSessions: 0 };
      }
      await tx.execute(TAKE_OVER_SQL, [passwordHash, now, existing.id], "run");
      const revokedSessions = await this.#sessionService.revokeAll(existing.id, tx);
      await this.#invalidateResetTokens(existing.id, tx);
      await tx.execute(DELETE_VERIFICATION_TOKENS_SQL, [existing.id], "run");
      return { action: "taken_over" as const, userId: existing.id, revokedSessions };
    });
  }
}

function nameTaken(): ValidationError {
  return new ValidationError(DISPLAY_NAME_TAKEN_BY_OPERATOR_MESSAGE, {
    code: "DISPLAY_NAME_TAKEN",
    fieldErrors: { displayName: [DISPLAY_NAME_TAKEN_BY_OPERATOR_MESSAGE] },
    fieldIssues: { displayName: [{ code: "DISPLAY_NAME_TAKEN" }] },
  });
}
