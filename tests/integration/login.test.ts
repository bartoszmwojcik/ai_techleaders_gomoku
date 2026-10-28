import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

// Every test uses its own client address (X-Forwarded-For, one trusted hop) and its own
// e-mail: the limits are per address and per e-mail, so tests cannot exhaust each other.
let addressCounter = 0;
// Hundreds of addresses are needed (the e-mail limit test), so the counter spans two octets.
const nextAddress = () => {
  const n = ++addressCounter;
  return `198.51.${Math.floor(n / 250)}.${(n % 250) + 1}`;
};
let userCounter = 0;
const uniqueUser = () => {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  return {
    email: `login-${n}@example.com`,
    displayName: `Login_${n}`,
    password: "secret123",
  };
};

type Options = { headers?: Record<string, string | null>; address?: string };

function post(path: string, body: unknown, options: Options = {}) {
  const merged: Record<string, string | null> = {
    "content-type": "application/json",
    origin: baseUrl,
    "x-gomoku-request": "1",
    "x-forwarded-for": options.address ?? nextAddress(),
    ...options.headers,
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

const login = (body: unknown, options?: Options) =>
  post("/api/auth/login", body, options);

async function registerUser() {
  const user = uniqueUser();
  const response = await post("/api/auth/register", user);
  expect(response.status).toBe(201);
  return user;
}

type ErrorBody = { error: { code: string; message: string } };

describe("POST /api/auth/login", () => {
  it("answers 200 with the user and the session cookie", async () => {
    const user = await registerUser();

    const response = await login({
      email: ` ${user.email.toUpperCase()} `,
      password: user.password,
    });

    expect(response.status).toBe(200);
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
    expect(cookie).toMatch(/Max-Age=2595600/);
  });

  it("logs in an account with an unconfirmed e-mail (BR-26)", async () => {
    // A freshly registered account has no confirmed e-mail.
    const user = await registerUser();
    expect(
      (await login({ email: user.email, password: user.password })).status,
    ).toBe(200);
  });

  it("answers 401 with an identical body for an unknown e-mail and a wrong password", async () => {
    const user = await registerUser();

    const wrongPassword = await login({ email: user.email, password: "nope" });
    const unknown = await login({
      email: `nikt-${user.email}`,
      password: "nope",
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    const a = (await wrongPassword.json()) as ErrorBody;
    const b = (await unknown.json()) as ErrorBody;
    expect(a).toEqual(b);
    expect(a.error.code).toBe("INVALID_CREDENTIALS");
    expect(wrongPassword.headers.get("set-cookie")).toBeNull();
    expect(unknown.headers.get("set-cookie")).toBeNull();
  });

  it("answers 400 with field errors and without the registration password rules", async () => {
    const response = await login({ email: "nie-email", password: "" });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string; fieldErrors: Record<string, string[]> };
    };
    expect(body.error.code).toBe("VALIDATION");
    expect(Object.keys(body.error.fieldErrors).sort()).toEqual([
      "email",
      "password",
    ]);
  });

  it("answers 400 for a body that is not JSON", async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
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
  ])("answers 403 %s", async (_name, headers) => {
    const user = await registerUser();

    const response = await login(
      { email: user.email, password: user.password },
      { headers },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("FORBIDDEN");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("answers 409 ALREADY_AUTHENTICATED for a signed-in client", async () => {
    const user = await registerUser();
    const first = await login({ email: user.email, password: user.password });
    const cookie = (first.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

    const response = await login(
      { email: user.email, password: user.password },
      { headers: { cookie } },
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("ALREADY_AUTHENTICATED");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("answers 429 after 10 failed attempts for an e-mail and address pair; another address passes", async () => {
    const user = await registerUser();
    const address = nextAddress();
    for (let attempt = 0; attempt < 10; attempt++) {
      const failed = await login(
        { email: user.email, password: "zle-haslo" },
        { address },
      );
      expect(failed.status).toBe(401);
    }

    const blocked = await login(
      { email: user.email, password: user.password },
      { address },
    );

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    const body = (await blocked.json()) as ErrorBody;
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(blocked.headers.get("set-cookie")).toBeNull();
    // The owner from another address is not locked out (H1).
    const other = await login({ email: user.email, password: user.password });
    expect(other.status).toBe(200);
    // The same address still works for a different e-mail.
    const another = await registerUser();
    expect(
      (
        await login(
          { email: another.email, password: another.password },
          { address },
        )
      ).status,
    ).toBe(200);
  });

  it("resets the counter after a successful login", async () => {
    const user = await registerUser();
    const address = nextAddress();
    const attempt = (password: string) =>
      login({ email: user.email, password }, { address });
    for (let i = 0; i < 9; i++) expect((await attempt("zle")).status).toBe(401);
    expect((await attempt(user.password)).status).toBe(200);

    // Without the reset the 11th attempt would be blocked.
    for (let i = 0; i < 9; i++) expect((await attempt("zle")).status).toBe(401);
    expect((await attempt(user.password)).status).toBe(200);
  });

  it("answers 429 for a new address after 100 failed attempts on one e-mail, even with the right password", async () => {
    const user = await registerUser();
    // Every attempt comes from its own address, so neither the pair limit (10) nor the
    // address limit (30) is reached: only the per-e-mail limit (100 per hour) can trigger.
    for (let attempt = 0; attempt < 100; attempt++) {
      const failed = await login({ email: user.email, password: "zle-haslo" });
      expect(failed.status).toBe(401);
    }

    const blocked = await login({ email: user.email, password: user.password });

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(((await blocked.json()) as ErrorBody).error.code).toBe(
      "RATE_LIMITED",
    );
    expect(blocked.headers.get("set-cookie")).toBeNull();
  }, 120_000);

  it("answers 429 with Retry-After after 30 requests from one address for different e-mails", async () => {
    const address = nextAddress();
    const unknown = (n: number) => ({
      email: `nikt-${Date.now().toString(36)}-${n}@example.com`,
      password: "zle-haslo",
    });
    for (let attempt = 0; attempt < 30; attempt++) {
      const failed = await login(unknown(attempt), { address });
      expect(failed.status).toBe(401);
    }

    const blocked = await login(unknown(30), { address });

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(((await blocked.json()) as ErrorBody).error.code).toBe(
      "RATE_LIMITED",
    );
    // Another address is unaffected.
    const other = await login(unknown(31));
    expect(other.status).toBe(401);
  }, 60_000);

  it("lets exactly 10 parallel attempts on one e-mail and address reach the password check", async () => {
    const user = await registerUser();
    const address = nextAddress();

    const responses = await Promise.all(
      Array.from({ length: 15 }, () =>
        login({ email: user.email, password: "zle-haslo" }, { address }),
      ),
    );

    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 401)).toHaveLength(10);
    expect(statuses.filter((status) => status === 429)).toHaveLength(5);
  });
});
