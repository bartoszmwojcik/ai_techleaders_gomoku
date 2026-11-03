// Rules of the "paper and pencil" variant (E11, D-34): a 101×101 sheet, stones at most three
// fields apart, a point for every five in a row, a clock of 1/2/3/5 minutes per player.

/** The sheet is 101×101; coordinates are absolute 0–100 and the first stone is in the middle. */
export const PAPER_BOARD_SIZE = 101;
export const PAPER_CENTER = 50;
export const PAPER_CELLS = PAPER_BOARD_SIZE * PAPER_BOARD_SIZE;

/** A stone may be placed at most this many fields (Chebyshev) from another stone (BR-47). */
export const PAPER_MAX_GAP = 3;

/** A row of `n` stones is worth ⌊n / 5⌋ points (BR-48). */
export const PAPER_FIVE = 5;

/** Clock budgets the creator may choose (BR-49), in ms. */
export const PAPER_TIME_CONTROLS_MS = [60_000, 120_000, 180_000, 300_000] as const;
export type PaperTimeControlMs = (typeof PAPER_TIME_CONTROLS_MS)[number];
export const PAPER_DEFAULT_TIME_MS: PaperTimeControlMs = 180_000;

/** The automat puts its next stone this long after the opponent's move (BR-50). */
export const AUTO_MOVE_DELAY_MS = 2_000;

/** Game variants: the classic 15×15 game and the paper and pencil one. */
export const GAME_VARIANTS = ["classic", "paper"] as const;
export type GameVariant = (typeof GAME_VARIANTS)[number];
export const DEFAULT_VARIANT: GameVariant = "classic";
