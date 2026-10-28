import { describe, expect, it } from "vitest";

import {
  VERIFICATION_TOKEN_MAX_LENGTH,
  emailVerificationConfirmSchema,
} from "./email-verification-confirm-schema";

function messages(result: { error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe("emailVerificationConfirmSchema", () => {
  it("accepts a token with and without next", () => {
    expect(emailVerificationConfirmSchema.parse({ token: "abc" })).toEqual({
      token: "abc",
    });
    expect(
      emailVerificationConfirmSchema.parse({ token: "abc", next: "/x" }),
    ).toEqual({ token: "abc", next: "/x" });
  });

  it("accepts exactly the maximum length and rejects one more", () => {
    const ok = "a".repeat(VERIFICATION_TOKEN_MAX_LENGTH);
    expect(emailVerificationConfirmSchema.safeParse({ token: ok }).success).toBe(
      true,
    );
    expect(
      messages(emailVerificationConfirmSchema.safeParse({ token: ok + "a" })),
    ).toEqual(["Token jest za długi."]);
  });

  it("rejects a missing, empty or non-string token", () => {
    for (const input of [{}, { token: "" }, { token: 5 }]) {
      expect(messages(emailVerificationConfirmSchema.safeParse(input))).toEqual(
        ["Podaj token z linku."],
      );
    }
  });

  it("rejects a non-string next", () => {
    expect(
      messages(
        emailVerificationConfirmSchema.safeParse({ token: "a", next: 1 }),
      ),
    ).toEqual(["Nieprawidłowa ścieżka."]);
  });
});
