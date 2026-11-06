// Entry point of `npm run bot:arena`: the R17 acceptance test of the spec 2026-11-05-hosted-bot —
// 100 bot–bot games (seeds 1…100, level 2 on black for odd seeds), node limit instead of time.
// Prints every game and the score; exit code 1 when level 2 misses the R17 thresholds.
import { ARENA_BUDGET, R17_PER_COLOUR, R17_TOTAL, runArena, type ArenaGame } from "./arena";

export const ARENA_GAMES = 100;

const COLOUR_LABELS = { black: "czarne", white: "białe" } as const;

function outcome(game: ArenaGame): string {
  if (game.winner === null) return "remis";
  return game.winner === game.level2Colour ? "wygrywa poziom 2" : "wygrywa poziom 1";
}

const started = performance.now();
const result = runArena(ARENA_GAMES, ARENA_BUDGET, (game) => {
  console.log(`partia ${game.seed}: poziom 2 gra ${COLOUR_LABELS[game.level2Colour]}, ${outcome(game)} po ${game.moves.length} ruchach`);
});
const seconds = ((performance.now() - started) / 1000).toFixed(1);
const { maxNodes, maxDepth, ttBytes } = ARENA_BUDGET;
console.log(`budżet: maxNodes ${maxNodes}, maxDepth ${maxDepth}, ttBytes ${ttBytes}; czas ${seconds} s`);
for (const colour of ["black", "white"] as const) {
  const { games, score } = result.byColour[colour];
  console.log(`poziom 2 na ${COLOUR_LABELS[colour]}: ${score} / ${games} = ${(score / games).toFixed(2)} (próg ${R17_PER_COLOUR})`);
}
console.log(`wynik poziomu 2: ${result.total.toFixed(2)} (próg ${R17_TOTAL}) — ${result.passed ? "R17 spełnione" : "R17 NIESPEŁNIONE"}`);
process.exitCode = result.passed ? 0 : 1;
