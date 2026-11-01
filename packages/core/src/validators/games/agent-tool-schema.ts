import { z } from "zod";

import { CHAT_MAX_SEQ } from "../../chat/constants";
import { BOARD_CELLS } from "../../games/board";
import { AGENT_TOKEN_LENGTH, MCP_MAX_WAIT_SECONDS } from "../../games/constants";

const token = z
  .string({ error: "token" })
  .regex(new RegExp(`^[A-Za-z0-9_-]{${AGENT_TOKEN_LENGTH}}$`), { error: "token" });

const integer = (field: string) => z.number({ error: field }).int({ error: field });

/**
 * Input of the MCP tool `get_state` (E06-S02). The message of every issue is the name of the
 * field, so an error can name the field without echoing what the agent sent. `null` for an
 * optional field counts as absent (models often send it).
 */
export const agentGetStateSchema = z.object({
  token,
  waitSeconds: integer("waitSeconds").min(0, { error: "waitSeconds" }).max(MCP_MAX_WAIT_SECONDS, { error: "waitSeconds" }).nullish(),
  afterMove: integer("afterMove").min(0, { error: "afterMove" }).max(BOARD_CELLS, { error: "afterMove" }).nullish(),
  afterMessage: integer("afterMessage").min(0, { error: "afterMessage" }).max(CHAT_MAX_SEQ, { error: "afterMessage" }).nullish(),
});

/**
 * Input of `send_message`. The text is not judged here: `ChatService` does it (same rules as for a
 * person), so a wrong type or a missing text is answered there with a `reason`.
 */
export const agentSendMessageSchema = z.object({ token, text: z.unknown().optional() });

/**
 * Input of `play_move`. A coordinate is any integer: a cell outside the board is a move that
 * is not legal (`ILLEGAL_MOVE`), not a malformed input, so the range is checked by the tool.
 */
export const agentPlayMoveSchema = z.object({
  token,
  x: integer("x"),
  y: integer("y"),
  moveNumber: integer("moveNumber").min(1, { error: "moveNumber" }).max(BOARD_CELLS, { error: "moveNumber" }),
});

export type AgentGetStateInput = z.infer<typeof agentGetStateSchema>;
export type AgentSendMessageInput = z.infer<typeof agentSendMessageSchema>;
export type AgentPlayMoveInput = z.infer<typeof agentPlayMoveSchema>;
