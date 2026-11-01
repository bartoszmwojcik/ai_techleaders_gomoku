import { AppError, NotFoundError, TooManyRequestsError, type ChatRejection } from "@gomoku/core";
import type { CallToolResult } from "@modelcontextprotocol/server";

import { describeError } from "../http/describe-error";

/** Tool error codes of the MCP endpoint (decisions #138 and 8, API Contracts), one set for every tool. */
export type McpErrorCode =
  | "INVALID_INPUT"
  | "INVALID_INVITATION"
  | "INVALID_TOKEN"
  | "ILLEGAL_MOVE"
  | "NOT_YOUR_TURN"
  | "STALE_MOVE"
  | "GAME_NOT_STARTED"
  | "GAME_NOT_ACTIVE"
  | "GAME_FINISHED"
  | "CHAT_DISABLED"
  | "CHAT_UNAVAILABLE"
  | "CHAT_FULL"
  | "RATE_LIMITED"
  | "INTERNAL";

export const INTERNAL_MESSAGE = "Wystąpił nieoczekiwany błąd.";
export const INVALID_TOKEN_MESSAGE = "Nieprawidłowy lub wygasły token.";

/** Why a move is illegal (`ILLEGAL_MOVE` only). */
export type IllegalMoveReason = "cell_occupied" | "out_of_board";

/** Why a chat message is refused (`INVALID_INPUT` of `send_message` only); `secret` is the token guard. */
export type ChatErrorReason = ChatRejection | "secret";

export type McpToolError = {
  code: McpErrorCode;
  message: string;
  /** Whether the same call may succeed later without changes. */
  retryable: boolean;
  retryAfterMs?: number;
  reason?: IllegalMoveReason | ChatErrorReason;
};

/** A failed tool call: `isError` with the one shape `structuredContent.error` for every code. */
export function toolFailure(error: McpToolError): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: error.message }],
    structuredContent: { error },
  };
}

/** A successful tool call: the data as structured content and, for clients that read text, as JSON. */
export function toolSuccess(data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
}

// Codes of the errors of the services (`AppError.code`) that are tool errors as they are, and
// whether the same call may succeed after a fresh `get_state`.
const RETRYABLE: Partial<Record<string, boolean>> = {
  INVALID_INPUT: false,
  INVALID_INVITATION: false,
  INVALID_TOKEN: false,
  NOT_YOUR_TURN: true,
  STALE_MOVE: true,
  GAME_NOT_STARTED: true,
  GAME_NOT_ACTIVE: false,
  GAME_FINISHED: false,
  CHAT_DISABLED: false,
  CHAT_UNAVAILABLE: false,
  CHAT_FULL: false,
};

/**
 * The tool error for an error of the service: always a result with `isError`, never a protocol
 * error, so every tool answers in the one shape. Messages never echo the input (a name, a code or
 * a token from the agent). A missing game under a valid token (cleaned up meanwhile) is the same
 * `INVALID_TOKEN` as an unknown token. Anything unexpected is logged by name and code only and
 * answered as `INTERNAL` without a detail.
 */
export function toolErrorOf(error: unknown): CallToolResult {
  if (error instanceof TooManyRequestsError) {
    // The chat's exact wait (`data.retryAfterMs`) wins over the whole seconds of the HTTP header.
    const exact = error.data?.retryAfterMs;
    const retryAfterMs =
      typeof exact === "number" ? exact : error.retryAfterSeconds === undefined ? undefined : error.retryAfterSeconds * 1000;
    return toolFailure({
      code: "RATE_LIMITED",
      message: error.message,
      retryable: true,
      ...(retryAfterMs !== undefined && { retryAfterMs }),
    });
  }
  if (error instanceof NotFoundError) {
    return toolFailure({ code: "INVALID_TOKEN", message: INVALID_TOKEN_MESSAGE, retryable: false });
  }
  if (error instanceof AppError) {
    if (error.code === "VALIDATION") {
      const reason = error.data?.reason;
      return toolFailure({
        code: "INVALID_INPUT",
        message: error.message,
        retryable: false,
        ...(typeof reason === "string" && { reason: reason as ChatErrorReason }),
      });
    }
    if (error.code in RETRYABLE) {
      return toolFailure({
        code: error.code as McpErrorCode,
        message: error.message,
        retryable: RETRYABLE[error.code]!,
      });
    }
    if (error.code === "CELL_OCCUPIED" || error.code === "ILLEGAL_MOVE") {
      return toolFailure({
        code: "ILLEGAL_MOVE",
        message: error.message,
        retryable: false,
        reason: error.code === "CELL_OCCUPIED" ? "cell_occupied" : "out_of_board",
      });
    }
  }
  console.error("Unhandled MCP error", describeError(error));
  return toolFailure({ code: "INTERNAL", message: INTERNAL_MESSAGE, retryable: false });
}
