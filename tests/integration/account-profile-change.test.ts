import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";
import { waitForMessages } from "./outbox";

const baseUrl = inject("baseUrl");
const outbox = inject("emailOutboxPath");
const browser = new Browser(inject("browserSession"));

let addressCounter = 0;
const nextAddress = () => `198.18.${Math.floor(addressCounter / 250)}.${(++addressCounter % 250) + 1}`;
let userCounter = 0;
const uniqueUser = () => {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  return { email: `profile-${n}@example.com`, displayName: `Prof_${n}`, password: "secret123" };
};

type Body = { ok: boolean; error?: { code: string; fieldErrors?: Record<string, string[]> }; data?: unknown };

async function call(method: string, path: string, body: unknown, cookie?: string) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      "x-gomoku-request": "1",
      "x-forwarded-for": nextAddress(),
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

async function register() {
  const user = uniqueUser();
  const response = await call("POST", "/api/auth/register", user);
  expect(response.status).toBe(201);
  return { user, cookie: cookieOf(response) };
}

/** Starts an e-mail change and returns the link token from the message that arrived at the new address. */
async function requestChange(cookie: string, password: string, newEmail: string) {
  const response = await call("POST", "/api/auth/email-change", { newEmail, currentPassword: password }, cookie);
  expect(response.status).toBe(202);
  const [message] = await waitForMessages(outbox, newEmail);
  const token = /confirm-email-change\?token=([^\s&]+)/.exec(message!.text)![1]!;
  return decodeURIComponent(token);
}

beforeEach(async () => {
  await browser.setHeaders({ "x-forwarded-for": nextAddress() });
  await browser.clearCookies();
});
afterAll(async () => {
  await browser.setHeaders({});
  await browser.clearCookies();
});

describe("display name change API", () => {
  it("renames once per day, refuses a taken, reserved or current name", async () => {
    const { user, cookie } = await register();
    const other = await register();

    const taken = await call("PATCH", "/api/auth/display-name", { displayName: other.user.displayName.toUpperCase() }, cookie);
    expect(taken.status).toBe(409);
    expect(((await taken.json()) as Body).error?.fieldErrors?.displayName).toBeDefined();
    expect((await call("PATCH", "/api/auth/display-name", { displayName: "Agent" }, cookie)).status).toBe(400);
    expect((await call("PATCH", "/api/auth/display-name", { displayName: user.displayName }, cookie)).status).toBe(400);

    const renamed = `${user.displayName}x`.slice(0, 24);
    const ok = await call("PATCH", "/api/auth/display-name", { displayName: renamed }, cookie);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as Body).data).toEqual({ displayName: renamed });

    const again = await call("PATCH", "/api/auth/display-name", { displayName: `${user.displayName}y`.slice(0, 24) }, cookie);
    expect(again.status).toBe(429);
    expect(((await again.json()) as Body).error?.code).toBe("DISPLAY_NAME_COOLDOWN");
    expect(Number(again.headers.get("retry-after"))).toBeGreaterThan(23 * 3600);

    // The old name is free for someone else at once (Q6).
    const taker = await call("PATCH", "/api/auth/display-name", { displayName: user.displayName }, other.cookie);
    expect(taker.status).toBe(200);
  });

  it("answers 401 without a session", async () => {
    expect((await call("PATCH", "/api/auth/display-name", { displayName: "Nowa_7" })).status).toBe(401);
  });
});

describe("e-mail change API", () => {
  it("keeps the old address until the link is used, then switches, confirms and ends every session", async () => {
    const { user, cookie } = await register();
    const second = await call("POST", "/api/auth/login", { email: user.email, password: user.password });
    const secondCookie = cookieOf(second);
    const newEmail = `new-${user.email}`;

    const token = await requestChange(cookie, user.password, newEmail);
    // Nothing changed yet: the old address still logs in.
    expect((await call("POST", "/api/auth/login", { email: user.email, password: user.password })).status).toBe(200);
    expect((await call("POST", "/api/auth/login", { email: newEmail, password: user.password })).status).toBe(401);

    const confirmed = await call("POST", "/api/auth/email-change/confirm", { token });
    expect(confirmed.status).toBe(200);
    expect((await call("POST", "/api/auth/email-change/confirm", { token })).status).toBe(400);

    expect((await call("POST", "/api/auth/login", { email: newEmail, password: user.password })).status).toBe(200);
    expect((await call("POST", "/api/auth/login", { email: user.email, password: user.password })).status).toBe(401);
    // Both earlier sessions are gone (a login with a valid session cookie would be 409).
    for (const old of [cookie, secondCookie]) {
      expect((await call("POST", "/api/auth/login", { email: newEmail, password: user.password }, old)).status).toBe(200);
    }
    // The old address learns about it (the account was unconfirmed, so it does not: Q2).
    await expect(waitForMessages(outbox, user.email, 2, 400)).rejects.toThrow();
  });

  it("answers the same 202 for a taken address, sends nothing there, and refuses a wrong password", async () => {
    const { user, cookie } = await register();
    const other = await register();

    const wrong = await call("POST", "/api/auth/email-change", { newEmail: "x-" + user.email, currentPassword: "nope-nope" }, cookie);
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as Body).error?.code).toBe("INVALID_CURRENT_PASSWORD");

    const taken = await call("POST", "/api/auth/email-change", { newEmail: other.user.email, currentPassword: user.password }, cookie);
    expect(taken.status).toBe(202);
    expect(await taken.json()).toEqual({ ok: true, data: null });
    // The only message to the other account is its own registration mail, never a change link.
    const messages = await waitForMessages(outbox, other.user.email);
    expect(messages.some((m) => m.text.includes("confirm-email-change"))).toBe(false);

    expect((await call("POST", "/api/auth/email-change", { newEmail: user.email, currentPassword: user.password }, cookie)).status).toBe(400);
  });

  it("invalidates a pending link when the password changes, and a stale link says INVALID_TOKEN", async () => {
    const { user, cookie } = await register();
    const token = await requestChange(cookie, user.password, `pending-${user.email}`);

    const changed = await call("POST", "/api/auth/password", { currentPassword: user.password, newPassword: "brand-new-pass1" }, cookie);
    expect(changed.status).toBe(200);

    const response = await call("POST", "/api/auth/email-change/confirm", { token });
    expect(response.status).toBe(400);
    expect(((await response.json()) as Body).error?.code).toBe("INVALID_TOKEN");
  });

  it("a newer request replaces the older link", async () => {
    const { user, cookie } = await register();
    const first = await requestChange(cookie, user.password, `first-${user.email}`);
    const second = await requestChange(cookie, user.password, `second-${user.email}`);
    expect((await call("POST", "/api/auth/email-change/confirm", { token: first })).status).toBe(400);
    expect((await call("POST", "/api/auth/email-change/confirm", { token: second })).status).toBe(200);
  });
});

describe("account forms in the browser", () => {
  it("changes the name at 320 px and shows the lock, then confirms an e-mail change from the link", async () => {
    const { user } = await register();
    await browser.open(`${baseUrl}/login`);
    await browser.fill("#login-email", user.email);
    await browser.fill("#login-password", user.password);
    await browser.click("[data-testid=login-form] button[type=submit]");
    await browser.waitFor("[data-testid=signed-in-as]");

    await browser.setViewport(320, 900);
    await browser.open(`${baseUrl}/account`);
    await browser.waitFor("[data-testid=change-name-form]");
    const renamed = `${user.displayName}z`.slice(0, 24);
    await browser.fill("input[name=displayName]", renamed);
    await browser.click("[data-testid=change-name-form] button[type=submit]");
    await browser.waitFor("[data-testid=change-name-success]");
    await browser.waitFor("[data-testid=change-name-locked]");
    expect(await browser.text("[data-testid=account-name]")).toBe(renamed);
    expect(await browser.evaluate<boolean>("document.documentElement.scrollWidth <= document.documentElement.clientWidth")).toBe(true);

    const newEmail = `browser-${user.email}`;
    await browser.fill("#change-new-email", newEmail);
    await browser.fill("#change-email-password", user.password);
    await browser.click("[data-testid=change-email-form] button[type=submit]");
    await browser.waitFor("[data-testid=change-email-success]");

    const [message] = await waitForMessages(outbox, newEmail);
    const link = /https?:\/\/\S+\/confirm-email-change\?token=[^\s&]+/.exec(message!.text)![0];
    await browser.open(link.replace(/^https?:\/\/[^/]+/, baseUrl));
    expect(await browser.count("[data-testid=change-confirm-done]")).toBe(0);
    await browser.click("[data-testid=change-confirm-button]");
    await browser.waitFor("[data-testid=change-confirm-done]");
    // Every session ended, this one too: the bar drops the menu, and the result stays on the page.
    await expect.poll(() => browser.count("[data-testid=signed-in-as]"), { timeout: 10_000 }).toBe(0);
    expect(await browser.count("[data-testid=change-confirm-done]")).toBe(1);

    await browser.open(link.replace(/^https?:\/\/[^/]+/, baseUrl));
    await browser.click("[data-testid=change-confirm-button]");
    await browser.waitFor("[data-testid=change-confirm-invalid]");
  });
});
