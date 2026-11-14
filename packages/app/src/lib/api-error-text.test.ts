import { nicknameSchema, registerSchema } from "@gomoku/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import enErrors from "@/i18n/catalogs/en/errors";
import frErrors from "@/i18n/catalogs/fr/errors";
import plErrors from "@/i18n/catalogs/pl/errors";

import {
  apiErrorText,
  fieldIssueKeys,
  fieldIssueText,
  fieldMessages,
  localFieldMessages,
  localValueMessage,
} from "./api-error-text";

const FR = { locale: "fr" as const, dict: frErrors };
const EN = { locale: "en" as const, dict: enErrors };

describe("fieldIssueKeys", () => {
  it("tries the form, the field, then the Zod text by origin and variant", () => {
    expect(
      fieldIssueKeys("displayName", { code: "too_small", params: { origin: "string", minimum: 3, inclusive: true } }, "register"),
    ).toEqual([
      "fields.register.displayName.too_small",
      "field.displayName.too_small",
      "zod.too_small.string.inclusive",
      "zod.too_small.string",
      "zod.too_small",
    ]);
  });

  it("tells “at least”, “more than” and “exactly” apart", () => {
    const at = (params: Record<string, string | number | boolean>) => fieldIssueKeys("x", { code: "too_big", params })[1];
    expect(at({ origin: "number", inclusive: true })).toBe("zod.too_big.number.inclusive");
    expect(at({ origin: "number", inclusive: false })).toBe("zod.too_big.number.exclusive");
    expect(at({ origin: "number", inclusive: true, exact: true })).toBe("zod.too_big.number.exact");
    expect(at({ origin: "number" })).toBe("zod.too_big.number");
  });

  it("uses the format as the variant of a format rule, also without an origin", () => {
    expect(fieldIssueKeys("x", { code: "invalid_format", params: { format: "email" } })).toEqual([
      "field.x.invalid_format",
      "zod.invalid_format.email",
      "zod.invalid_format",
    ]);
    expect(fieldIssueKeys("x", { code: "invalid_format" })).toEqual(["field.x.invalid_format", "zod.invalid_format"]);
    expect(fieldIssueKeys("x", { code: "NICKNAME_INVALID" })).toEqual(["field.x.NICKNAME_INVALID", "zod.NICKNAME_INVALID"]);
  });
});

describe("fieldIssueText", () => {
  it("takes the field's own text, with the limit as {count}", () => {
    const issue = { code: "too_small", params: { origin: "string", minimum: 3, inclusive: true } };
    expect(fieldIssueText({}, "displayName", issue)).toBe("Nazwa gracza musi mieć co najmniej 3 znaki.");
    expect(fieldIssueText(FR, "displayName", issue)).toBe(frErrors.field.displayName.too_small.replace("{count}", "3"));
    expect(fieldIssueText(FR, "nickname", { code: "NICKNAME_TOO_LONG", params: { max: 24 } })).toContain("24");
  });

  it("falls back to the generic Zod text with its plural form, and to its group's own text", () => {
    expect(fieldIssueText({}, "other", { code: "too_small", params: { origin: "string", minimum: 5, inclusive: false } })).toBe(
      "Wpisz więcej niż 5 znaków.",
    );
    expect(fieldIssueText(EN, "other", { code: "too_small", params: { origin: "array", minimum: 1, inclusive: true } })).toBe(
      enErrors.zod.too_small._,
    );
    expect(fieldIssueText({}, "other", { code: "too_big", params: { origin: "number", maximum: 9, inclusive: true, exact: true } })).toBe(
      "Podaj liczbę 9.",
    );
    expect(fieldIssueText({}, "other", { code: "invalid_value" })).toBe(plErrors.zod.invalid_value);
    // A group without a text of its own (the string origin needs a variant) is passed over.
    expect(fieldIssueText({}, "other", { code: "too_small", params: { origin: "string", minimum: 2 } })).toBe(plErrors.zod.too_small._);
  });

  it("has no text for a code it does not know, or a path through a text", () => {
    expect(fieldIssueText({}, "other", { code: "SOMETHING_NEW" })).toBeUndefined();
    expect(fieldIssueText({}, "other", { code: "invalid_type.deeper" })).toBeUndefined();
  });
});

describe("fieldMessages", () => {
  it("translates by fieldIssues and keeps the Polish fieldErrors where the catalog has no text", () => {
    const messages = fieldMessages(FR, ["displayName", "email", "password"] as const, {
      fieldErrors: { displayName: ["Ta nazwa gracza jest już zajęta."], email: ["Polski tekst"] },
      fieldIssues: { displayName: [{ code: "DISPLAY_NAME_TAKEN" }], email: [{ code: "SOMETHING_NEW" }] },
    });

    expect(messages).toEqual({ displayName: frErrors.field.displayName.DISPLAY_NAME_TAKEN, email: "Polski tekst" });
  });

  it("is empty without a source, and takes fieldErrors of an older server", () => {
    expect(fieldMessages(FR, ["email"], undefined)).toEqual({});
    expect(fieldMessages(FR, ["email"], { fieldErrors: { email: ["Stary serwer"] } })).toEqual({ email: "Stary serwer" });
  });

  it("gives a local check the texts of the server's answer", () => {
    const parsed = registerSchema.safeParse({ email: "bad", displayName: "admin", password: "short" });
    if (parsed.success) throw new Error("expected a failure");

    expect(localFieldMessages(FR, ["email", "displayName", "password"], parsed.error, "register")).toEqual({
      email: frErrors.field.email.invalid_format,
      displayName: frErrors.field.displayName.DISPLAY_NAME_RESERVED,
      password: frErrors.field.password.PASSWORD_TOO_SHORT.replace("{count}", "8"),
    });
  });
});

describe("localValueMessage", () => {
  it("translates the issue of a value under its field, or keeps the schema's message", () => {
    const tooLong = nicknameSchema.safeParse("x".repeat(30));
    const custom = z.string().refine(() => false, { error: "Polski", params: { code: "SOMETHING_NEW" } }).safeParse("x");
    if (tooLong.success || custom.success) throw new Error("expected failures");

    expect(localValueMessage(FR, "nickname", tooLong.error)).toContain("24");
    expect(localValueMessage({}, "nickname", tooLong.error)).toBe("Nick może mieć najwyżej 24 znaków.");
    expect(localValueMessage(FR, "nickname", custom.error)).toBe("Polski");
  });
});

describe("apiErrorText", () => {
  it("translates by code, and by reason where one code carries several messages", () => {
    expect(apiErrorText(FR, { code: "CHAT_FULL", message: "Polski" })).toBe(frErrors.api.CHAT_FULL);
    expect(apiErrorText(FR, { code: "UNAUTHORIZED", message: "Polski", data: { reason: "join_sign_in" } })).toBe(
      frErrors.api.UNAUTHORIZED.join_sign_in,
    );
    expect(apiErrorText({}, { code: "CONFLICT", message: "Polski", data: { reason: "email_taken" } })).toBe(
      plErrors.api.CONFLICT.email_taken,
    );
  });

  it("uses the code's own text for an unknown reason or none, and the envelope's message for an unknown code", () => {
    expect(apiErrorText(EN, { code: "UNAUTHORIZED", message: "Polski", data: { reason: "later" } })).toBe(enErrors.api.UNAUTHORIZED._);
    expect(apiErrorText(EN, { code: "UNAUTHORIZED", message: "Polski", data: { reason: 5 } })).toBe(enErrors.api.UNAUTHORIZED._);
    expect(apiErrorText(EN, { code: "SOMETHING_NEW", message: "Polski" })).toBe("Polski");
  });
});
