import {
  ConflictError,
  normalizeDisplayName,
  type RegisterInput,
} from "@gomoku/core";
import {
  User,
  UniqueConstraintViolationException,
  type EntityManager,
} from "@gomoku/db";

import type { PasswordHasher } from "./password-hasher";
import type { SessionService } from "./session-service";

type Deps = {
  em: EntityManager;
  passwordHasher: PasswordHasher;
  sessionService: SessionService;
};

export type RegisteredUser = {
  user: { id: string; displayName: string };
  session: { token: string; expiresAt: Date };
};

/** Uniform answer for a taken e-mail: it must not reveal whether the account exists (Q7). */
export const EMAIL_TAKEN_MESSAGE =
  "Nie udało się założyć konta. Jeśli masz już konto, zaloguj się.";
export const DISPLAY_NAME_TAKEN_MESSAGE = "Ta nazwa gracza jest już zajęta.";

const DISPLAY_NAME_KEY_CONSTRAINT = "users_display_name_key_unique";

export class UserService {
  readonly #em: EntityManager;
  readonly #passwordHasher: PasswordHasher;
  readonly #sessionService: SessionService;

  constructor({ em, passwordHasher, sessionService }: Deps) {
    this.#em = em;
    this.#passwordHasher = passwordHasher;
    this.#sessionService = sessionService;
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
    try {
      // One transaction: a failure to create the session leaves no account without one.
      return await this.#em.transactional(async () => {
        const user = this.#em.create(User, {
          email: input.email,
          displayName: input.displayName,
          displayNameKey: normalizeDisplayName(input.displayName),
          passwordHash,
        });
        await this.#em.flush();
        const session = await this.#sessionService.create(user.id);
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
