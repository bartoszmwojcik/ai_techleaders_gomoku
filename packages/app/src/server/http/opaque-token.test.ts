import { describe, expect, it } from "vitest";

import { createOpaqueToken, hashOpaqueToken } from "./opaque-token";

describe("createOpaqueToken", () => {
  it("returns a base64url encoding of 32 random bytes", () => {
    const token = createOpaqueToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createOpaqueToken()).not.toBe(token);
  });
});

describe("hashOpaqueToken", () => {
  it("returns the hex SHA-256 of the input", () => {
    expect(hashOpaqueToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
