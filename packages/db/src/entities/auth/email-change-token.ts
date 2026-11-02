import { defineEntity, p } from "@mikro-orm/core";

import { User } from "./user";

/**
 * One-time token confirming a change of the account's e-mail address (E05-S01); only the SHA-256 of
 * the link token is stored. The link goes to `newEmail`; the account keeps its old address until the
 * token is consumed. `expiresAt` (24 h) is set by the service; `usedAt` marks consumption.
 */
export const EmailChangeToken = defineEntity({
  name: "EmailChangeToken",
  tableName: "email_change_tokens",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    user: () => p.manyToOne(User).deleteRule("cascade").index(),
    newEmail: p.string().length(254),
    tokenHash: p.string().length(64).columnType("char(64)").unique(),
    createdAt: p.datetime().defaultRaw("now()"),
    expiresAt: p.datetime(),
    usedAt: p.datetime().nullable(),
  },
});
