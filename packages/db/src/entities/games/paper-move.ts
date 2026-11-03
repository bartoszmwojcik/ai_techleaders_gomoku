import { defineEntity, p } from "@mikro-orm/core";

import { PAPER_BOARD_SIZE } from "@gomoku/core";

import { Game } from "./game";

/**
 * One stone of a paper game (E11, D-34): absolute coordinates 0-100, numbered from 1 per game. The colour is not
 * stored: it follows from `seat` and `games.black_seat`. `isAuto` marks a stone put by the automat (BR-50).
 */
export const PaperMove = defineEntity({
  name: "PaperMove",
  tableName: "paper_moves",
  properties: {
    game: () => p.manyToOne(Game).primary().deleteRule("cascade"),
    moveNumber: p.integer().primary(),
    x: p.smallint(),
    y: p.smallint(),
    seat: p.smallint(),
    isAuto: p.boolean().default(false),
    playedAt: p.datetime(),
  },
  // A field holds at most one stone.
  uniques: [{ name: "paper_moves_game_id_x_y_unique", properties: ["game", "x", "y"] }],
  checks: [
    { name: "paper_moves_move_number_check", expression: "move_number >= 1" },
    {
      name: "paper_moves_coordinates_check",
      expression: `x between 0 and ${PAPER_BOARD_SIZE - 1} and y between 0 and ${PAPER_BOARD_SIZE - 1}`,
    },
    { name: "paper_moves_seat_check", expression: "seat in (1, 2)" },
  ],
});
