import { describe, expect, it } from "vitest";

import {
  displayNameChangeSchema,
  emailChangeConfirmSchema,
  emailChangeSchema,
} from "./profile-change-schema";

const issues = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, input: unknown) => {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error!.issues.map((i) => [i.path.join("."), i.message]);
};

describe("displayNameChangeSchema", () => {
  it("trims and accepts a valid name", () => {
    expect(displayNameChangeSchema.parse({ displayName: "  Ala_7 " })).toEqual({ displayName: "Ala_7" });
  });

  it("refuses a reserved, short, odd or missing name", () => {
    expect(issues(displayNameChangeSchema, { displayName: "Agent" })).toEqual([["displayName", "Ta nazwa jest zastrzeżona."]]);
    expect(issues(displayNameChangeSchema, { displayName: "ab" })[0]![0]).toBe("displayName");
    expect(issues(displayNameChangeSchema, { displayName: "a b c" })[0]![0]).toBe("displayName");
    expect(issues(displayNameChangeSchema, {})).toEqual([["displayName", "Podaj nazwę gracza."]]);
  });
});

describe("emailChangeSchema", () => {
  it("normalizes the new address and keeps the password as typed", () => {
    expect(emailChangeSchema.parse({ newEmail: " Ala@Example.COM ", currentPassword: " x y " })).toEqual({
      newEmail: "ala@example.com",
      currentPassword: " x y ",
    });
  });

  it("refuses a bad address, an empty or too long password and missing fields", () => {
    expect(issues(emailChangeSchema, { newEmail: "nie-adres", currentPassword: "x" })).toEqual([["newEmail", "Podaj poprawny adres e-mail."]]);
    expect(issues(emailChangeSchema, { newEmail: "a@b.pl", currentPassword: "" })).toEqual([["currentPassword", "Podaj obecne hasło."]]);
    expect(issues(emailChangeSchema, { newEmail: "a@b.pl", currentPassword: "x".repeat(10_000) })[0]![0]).toBe("currentPassword");
    expect(issues(emailChangeSchema, {}).map(([path]) => path)).toEqual(["newEmail", "currentPassword"]);
  });
});

describe("emailChangeConfirmSchema", () => {
  it("accepts any non-empty token of bounded length", () => {
    expect(emailChangeConfirmSchema.parse({ token: "abc" })).toEqual({ token: "abc" });
    expect(issues(emailChangeConfirmSchema, { token: "" })).toEqual([["token", "Podaj token z linku."]]);
    expect(issues(emailChangeConfirmSchema, { token: "t".repeat(513) })).toEqual([["token", "Token jest za długi."]]);
    expect(issues(emailChangeConfirmSchema, {})).toEqual([["token", "Podaj token z linku."]]);
  });
});
