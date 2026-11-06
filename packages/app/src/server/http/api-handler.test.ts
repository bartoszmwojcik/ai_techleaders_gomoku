import {
  ConflictError,
  ServiceUnavailableError,
  TooManyRequestsError,
  ValidationError,
  registerSchema,
} from "@gomoku/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getContainer } = vi.hoisted(() => ({ getContainer: vi.fn() }));
vi.mock("../container", () => ({ getContainer }));

import { API_BODY_MAX_BYTES, apiHandler, assertSameOrigin, readJsonBody, readOptionalJsonBody } from "./api-handler";

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

function streamOf(chunks: Uint8Array[], headers: HeadersInit = {}): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Request("http://x", { method: "POST", headers, body, duplex: "half" } as RequestInit);
}

describe("the request body limit", () => {
  const filler = (bytes: number) => JSON.stringify({ a: "x".repeat(bytes - 8) });

  it("accepts a body of exactly the limit", async () => {
    const text = filler(API_BODY_MAX_BYTES);
    expect(new TextEncoder().encode(text).length).toBe(API_BODY_MAX_BYTES);
    await expect(readJsonBody(new Request("http://x", { method: "POST", body: text }))).resolves.toMatchObject({});
  });

  it("refuses by the declared Content-Length before reading", async () => {
    const request = new Request("http://x", {
      method: "POST",
      headers: { "content-length": String(API_BODY_MAX_BYTES + 1) },
      body: "{}",
    });
    await expect(readJsonBody(request)).rejects.toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
    await expect(readOptionalJsonBody(request)).rejects.toMatchObject({ status: 413 });
  });

  it("refuses a body that is too big although Content-Length is missing or lies", async () => {
    const chunk = new Uint8Array(API_BODY_MAX_BYTES / 2 + 1).fill(0x61);
    await expect(readJsonBody(streamOf([chunk, chunk]))).rejects.toMatchObject({ status: 413 });
    await expect(readJsonBody(streamOf([chunk, chunk], { "content-length": "2" }))).rejects.toMatchObject({ status: 413 });
  });

  it("reads a body in several chunks, also a multibyte character split between them", async () => {
    const bytes = new TextEncoder().encode('{"a":"zażółć"}');
    await expect(readJsonBody(streamOf([bytes.slice(0, 9), bytes.slice(9)]))).resolves.toEqual({ a: "zażółć" });
  });

  it("keeps a body within the limit but not JSON a 400", async () => {
    await expect(readJsonBody(new Request("http://x", { method: "POST", body: "{nope" }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("answers 413 in the error envelope, without running further", async () => {
    const response = await apiHandler(async (request) => ({ data: await readJsonBody(request) }))(
      post({ "content-length": String(API_BODY_MAX_BYTES + 1) }),
    );
    expect(response.status).toBe(413);
    expect((await response.json()).error).toEqual({ code: "PAYLOAD_TOO_LARGE", message: "Żądanie jest zbyt duże." });
  });
});

describe("readOptionalJsonBody", () => {
  it("treats a missing or blank body as an empty object, parses JSON and rejects garbage", async () => {
    expect(await readOptionalJsonBody(new Request("http://x", { method: "POST" }))).toEqual({});
    expect(await readOptionalJsonBody(new Request("http://x", { method: "POST", body: "  " }))).toEqual({});
    expect(await readOptionalJsonBody(new Request("http://x", { method: "POST", body: '{"a":1}' }))).toEqual({ a: 1 });
    await expect(
      readOptionalJsonBody(new Request("http://x", { method: "POST", body: "{nope" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("apiHandler caching and the security log", () => {
  it("marks JSON answers, errors and routes' own Responses without Cache-Control as no-store", async () => {
    const ok = await apiHandler(async () => ({ data: 1 }))(new Request("http://internal/api/x"));
    const failed = await apiHandler(async () => {
      throw new ConflictError("x");
    })(post());
    const plain = await apiHandler(async () => new Response("x"))(new Request("http://internal/api/x"));
    for (const response of [ok, failed, plain]) expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("keeps the Cache-Control a route set itself", async () => {
    const response = await apiHandler(async () => new Response("x", { headers: { "Cache-Control": "public, max-age=60" } }))(
      new Request("http://internal/api/x"),
    );
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it.each([
    ["a foreign origin", { origin: "https://evil.example" }, "origin"],
    ["a missing CSRF header", { "x-gomoku-request": "" }, "missing_header"],
  ])("logs csrf_rejected for %s without the origin", async (_label, headers, reason) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const request = post(headers);
    if (reason === "missing_header") request.headers.delete("x-gomoku-request");

    const response = await apiHandler(async () => ({ data: null }))(request);

    expect(response.status).toBe(403);
    const line = warn.mock.calls[0]![0] as string;
    expect(JSON.parse(line)).toMatchObject({ event: "security.csrf_rejected", reason });
    expect(line).not.toContain("evil.example");
  });
});

describe("apiHandler", () => {
  it("passes on a Response of the route as it is", async () => {
    const image = new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } });
    const handler = apiHandler(async () => image);

    await expect(handler(new Request("http://internal/api/x"))).resolves.toBe(image);
  });

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

  it("sets Retry-After for 503 when known (BOT_UNAVAILABLE)", async () => {
    const off = await apiHandler(async () => {
      throw new ServiceUnavailableError("Bot jest teraz niedostępny.", { code: "BOT_UNAVAILABLE", retryAfterSeconds: 60 });
    })(post());
    expect(off.status).toBe(503);
    expect(off.headers.get("Retry-After")).toBe("60");
    expect((await off.json()).error.code).toBe("BOT_UNAVAILABLE");

    const unknown = await apiHandler(async () => {
      throw new ServiceUnavailableError("off");
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
