import {
  ConflictError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
  normalizeDisplayName,
  normalizeEmail,
  type RegisterInput,
} from "@gomoku/core";
import {
  User,
  UniqueConstraintViolationException,
  type EntityManager,
} from "@gomoku/db";

import { describeError } from "../../http/describe-error";
import type { Clock } from "../email/email-sender";
import {
  VERIFICATION_SEND_TIMEOUT_MS,
  type EmailVerificationService,
} from "./email-verification-service";
import type { PasswordHasher } from "./password-hasher";
import type { SessionService } from "./session-service";

/**
 * Invalidates the user's unused password reset tokens (#35). Called inside the password
 * change transaction with the transaction's `em` (`tx`): an implementation must write only
 * through it, never through an injected `em` (that fork does not join the transaction).
 * The container registers `invalidateResetTokens` from `invalidate-reset-tokens.ts`.
 */
export type InvalidateResetTokens = (
  userId: string,
  em: EntityManager,
) => Promise<void>;

type Deps = {
  em: EntityManager;
  passwordHasher: PasswordHasher;
  sessionService: SessionService;
  invalidateResetTokens: InvalidateResetTokens;
  emailVerificationService: EmailVerificationService;
  clock: Clock;
};

export type RegisteredUser = {
  user: { id: string; displayName: string };
  session: { token: string; expiresAt: Date };
};

/** Uniform answer for a taken e-mail: it must not reveal whether the account exists (Q7). */
export const EMAIL_TAKEN_MESSAGE =
  "Nie udało się założyć konta. Jeśli masz już konto, zaloguj się.";
export const DISPLAY_NAME_TAKEN_MESSAGE = "Ta nazwa gracza jest już zajęta.";

/** One answer for an unknown e-mail and a wrong password (never reveals which). */
export const INVALID_CREDENTIALS_MESSAGE = "Nieprawidłowy e-mail lub hasło.";

/** Answer for a wrong current password, also when a concurrent change got there first. */
export const INVALID_CURRENT_PASSWORD_MESSAGE =
  "Obecne hasło jest nieprawidłowe.";

/** A player may rename themselves at most once per this window (E05-S01). */
export const DISPLAY_NAME_CHANGE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SAME_DISPLAY_NAME_MESSAGE = "To już jest Twoja nazwa gracza.";
export const DISPLAY_NAME_COOLDOWN_MESSAGE =
  "Nazwę gracza można zmienić raz na dobę. Spróbuj później.";

const DISPLAY_NAME_KEY_CONSTRAINT = "users_display_name_key_unique";

export class UserService {
  readonly #em: EntityManager;
  readonly #passwordHasher: PasswordHasher;
  readonly #sessionService: SessionService;
  readonly #invalidateResetTokens: InvalidateResetTokens;
  readonly #emailVerificationService: EmailVerificationService;
  readonly #clock: Clock;

  constructor({
    em,
    passwordHasher,
    sessionService,
    invalidateResetTokens,
    emailVerificationService,
    clock,
  }: Deps) {
    this.#em = em;
    this.#passwordHasher = passwordHasher;
    this.#sessionService = sessionService;
    this.#invalidateResetTokens = invalidateResetTokens;
    this.#emailVerificationService = emailVerificationService;
    this.#clock = clock;
  }

  /**
   * Creates an account and its first session in a single transaction. `input` must come from `registerSchema`
   * (normalized e-mail, validated name and password); only its fields are persisted.
   * The password is hashed before the insert on every path, so response time does not
   * depend on whether the e-mail exists. Uniqueness is decided by the database indexes,
   * not by a prior lookup, so concurrent registrations cannot both succeed.
   */
  async register(input: RegisterInput): Promise<RegisteredUser> {
    const passwordHash = await this.#passwordHasher.hash(input.password);
    let registered: RegisteredUser;
    try {
      // One transaction: a failure to create the session leaves no account without one.
      // Writes go through `tx`; the injected fork (`useContext = false`) is outside it.
      registered = await this.#em.transactional(async (tx) => {
        const user = tx.create(User, {
          email: input.email,
          displayName: input.displayName,
          displayNameKey: normalizeDisplayName(input.displayName),
          passwordHash,
        });
        await tx.flush();
        const session = await this.#sessionService.create(
          user.id,
          new Date(),
          tx,
        );
        return {
          user: { id: user.id, displayName: user.displayName },
          session,
        };
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        throw await this.#conflictFor(error, input.email);
      }
      throw error;
    }
    await this.#sendVerification(registered.user, input.email);
    return registered;
  }

  /**
   * Sends the confirmation link after the registration committed. The call is awaited
   * (no background work), but a failure never fails the registration (Q6): it is logged
   * without the address or the token, and the player can ask for a new link later.
   * The wait is bounded by `VERIFICATION_SEND_TIMEOUT_MS`: on timeout the sender aborts, the
   * service removes the unsent token (the earlier link, if any, stays valid) and registration
   * still answers 201. If the provider delivered the message despite the abort, its link is
   * dead (token removed) and the player asks for a new one.
   */
  async #sendVerification(
    user: RegisteredUser["user"],
    email: string,
  ): Promise<void> {
    try {
      await this.#emailVerificationService.issue(
        { ...user, email },
        undefined,
        {
          signal: AbortSignal.timeout(VERIFICATION_SEND_TIMEOUT_MS),
        },
      );
    } catch (error) {
      console.error("Verification e-mail not sent", describeError(error));
    }
  }

  /**
   * Checks credentials and returns the user; it does not create a session (the route
   * resets the e-mail rate limits first). The e-mail is normalized like at registration.
   * `verify` always runs - for an unknown e-mail against the dummy hash - so response time
   * does not reveal whether the account exists. An unconfirmed e-mail does not matter (BR-26).
   * @throws UnauthorizedError with the same message for an unknown e-mail and a wrong password.
   */
  async authenticate(
    email: string,
    password: string,
  ): Promise<{ id: string; displayName: string }> {
    const user = await this.#em.findOne(User, { email: normalizeEmail(email) });
    const hash = user?.passwordHash ?? (await this.#passwordHasher.dummyHash);
    const matches = await this.#passwordHasher.verify(password, hash);
    if (!user || !matches) {
      throw new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE, {
        code: "INVALID_CREDENTIALS",
      });
    }
    return { id: user.id, displayName: user.displayName };
  }

  /**
   * Changes the password of a signed-in user. `newPassword` must come from
   * `passwordChangeSchema`. The current password is verified against the stored hash and the
   * new one hashed before the transaction (bcrypt must not hold a connection); the
   * transaction then replaces the hash only if it is still the one that was verified
   * (`UPDATE ... WHERE password_hash = <verified>`, so of two parallel changes only the first
   * wins), removes the user's other sessions (all but `currentSessionId`) and invalidates
   * unused reset tokens, all or nothing.
   * @throws ValidationError `INVALID_CURRENT_PASSWORD` (`fieldErrors.currentPassword`) for a
   * wrong current password or a lost race; UnauthorizedError when the user no longer exists.
   */
  async changePassword(
    userId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.#em.findOne(User, { id: userId });
    if (!user) {
      throw new UnauthorizedError("Zaloguj się, aby kontynuować.");
    }
    const previousHash = user.passwordHash;
    if (!(await this.#passwordHasher.verify(currentPassword, previousHash))) {
      throw invalidCurrentPassword();
    }
    const newHash = await this.#passwordHasher.hash(newPassword);
    await this.#em.transactional(async (tx) => {
      const updated = await tx.nativeUpdate(
        User,
        { id: userId, passwordHash: previousHash },
        { passwordHash: newHash },
      );
      if (updated === 0) throw invalidCurrentPassword();
      await this.#sessionService.revokeOthers(userId, currentSessionId, tx);
      await this.#invalidateResetTokens(userId, tx);
    });
  }

  /**
   * Renames a signed-in user (E05-S01). `displayName` must come from `displayNameChangeSchema`.
   * The window is checked in the same conditional `UPDATE` that writes the name, so two
   * parallel requests cannot both pass; uniqueness is decided by the `display_name_key` index.
   * Seats of games already created keep their snapshot of the old name.
   * @returns the new name.
   * @throws ValidationError (`fieldErrors.displayName`) for the current name (the window is not
   * spent); ConflictError (`fieldErrors.displayName`) for a taken name; TooManyRequestsError
   * `DISPLAY_NAME_COOLDOWN` with `retryAfterSeconds` inside the window; UnauthorizedError when
   * the user no longer exists.
   */
  async changeDisplayName(userId: string, displayName: string): Promise<string> {
    const user = await this.#em.findOne(User, { id: userId });
    if (!user) throw new UnauthorizedError("Zaloguj się, aby kontynuować.");
    if (user.displayName === displayName) {
      throw new ValidationError(SAME_DISPLAY_NAME_MESSAGE, {
        fieldErrors: { displayName: [SAME_DISPLAY_NAME_MESSAGE] },
      });
    }
    const now = this.#clock.now();
    const cutoff = new Date(now.getTime() - DISPLAY_NAME_CHANGE_WINDOW_MS);
    let updated: number;
    try {
      updated = await this.#em.nativeUpdate(
        User,
        {
          id: userId,
          $or: [
            { displayNameChangedAt: null },
            { displayNameChangedAt: { $lte: cutoff } },
          ],
        },
        {
          displayName,
          displayNameKey: normalizeDisplayName(displayName),
          displayNameChangedAt: now,
        },
      );
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        throw new ConflictError(DISPLAY_NAME_TAKEN_MESSAGE, {
          fieldErrors: { displayName: [DISPLAY_NAME_TAKEN_MESSAGE] },
        });
      }
      throw error;
    }
    if (updated === 0) {
      // The user exists (read above), so the window is what held the update back.
      const row = await this.#em.findOne(User, { id: userId }, { refresh: true });
      const changedAt = row?.displayNameChangedAt ?? now;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(
          (changedAt.getTime() + DISPLAY_NAME_CHANGE_WINDOW_MS - now.getTime()) / 1000,
        ),
      );
      throw new TooManyRequestsError(DISPLAY_NAME_COOLDOWN_MESSAGE, {
        code: "DISPLAY_NAME_COOLDOWN",
        retryAfterSeconds,
      });
    }
    return displayName;
  }

  /**
   * PostgreSQL reports only the first violated index, so when the name index fired the
   * e-mail may be taken as well; it is looked up so that the uniform e-mail answer wins
   * and a name conflict never confirms an e-mail.
   */
  async #conflictFor(
    error: UniqueConstraintViolationException,
    email: string,
  ): Promise<ConflictError> {
    const onlyNameKnown =
      (error as { constraint?: string }).constraint ===
      DISPLAY_NAME_KEY_CONSTRAINT;
    // The failed flush leaves the new entity scheduled; drop it before querying.
    this.#em.clear();
    if (onlyNameKnown && (await this.#em.count(User, { email })) === 0) {
      return new ConflictError(DISPLAY_NAME_TAKEN_MESSAGE, {
        fieldErrors: { displayName: [DISPLAY_NAME_TAKEN_MESSAGE] },
      });
    }
    return new ConflictError(EMAIL_TAKEN_MESSAGE);
  }
}

function invalidCurrentPassword(): ValidationError {
  return new ValidationError(INVALID_CURRENT_PASSWORD_MESSAGE, {
    code: "INVALID_CURRENT_PASSWORD",
    fieldErrors: { currentPassword: [INVALID_CURRENT_PASSWORD_MESSAGE] },
  });
}
