import { describe, expect, it } from "vitest";

import { showIdOf } from "./show-id";

describe("showIdOf", () => {
  it("passes a game id and answers anything else with the 404 of a missing game", () => {
    const id = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";
    expect(showIdOf(id)).toBe(id);
    expect(() => showIdOf("nope")).toThrow(expect.objectContaining({ status: 404, code: "NOT_FOUND" }));
  });
});
