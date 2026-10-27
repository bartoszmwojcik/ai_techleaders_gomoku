import bcrypt from "bcryptjs";

type Deps = { passwordHashCost: number };

/**
 * bcrypt password hashing. Only the asynchronous API is used: bcryptjs yields to the event
 * loop between rounds, so hashing does not block a single-process server with live games.
 * The cost is injected (12 in the app, 4 in tests).
 */
export class PasswordHasher {
  readonly #cost: number;

  constructor({ passwordHashCost }: Deps) {
    this.#cost = passwordHashCost;
  }

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.#cost);
  }

  verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
