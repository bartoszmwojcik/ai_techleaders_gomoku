import { randomInt } from "node:crypto";

import { generateInvitationCode } from "@gomoku/core";

/** Source of fresh invitation codes (CSPRNG). Stateless, so a singleton. */
export class InvitationCodes {
  generate(): string {
    return generateInvitationCode(randomInt);
  }
}
