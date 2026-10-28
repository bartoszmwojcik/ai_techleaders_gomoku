import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const browser = new Browser(inject("browserSession"));

// Limits count per client address; every test gets its own, like a separate visitor.
let addressCounter = 0;
let userCounter = 0;
const uniqueUser = () => {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  return { email: `ap-${n}@example.com`, displayName: `Ap_${n}`, password: "secret123" };
};

async function registerInBrowser(user: ReturnType<typeof uniqueUser>) {
  await browser.open(`${baseUrl}/register`);
  await browser.fill("#register-email", user.email);
  await browser.fill("#register-display-name", user.displayName);
  await browser.fill("#register-password", user.password);
  await browser.click("[data-testid=register-form] button[type=submit]");
  await browser.waitFor("[data-testid=signed-in-as]");
}

async function clickLogout() {
  await browser.evaluate(
    "[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Wyloguj').click()",
  );
}

beforeEach(async () => {
  await browser.setHeaders({ "x-forwarded-for": `198.51.100.${100 + ++addressCounter}` });
  await browser.clearCookies();
});

afterAll(async () => {
  await browser.setHeaders({});
  await browser.clearCookies();
});

describe("account page", () => {
  it("sends a guest to the login page, returns to /account after login and logs out", async () => {
    const user = uniqueUser();
    await registerInBrowser(user);
    await browser.clearCookies();

    await browser.open(`${baseUrl}/account`);
    expect(await browser.url()).toBe(`${baseUrl}/login?next=%2Faccount`);

    await browser.fill("#login-email", user.email);
    await browser.fill("#login-password", user.password);
    await browser.click("[data-testid=login-form] button[type=submit]");
    await browser.waitFor("[data-testid=account-name]");
    expect(await browser.url()).toBe(`${baseUrl}/account`);
    expect(await browser.text("h1")).toBe("Konto");
    expect(await browser.text("[data-testid=account-name]")).toBe(user.displayName);
    expect(await browser.text("[data-testid=account-email]")).toBe(user.email);
    // Nobody has a running game yet: no confirmation, just the button.
    expect(await browser.evaluate<boolean>(`document.body.textContent.includes('Trwa partia')`)).toBe(false);

    await clickLogout();
    await browser.waitForFn(`location.pathname === '/' && !!document.querySelector("a[href='/login']")`);
    expect(await browser.url()).toBe(`${baseUrl}/`);

    await browser.open(`${baseUrl}/account`);
    expect(await browser.url()).toBe(`${baseUrl}/login?next=%2Faccount`);
  });

  it("offers the account link and logout on the home page of a signed-in player", async () => {
    const user = uniqueUser();
    await registerInBrowser(user);

    expect(await browser.count("a[href='/account']")).toBe(1);
    expect(await browser.count("a[href='/login']")).toBe(0);

    await clickLogout();
    await browser.waitFor("a[href='/register']");
    expect(await browser.count("[data-testid=signed-in-as]")).toBe(0);

    // The session is really gone, not just hidden.
    await browser.open(`${baseUrl}/account`);
    expect(await browser.url()).toBe(`${baseUrl}/login?next=%2Faccount`);
  });

  it("fits a 360 px phone on / and /account without horizontal scrolling", async () => {
    const user = uniqueUser();
    await registerInBrowser(user);
    await browser.setViewport(360, 800);
    try {
      for (const path of ["/", "/account"]) {
        await browser.open(`${baseUrl}${path}`);
        expect(
          await browser.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
        ).toBe(true);
        expect(
          await browser.evaluate<boolean>(
            `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Wyloguj').getBoundingClientRect(); return b.left >= 0 && b.right <= window.innerWidth && b.height >= 44; })()`,
          ),
        ).toBe(true);
      }
    } finally {
      await browser.setViewport(1280, 720);
    }
  });
});
