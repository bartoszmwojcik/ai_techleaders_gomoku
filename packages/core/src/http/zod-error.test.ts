import { describe, expect, it } from "vitest";
import { z, ZodError } from "zod";

import { FORM_ERROR_KEY, toFieldIssues, toValidationError } from "./zod-error";

describe("toValidationError", () => {
  it("groups issue messages by dotted path", () => {
    const schema = z.object({
      email: z.string({ error: "Podaj e-mail." }),
      nested: z.object({ a: z.string().min(2, { error: "A" }) }),
    });
    const result = schema.safeParse({ nested: { a: "x" } });
    const error = toValidationError(result.error);

    expect(error?.status).toBe(400);
    expect(error?.code).toBe("VALIDATION");
    expect(error?.fieldErrors).toEqual({
      email: ["Podaj e-mail."],
      "nested.a": ["A"],
    });
  });

  it("collects several messages for one field and form-level issues", () => {
    const schema = z
      .object({ p: z.string() })
      .superRefine((_value, ctx) =>
        ctx.addIssue({ code: "custom", message: "Ogólny" }),
      )
      .pipe(
        z.object({
          p: z.string().min(3, { error: "1" }).regex(/\d/, { error: "2" }),
        }),
      );
    const result = schema.safeParse({ p: "a" });
    expect(toValidationError(result.error)?.fieldErrors).toEqual({
      [FORM_ERROR_KEY]: ["Ogólny"],
    });

    const multi = z.object({
      p: z.string().min(3, { error: "1" }).regex(/\d/, { error: "2" }),
    });
    expect(
      toValidationError(multi.safeParse({ p: "a" }).error)?.fieldErrors,
    ).toEqual({
      p: ["1", "2"],
    });
  });

  it("adds fieldIssues in the same keys and order as fieldErrors", () => {
    const schema = z.object({
      p: z.string().min(3, { error: "1" }).regex(/\d/, { error: "2" }),
    });
    const error = toValidationError(schema.safeParse({ p: "a" }).error);
    expect(error?.fieldErrors).toEqual({ p: ["1", "2"] });
    expect(error?.fieldIssues).toEqual({
      p: [
        { code: "too_small", params: { origin: "string", minimum: 3, inclusive: true } },
        { code: "invalid_format", params: { origin: "string", format: "regex" } },
      ],
    });
    expect(error?.toBody().fieldIssues).toEqual(error?.fieldIssues);
  });

  it("tells inclusive, exclusive and exact bounds apart", () => {
    const issue = (schema: z.ZodType, value: unknown) =>
      toFieldIssues(schema.safeParse(value).error as z.ZodError)[FORM_ERROR_KEY];
    expect(issue(z.number().gt(3), 3)?.[0]?.params).toMatchObject({ inclusive: false });
    expect(issue(z.number().min(3), 2)?.[0]?.params).toMatchObject({ inclusive: true });
    expect(issue(z.string().length(3), "a")?.[0]?.params).toMatchObject({ exact: true });
  });

  it("uses params.code of custom rules and drops non-scalar params", () => {
    const schema = z.string().superRefine((_v, ctx) =>
      ctx.addIssue({
        code: "custom",
        message: "x",
        params: { code: "MY_CODE", min: 8, list: [1, 2], nested: { a: 1 }, other: 3 },
      }),
    );
    expect(toFieldIssues(schema.safeParse("a").error as z.ZodError)).toEqual({
      [FORM_ERROR_KEY]: [{ code: "MY_CODE", params: { min: 8 } }],
    });
  });

  it("reports a custom rule without a code as custom", () => {
    const schema = z.string().refine(() => false, "x");
    expect(toFieldIssues(schema.safeParse("a").error as z.ZodError)).toEqual({
      [FORM_ERROR_KEY]: [{ code: "custom" }],
    });
  });

  it("drops keys outside the list and never leaks input or structure", () => {
    const strict = z.strictObject({ a: z.string() });
    const union = z.union([z.string(), z.number()]);
    const literal = z.literal("secret-expected");
    const strictIssues = toFieldIssues(strict.safeParse({ a: "x", leaked: 1 }).error as z.ZodError);
    expect(strictIssues).toEqual({ [FORM_ERROR_KEY]: [{ code: "unrecognized_keys" }] });
    expect(JSON.stringify(strictIssues)).not.toContain("leaked");
    expect(toFieldIssues(union.safeParse(true).error as z.ZodError)).toEqual({
      [FORM_ERROR_KEY]: [{ code: "invalid_union" }],
    });
    const lit = toFieldIssues(literal.safeParse("user-input").error as z.ZodError);
    expect(lit[FORM_ERROR_KEY]).toEqual([{ code: "invalid_value" }]);
    expect(JSON.stringify(toFieldIssues(z.email().safeParse("user-input").error as z.ZodError))).not.toContain(
      "user-input",
    );
  });

  it("keeps only safe scalar custom params (bigint, Date, finite numbers, booleans)", () => {
    const schema = z.string().superRefine((_v, ctx) =>
      ctx.addIssue({
        code: "custom",
        message: "x",
        params: {
          min: 5n,
          max: 2n ** 80n,
          minimum: new Date(1000),
          maximum: Number.POSITIVE_INFINITY,
          inclusive: true,
          exact: null,
          length: () => 1,
          secret: "user-input",
        },
      }),
    );
    const issues = toFieldIssues(schema.safeParse("a").error as z.ZodError);
    expect(issues).toEqual({
      [FORM_ERROR_KEY]: [{ code: "custom", params: { min: 5, minimum: 1000, inclusive: true } }],
    });
    expect(JSON.stringify(issues)).not.toContain("user-input");
  });

  it("reports an unrecognised issue code as unknown", () => {
    const error = new ZodError([{ code: "future_code", path: ["a"], message: "m" } as never]);
    expect(toFieldIssues(error)).toEqual({ a: [{ code: "unknown" }] });
  });

  it("ignores values that are not ZodError", () => {
    expect(toValidationError(new Error("x"))).toBeUndefined();
    expect(toValidationError(undefined)).toBeUndefined();
  });
});
