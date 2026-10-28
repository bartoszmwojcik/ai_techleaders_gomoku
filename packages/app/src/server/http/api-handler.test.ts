import {
  ConflictError,
  TooManyRequestsError,
  ValidationError,
  registerSchema,
} from "@gomoku/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getContainer } = vi.hoisted(() => ({ getContainer: vi.fn() }));
vi.mock("../container", () => ({ getContainer }));

import { apiHandler, assertSameOrigin, readJsonBody } from "./api-handler";

const ORIGIN = "https://gomoku.example";

function useConfig(config: object) {
  getContainer.mockResolvedValue({ cradle: { serverConfig: config } });
}

function post(headers: Record<string, string> = {}) {
  return new Request("http://internal/api/x", {
    method: "POST",
    headers: { origin: ORIGIN, "x-gomoku-request": "1", ...headers },
    body: "{}",
  });
}

beforeEach(() => {
  getContainer.mockReset();
  useConfig({ appOrigin: ORIGIN });
});

afterEach(() => vi.restoreAllMocks());

describe("assertSameOrigin", () => {
  it("accepts the exact APP_ORIGIN with the CSRF header", () => {
    expect(() => assertSameOrigin(post(), { appOrigin: ORIGIN })).not.toThrow();
  });

  it.each([
    ["a foreign origin", { origin: "https://inny.byst.re" }],
    ["a sibling port", { origin: `${ORIGIN}:8443` }],
    ["a missing CSRF header", { "x-gomoku-request": "" }],
  ])("rejects %s", (_name, headers) => {
    const request = post(headers);
    if (_name === "a missing CSRF header")
      request.headers.delete("x-gomoku-request");
    expect(() => assertSameOrigin(request, { appOrigin: ORIGIN })).toThrow(
      /odrzucone/,
    );
  });

  it("rejects a missing Origin", () => {
    const request = post();
    request.headers.delete("origin");
    expect(() => assertSameOrigin(request, { appOrigin: ORIGIN })).toThrow();
  });

  it("falls back to localhost when APP_ORIGIN is unset (outside production)", () => {
    expect(() =>
      assertSameOrigin(post({ origin: "http://localhost:3000" }), {}),
    ).not.toThrow();
    expect(() => assertSameOrigin(post({ origin: ORIGIN }), {})).toThrow();
    const request = post();
    request.headers.delete("origin");
    expect(() => assertSameOrigin(request, {})).toThrow();
  });
});

describe("readJsonBody", () => {
  it("parses JSON and turns garbage into a validation error", async () => {
    const ok = new Request("http://x", { method: "POST", body: '{"a":1}' });
    expect(await readJsonBody(ok)).toEqual({ a: 1 });
    const bad = new Request("http://x", { method: "POST", body: "{nope" });
    await expect(readJsonBody(bad)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("apiHandler", () => {
  it("wraps data in the envelope, defaulting to 200", async () => {
    const response = await apiHandler(async () => ({ data: { a: 1 } }))(post());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { a: 1 } });
  });

  it("uses a custom status and passes extra arguments through", async () => {
    const fn = vi.fn(async (_r: Request, id: string) => ({
      data: id,
      status: 201,
    }));
    const response = await apiHandler(fn)(post(), "abc");
    expect(response.status).toBe(201);
    expect(fn).toHaveBeenCalledWith(expect.any(Request), "abc");
  });

  it("does not require CSRF headers for safe methods", async () => {
    const response = await apiHandler(async () => ({ data: null }))(
      new Request("http://internal/api/x"),
    );
    expect(response.status).toBe(200);
    expect(getContainer).not.toHaveBeenCalled();
  });

  it("answers 403 without running the function when CSRF fails", async () => {
    const fn = vi.fn(async () => ({ data: null }));
    const response = await apiHandler(fn)(
      post({ origin: "https://evil.example" }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
    expect(fn).not.toHaveBeenCalled();
  });

  it("fails closed with 500 when the configuration is invalid", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getContainer.mockRejectedValue(new Error("APP_ORIGIN is required"));
    const fn = vi.fn(async () => ({ data: null }));
    const response = await apiHandler(fn)(post());
    expect(response.status).toBe(500);
    expect(fn).not.toHaveBeenCalled();
  });

  it("maps AppError with its fieldErrors", async () => {
    const response = await apiHandler(async () => {
      throw new ConflictError("Zajęte", {
        fieldErrors: { displayName: ["x"] },
      });
    })(post());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "Zajęte",
        fieldErrors: { displayName: ["x"] },
      },
    });
  });

  it("sets Retry-After for 429 when known", async () => {
    const limited = await apiHandler(async () => {
      throw new TooManyRequestsError("Za dużo", { retryAfterSeconds: 42 });
    })(post());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("42");

    const unknown = await apiHandler(async () => {
      throw new TooManyRequestsError("Za dużo");
    })(post());
    expect(unknown.headers.has("Retry-After")).toBe(false);
  });

  it("maps ZodError to 400 with field errors", async () => {
    const response = await apiHandler(async () => {
      registerSchema.parse({ email: "x", displayName: "a", password: "1" });
      return { data: null };
    })(post());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION");
    expect(Object.keys(body.error.fieldErrors).sort()).toEqual([
      "displayName",
      "email",
      "password",
    ]);
  });

  it("hides unknown errors behind a generic 500 and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = Object.assign(new Error("secret internals"), {
      code: "57P01",
    });
    const response = await apiHandler(async () => {
      throw failure;
    })(post());
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("secret internals");
    expect(JSON.parse(text).error.code).toBe("INTERNAL");
    expect(log).toHaveBeenCalledWith("Unhandled API error", {
      name: "Error",
      code: "57P01",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret internals");
  });
});
