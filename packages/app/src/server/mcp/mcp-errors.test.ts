import { ConflictError, GoneError, NotFoundError, TooManyRequestsError, ValidationError } from "@gomoku/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { INTERNAL_MESSAGE, INVALID_TOKEN_MESSAGE, toolErrorOf, toolFailure, toolSuccess } from "./mcp-errors";

afterEach(() => vi.restoreAllMocks());

describe("toolSuccess", () => {
  it("carries the data as structured content and as JSON text", () => {
    expect(toolSuccess({ a: 1 })).toEqual({
      content: [{ type: "text", text: '{"a":1}' }],
      structuredContent: { a: 1 },
    });
  });
});

describe("toolFailure", () => {
  it("is an error result with the one shape in structuredContent.error", () => {
    const error = { code: "INVALID_INPUT", message: "Źle", retryable: false } as const;
    expect(toolFailure(error)).toEqual({
      isError: true,
      content: [{ type: "text", text: "Źle" }],
      structuredContent: { error },
    });
  });
});

describe("toolErrorOf", () => {
  it("maps the limit to RATE_LIMITED with the wait in milliseconds", () => {
    expect(toolErrorOf(new TooManyRequestsError("Za dużo", { retryAfterSeconds: 3 })).structuredContent).toEqual({
      error: { code: "RATE_LIMITED", message: "Za dużo", retryable: true, retryAfterMs: 3000 },
    });
  });

  it("leaves out the wait when there is none", () => {
    const { error } = toolErrorOf(new TooManyRequestsError("Za dużo")).structuredContent as {
      error: Record<string, unknown>;
    };
    expect(error).not.toHaveProperty("retryAfterMs");
  });

  it("maps an invalid input and an invalid invitation, not retryable", () => {
    expect(
      toolErrorOf(new ValidationError("Zły kształt", { code: "INVALID_INPUT" })).structuredContent,
    ).toEqual({ error: { code: "INVALID_INPUT", message: "Zły kształt", retryable: false } });
    expect(
      toolErrorOf(new GoneError("Nieważne", { code: "INVALID_INVITATION" })).structuredContent,
    ).toEqual({ error: { code: "INVALID_INVITATION", message: "Nieważne", retryable: false } });
  });

  it.each([
    ["NOT_YOUR_TURN", true],
    ["STALE_MOVE", true],
    ["GAME_NOT_STARTED", true],
    ["GAME_NOT_ACTIVE", false],
    ["GAME_FINISHED", false],
  ])("maps %s from the move service, retryable %s", (code, retryable) => {
    expect(toolErrorOf(new ConflictError("Tekst", { code })).structuredContent).toEqual({
      error: { code, message: "Tekst", retryable },
    });
  });

  it("maps an occupied cell and a cell off the board to ILLEGAL_MOVE with the reason", () => {
    expect(toolErrorOf(new ConflictError("Zajęte", { code: "CELL_OCCUPIED" })).structuredContent).toEqual({
      error: { code: "ILLEGAL_MOVE", message: "Zajęte", retryable: false, reason: "cell_occupied" },
    });
    expect(toolErrorOf(new ValidationError("Poza", { code: "ILLEGAL_MOVE" })).structuredContent).toEqual({
      error: { code: "ILLEGAL_MOVE", message: "Poza", retryable: false, reason: "out_of_board" },
    });
  });

  it("maps a missing game to the one INVALID_TOKEN, whatever the message said", () => {
    expect(toolErrorOf(new NotFoundError("Nie znaleziono partii.")).structuredContent).toEqual({
      error: { code: "INVALID_TOKEN", message: INVALID_TOKEN_MESSAGE, retryable: false },
    });
  });

  it("answers anything else as INTERNAL, logging name and code only", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secret = Object.assign(new Error("select ... where code = 'ABCD-EFGH'"), { code: "57P01" });

    const result = toolErrorOf(secret);

    expect(result).toEqual({
      isError: true,
      content: [{ type: "text", text: INTERNAL_MESSAGE }],
      structuredContent: { error: { code: "INTERNAL", message: INTERNAL_MESSAGE, retryable: false } },
    });
    expect(log).toHaveBeenCalledExactlyOnceWith("Unhandled MCP error", { name: "Error", code: "57P01" });
    expect(JSON.stringify([log.mock.calls, result])).not.toContain("ABCD-EFGH");
  });

  it("does not take another AppError for a tool error", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(toolErrorOf(new ValidationError("Inne")).structuredContent).toMatchObject({
      error: { code: "INTERNAL" },
    });
  });
});
