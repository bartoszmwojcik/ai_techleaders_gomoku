import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

// Every test uses its own client address (X-Forwarded-For, one trusted hop): the rate limit
// is per address, so tests cannot exhaust each other's budget.
let addressCounter = 0;
const nextAddress = () => `198.51.100.${++addressCounter}`;
let userCounter = 0;
const uniqueUser = () => {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  return {
    email: `gracz-${n}@example.com`,
    displayName: `Gracz_${n}`,
    password: "secret123",
  };
};

type Options = { headers?: Record<string, string | null>; address?: string };

function register(
  body: unknown,
  { headers = {}, address = nextAddress() }: Options = {},
) {
  const merged: Record<string, string | null> = {
    "content-type": "application/json",
    origin: baseUrl,
    "x-gomoku-request": "1",
    "x-forwarded-for": address,
    ...headers,
  };
  const sent = Object.fromEntries(
    Object.entries(merged).filter(
      (entry): entry is [string, string] => entry[1] !== null,
    ),
  );
  return fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: sent,
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  it("creates the account and answers 201 with the session cookie", async () => {
    const user = uniqueUser();

    const response = await register(user);

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      ok: boolean;
      data: { user: { id: string; displayName: string } };
    };
    expect(body.ok).toBe(true);
    expect(body.data.user).toEqual({
      id: expect.any(String),
      displayName: user.displayName,
    });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^gomoku_session=[^;]{20,};/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=2595600/);
    expect(cookie).not.toMatch(/Secure/i);
    expect(cookie).not.toMatch(/Domain/i);
  });

  it("answers 409 for a taken e-mail without naming a field", async () => {
    const user = uniqueUser();
    expect((await register(user)).status).toBe(201);

    const response = await register({
      ...user,
      displayName: `${user.displayName}x`,
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: { code: string; fieldErrors?: unknown };
    };
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.fieldErrors).toBeUndefined();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("answers 409 at the displayName field when only the name is taken", async () => {
    const user = uniqueUser();
    expect((await register(user)).status).toBe(201);

    const response = await register({
      ...user,
      email: `inny-${user.email}`,
      displayName: user.displayName.toUpperCase(),
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: { fieldErrors: { displayName: string[] } };
    };
    expect(body.error.fieldErrors.displayName).toHaveLength(1);
  });

  it("lets exactly one of two concurrent identical registrations win", async () => {
    const user = uniqueUser();

    const statuses = (await Promise.all([register(user), register(user)])).map(
      (r) => r.status,
    );

    expect(statuses.sort()).toEqual([201, 409]);
  });

  it("answers 400 with field errors for invalid data", async () => {
    const response = await register({
      email: "nie-email",
      displayName: "ab",
      password: "short",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string; fieldErrors: Record<string, string[]> };
    };
    expect(body.error.code).toBe("VALIDATION");
    expect(Object.keys(body.error.fieldErrors).sort()).toEqual([
      "displayName",
      "email",
      "password",
    ]);
  });

  it("answers 400 for a body that is not JSON", async () => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: {
        origin: baseUrl,
        "x-gomoku-request": "1",
        "x-forwarded-for": nextAddress(),
      },
      body: "{",
    });
    expect(response.status).toBe(400);
  });

  it.each([
    ["without X-Gomoku-Request", { "x-gomoku-request": null }],
    ["without Origin", { origin: null }],
    ["with a foreign Origin", { origin: "https://inny.byst.re" }],
  ])("answers 403 %s and creates nothing", async (_name, headers) => {
    const user = uniqueUser();

    const response = await register(user, { headers });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    // The account was not created: the same data still registers.
    expect((await register(user)).status).toBe(201);
  });

  it("answers 429 with Retry-After after 5 attempts from one address; another address passes", async () => {
    const address = nextAddress();
    // Failed attempts (400) count as well, so this also proves the counter is not rolled back.
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await register({}, { address })).status).toBe(400);
    }

    const blocked = await register(uniqueUser(), { address });

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    const body = (await blocked.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
    expect((await register(uniqueUser())).status).toBe(201);
  });

  it("keeps counting when the attempt ends in 409", async () => {
    const address = nextAddress();
    const user = uniqueUser();
    expect((await register(user, { address })).status).toBe(201);
    for (let attempt = 0; attempt < 4; attempt++) {
      expect((await register(user, { address })).status).toBe(409);
    }

    expect((await register(user, { address })).status).toBe(429);
  });

  it("trusts only the entry added by our proxy, not client-supplied ones", async () => {
    const address = nextAddress();
    for (let attempt = 0; attempt < 5; attempt++) {
      // A spoofed leftmost entry changes per request; the rightmost (our proxy's) is stable.
      const spoofed = `10.9.9.${attempt}, ${address}`;
      expect(
        (await register({}, { headers: { "x-forwarded-for": spoofed } }))
          .status,
      ).toBe(400);
    }
    const blocked = await register(
      {},
      { headers: { "x-forwarded-for": `10.9.9.99, ${address}` } },
    );
    expect(blocked.status).toBe(429);
  });
});
