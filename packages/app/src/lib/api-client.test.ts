import { afterEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "./api-client";

function stubFetch(impl: () => Promise<unknown>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const json = (body: unknown, headers: Record<string, string> = {}) =>
  Promise.resolve({ json: () => Promise.resolve(body), headers: new Headers(headers) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiCall", () => {
  it("returns a success envelope and sends the CSRF and JSON headers", async () => {
    const fetchMock = stubFetch(() => json({ ok: true, data: { id: "1" } }));
    const signal = new AbortController().signal;

    const result = await apiCall<{ id: string }>("/api/x", { body: { a: 1 }, signal });

    expect(result).toEqual({ ok: true, data: { id: "1" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/x", {
      method: "POST",
      headers: { "X-Gomoku-Request": "1", "Content-Type": "application/json" },
      body: '{"a":1}',
      signal,
    });
  });

  it("omits body and content type when there is no body", async () => {
    const fetchMock = stubFetch(() => json({ ok: true, data: null }));

    await apiCall("/api/x", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledWith("/api/x", {
      method: "GET",
      headers: { "X-Gomoku-Request": "1" },
      body: undefined,
      signal: undefined,
    });
  });

  it("passes through an error envelope with fieldErrors", async () => {
    const error = { code: "VALIDATION", message: "Bad", fieldErrors: { email: ["invalid"] } };
    stubFetch(() => json({ ok: false, error }));

    expect(await apiCall("/api/x")).toEqual({ ok: false, error });
  });

  it("copies Retry-After of a failure into the error", async () => {
    const error = { code: "RATE_LIMITED", message: "Wait" };
    stubFetch(() => json({ ok: false, error }, { "Retry-After": "90" }));

    expect(await apiCall("/api/x")).toEqual({ ok: false, error: { ...error, retryAfterSeconds: 90 } });
  });

  it("ignores an unusable Retry-After", async () => {
    const error = { code: "RATE_LIMITED", message: "Wait" };
    stubFetch(() => json({ ok: false, error }, { "Retry-After": "soon" }));

    expect(await apiCall("/api/x")).toEqual({ ok: false, error });
  });

  it.each([null, "text", 5, {}, { ok: "yes" }])("maps non-envelope JSON %j to a network error", async (body) => {
    stubFetch(() => json(body));

    expect(await apiCall("/api/x")).toEqual({
      ok: false,
      error: { code: "network", message: "Request failed" },
    });
  });

  it("maps a non-JSON response to a network error", async () => {
    stubFetch(() => Promise.resolve({ json: () => Promise.reject(new SyntaxError("Unexpected token <")) }));

    expect(await apiCall("/api/x")).toMatchObject({ ok: false, error: { code: "network" } });
  });

  it("maps a network failure to a network error", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    expect(await apiCall("/api/x")).toMatchObject({ ok: false, error: { code: "network" } });
  });
});
