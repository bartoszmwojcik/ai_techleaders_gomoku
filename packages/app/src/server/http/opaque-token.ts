import { createHash, randomBytes } from "node:crypto";

/** Random, opaque bearer token (32 bytes from the CSPRNG, base64url). Only its hash is stored. */
export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 (hex, 64 chars) of a token or any other identifier; safe to store and index. */
export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
