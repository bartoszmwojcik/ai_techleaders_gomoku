import { describe, expect, it } from "vitest";

import { LOGIN_PASSWORD_MAX_LENGTH } from "./login-schema";
import { newPasswordSchema } from "./new-password-schema";
import { passwordChangeSchema } from "./password-change-schema";

const issues = (input: unknown) => {
  const result = passwordChangeSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((i) => [i.path.join("."), i.message]);
};

const valid = { currentPassword: "oldpassword", newPassword: "newpassword" };

describe("newPasswordSchema", () => {
  it("enforces 8 characters and 72 bytes with multibyte characters", () => {
    expect(newPasswordSchema.safeParse("1234567").success).toBe(false);
    expect(newPasswordSchema.safeParse("12345678").success).toBe(true);
    expect(newPasswordSchema.safeParse("a".repeat(72)).success).toBe(true);
    expect(newPasswordSchema.safeParse("a".repeat(73)).success).toBe(false);
    expect(newPasswordSchema.safeParse("ż".repeat(36)).success).toBe(true);
    expect(newPasswordSchema.safeParse("ż".repeat(37)).success).toBe(false);
    expect(newPasswordSchema.safeParse("😀".repeat(18)).success).toBe(true);
    expect(newPasswordSchema.safeParse("😀".repeat(19)).success).toBe(false);
  });
});

describe("passwordChangeSchema", () => {
  it("accepts a valid change and does not trim", () => {
    expect(passwordChangeSchema.parse(valid)).toEqual(valid);
    const padded = { currentPassword: " old ", newPassword: "  new pass " };
    expect(passwordChangeSchema.parse(padded)).toEqual(padded);
  });

  it("rejects a new password of 7 characters, accepts 8", () => {
    expect(issues({ ...valid, newPassword: "1234567" })).toEqual([
      ["newPassword", "Hasło musi mieć co najmniej 8 znaków."],
    ]);
    expect(
      passwordChangeSchema.safeParse({ ...valid, newPassword: "12345678" })
        .success,
    ).toBe(true);
  });

  it("enforces the 72 byte limit including multibyte characters", () => {
    const ok = (newPassword: string) =>
      passwordChangeSchema.safeParse({ ...valid, newPassword }).success;
    expect(ok("a".repeat(72))).toBe(true);
    expect(issues({ ...valid, newPassword: "a".repeat(73) })).toEqual([
      ["newPassword", "Hasło może mieć najwyżej 72 bajtów."],
    ]);
    expect(ok("ż".repeat(36))).toBe(true);
    expect(ok("ż".repeat(37))).toBe(false);
    expect(ok("😀".repeat(18))).toBe(true);
    expect(ok("😀".repeat(19))).toBe(false);
  });

  it("rejects a new password equal to the current one on newPassword", () => {
    expect(
      issues({ currentPassword: "samepassword", newPassword: "samepassword" }),
    ).toEqual([["newPassword", "Nowe hasło musi się różnić od obecnego."]]);
  });

  it("treats passwords differing only by whitespace as different", () => {
    expect(
      passwordChangeSchema.safeParse({
        currentPassword: "samepassword",
        newPassword: "samepassword ",
      }).success,
    ).toBe(true);
  });

  it("applies no registration rules to the current password", () => {
    expect(
      passwordChangeSchema.safeParse({ ...valid, currentPassword: "x" })
        .success,
    ).toBe(true);
    expect(issues({ ...valid, currentPassword: "" })).toEqual([
      ["currentPassword", "Podaj obecne hasło."],
    ]);
    expect(
      issues({
        ...valid,
        currentPassword: "a".repeat(LOGIN_PASSWORD_MAX_LENGTH + 1),
      }),
    ).toEqual([["currentPassword", "Hasło może mieć najwyżej 1024 znaków."]]);
  });

  it("reports missing fields", () => {
    expect(issues({})).toEqual([
      ["currentPassword", "Podaj obecne hasło."],
      ["newPassword", "Podaj hasło."],
    ]);
  });
});
