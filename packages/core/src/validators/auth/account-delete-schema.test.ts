import { describe, expect, it } from "vitest";

import { LOGIN_PASSWORD_MAX_LENGTH } from "./login-schema";
import { accountDeleteSchema } from "./account-delete-schema";

const issues = (input: unknown) => {
  const result = accountDeleteSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((i) => [i.path.join("."), i.message]);
};

describe("accountDeleteSchema", () => {
  it("accepts a password with the confirmation and does not trim", () => {
    const padded = { password: " pass ", confirm: true };
    expect(accountDeleteSchema.parse(padded)).toEqual(padded);
  });

  it("applies no registration rules to the password", () => {
    expect(accountDeleteSchema.safeParse({ password: "x", confirm: true }).success).toBe(true);
  });

  it("requires a password of at most the login limit", () => {
    expect(issues({ password: "", confirm: true })).toEqual([["password", "Podaj hasło."]]);
    expect(
      issues({ password: "a".repeat(LOGIN_PASSWORD_MAX_LENGTH + 1), confirm: true }),
    ).toEqual([["password", "Hasło może mieć najwyżej 1024 znaków."]]);
    expect(
      accountDeleteSchema.safeParse({
        password: "a".repeat(LOGIN_PASSWORD_MAX_LENGTH),
        confirm: true,
      }).success,
    ).toBe(true);
  });

  it("requires the confirmation to be exactly true", () => {
    const message = "Zaznacz potwierdzenie, aby usunąć konto.";
    expect(issues({ password: "x", confirm: false })).toEqual([["confirm", message]]);
    expect(issues({ password: "x", confirm: "true" })).toEqual([["confirm", message]]);
    expect(issues({ password: "x" })).toEqual([["confirm", message]]);
  });

  it("reports missing fields", () => {
    expect(issues({})).toEqual([
      ["password", "Podaj hasło."],
      ["confirm", "Zaznacz potwierdzenie, aby usunąć konto."],
    ]);
  });
});
