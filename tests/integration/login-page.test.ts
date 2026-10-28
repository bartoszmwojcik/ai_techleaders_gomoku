import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const browser = new Browser(inject("browserSession"));

// Limits count per client address; every test gets its own, like a separate visitor.
let addressCounter = 0;
let userCounter = 0;
const uniqueUser = () => {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  return { email: `lp-${n}@example.com`, displayName: `Lp_${n}`, password: "secret123" };
};

async function registerInBrowser(user: ReturnType<typeof uniqueUser>) {
  await browser.open(`${baseUrl}/register`);
  await browser.fill("#register-email", user.email);
  await browser.fill("#register-display-name", user.displayName);
  await browser.fill("#register-password", user.password);
  await browser.click("[data-testid=register-form] button[type=submit]");
  await browser.waitFor("[data-testid=signed-in-as]");
}

async function logIn(email: string, password: string) {
  await browser.fill("#login-email", email);
  await browser.fill("#login-password", password);
  await browser.click("[data-testid=login-form] button[type=submit]");
}

beforeEach(async () => {
  await browser.setHeaders({ "x-forwarded-for": `198.51.100.${++addressCounter}` });
  await browser.clearCookies();
});

afterAll(async () => {
  await browser.setHeaders({});
  await browser.clearCookies();
});

describe("login page", () => {
  it("offers the login link on the home page and shows the form", async () => {
    await browser.open(`${baseUrl}/`);
    expect(await browser.count("a[href='/login']")).toBe(1);

    await browser.open(`${baseUrl}/login`);
    expect(await browser.text("h1")).toBe("Zaloguj się");
    expect(await browser.count("[data-testid=login-form]")).toBe(1);
    expect(await browser.evaluate<string>("document.getElementById('login-password').type")).toBe("password");
    await browser.click("[data-testid=login-form] button[type=button]");
    expect(await browser.evaluate<string>("document.getElementById('login-password').type")).toBe("text");
  });

  it("logs in a registered player in a fresh browser context and follows ?next=", async () => {
    const user = uniqueUser();
    await registerInBrowser(user);
    await browser.clearCookies();

    await browser.open(`${baseUrl}/login?next=/`);
    await logIn(user.email, user.password);

    await browser.waitFor("[data-testid=signed-in-as]");
    expect(await browser.url()).toBe(`${baseUrl}/`);
    expect(await browser.text("[data-testid=signed-in-as]")).toBe(`Zalogowano jako ${user.displayName}`);

    // A signed-in player is sent away from /login.
    await browser.open(`${baseUrl}/login`);
    expect(await browser.url()).toBe(`${baseUrl}/`);
  });

  it("shows one general error for a wrong password and focuses the password field", async () => {
    const user = uniqueUser();
    await registerInBrowser(user);
    await browser.clearCookies();

    await browser.open(`${baseUrl}/login`);
    await logIn(user.email, "wrong-password");

    await browser.waitFor("[data-testid=login-error]");
    expect(await browser.text("[data-testid=login-error]")).toContain("Nieprawidłowy e-mail lub hasło");
    expect(await browser.url()).toBe(`${baseUrl}/login`);
    expect(await browser.count("#login-email-error")).toBe(0);
    expect(await browser.count("#login-password-error")).toBe(0);
    expect(await browser.evaluate<string>("document.activeElement.id")).toBe("login-password");
    expect(await browser.evaluate<string>("document.getElementById('login-email').value")).toBe(user.email);
    expect(await browser.evaluate<string>("document.getElementById('login-password').value")).toBe("");

    // An unknown e-mail gets the very same message.
    await logIn(`nobody-${user.email}`, "wrong-password");
    await browser.waitForFn("document.querySelector('[data-testid=login-error]')?.textContent.includes('Nieprawidłowy')");
  });

  it("fits a 360 px phone without horizontal scrolling", async () => {
    await browser.setViewport(360, 800);
    try {
      await browser.open(`${baseUrl}/login`);
      expect(
        await browser.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
      ).toBe(true);
      expect(
        await browser.evaluate<boolean>(
          "(() => { const r = document.querySelector('[data-testid=login-form] button[type=submit]').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.height >= 44; })()",
        ),
      ).toBe(true);
    } finally {
      await browser.setViewport(1280, 720);
    }
  });
});
