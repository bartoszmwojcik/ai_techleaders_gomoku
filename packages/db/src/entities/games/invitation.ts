import { defineEntity, p } from "@mikro-orm/core";

import { Game } from "./game";
import { GamePlayer } from "./game-player";

/**
 * Single-use invitation to a game (#21). The code is stored in plain text on purpose
 * (Q9): the creator must be able to see the link again. Storage form, no dash.
 */
export const Invitation = defineEntity({
  name: "Invitation",
  tableName: "invitations",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    game: () => p.oneToOne(Game).deleteRule("cascade").unique(),
    code: p.string().length(8).unique(),
    createdAt: p.datetime().defaultRaw("now()"),
    expiresAt: p.datetime().index(),
    consumedAt: p.datetime().nullable(),
    consumedBy: () => p.manyToOne(GamePlayer).deleteRule("set null").nullable(),
  },
  checks: [
    {
      name: "invitations_code_check",
      // The invitation alphabet without the look-alikes 0 O 1 I L (core constants).
      expression: `code ~ '^[2-9A-HJKMNP-Z]{8}$'`,
    },
  ],
});
