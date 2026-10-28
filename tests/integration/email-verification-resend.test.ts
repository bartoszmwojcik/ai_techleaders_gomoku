// POST /api/auth/email-verification/resend and the "Wyślij nowy link" button on /verify-email,
// end to end: new messages land in the file outbox, the older link dies, Q4 limits answer 429.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from "vitest";
import { EmailVerificationToken, User, createOrm, type Orm } from "@gomoku/db";

import { Browser } from "./browser";
import { verificationLink, waitForMessages } from "./outbox";

const baseUrl = inject("baseUrl");
const outbox = inject("emailOutboxPath");
const browser = new Browser(inject("browserSession"));
let orm: Orm;

// 100.64.0.0/16 is used by no other test file. Every request gets its own client address
// unless the test is about the per-address limit.
let addressCounter = 0;
let userCounter = 0;
const nextAddress = () =>
  `100.64.${Math.floor(addressCounter / 250)}.${(++addressCounter % 250) + 1}`;
const uniqueUser = () => {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  return {
    email: `rs-${n}@example.com`,
    displayName: `Rs_${n}`,
    password: "secret123",
  };
};

const apiHeaders = {
  "content-type": "application/json",
  origin: baseUrl,
  "x-gomoku-request": "1",
};

async function register() {
  const user = uniqueUser();
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { ...apiHeaders, "x-forwarded-for": nextAddress() },
    body: JSON.stringify(user),
  });
  expect(response.status).toBe(201);
  const { data } = (await response.json()) as {
    data: { user: { id: string } };
  };
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const [first] = await waitForMessages(outbox, user.email);
  return { user, userId: data.user.id, cookie, ...verificationLink(first!) };
}

const resend = (
  cookie: string | null,
  headers: Record<string, string | null> = {},
) => {
  const merged: Record<string, string | null> = {
    ...apiHeaders,
    "x-forwarded-for": nextAddress(),
    ...(cookie ? { cookie } : {}),
    ...headers,
  };
  return fetch(`${baseUrl}/api/auth/email-verification/resend`, {
    method: "POST",
    headers: Object.fromEntries(
      Object.entries(merged).filter(
        (entry): entry is [string, string] => entry[1] !== null,
      ),
    ),
  });
};

const confirmApi = (token: string) =>
  fetch(`${baseUrl}/api/auth/email-verification/confirm`, {
    method: "POST",
    headers: apiHeaders,
    body: JSON.stringify({ token }),
  });

beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
beforeEach(async () => {
  await browser.setHeaders({ "x-forwarded-for": nextAddress() });
  await browser.clearCookies();
});
afterAll(async () => {
  await browser.setHeaders({});
  await browser.clearCookies();
  await orm.close();
});

describe("POST /api/auth/email-verification/resend", () => {
  it("mails a new link and kills the older one", async () => {
    const { user, userId, cookie, token: oldToken } = await register();

    const response = await resend(cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: null });

    const messages = await waitForMessages(outbox, user.email, 2);
    const newest = verificationLink(messages[1]!);
    expect(newest.token).not.toBe(oldToken);
    expect(
      await orm.em
        .fork()
        .count(EmailVerificationToken, { user: userId, usedAt: null }),
    ).toBe(1);
    expect((await confirmApi(oldToken)).status).toBe(400);
    expect((await confirmApi(newest.token)).status).toBe(200);
    expect(
      (await orm.em.fork().findOneOrFail(User, { id: userId })).emailVerifiedAt,
    ).toBeInstanceOf(Date);
  });

  it("answers 409 ALREADY_VERIFIED for a confirmed account and sends nothing", async () => {
    const { user, cookie, token } = await register();
    expect((await confirmApi(token)).status).toBe(200);

    const response = await resend(cookie);

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("ALREADY_VERIFIED");
    expect(await waitForMessages(outbox, user.email, 1)).toHaveLength(1);
  });

  it("answers 401 without a session", async () => {
    const response = await resend(null);

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a request without the CSRF headers with 403 and sends nothing", async () => {
    const { user, cookie } = await register();

    const bad: Record<string, string | null>[] = [
      { "x-gomoku-request": null },
      { origin: "https://evil.example" },
    ];
    for (const headers of bad) {
      const response = await resend(cookie, headers);
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
    }
    expect(await waitForMessages(outbox, user.email, 1)).toHaveLength(1);
  });

  it("allows 3 resends per account per hour, then 429 with Retry-After", async () => {
    const { user, cookie } = await register();

    for (let i = 0; i < 3; i++) expect((await resend(cookie)).status).toBe(200);
    const blocked = await resend(cookie);

    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(Number(blocked.headers.get("Retry-After"))).toBeLessThanOrEqual(
      3600,
    );
    // 1 from registration + 3 resends; the blocked one sent nothing.
    await waitForMessages(outbox, user.email, 4);
    await new Promise((r) => setTimeout(r, 300));
    expect(await waitForMessages(outbox, user.email, 4)).toHaveLength(4);
  });

  it("allows 10 resends per client address per hour, then 429 for any account", async () => {
    const address = nextAddress();
    for (let i = 0; i < 10; i++) {
      const { cookie } = await register();
      expect(
        (await resend(cookie, { "x-forwarded-for": address })).status,
      ).toBe(200);
    }

    const { cookie } = await register();
    const blocked = await resend(cookie, { "x-forwarded-for": address });

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    // Another address is not affected.
    expect((await resend(cookie)).status).toBe(200);
  });
});

describe("/verify-email: new link", () => {
  async function logIn(user: { email: string; password: string }) {
    await browser.open(`${baseUrl}/login`);
    await browser.fill("#login-email", user.email);
    await browser.fill("#login-password", user.password);
    await browser.click("[data-testid=login-form] button[type=submit]");
    await browser.waitFor("[data-testid=signed-in-as]");
  }

  it("a signed-in player with a dead link asks for a new one and confirms with it", async () => {
    const { user, cookie, link: deadLink } = await register();
    // A newer link replaced the first one.
    expect((await resend(cookie)).status).toBe(200);
    await logIn(user);

    await browser.open(deadLink);
    await browser.click("main button");
    await browser.waitFor("[data-testid=verify-invalid]");
    expect(
      await browser.count(
        "[data-testid=verify-invalid] a[href='/login?next=/account']",
      ),
    ).toBe(0);

    await browser.click("[data-testid=verify-invalid] button");
    await browser.waitFor("[data-testid=resend-feedback]");
    expect(await browser.text("[data-testid=resend-feedback]")).toContain(
      "Wysłano. Nowy link zastępuje poprzedni.",
    );
    expect(
      await browser.evaluate<string>("document.activeElement.dataset.testid"),
    ).toBe("resend-feedback");

    const messages = await waitForMessages(outbox, user.email, 3);
    await browser.open(verificationLink(messages[2]!).link);
    await browser.click("main button");
    await browser.waitFor("[data-testid=verify-done]");
    expect(await browser.text("[data-testid=verify-done]")).toContain(
      "Adres potwierdzony",
    );
  });

  it("shows the waiting time once the account limit is used up", async () => {
    const { user, cookie, link } = await register();
    await logIn(user);
    for (let i = 0; i < 3; i++) expect((await resend(cookie)).status).toBe(200);

    await browser.open(link);
    await browser.click("main button");
    await browser.waitFor("[data-testid=verify-invalid]");
    await browser.click("[data-testid=verify-invalid] button");
    await browser.waitFor("[data-testid=resend-feedback]");

    expect(await browser.text("[data-testid=resend-feedback]")).toMatch(
      /^Za wiele prób\. Spróbuj za \d+ min\.$/,
    );
    expect(
      await browser.evaluate<boolean>(
        "document.querySelector('[data-testid=verify-invalid] button').disabled",
      ),
    ).toBe(true);
  });

  it("a signed-out visitor gets a link to sign in instead of the button", async () => {
    await browser.open(`${baseUrl}/verify-email?token=not-a-real-token`);
    await browser.click("main button");
    await browser.waitFor("[data-testid=verify-invalid]");

    expect(await browser.count("[data-testid=verify-invalid] button")).toBe(0);
    expect(await browser.text("[data-testid=verify-invalid] a")).toBe(
      "Zaloguj się, aby wysłać nowy link",
    );
    expect(
      await browser.evaluate<string>(
        "document.querySelector('[data-testid=verify-invalid] a').getAttribute('href')",
      ),
    ).toBe("/login?next=/account");
  });
});
