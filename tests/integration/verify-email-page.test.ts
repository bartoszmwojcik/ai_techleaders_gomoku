// /verify-email and POST /api/auth/email-verification/confirm end to end: the link comes from
// the file outbox, opening it changes nothing, only the button confirms.
import { EmailVerificationToken, User, createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";
import { verificationLink, waitForMessages } from "./outbox";

const baseUrl = inject("baseUrl");
const outbox = inject("emailOutboxPath");
const browser = new Browser(inject("browserSession"));
let orm: Orm;

// Limits count per client address; every test gets its own, like a separate visitor.
let addressCounter = 0;
let userCounter = 0;
const nextAddress = () => `192.0.2.${(++addressCounter % 250) + 1}`;
const uniqueUser = () => {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  return { email: `vp-${n}@example.com`, displayName: `Vp_${n}`, password: "secret123" };
};

const apiHeaders = {
  "content-type": "application/json",
  origin: baseUrl,
  "x-gomoku-request": "1",
};

/** Registers over HTTP (no browser session) and returns the mailed link. */
async function register() {
  const user = uniqueUser();
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { ...apiHeaders, "x-forwarded-for": nextAddress() },
    body: JSON.stringify(user),
  });
  expect(response.status).toBe(201);
  const { data } = (await response.json()) as { data: { user: { id: string } } };
  const [message] = await waitForMessages(outbox, user.email);
  return { user, userId: data.user.id, ...verificationLink(message!) };
}

const confirmApi = (body: unknown, headers: Record<string, string> = apiHeaders) =>
  fetch(`${baseUrl}/api/auth/email-verification/confirm`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

const verifiedAt = async (userId: string) =>
  (await orm.em.fork().findOneOrFail(User, { id: userId })).emailVerifiedAt;

async function logIn(user: { email: string; password: string }) {
  await browser.open(`${baseUrl}/login`);
  await browser.fill("#login-email", user.email);
  await browser.fill("#login-password", user.password);
  await browser.click("[data-testid=login-form] button[type=submit]");
  await browser.waitFor("[data-testid=signed-in-as]");
}

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

describe("POST /api/auth/email-verification/confirm", () => {
  it("confirms without a session, echoes only a safe next path and rejects a reused token", async () => {
    const { userId, token } = await register();

    const response = await confirmApi({ token, next: "//evil.com" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { next: "/" } });
    expect(await verifiedAt(userId)).toBeInstanceOf(Date);
    // The call did not log anyone in.
    expect(response.headers.get("set-cookie")).toBeNull();

    const again = await confirmApi({ token });
    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({
      ok: false,
      error: { code: "INVALID_TOKEN", message: "Link wygasł lub został już użyty." },
    });
  });

  it("answers INVALID_TOKEN for an unknown token and VALIDATION for a wrong shape", async () => {
    const unknown = await confirmApi({ token: "definitely-not-a-token" });
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).error.code).toBe("INVALID_TOKEN");

    const shape = await confirmApi({ token: "" });
    expect(shape.status).toBe(400);
    expect((await shape.json()).error.code).toBe("VALIDATION");
  });

  it("rejects a request without the CSRF headers and leaves the token valid", async () => {
    const { userId, token } = await register();

    const bad: Record<string, string>[] = [
      { "content-type": "application/json" },
      { ...apiHeaders, origin: "https://evil.example" },
      { "content-type": "application/json", origin: baseUrl },
    ];
    for (const headers of bad) {
      const response = await confirmApi({ token }, headers);
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
    }
    expect(await verifiedAt(userId)).toBeNull();
    expect((await confirmApi({ token })).status).toBe(200);
  });

  it("rejects an expired token", async () => {
    const { userId, token } = await register();
    await orm.em
      .fork()
      .nativeUpdate(EmailVerificationToken, { user: userId }, { expiresAt: new Date(Date.now() - 1000) });

    expect((await confirmApi({ token })).status).toBe(400);
    expect(await verifiedAt(userId)).toBeNull();
  });
});

describe("/verify-email page", () => {
  it("sends Referrer-Policy: no-referrer", async () => {
    const response = await fetch(`${baseUrl}/verify-email?token=whatever`);
    expect(response.status).toBe(200);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("opening the link changes nothing; the button confirms once the player clicks", async () => {
    const { userId, link } = await register();

    await browser.open(link);
    expect(await browser.text("h1")).toBe("Potwierdź adres e-mail");
    expect(await browser.count("main button")).toBe(1);
    // Mail scanners and link previews only GET: the account and the token stay untouched.
    await fetch(link);
    expect(await verifiedAt(userId)).toBeNull();
    expect(
      await orm.em.fork().count(EmailVerificationToken, { user: userId, usedAt: null }),
    ).toBe(1);

    await browser.click("main button");
    await browser.waitFor("[data-testid=verify-done]");

    expect(await browser.text("[data-testid=verify-done]")).toContain("Adres potwierdzony");
    expect(await browser.evaluate<string>("document.activeElement.dataset.testid")).toBe("verify-done");
    expect(await verifiedAt(userId)).toBeInstanceOf(Date);
    // Not logged in by the link: the page offers logging in.
    expect(await browser.text("main")).toContain("Nie jesteś zalogowany na tym urządzeniu");
  });

  it("a signed-in player continues to next after confirming", async () => {
    const { user, userId, token } = await register();
    await logIn(user);
    const target = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}&next=${encodeURIComponent("/account")}`;

    await browser.open(target);
    await browser.click("main button");
    await browser.waitFor("[data-testid=verify-done]");
    await browser.click("[data-testid=verify-done] a");

    await browser.waitForFn("location.pathname === '/account'");
    expect(await verifiedAt(userId)).toBeInstanceOf(Date);
  });

  it("shows the uniform message for a used link, a wrong link and a missing token", async () => {
    const { link, token } = await register();
    await browser.open(link);
    // Used elsewhere between opening the page and clicking.
    expect((await confirmApi({ token })).status).toBe(200);
    await browser.click("main button");
    await browser.waitFor("[data-testid=verify-invalid]");
    expect(await browser.text("[data-testid=verify-invalid]")).toContain("Link wygasł lub został już użyty.");
    expect(await browser.evaluate<string>("document.activeElement.dataset.testid")).toBe("verify-invalid");

    await browser.open(`${baseUrl}/verify-email?token=not-a-real-token`);
    await browser.click("main button");
    await browser.waitFor("[data-testid=verify-invalid]");

    await browser.open(`${baseUrl}/verify-email`);
    expect(await browser.text("[data-testid=verify-invalid]")).toContain("Link wygasł lub został już użyty.");
    expect(await browser.count("main button")).toBe(0);
  });

  it("tells a signed-in player with a confirmed account that the address is confirmed", async () => {
    const { user, token } = await register();
    expect((await confirmApi({ token })).status).toBe(200);
    await logIn(user);

    await browser.open(`${baseUrl}/verify-email`);

    expect(await browser.text("main")).toContain("Adres jest już potwierdzony.");
    expect(await browser.count("[data-testid=verify-invalid] a[href='/']")).toBe(1);
  });

  it("fits a 360 px phone without horizontal scrolling and with 44 px targets", async () => {
    const { link } = await register();
    await browser.setViewport(360, 800);
    try {
      await browser.open(link);
      expect(
        await browser.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
      ).toBe(true);
      expect(
        await browser.evaluate<boolean>(
          "(() => { const r = document.querySelector('main button').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.height >= 44; })()",
        ),
      ).toBe(true);
      await browser.click("main button");
      await browser.waitFor("[data-testid=verify-done]");
      expect(
        await browser.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
      ).toBe(true);
    } finally {
      await browser.setViewport(1280, 720);
    }
  });
});
