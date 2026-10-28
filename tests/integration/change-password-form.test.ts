import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const browser = new Browser(inject("browserSession"));

// Limits count per client address; every test gets its own, like a separate visitor.
let addressCounter = 0;
let userCounter = 0;
const uniqueUser = () => {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  return { email: `cp-${n}@example.com`, displayName: `Cp_${n}`, password: "secret123" };
};
const NEW_PASSWORD = "brand-new-pass1";

async function registerInBrowser(user: ReturnType<typeof uniqueUser>) {
  await browser.open(`${baseUrl}/register`);
  await browser.fill("#register-email", user.email);
  await browser.fill("#register-display-name", user.displayName);
  await browser.fill("#register-password", user.password);
  await browser.click("[data-testid=register-form] button[type=submit]");
  await browser.waitFor("[data-testid=signed-in-as]");
}

async function loginInBrowser(email: string, password: string) {
  await browser.open(`${baseUrl}/login`);
  await browser.fill("#login-email", email);
  await browser.fill("#login-password", password);
  await browser.click("[data-testid=login-form] button[type=submit]");
}

async function clickLogout() {
  await browser.evaluate(
    "[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Wyloguj').click()",
  );
}

beforeEach(async () => {
  await browser.setHeaders({ "x-forwarded-for": `198.51.100.${150 + ++addressCounter}` });
  await browser.clearCookies();
});

afterAll(async () => {
  await browser.setHeaders({});
  await browser.clearCookies();
});

describe("change password form on /account", () => {
  it("rejects a wrong current password at the field, changes the password and logs in with the new one", async () => {
    const user = uniqueUser();
    await registerInBrowser(user);
    await browser.open(`${baseUrl}/account`);
    await browser.waitFor("[data-testid=change-password-form]");
    expect(
      await browser.evaluate<boolean>(`document.body.textContent.includes('Inne urządzenia zostaną wylogowane, także w trakcie partii')`),
    ).toBe(true);

    await browser.fill("#change-current-password", "wrong-password");
    await browser.fill("#change-new-password", NEW_PASSWORD);
    await browser.click("[data-testid=change-password-form] button[type=submit]");
    await browser.waitForFn(`document.body.textContent.includes('Obecne hasło jest nieprawidłowe.')`);
    expect(await browser.count("[data-testid=change-password-success]")).toBe(0);
    expect(await browser.evaluate<string>("document.activeElement.id")).toBe("change-current-password");

    await browser.fill("#change-current-password", user.password);
    await browser.fill("#change-new-password", NEW_PASSWORD);
    await browser.click("[data-testid=change-password-form] button[type=submit]");
    await browser.waitFor("[data-testid=change-password-success]");
    expect(await browser.text("[data-testid=change-password-success]")).toContain("Hasło zmienione");
    expect(await browser.evaluate<string>("document.querySelector('#change-current-password').value")).toBe("");
    expect(await browser.evaluate<string>("document.querySelector('#change-new-password').value")).toBe("");

    // The current session survives the change.
    await browser.open(`${baseUrl}/account`);
    expect(await browser.text("[data-testid=account-email]")).toBe(user.email);

    await clickLogout();
    await browser.waitForFn(`location.pathname === '/' && !!document.querySelector("a[href='/login']")`);

    await loginInBrowser(user.email, user.password);
    await browser.waitFor("[data-testid=login-error]");
    expect(await browser.url()).toBe(`${baseUrl}/login`);

    await loginInBrowser(user.email, NEW_PASSWORD);
    await browser.waitFor("[data-testid=signed-in-as]");
  });

  it("sends a user whose session expired to sign-in and back to the account page", async () => {
    const user = uniqueUser();
    await registerInBrowser(user);
    await browser.open(`${baseUrl}/account`);
    await browser.waitFor("[data-testid=change-password-form]");

    await browser.clearCookies();
    await browser.fill("#change-current-password", user.password);
    await browser.fill("#change-new-password", NEW_PASSWORD);
    await browser.click("[data-testid=change-password-form] button[type=submit]");

    await browser.waitForFn(`location.pathname === '/login' && location.search === '?next=%2Faccount'`);
  });

  it("validates the form on the client without leaving the page", async () => {
    const user = uniqueUser();
    await registerInBrowser(user);
    await browser.open(`${baseUrl}/account`);
    await browser.waitFor("[data-testid=change-password-form]");
    await browser.click("[data-testid=change-password-form] button[type=submit]");
    await browser.waitForFn(`document.body.textContent.includes('Podaj obecne hasło.')`);
    expect(await browser.evaluate<string>("document.activeElement.id")).toBe("change-current-password");
  });

  it("fits a 360 px phone with touch-sized buttons", async () => {
    const user = uniqueUser();
    await registerInBrowser(user);
    await browser.setViewport(360, 800);
    try {
      await browser.open(`${baseUrl}/account`);
      await browser.waitFor("[data-testid=change-password-form]");
      expect(
        await browser.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
      ).toBe(true);
      expect(
        await browser.evaluate<boolean>(
          `[...document.querySelectorAll('[data-testid=change-password-form] button')].every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.height >= 44; })`,
        ),
      ).toBe(true);
    } finally {
      await browser.setViewport(1280, 720);
    }
  });
});
