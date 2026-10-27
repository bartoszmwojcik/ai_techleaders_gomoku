import { defineEntity, p } from "@mikro-orm/core";

/** Player account. `email` is stored trimmed and lowercased. */
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
    createdAt: p.datetime().defaultRaw("now()"),
  },
});
