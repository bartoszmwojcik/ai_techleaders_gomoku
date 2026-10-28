import { defineEntity, p } from "@mikro-orm/core";

import { User } from "./user";

/**
 * One-time e-mail confirmation token; only the SHA-256 of the link token is
 * stored. `expiresAt` (24 h) is set by the service; `usedAt` marks consumption.
 */
export const EmailVerificationToken = defineEntity({
  name: "EmailVerificationToken",
  tableName: "email_verification_tokens",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    user: () => p.manyToOne(User).deleteRule("cascade").index(),
    tokenHash: p.string().length(64).columnType("char(64)").unique(),
    createdAt: p.datetime().defaultRaw("now()"),
    expiresAt: p.datetime(),
    usedAt: p.datetime().nullable(),
  },
});
