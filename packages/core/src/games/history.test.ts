import { describe, expect, it } from "vitest";

import { ValidationError } from "../http/errors";
import {
  decodeHistoryCursor,
  encodeHistoryCursor,
  historyQuerySchema,
  historyResultOf,
  HISTORY_CURSOR_MAX_LENGTH,
} from "./history";

const CURSOR = { finishedAt: "2026-10-31T15:04:05.123456Z", id: "0b9a6c52-7e3b-4a61-9f0e-2d3c4b5a6978" };
const encodeRaw = (text: string) => btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

describe("historyResultOf", () => {
  it.each([
    [1, 1, "win"],
    [2, 2, "win"],
    [1, 2, "loss"],
    [2, 1, "loss"],
    [null, 1, "draw"],
    [null, 2, "draw"],
  ] as const)("winner %s seen from seat %s is %s", (winner, mine, result) => {
    expect(historyResultOf(winner, mine)).toBe(result);
  });
});

describe("history cursor", () => {
  it("round-trips and is URL-safe", () => {
    const encoded = encodeHistoryCursor(CURSOR);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeHistoryCursor(encoded)).toEqual(CURSOR);
  });

  it.each([
    ["not base64", "!!!"],
    ["no separator", encodeRaw("2026-10-31T15:04:05.123456Z")],
    ["extra part", encodeRaw(`${CURSOR.finishedAt}|${CURSOR.id}|x`)],
    ["a date with no microseconds", encodeRaw(`2026-10-31T15:04:05Z|${CURSOR.id}`)],
    ["a month that does not exist", encodeRaw(`2026-99-31T15:04:05.123456Z|${CURSOR.id}`)],
    ["a 30th of February", encodeRaw(`2026-02-30T15:04:05.123456Z|${CURSOR.id}`)],
    ["an hour that does not exist", encodeRaw(`2026-10-31T25:04:05.123456Z|${CURSOR.id}`)],
    ["a year PostgreSQL does not have", encodeRaw(`0000-10-31T15:04:05.123456Z|${CURSOR.id}`)],
    ["a free text date", encodeRaw(`yesterday|${CURSOR.id}`)],
    ["an id that is not a uuid", encodeRaw(`${CURSOR.finishedAt}|1; drop table games`)],
  ])("rejects %s", (_name, cursor) => {
    expect(() => decodeHistoryCursor(cursor)).toThrow(ValidationError);
  });
});

describe("historyQuerySchema", () => {
  it("takes no cursor or a short one", () => {
    expect(historyQuerySchema.parse({})).toEqual({});
    expect(historyQuerySchema.parse({ cursor: "abc" })).toEqual({ cursor: "abc" });
  });

  it("rejects a cursor longer than the limit", () => {
    expect(historyQuerySchema.safeParse({ cursor: "a".repeat(HISTORY_CURSOR_MAX_LENGTH + 1) }).success).toBe(false);
  });
});
