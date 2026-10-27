import { defineEntity, p } from "@mikro-orm/core";

import { User } from "./user";

/** Server-side session; only the SHA-256 of the cookie token is stored. */
export const Session = defineEntity({
  name: "Session",
  tableName: "sessions",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    user: () => p.manyToOne(User).deleteRule("cascade").index(),
    tokenHash: p.string().length(64).columnType("char(64)").unique(),
    createdAt: p.datetime().defaultRaw("now()"),
    expiresAt: p.datetime(),
  },
});
