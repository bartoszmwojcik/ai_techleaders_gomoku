import { defineEntity, p } from "@mikro-orm/core";

import { User } from "../auth/user";

/**
 * "Looking for a game" status of an account (#25, #31): one row per user, valid until
 * `expiresAt` (BR-12, 5 minutes). Not a game and not a slot: it has its own life cycle.
 * Expiry is lazy (reads filter `expires_at > now`); the cleanup sweeps the dead rows.
 */
export const LobbySeeker = defineEntity({
  name: "LobbySeeker",
  tableName: "lobby_seekers",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    user: () => p.manyToOne(User).deleteRule("cascade").unique(),
    createdAt: p.datetime().defaultRaw("now()"),
    expiresAt: p.datetime().index(),
  },
  checks: [
    {
      name: "lobby_seekers_expiry_check",
      expression: "expires_at > created_at",
    },
  ],
});
