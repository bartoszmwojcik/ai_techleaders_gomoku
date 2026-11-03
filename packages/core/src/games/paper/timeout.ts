import { pickAutoMove } from "./auto-move";
import type { PaperStone } from "./board";
import { AUTO_MOVE_DELAY_MS } from "./constants";
import { scoreGame } from "./scoring";

/**
 * State of an active paper game as stored (E11 Data Model): the clock budget left after each
 * player's last move, the start of the current turn and the automat phase. In the normal phase
 * `turnSeat` is the player whose clock runs. In the automat phase `autoSeat` is the player who
 * ran out of time as the leader; the opponent (`turnSeat`) plays on against a clock that runs
 * without a break from `turnStartedAtMs` (the moment the automat took over).
 */
export type PaperClockState = {
  stones: readonly PaperStone[];
  clockMs: readonly [number, number];
  turnSeat: 1 | 2;
  turnStartedAtMs: number;
  autoSeat: 1 | 2 | null;
  pendingAutoAtMs: number | null;
};

export type PaperAutoMove = { x: number; y: number; seat: 1 | 2; atMs: number };

export type PaperResolution = {
  /** Automat stones to append, in order, each with the moment it was (to be) played. */
  autoMoves: PaperAutoMove[];
  /** Set when the game ended; `winnerSeat` is `null` for a draw on points. */
  finish: { atMs: number; winnerSeat: 1 | 2 | null } | null;
  /** The state after applying `autoMoves` (and the take-over), valid when `finish` is null. */
  state: PaperClockState;
};

const other = (seat: 1 | 2): 1 | 2 => (seat === 1 ? 2 : 1);

function winnerOf(stones: readonly PaperStone[]): 1 | 2 | null {
  const { scores } = scoreGame(stones);
  if (scores[0] === scores[1]) return null;
  return scores[0] > scores[1] ? 1 : 2;
}

/**
 * Brings a paper game up to `nowMs` (BR-50), lazily like the classic clock: every automat stone
 * and the end of the game are stamped with the moment they happened, not with `nowMs`.
 *
 * - The player on turn runs out of time: when they do not lead on points the game ends then
 *   (the higher score wins, equal is a draw); when they lead, the automat takes over: it plays
 *   at once and the opponent's clock runs from that moment, uninterrupted.
 * - In the automat phase the opponent's moves schedule the automat's next stone
 *   (`pendingAutoAtMs`, set by the move service); it is played when due, unless the opponent's
 *   clock ends first, which ends the game with the winner decided by points.
 */
export function resolvePaperClock(initial: PaperClockState, nowMs: number, random: () => number): PaperResolution {
  let state = initial;
  const autoMoves: PaperAutoMove[] = [];
  const stones = [...initial.stones];

  const playAuto = (seat: 1 | 2, atMs: number): boolean => {
    const around = stones.findLast((stone) => stone.seat !== seat) ?? stones[stones.length - 1]!;
    const cell = pickAutoMove(stones, around, random);
    if (cell === null) return false;
    stones.push({ ...cell, seat, auto: true });
    autoMoves.push({ ...cell, seat, atMs });
    return true;
  };

  if (state.autoSeat === null) {
    const deadline = state.turnStartedAtMs + state.clockMs[state.turnSeat - 1]!;
    if (nowMs < deadline) return { autoMoves, finish: null, state };
    const { scores } = scoreGame(stones);
    const leads = scores[state.turnSeat - 1]! > scores[other(state.turnSeat) - 1]!;
    if (!leads || !playAuto(state.turnSeat, deadline)) {
      return { autoMoves, finish: { atMs: deadline, winnerSeat: winnerOf(stones) }, state };
    }
    const clockMs: [number, number] = [state.clockMs[0], state.clockMs[1]];
    clockMs[state.turnSeat - 1] = 0;
    state = {
      stones,
      clockMs,
      turnSeat: other(state.turnSeat),
      turnStartedAtMs: deadline,
      autoSeat: state.turnSeat,
      pendingAutoAtMs: null,
    };
  }

  const autoSeat = state.autoSeat!;
  const player = other(autoSeat);
  const playerDeadline = state.turnStartedAtMs + state.clockMs[player - 1]!;
  let pending = state.pendingAutoAtMs;
  if (pending !== null && pending < playerDeadline && nowMs >= pending) {
    playAuto(autoSeat, pending);
    pending = null;
  }
  if (nowMs >= playerDeadline) {
    return { autoMoves, finish: { atMs: playerDeadline, winnerSeat: winnerOf(stones) }, state: { ...state, stones, pendingAutoAtMs: pending } };
  }
  return { autoMoves, finish: null, state: { ...state, stones, pendingAutoAtMs: pending } };
}

/** When the automat is due after the opponent's move at `atMs`. */
export const autoDueAt = (atMs: number): number => atMs + AUTO_MOVE_DELAY_MS;
