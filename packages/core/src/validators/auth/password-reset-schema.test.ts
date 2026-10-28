import { describe, expect, it } from "vitest";

import {
  PASSWORD_RESET_TOKEN_MAX_LENGTH,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from "./password-reset-schema";

const issues = (
  schema: typeof passwordResetRequestSchema | typeof passwordResetConfirmSchema,
  input: unknown,
) => {
  const result = schema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((i) => [i.path.join("."), i.message]);
};

describe("passwordResetRequestSchema", () => {
  it("normalizes the e-mail", () => {
    expect(
      passwordResetRequestSchema.parse({ email: "  Ala@Example.COM " }),
    ).toEqual({ email: "ala@example.com" });
  });

  it("rejects a malformed e-mail", () => {
    expect(issues(passwordResetRequestSchema, { email: "nope" })).toEqual([
      ["email", "Podaj poprawny adres e-mail."],
    ]);
  });

  it("rejects a missing or non-string e-mail", () => {
    expect(issues(passwordResetRequestSchema, {})).toEqual([
      ["email", "Podaj adres e-mail."],
    ]);
    expect(issues(passwordResetRequestSchema, { email: 1 })).toEqual([
      ["email", "Podaj adres e-mail."],
    ]);
  });

  it("rejects an e-mail that is too long", () => {
    const email = `${"a".repeat(250)}@example.com`;
    expect(issues(passwordResetRequestSchema, { email })).toHaveLength(1);
  });
});

describe("passwordResetConfirmSchema", () => {
  const valid = { token: "abc", newPassword: "12345678" };

  it("accepts a valid input and does not trim the password", () => {
    expect(passwordResetConfirmSchema.parse(valid)).toEqual(valid);
    const padded = { token: "abc", newPassword: "  new pass " };
    expect(passwordResetConfirmSchema.parse(padded)).toEqual(padded);
  });

  it("reports missing fields", () => {
    expect(issues(passwordResetConfirmSchema, {})).toEqual([
      ["token", "Podaj token z linku."],
      ["newPassword", "Podaj hasło."],
    ]);
  });

  it("enforces the 8 character minimum", () => {
    expect(
      issues(passwordResetConfirmSchema, { ...valid, newPassword: "1234567" }),
    ).toEqual([["newPassword", "Hasło musi mieć co najmniej 8 znaków."]]);
    expect(
      passwordResetConfirmSchema.safeParse({
        ...valid,
        newPassword: "12345678",
      }).success,
    ).toBe(true);
  });

  it("enforces the 72 byte maximum, also for multibyte characters", () => {
    const parse = (newPassword: string) =>
      passwordResetConfirmSchema.safeParse({ ...valid, newPassword }).success;
    expect(parse("a".repeat(72))).toBe(true);
    expect(parse("a".repeat(73))).toBe(false);
    expect(parse("ż".repeat(36))).toBe(true);
    expect(parse("ż".repeat(37))).toBe(false);
    expect(parse("😀".repeat(18))).toBe(true);
    expect(parse("😀".repeat(19))).toBe(false);
    expect(
      issues(passwordResetConfirmSchema, {
        ...valid,
        newPassword: "a".repeat(73),
      }),
    ).toEqual([["newPassword", "Hasło może mieć najwyżej 72 bajtów."]]);
  });

  it("rejects an empty token and accepts the maximum length", () => {
    expect(issues(passwordResetConfirmSchema, { ...valid, token: "" })).toEqual(
      [["token", "Podaj token z linku."]],
    );
    const ok = "a".repeat(PASSWORD_RESET_TOKEN_MAX_LENGTH);
    expect(
      passwordResetConfirmSchema.safeParse({ ...valid, token: ok }).success,
    ).toBe(true);
    expect(
      issues(passwordResetConfirmSchema, { ...valid, token: ok + "a" }),
    ).toEqual([["token", "Token jest za długi."]]);
  });

  it("rejects a non-string token", () => {
    expect(issues(passwordResetConfirmSchema, { ...valid, token: 5 })).toEqual([
      ["token", "Podaj token z linku."],
    ]);
  });
});
