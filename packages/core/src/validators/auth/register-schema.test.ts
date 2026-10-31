import { describe, expect, it } from "vitest";

import {
  displayNameSchema,
  emailSchema,
  passwordSchema,
  registerSchema,
  RESERVED_DISPLAY_NAMES,
} from "./register-schema";

const valid = {
  email: "ala@example.com",
  displayName: "Ala_7",
  password: "12345678",
};

function messages(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe("emailSchema", () => {
  it("normalizes case and surrounding whitespace", () => {
    expect(emailSchema.parse(" Ala@X.com ")).toBe("ala@x.com");
  });

  it("rejects malformed addresses", () => {
    expect(messages(emailSchema.safeParse("not-an-email"))).toEqual([
      "Podaj poprawny adres e-mail.",
    ]);
  });

  it("accepts 254 characters and rejects 255", () => {
    const local = "a".repeat(64);
    const domain = `${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(57)}.com`;
    const ok = `${local}@${domain}`;
    expect(ok).toHaveLength(254);
    expect(emailSchema.safeParse(ok).success).toBe(true);
    const tooLong = `${local}@${domain}x`;
    expect(messages(emailSchema.safeParse(tooLong))).toContain(
      "Adres e-mail może mieć najwyżej 254 znaków.",
    );
  });

  it("rejects non-strings", () => {
    expect(messages(emailSchema.safeParse(undefined))).toEqual([
      "Podaj adres e-mail.",
    ]);
  });
});

describe("displayNameSchema", () => {
  it("keeps the user's spelling but trims edge whitespace", () => {
    expect(displayNameSchema.parse("  Ala_7 ")).toBe("Ala_7");
  });

  it("enforces 3 and 24 character boundaries", () => {
    expect(displayNameSchema.safeParse("ab").success).toBe(false);
    expect(displayNameSchema.safeParse("abc").success).toBe(true);
    expect(displayNameSchema.safeParse("a".repeat(24)).success).toBe(true);
    expect(messages(displayNameSchema.safeParse("a".repeat(25)))).toEqual([
      "Nazwa gracza może mieć najwyżej 24 znaków.",
    ]);
    expect(messages(displayNameSchema.safeParse("ab"))).toEqual([
      "Nazwa gracza musi mieć co najmniej 3 znaki.",
    ]);
  });

  it("accepts Polish letters, digits, underscore and hyphen", () => {
    expect(displayNameSchema.safeParse("ŁąkaŻółć-9_").success).toBe(true);
  });

  it.each(["ala ma", "ala!", "аla", "αla", "ala.7"])(
    "rejects disallowed characters in %s",
    (name) => {
      expect(messages(displayNameSchema.safeParse(name))).toEqual([
        "Nazwa gracza może zawierać tylko litery, cyfry oraz znaki _ i - (bez spacji).",
      ]);
    },
  );

  it("rejects non-strings", () => {
    expect(messages(displayNameSchema.safeParse(1))).toEqual([
      "Podaj nazwę gracza.",
    ]);
  });

  it.each([
    "Admin",
    "ADMIN_",
    "Usunięty-gracz",
    "usuniety_gracz",
    "Gomoku",
    "SYSTEM",
    "Moderator",
    "support",
    "Administrator",
    "Agent",
    "agent",
    "AGENT",
    " agent ",
    "A_g-ent",
  ])("rejects reserved name %s", (name) => {
    expect(messages(displayNameSchema.safeParse(name))).toEqual([
      "Ta nazwa jest zastrzeżona.",
    ]);
  });

  it("covers every reserved core", () => {
    for (const core of RESERVED_DISPLAY_NAMES) {
      expect(displayNameSchema.safeParse(core).success).toBe(false);
    }
  });

  it("allows similar but different names", () => {
    expect(displayNameSchema.safeParse("admina").success).toBe(true);
    expect(displayNameSchema.safeParse("gomoku2").success).toBe(true);
    expect(displayNameSchema.safeParse("Agentka").success).toBe(true);
    expect(displayNameSchema.safeParse("Agent1").success).toBe(true);
  });
});

describe("passwordSchema", () => {
  it("enforces the 7/8 character boundary", () => {
    expect(messages(passwordSchema.safeParse("1234567"))).toEqual([
      "Hasło musi mieć co najmniej 8 znaków.",
    ]);
    expect(passwordSchema.safeParse("12345678").success).toBe(true);
  });

  it("counts characters, not bytes, for the minimum", () => {
    expect(passwordSchema.safeParse("żółćżółć").success).toBe(true);
  });

  it("does not require digits, capitals or other character classes", () => {
    expect(passwordSchema.safeParse("aaaaaaaa").success).toBe(true);
  });

  it("enforces the 72/73 byte boundary", () => {
    expect(passwordSchema.safeParse("a".repeat(72)).success).toBe(true);
    expect(messages(passwordSchema.safeParse("a".repeat(73)))).toEqual([
      "Hasło może mieć najwyżej 72 bajtów.",
    ]);
  });

  it("measures the maximum in UTF-8 bytes", () => {
    expect(passwordSchema.safeParse("ż".repeat(36)).success).toBe(true);
    expect(passwordSchema.safeParse("ż".repeat(37)).success).toBe(false);
    expect(passwordSchema.safeParse("😀".repeat(18)).success).toBe(true);
    expect(passwordSchema.safeParse("😀".repeat(19)).success).toBe(false);
  });

  it("does not trim the password", () => {
    expect(passwordSchema.parse("  abcdefg ")).toBe("  abcdefg ");
  });

  it("rejects non-strings", () => {
    expect(messages(passwordSchema.safeParse(null))).toEqual(["Podaj hasło."]);
  });
});

describe("registerSchema", () => {
  it("returns normalized data for valid input", () => {
    expect(
      registerSchema.parse({
        ...valid,
        email: " Ala@Example.com ",
        displayName: " Ala_7 ",
      }),
    ).toEqual(valid);
  });

  it("reports errors per field", () => {
    const result = registerSchema.safeParse({
      email: "x",
      displayName: "admin",
      password: "short",
    });
    expect(result.success).toBe(false);
    expect(
      Object.keys(result.error?.flatten().fieldErrors ?? {}).sort(),
    ).toEqual(["displayName", "email", "password"]);
  });
});
