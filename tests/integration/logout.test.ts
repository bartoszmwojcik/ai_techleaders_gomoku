import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

// Every test uses its own client address (X-Forwarded-For, one trusted hop).
let addressCounter = 0;
const nextAddress = () => `198.18.0.${++addressCounter}`;
let userCounter = 0;
const uniqueUser = () => {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  return {
    email: `logout-${n}@example.com`,
    displayName: `Logout_${n}`,
    password: "secret123",
  };
};

function post(
  path: string,
  body: unknown,
  headers: Record<string, string | null> = {},
) {
  const merged: Record<string, string | null> = {
    "content-type": "application/json",
    origin: baseUrl,
    "x-gomoku-request": "1",
    "x-forwarded-for": nextAddress(),
    ...headers,
  };
  const sent = Object.fromEntries(
    Object.entries(merged).filter(
      (entry): entry is [string, string] => entry[1] !== null,
    ),
  );
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: sent,
    body: JSON.stringify(body),
  });
}

const cookieOf = (response: Response): string =>
  (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

async function registerUser() {
  const user = uniqueUser();
  const response = await post("/api/auth/register", user);
  expect(response.status).toBe(201);
  return { user, cookie: cookieOf(response) };
}

async function loginAs(user: { email: string; password: string }) {
  const response = await post("/api/auth/login", user);
  expect(response.status).toBe(200);
  return cookieOf(response);
}

const logout = (cookie?: string, headers: Record<string, string | null> = {}) =>
  post("/api/auth/logout", {}, { ...(cookie ? { cookie } : {}), ...headers });

/** `409` for a valid session; anything else (here `200`) means the cookie is not valid. */
async function sessionIsValid(
  cookie: string,
  user: { email: string; password: string },
) {
  const response = await post("/api/auth/login", user, { cookie });
  return response.status === 409;
}

describe("POST /api/auth/logout", () => {
  it("answers 200, clears the cookie and ends the session", async () => {
    const { user, cookie } = await registerUser();
    expect(await sessionIsValid(cookie, user)).toBe(true);

    const response = await logout(cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: null });
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^gomoku_session=;/);
    expect(setCookie).toMatch(/Max-Age=0/i);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(await sessionIsValid(cookie, user)).toBe(false);
  });

  it("revokes only the current session", async () => {
    const { user, cookie: first } = await registerUser();
    const second = await loginAs(user);

    expect((await logout(first)).status).toBe(200);

    expect(await sessionIsValid(first, user)).toBe(false);
    expect(await sessionIsValid(second, user)).toBe(true);
  });

  it("is idempotent, also without a session", async () => {
    const { cookie } = await registerUser();
    expect((await logout(cookie)).status).toBe(200);

    const again = await logout(cookie);
    expect(again.status).toBe(200);
    expect(again.headers.get("set-cookie") ?? "").toMatch(/Max-Age=0/i);

    const anonymous = await logout();
    expect(anonymous.status).toBe(200);
    expect(await anonymous.json()).toEqual({ ok: true, data: null });
  });

  it("rejects a request without the CSRF header with 403", async () => {
    const { user, cookie } = await registerUser();

    const response = await logout(cookie, { "x-gomoku-request": null });

    expect(response.status).toBe(403);
    expect(await sessionIsValid(cookie, user)).toBe(true);
  });

  it("rejects a foreign Origin with 403", async () => {
    const { user, cookie } = await registerUser();

    const response = await logout(cookie, { origin: "https://evil.example" });

    expect(response.status).toBe(403);
    expect(await sessionIsValid(cookie, user)).toBe(true);
  });
});
