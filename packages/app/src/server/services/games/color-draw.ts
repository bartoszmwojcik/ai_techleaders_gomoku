import { randomInt } from "node:crypto";

import type { Seat } from "@gomoku/core";

/**
 * Source of the colour draw (#22 Q1): which seat plays black and moves first. Without it the
 * creator's side would always have the first-move advantage, which is large in gomoku.
 * Stateless (CSPRNG), so a singleton.
 */
export class ColorDraw {
  drawBlackSeat(): Seat {
    return randomInt(2) === 0 ? 1 : 2;
  }
}
