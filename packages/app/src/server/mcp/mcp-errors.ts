import { AppError, TooManyRequestsError } from "@gomoku/core";
import type { CallToolResult } from "@modelcontextprotocol/server";

import { describeError } from "../http/describe-error";

/** Tool error codes of the MCP endpoint (decision #138, API Contracts). */
export type McpErrorCode = "INVALID_INPUT" | "INVALID_INVITATION" | "RATE_LIMITED";

export const INTERNAL_MESSAGE = "Wystąpił nieoczekiwany błąd.";

export type McpToolError = {
  code: McpErrorCode;
  message: string;
  /** Whether the same call may succeed later without changes. */
  retryable: boolean;
  retryAfterMs?: number;
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

/**
 * The tool error for an error of the service. Messages never echo the input (a name or a code
 * from the agent). Anything unexpected is logged by name and code only and thrown on as a
 * generic error, which the protocol layer answers as an internal error.
 */
export function toolErrorOf(error: unknown): CallToolResult {
  if (error instanceof TooManyRequestsError) {
    return toolFailure({
      code: "RATE_LIMITED",
      message: error.message,
      retryable: true,
      ...(error.retryAfterSeconds !== undefined && { retryAfterMs: error.retryAfterSeconds * 1000 }),
    });
  }
  if (error instanceof AppError && (error.code === "INVALID_INPUT" || error.code === "INVALID_INVITATION")) {
    return toolFailure({ code: error.code, message: error.message, retryable: false });
  }
  console.error("Unhandled MCP error", describeError(error));
  throw new Error(INTERNAL_MESSAGE);
}
