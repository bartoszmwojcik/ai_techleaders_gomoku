import { describe, expect, it } from "vitest";

import { rateLimitedError } from "./rate-limited-error";

describe("rateLimitedError", () => {
  it("rounds the wait up to whole minutes, at least one", () => {
    expect(rateLimitedError(61).details).toBe("Spróbuj ponownie za 2 min.");
    expect(rateLimitedError(5).details).toBe("Spróbuj ponownie za 1 min.");
  });

  it("falls back to a generic wait without a Retry-After", () => {
    expect(rateLimitedError(undefined)).toEqual({
      title: "Zbyt wiele prób",
      details: "Spróbuj ponownie za jakiś czas.",
    });
  });
});
