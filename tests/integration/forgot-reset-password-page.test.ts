// /forgot-password and /reset-password end to end in a browser: the link comes from the file
// outbox, and the whole flow works at the width of a phone.
import { User, createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";
import { resetLink, waitForMessages, waitForResetMessage } from "./outbox";

const baseUrl = inject("baseUrl");
const outbox = inject("emailOutboxPath");
const browser = new Browser(inject("browserSession"));
let orm: Orm;

// Limits count per client address; every test gets its own, like a separate visitor.
let addressCounter = 0;
let userCounter = 0;
const nextAddress = () => `100.70.0.${(++addressCounter % 250) + 1}`;
const uniqueUser = () => {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  return { email: `fr-${n}@example.com`, displayName: `Fr_${n}`, password: "secret123" };
};

const apiHeaders = {
  "content-type": "application/json",
  origin: baseUrl,
  "x-gomoku-request": "1",
};

/** Registers over HTTP; the e-mail is confirmed straight in the database when asked. */
async function createAccount(confirmed: boolean) {
  const user = uniqueUser();
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { ...apiHeaders, "x-forwarded-for": nextAddress() },
    body: JSON.stringify(user),
  });
  expect(response.status).toBe(201);
  if (confirmed) {
    await orm.em.fork().nativeUpdate(User, { email: user.email }, { emailVerifiedAt: new Date() });
  }
  // The verification mail goes out first; wait for it so later counts are exact.
  await waitForMessages(outbox, user.email);
  return user;
}

async function requestLinkInBrowser(email: string) {
  await browser.open(`${baseUrl}/forgot-password`);
  await browser.fill("#forgot-email", email);
  await browser.click("[data-testid=forgot-form] button[type=submit]");
  await browser.waitFor("[data-testid=forgot-sent]");
}

async function setNewPassword(password: string) {
  await browser.fill("#reset-new-password", password);
  await browser.click("[data-testid=reset-form] button[type=submit]");
}

async function loginStatus(email: string, password: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { ...apiHeaders, "x-forwarded-for": nextAddress() },
    body: JSON.stringify({ email, password }),
  });
  return response.status;
}

beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
beforeEach(async () => {
  await browser.setHeaders({ "x-forwarded-for": nextAddress() });
  await browser.clearCookies();
});
afterAll(async () => {
  await browser.setViewport(1280, 720);
  await browser.setHeaders({});
  await browser.clearCookies();
  await orm.close();
});

describe("forgot and reset password pages", () => {
  it("resets the password from the login page through the mailed link", async () => {
    const user = await createAccount(true);

    await browser.open(`${baseUrl}/login`);
    await browser.click("a[href='/forgot-password']");
    await browser.waitFor("[data-testid=forgot-form]");
    expect(await browser.url()).toBe(`${baseUrl}/forgot-password`);
    expect(await browser.text("h1")).toBe("Nie pamiętasz hasła?");

    await browser.fill("#forgot-email", user.email);
    await browser.click("[data-testid=forgot-form] button[type=submit]");
    await browser.waitFor("[data-testid=forgot-sent]");
    expect(await browser.text("[data-testid=forgot-sent]")).toContain(
      "Jeśli konto z tym adresem istnieje i adres jest potwierdzony, wysłaliśmy link (ważny 1 godzinę). Sprawdź też folder spam.",
    );

    const { link, token } = resetLink(await waitForResetMessage(outbox, user.email));
    await browser.open(link);
    expect(await browser.text("h1")).toBe("Ustaw nowe hasło");
    // Opening the link changes nothing.
    expect(await loginStatus(user.email, user.password)).toBe(200);
    expect(await browser.evaluate<string>("document.getElementById('reset-new-password').type")).toBe("password");

    await setNewPassword("short");
    await browser.waitFor("#reset-new-password-error");
    expect(await browser.evaluate<string>("document.activeElement.id")).toBe("reset-new-password");

    await setNewPassword("brand-new-pass1");
    await browser.waitFor("[data-testid=reset-done]");
    expect(await browser.text("[data-testid=reset-done]")).toContain("Hasło zmienione");
    expect(await browser.count("#reset-new-password")).toBe(0);

    expect(await loginStatus(user.email, user.password)).toBe(401);
    expect(await loginStatus(user.email, "brand-new-pass1")).toBe(200);

    // The page "Zaloguj się" leads to the login page, where the new password works.
    await browser.click("[data-testid=reset-done] a[href='/login']");
    await browser.waitFor("[data-testid=login-form]");
    await browser.fill("#login-email", user.email);
    await browser.fill("#login-password", "brand-new-pass1");
    await browser.click("[data-testid=login-form] button[type=submit]");
    await browser.waitFor("[data-testid=signed-in-as]");

    // The same link a second time: expired, with a way to ask again.
    await browser.clearCookies();
    await browser.open(`${baseUrl}/reset-password?token=${encodeURIComponent(token)}`);
    await setNewPassword("another-pass-22");
    await browser.waitFor("[data-testid=reset-invalid]");
    expect(await browser.text("[data-testid=reset-invalid]")).toContain("Link wygasł lub został już użyty");
    expect(await browser.count("[data-testid=reset-invalid] a[href='/forgot-password']")).toBe(1);
    expect(await loginStatus(user.email, "another-pass-22")).toBe(401);
    expect(await loginStatus(user.email, "brand-new-pass1")).toBe(200);
  });

  it("shows the same message and sends nothing for unconfirmed and unknown addresses", async () => {
    const unconfirmed = await createAccount(false);
    const unknown = uniqueUser().email;

    await requestLinkInBrowser(unconfirmed.email);
    const unconfirmedText = await browser.text("[data-testid=forgot-sent]");
    await requestLinkInBrowser(unknown);
    expect(await browser.text("[data-testid=forgot-sent]")).toBe(unconfirmedText);

    // Anything sent would be written right after the response.
    await new Promise((resolveWait) => setTimeout(resolveWait, 800));
    const mails = await waitForMessages(outbox, unconfirmed.email);
    expect(mails.filter((m) => /\/reset-password\?/.test(m.text))).toHaveLength(0);
    await expect(waitForMessages(outbox, unknown, 1, 300)).rejects.toThrow();
  });

  it("shows the broken-link state without a token and for a made-up one", async () => {
    await browser.open(`${baseUrl}/reset-password`);
    expect(await browser.text("[data-testid=reset-invalid]")).toContain("Ten link jest niepełny");
    expect(await browser.count("[data-testid=reset-form]")).toBe(0);

    await browser.open(`${baseUrl}/reset-password?token=made-up`);
    await setNewPassword("brand-new-pass1");
    await browser.waitFor("[data-testid=reset-invalid]");
    expect(await browser.text("[data-testid=reset-invalid]")).toContain("Link wygasł lub został już użyty");
  });

  it("sends a signed-in player from /forgot-password to the account page", async () => {
    const user = await createAccount(true);
    await browser.open(`${baseUrl}/login`);
    await browser.fill("#login-email", user.email);
    await browser.fill("#login-password", user.password);
    await browser.click("[data-testid=login-form] button[type=submit]");
    await browser.waitFor("[data-testid=signed-in-as]");

    await browser.open(`${baseUrl}/forgot-password`);
    expect(await browser.url()).toBe(`${baseUrl}/account`);
  });

  it("does not leak the token in Referer: /reset-password sends Referrer-Policy: no-referrer", async () => {
    const response = await fetch(`${baseUrl}/reset-password?token=abc`);
    expect(response.status).toBe(200);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("fits a 360 px phone without horizontal scrolling and with 44 px buttons", async () => {
    await browser.setViewport(360, 800);
    try {
      for (const [path, button] of [
        ["/forgot-password", "[data-testid=forgot-form] button[type=submit]"],
        ["/reset-password?token=abc", "[data-testid=reset-form] button[type=submit]"],
        ["/login", "[data-testid=login-form] button[type=submit]"],
      ] as const) {
        await browser.open(`${baseUrl}${path}`);
        expect(
          await browser.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
        ).toBe(true);
        expect(
          await browser.evaluate<boolean>(
            `(() => { const r = document.querySelector('${button}').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.height >= 44; })()`,
          ),
        ).toBe(true);
      }
      // Links are 44 px tall touch targets too.
      await browser.open(`${baseUrl}/forgot-password`);
      expect(
        await browser.evaluate<boolean>(
          "(() => { const r = document.querySelector('a[href=\"/login\"]').getBoundingClientRect(); return r.height >= 44; })()",
        ),
      ).toBe(true);
    } finally {
      await browser.setViewport(1280, 720);
    }
  });
});
