import { describe, expect, it } from "vitest";

import { LOGIN_PASSWORD_MAX_LENGTH, loginSchema } from "./login-schema";

function messages(result: {
  error?: { issues: { message: string }[] };
}) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe("loginSchema", () => {
  it("normalizes the e-mail and keeps the password untouched", () => {
    expect(
      loginSchema.parse({ email: " Ala@X.com ", password: " Pass " }),
    ).toEqual({ email: "ala@x.com", password: " Pass " });
  });

  it("does not apply registration password rules", () => {
    expect(
      loginSchema.safeParse({ email: "a@x.com", password: "x" }).success,
    ).toBe(true);
    expect(
      loginSchema.safeParse({
        email: "a@x.com",
        password: "ą".repeat(100),
      }).success,
    ).toBe(true);
  });

  it("accepts exactly 1024 characters and rejects 1025", () => {
    const ok = "a".repeat(LOGIN_PASSWORD_MAX_LENGTH);
    expect(
      loginSchema.safeParse({ email: "a@x.com", password: ok }).success,
    ).toBe(true);
    const result = loginSchema.safeParse({
      email: "a@x.com",
      password: ok + "a",
    });
    expect(messages(result)).toEqual(["Hasło może mieć najwyżej 1024 znaków."]);
  });

  it("rejects an empty password", () => {
    expect(
      messages(loginSchema.safeParse({ email: "a@x.com", password: "" })),
    ).toEqual(["Podaj hasło."]);
  });

  it("rejects a malformed e-mail", () => {
    expect(
      messages(loginSchema.safeParse({ email: "nope", password: "x" })),
    ).toEqual(["Podaj poprawny adres e-mail."]);
  });

  it("reports missing fields", () => {
    expect(messages(loginSchema.safeParse({}))).toEqual([
      "Podaj adres e-mail.",
      "Podaj hasło.",
    ]);
  });
});
