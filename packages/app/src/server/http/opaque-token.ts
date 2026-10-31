import { createHash, randomBytes } from "node:crypto";

/** Random, opaque bearer token (32 bytes from the CSPRNG, base64url). Only its hash is stored. */
export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 (hex, 64 chars) of a token or any other identifier; safe to store and index. */
export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * The token a guest carries into a rematch game (rematch spec Q5): derived from the token of
 * the finished game and the new game's id, so it is the same on every call (a retry after a lost
 * response, the proposer claiming their seat) while the database only ever sees its hash. It
 * cannot be computed without the old token, which the database does not hold either.
 */
export function deriveRematchToken(previousToken: string, rematchGameId: string): string {
  return createHash("sha256")
    .update(`rematch:${rematchGameId}:${previousToken}`)
    .digest("base64url");
}
