import { describe, expect, it } from "vitest";

import {
  AppError,
  ConflictError,
  ForbiddenError,
  GoneError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from "./errors";

describe("AppError", () => {
  it("carries status, code and message and builds a body without fieldErrors", () => {
    const error = new AppError(500, "INTERNAL", "Boom");
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(500);
    expect(error.name).toBe("AppError");
    expect(error.toBody()).toEqual({ code: "INTERNAL", message: "Boom" });
  });

  it("includes fieldErrors in the body when present", () => {
    const error = new AppError(400, "X", "m", { email: ["bad"] });
    expect(error.toBody()).toEqual({
      code: "X",
      message: "m",
      fieldErrors: { email: ["bad"] },
    });
  });

  it("includes data in the body when present", () => {
    const error = new AppError(409, "X", "m", undefined, { gameId: "g-1" });
    expect(error.toBody()).toEqual({ code: "X", message: "m", data: { gameId: "g-1" } });
  });

  it("passes data through the subclasses", () => {
    const error = new ConflictError("m", { code: "OWN_WAITING_GAME", data: { gameId: "g-1" } });
    expect(error.toBody()).toEqual({
      code: "OWN_WAITING_GAME",
      message: "m",
      data: { gameId: "g-1" },
    });
  });
});

describe.each([
  ["ValidationError", ValidationError, 400, "VALIDATION"],
  ["UnauthorizedError", UnauthorizedError, 401, "UNAUTHORIZED"],
  ["ForbiddenError", ForbiddenError, 403, "FORBIDDEN"],
  ["NotFoundError", NotFoundError, 404, "NOT_FOUND"],
  ["ConflictError", ConflictError, 409, "CONFLICT"],
  ["GoneError", GoneError, 410, "GONE"],
  ["TooManyRequestsError", TooManyRequestsError, 429, "RATE_LIMITED"],
] as const)("%s", (name, ErrorClass, status, code) => {
  it("has the default status and code", () => {
    const error = new ErrorClass("msg");
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe(name);
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).toBe("msg");
    expect(error.fieldErrors).toBeUndefined();
  });

  it("allows overriding the code and passing fieldErrors", () => {
    const error = new ErrorClass("msg", {
      code: "CUSTOM",
      fieldErrors: { displayName: ["taken"] },
    });
    expect(error.status).toBe(status);
    expect(error.code).toBe("CUSTOM");
    expect(error.toBody()).toEqual({
      code: "CUSTOM",
      message: "msg",
      fieldErrors: { displayName: ["taken"] },
    });
  });
});

describe("TooManyRequestsError", () => {
  it("exposes retryAfterSeconds", () => {
    expect(
      new TooManyRequestsError("slow down", { retryAfterSeconds: 30 })
        .retryAfterSeconds,
    ).toBe(30);
    expect(new TooManyRequestsError("slow down").retryAfterSeconds).toBeUndefined();
  });
});
