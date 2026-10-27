import { describe, expect, it } from "vitest";
import { z } from "zod";

import { FORM_ERROR_KEY, toValidationError } from "./zod-error";

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

  it("ignores values that are not ZodError", () => {
    expect(toValidationError(new Error("x"))).toBeUndefined();
    expect(toValidationError(undefined)).toBeUndefined();
  });
});
