import { AppError } from "@gomoku/core";
import { describe, expect, it } from "vitest";

import { describeError } from "./describe-error";

describe("describeError", () => {
  it("keeps only the name of an error", () => {
    expect(
      describeError(new TypeError("select * where email = 'a@b.c'")),
    ).toEqual({ name: "TypeError" });
  });

  it("adds a string or numeric code", () => {
    expect(
      describeError(Object.assign(new Error("x"), { code: "57P01" })),
    ).toEqual({ name: "Error", code: "57P01" });
    expect(describeError(Object.assign(new Error("x"), { code: 7 }))).toEqual({
      name: "Error",
      code: "7",
    });
  });

  it("reports the domain code of an AppError, without its message", () => {
    const described = describeError(
      new AppError(
        502,
        "EMAIL_SEND_FAILED",
        "Nie udało się wysłać ala@example.com",
      ),
    );
    expect(described).toEqual({ name: "AppError", code: "EMAIL_SEND_FAILED" });
    expect(JSON.stringify(described)).not.toContain("example.com");
  });

  it("ignores other code types", () => {
    expect(describeError(Object.assign(new Error("x"), { code: {} }))).toEqual({
      name: "Error",
    });
  });

  it("reports only the type of a non-error value", () => {
    expect(describeError("a@b.c")).toEqual({ name: "string" });
    expect(describeError(null)).toEqual({ name: "object" });
  });
});
