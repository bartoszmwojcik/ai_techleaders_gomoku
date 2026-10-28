// POST /api/auth/password-reset/request and /confirm on the built app: identical answers,
// the message only for a confirmed account (it arrives after the response, hence the polling
// helper), a full reset from the mailed link, CSRF and the Q4 address limits.
import { Session, createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { verificationLink, waitForMessages } from "./outbox";

const baseUrl = inject("baseUrl");
const outbox = inject("emailOutboxPath");
let orm: Orm;

// 100.68.0.0/16 is used by no other test file. Every request gets its own client address
// unless the test is about the per-address limit.
let addressCounter = 0;
let userCounter = 0;
const nextAddress = () =>
  `100.68.${Math.floor(addressCounter / 250)}.${(++addressCounter % 250) + 1}`;
const uniqueUser = () => {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  return {
    email: `pra-${n}@example.com`,
    displayName: `Pra_${n}`,
    password: "secret123",
  };
};

const apiHeaders = {
  "content-type": "application/json",
  origin: baseUrl,
  "x-gomoku-request": "1",
};

const post = (
  path: string,
  body: unknown,
  headers: Record<string, string | null> = {},
) => {
  const merged: Record<string, string | null> = {
    ...apiHeaders,
    "x-forwarded-for": nextAddress(),
    ...headers,
  };
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: Object.fromEntries(
      Object.entries(merged).filter(
        (entry): entry is [string, string] => entry[1] !== null,
      ),
    ),
    body: JSON.stringify(body),
  });
};

const requestReset = (email: string, headers = {}) =>
  post("/api/auth/password-reset/request", { email }, headers);
const confirmReset = (token: string, newPassword: string, headers = {}) =>
  post("/api/auth/password-reset/confirm", { token, newPassword }, headers);
const login = (email: string, password: string) =>
  post("/api/auth/login", { email, password });

/** Registers an account; with `confirmed` its e-mail is confirmed through the mailed link. */
async function register(confirmed: boolean) {
  const user = uniqueUser();
  const response = await post("/api/auth/register", user);
  expect(response.status).toBe(201);
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const [first] = await waitForMessages(outbox, user.email);
  if (confirmed) {
    const { token } = verificationLink(first!);
    expect(
      (await post("/api/auth/email-verification/confirm", { token })).status,
    ).toBe(200);
  }
  return { user, cookie };
}

/** The reset message is the second one to the address (the first is the verification). */
async function resetToken(email: string): Promise<string> {
  const messages = await waitForMessages(outbox, email, 2);
  const link = /https?:\/\/\S+\/reset-password\?\S+/.exec(
    messages[1]!.text,
  )?.[0] as string;
  return new URL(link).searchParams.get("token") as string;
}

beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await orm.close();
});

describe("POST /api/auth/password-reset/request", () => {
  it("answers identically for confirmed, unconfirmed and unknown accounts and mails only the confirmed one", async () => {
    const confirmed = await register(true);
    const unconfirmed = await register(false);
    const unknown = uniqueUser().email;

    const responses = [];
    for (const email of [
      unknown,
      unconfirmed.user.email,
      confirmed.user.email,
    ]) {
      const response = await requestReset(email);
      responses.push({ status: response.status, body: await response.json() });
    }

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(responses.map((r) => r.body)).toEqual([
      { ok: true, data: null },
      { ok: true, data: null },
      { ok: true, data: null },
    ]);
    const [, message] = await waitForMessages(outbox, confirmed.user.email, 2);
    expect(message!.subject).toBeTruthy();
    // Anything the other two requests would send is written before or alongside the mail above.
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    await expect(waitForMessages(outbox, unknown, 1, 300)).rejects.toThrow();
    expect(await waitForMessages(outbox, unconfirmed.user.email)).toHaveLength(
      1,
    );
  });

  it("answers 400 VALIDATION for a bad shape", async () => {
    const response = await requestReset("not-an-email");

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION");
  });

  it.each([
    ["without X-Gomoku-Request", { "x-gomoku-request": null }],
    ["with a foreign Origin", { origin: "https://evil.example" }],
  ])("answers 403 %s and sends nothing", async (_name, headers) => {
    const { user } = await register(true);

    const response = await requestReset(user.email, headers);

    expect(response.status).toBe(403);
    await expect(waitForMessages(outbox, user.email, 2, 500)).rejects.toThrow();
  });

  it("answers 429 after 10 requests from one address", async () => {
    const address = { "x-forwarded-for": nextAddress() };
    for (let i = 0; i < 10; i++) {
      expect((await requestReset(uniqueUser().email, address)).status).toBe(
        200,
      );
    }

    const response = await requestReset(uniqueUser().email, address);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect((await response.json()).error.code).toBe("RATE_LIMITED");
  });
});

describe("POST /api/auth/password-reset/confirm", () => {
  it("changes the password from the mailed link, kills sessions and rejects reuse", async () => {
    const { user, cookie } = await register(true);
    await requestReset(user.email);
    const token = await resetToken(user.email);
    const newPassword = "brand-new-pass1";

    const response = await confirmReset(token, newPassword);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: null });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect((await login(user.email, user.password)).status).toBe(401);
    const fresh = await login(user.email, newPassword);
    expect(fresh.status).toBe(200);
    // The earlier session is gone (the new login created exactly one).
    const sessions = await orm.em.fork().find(Session, {
      user: { email: user.email },
    });
    expect(sessions).toHaveLength(1);
    const stale = await fetch(`${baseUrl}/api/auth/password`, {
      method: "POST",
      headers: { ...apiHeaders, "x-forwarded-for": nextAddress(), cookie },
      body: JSON.stringify({}),
    });
    expect(stale.status).toBe(401);

    const again = await confirmReset(token, "another-pass-22");
    expect(again.status).toBe(400);
    expect((await again.json()).error.code).toBe("INVALID_TOKEN");
    expect((await login(user.email, newPassword)).status).toBe(200);
  });

  it("answers 400 INVALID_TOKEN for an unknown token", async () => {
    const response = await confirmReset("x".repeat(43), "brand-new-pass1");

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_TOKEN");
  });

  it("answers 400 VALIDATION with fieldErrors.newPassword and keeps the token usable", async () => {
    const { user } = await register(true);
    await requestReset(user.email);
    const token = await resetToken(user.email);

    const response = await confirmReset(token, "short");

    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error.code).toBe("VALIDATION");
    expect(error.fieldErrors.newPassword).toBeDefined();
    expect((await confirmReset(token, "brand-new-pass1")).status).toBe(200);
  });

  it.each([
    ["without X-Gomoku-Request", { "x-gomoku-request": null }],
    ["with a foreign Origin", { origin: "https://evil.example" }],
  ])("answers 403 %s", async (_name, headers) => {
    const response = await confirmReset(
      "x".repeat(43),
      "brand-new-pass1",
      headers,
    );

    expect(response.status).toBe(403);
  });

  it("answers 429 after 10 confirmations from one address", async () => {
    const address = { "x-forwarded-for": nextAddress() };
    for (let i = 0; i < 10; i++) {
      expect(
        (await confirmReset("x".repeat(43), "brand-new-pass1", address)).status,
      ).toBe(400);
    }

    const response = await confirmReset(
      "x".repeat(43),
      "brand-new-pass1",
      address,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });
});
