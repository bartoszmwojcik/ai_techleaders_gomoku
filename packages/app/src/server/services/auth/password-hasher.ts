import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";

type Deps = { passwordHashCost: number };

/**
 * bcrypt password hashing. Only the asynchronous API is used: bcryptjs yields to the event
 * loop between rounds, so hashing does not block a single-process server with live games.
 * The cost is injected (12 in the app, 4 in tests).
 */
export class PasswordHasher {
  readonly #cost: number;

  /**
   * Hash of a random throwaway secret at the same cost as real hashes, computed once when
   * the hasher is created. Login verifies against it for an unknown e-mail so the response
   * time does not reveal whether the account exists, also for the very first such request.
   */
  readonly dummyHash: Promise<string>;

  constructor({ passwordHashCost }: Deps) {
    this.#cost = passwordHashCost;
    this.dummyHash = this.hash(randomBytes(32).toString("base64url"));
  }

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.#cost);
  }

  verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
