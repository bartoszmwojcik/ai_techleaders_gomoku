import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

// Every test uses its own client address (X-Forwarded-For, one trusted hop).
let addressCounter = 0;
const nextAddress = () => `198.19.0.${++addressCounter}`;
let userCounter = 0;
const uniqueUser = () => {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  return {
    email: `pwchange-${n}@example.com`,
    displayName: `PwChange_${n}`,
    password: "secret123",
  };
};
const NEW_PASSWORD = "brand-new-pass1";

type ErrorBody = {
  error: { code: string; fieldErrors?: Record<string, string[]> };
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

const changePassword = (
  cookie: string | undefined,
  body: unknown,
  headers: Record<string, string | null> = {},
) =>
  post("/api/auth/password", body, {
    ...(cookie ? { cookie } : {}),
    ...headers,
  });

/** `409` for a valid session; anything else (here `200`) means the cookie is not valid. */
async function sessionIsValid(
  cookie: string,
  user: { email: string; password: string },
) {
  const response = await post("/api/auth/login", user, { cookie });
  return response.status === 409;
}

describe("POST /api/auth/password", () => {
  it("changes the password: the old one no longer logs in, the new one does", async () => {
    const { user, cookie } = await registerUser();

    const response = await changePassword(cookie, {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: null });
    const old = await post("/api/auth/login", user);
    expect(old.status).toBe(401);
    const fresh = await post("/api/auth/login", {
      email: user.email,
      password: NEW_PASSWORD,
    });
    expect(fresh.status).toBe(200);
  });

  it("lets only one of two parallel changes with the right current password win", async () => {
    const { user, cookie } = await registerUser();
    const first = "first-new-pass1";
    const second = "second-new-pass2";

    const responses = await Promise.all([
      changePassword(cookie, {
        currentPassword: user.password,
        newPassword: first,
      }),
      changePassword(cookie, {
        currentPassword: user.password,
        newPassword: second,
      }),
    ]);

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 400]);
    const winnerIndex = responses.findIndex((r) => r.status === 200);
    const loser = responses[1 - winnerIndex] as Response;
    expect(((await loser.json()) as ErrorBody).error.code).toBe(
      "INVALID_CURRENT_PASSWORD",
    );
    const winnerPassword = winnerIndex === 0 ? first : second;
    const loserPassword = winnerIndex === 0 ? second : first;
    expect(
      (
        await post("/api/auth/login", {
          email: user.email,
          password: winnerPassword,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post("/api/auth/login", {
          email: user.email,
          password: loserPassword,
        })
      ).status,
    ).toBe(401);
  });

  it("keeps the current session and ends the other ones", async () => {
    const { user, cookie: current } = await registerUser();
    const other = await loginAs(user);
    expect(await sessionIsValid(other, user)).toBe(true);

    const response = await changePassword(current, {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(await sessionIsValid(current, user)).toBe(true);
    expect(await sessionIsValid(other, user)).toBe(false);
  });

  it("answers 400 INVALID_CURRENT_PASSWORD for a wrong current password and changes nothing", async () => {
    const { user, cookie } = await registerUser();

    const response = await changePassword(cookie, {
      currentPassword: "wrong-password",
      newPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_CURRENT_PASSWORD");
    expect(body.error.fieldErrors?.currentPassword).toBeDefined();
    expect((await post("/api/auth/login", user)).status).toBe(200);
  });

  it("answers 400 VALIDATION for a weak new password", async () => {
    const { user, cookie } = await registerUser();

    const response = await changePassword(cookie, {
      currentPassword: user.password,
      newPassword: "short",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.fieldErrors?.newPassword).toBeDefined();
  });

  it("answers 400 when the new password equals the current one", async () => {
    const { user, cookie } = await registerUser();

    const response = await changePassword(cookie, {
      currentPassword: user.password,
      newPassword: user.password,
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.fieldErrors?.newPassword).toBeDefined();
  });

  it("answers 401 without a session", async () => {
    const response = await changePassword(undefined, {
      currentPassword: "secret123",
      newPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a request without the CSRF header with 403", async () => {
    const { user, cookie } = await registerUser();

    const response = await changePassword(
      cookie,
      { currentPassword: user.password, newPassword: NEW_PASSWORD },
      { "x-gomoku-request": null },
    );

    expect(response.status).toBe(403);
    expect((await post("/api/auth/login", user, {})).status).toBe(200);
  });

  it("rejects a foreign Origin with 403", async () => {
    const { user, cookie } = await registerUser();

    const response = await changePassword(
      cookie,
      { currentPassword: user.password, newPassword: NEW_PASSWORD },
      { origin: "https://evil.example" },
    );

    expect(response.status).toBe(403);
  });

  it("answers 429 after 10 failed attempts, even with the right password", async () => {
    const { user, cookie } = await registerUser();
    for (let attempt = 0; attempt < 10; attempt++) {
      const failed = await changePassword(cookie, {
        currentPassword: "wrong-password",
        newPassword: NEW_PASSWORD,
      });
      expect(failed.status).toBe(400);
    }

    const blocked = await changePassword(cookie, {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
    });

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    const body = (await blocked.json()) as ErrorBody;
    expect(body.error.code).toBe("RATE_LIMITED");
    // The password stayed unchanged.
    expect((await post("/api/auth/login", user)).status).toBe(200);
  });

  it("gives the attempt back after a successful change", async () => {
    const { user, cookie } = await registerUser();
    for (let attempt = 0; attempt < 9; attempt++) {
      await changePassword(cookie, {
        currentPassword: "wrong-password",
        newPassword: NEW_PASSWORD,
      });
    }

    expect(
      (
        await changePassword(cookie, {
          currentPassword: user.password,
          newPassword: NEW_PASSWORD,
        })
      ).status,
    ).toBe(200);

    // Without the reset, the 11th failure would be blocked.
    for (let attempt = 0; attempt < 9; attempt++) {
      const failed = await changePassword(cookie, {
        currentPassword: "wrong-password",
        newPassword: "another-pass12",
      });
      expect(failed.status).toBe(400);
    }
  });
});
