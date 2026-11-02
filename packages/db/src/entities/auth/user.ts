import { defineEntity, p } from "@mikro-orm/core";

/**
 * Player account. `email` is stored trimmed and lowercased.
 *
 * The installation administrator is the account whose e-mail equals `ADMIN_EMAIL` (BR-35, no role
 * column). Therefore nothing may change `email` of an existing account without handling that rule
 * (see `users-email-writes.guard.test.ts` in `@gomoku/app`).
 */
export const User = defineEntity({
  name: "User",
  tableName: "users",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    email: p.string().length(254).unique(),
    displayName: p.string().length(24),
    // `normalizeDisplayName(displayName)`, computed in the application (G6).
    displayNameKey: p.string().length(24).unique(),
    passwordHash: p.string().length(60),
    // NULL = e-mail not confirmed.
    emailVerifiedAt: p.datetime().nullable(),
    // When the name was last changed by the user (E05-S01): once per 24 h. NULL = never (registration does not count).
    displayNameChangedAt: p.datetime().nullable(),
    createdAt: p.datetime().defaultRaw("now()"),
  },
});
