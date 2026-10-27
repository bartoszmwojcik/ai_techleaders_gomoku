import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it.each(["/", "/invite/abc", "/login?x=1#top"])("allows %s", (value) => {
    expect(safeNextPath(value)).toBe(value);
  });

  it.each([
    "//evil.com",
    "/\\evil.com",
    "/a\\b",
    "https://evil.com",
    "javascript:alert(1)",
    "",
    "evil",
    "/\t/evil.com",
    "/a b",
    "/a\nb",
  ])("falls back to / for %j", (value) => {
    expect(safeNextPath(value)).toBe("/");
  });

  it.each([undefined, null, 5, ["/x"]])("falls back to / for non-string %j", (value) => {
    expect(safeNextPath(value)).toBe("/");
  });
});
