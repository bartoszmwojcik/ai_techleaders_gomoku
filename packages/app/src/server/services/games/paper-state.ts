import type { PaperMoveRow, PaperSnapshot } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

type StateRow = { move_count: number; auto_seat: number | null; pending_ms: number | null };
type MoveRow = { move_number: number; x: number; y: number; seat: number; is_auto: boolean; at_ms: number };

// Dates come back from `execute` as text (lesson 2026-10-29), so times are computed in SQL.
const STATE_SQL = `
  select move_count, auto_seat, (extract(epoch from pending_auto_at) * 1000)::float8 as pending_ms
  from paper_game_states where game_id = ?`;
const MOVES_SQL = `
  select move_number, x, y, seat, is_auto, (extract(epoch from played_at) * 1000)::float8 as at_ms
  from paper_moves where game_id = ? order by move_number`;

/** The sheet of a paper game as stored, or `null` when the game has none (a classic game). */
export async function loadPaperSnapshot(tx: EntityManager, gameId: string): Promise<PaperSnapshot | null> {
  const [state] = await tx.execute<StateRow[]>(STATE_SQL, [gameId]);
  if (!state) return null;
  const rows = await tx.execute<MoveRow[]>(MOVES_SQL, [gameId]);
  const moves: PaperMoveRow[] = rows.map((row) => ({
    n: row.move_number,
    x: row.x,
    y: row.y,
    seat: row.seat as 1 | 2,
    auto: row.is_auto,
    atMs: Number(row.at_ms),
  }));
  return {
    moveCount: state.move_count,
    autoSeat: state.auto_seat as 1 | 2 | null,
    pendingAutoAtMs: state.pending_ms === null ? null : Number(state.pending_ms),
    moves,
  };
}
