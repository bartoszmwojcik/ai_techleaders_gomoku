import { defineEntity, p } from "@mikro-orm/core";

import { GAME_VARIANTS, INITIAL_CLOCK_MS, PAPER_TIME_CONTROLS_MS } from "@gomoku/core";

import { User } from "../auth/user";

const VARIANTS_SQL = GAME_VARIANTS.map((variant) => `'${variant}'`).join(", ");

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
    // The settings the seeker wants for the game a pick creates (E11); same values as in `games`.
    variant: p.string().length(16).default("classic"),
    timeControlMs: p.integer().default(INITIAL_CLOCK_MS),
  },
  checks: [
    {
      name: "lobby_seekers_expiry_check",
      expression: "expires_at > created_at",
    },
    { name: "lobby_seekers_variant_check", expression: `variant in (${VARIANTS_SQL})` },
    {
      name: "lobby_seekers_time_control_check",
      expression: `(variant = 'classic' and time_control_ms = ${INITIAL_CLOCK_MS}) or (variant = 'paper' and time_control_ms in (${PAPER_TIME_CONTROLS_MS.join(", ")}))`,
    },
  ],
});
