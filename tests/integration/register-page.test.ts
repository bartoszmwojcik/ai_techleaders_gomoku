import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const browser = new Browser(inject("browserSession"));

// The rate limit counts attempts per client address (5 per hour). The browser sends no
// X-Forwarded-For, so every test gives its requests an own address, like a separate visitor.
let addressCounter = 0;

let userCounter = 0;
const uniqueUser = () => {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  return { email: `ui-${n}@example.com`, displayName: `Ui_${n}`, password: "secret123" };
};

async function fillForm({ email, displayName, password }: ReturnType<typeof uniqueUser>) {
  await browser.fill("#register-email", email);
  await browser.fill("#register-display-name", displayName);
  await browser.fill("#register-password", password);
}

async function submit() {
  await browser.click("[data-testid=register-form] button[type=submit]");
}

beforeEach(async () => {
  await browser.setHeaders({ "x-forwarded-for": `203.0.113.${++addressCounter}` });
  await browser.clearCookies();
});

afterAll(async () => {
  await browser.setHeaders({});
  await browser.clearCookies();
});

describe("registration page", () => {
  it("shows a guest the form and the registration link on the home page", async () => {
    await browser.open(`${baseUrl}/`);
    expect(await browser.text("main")).toContain("Załóż konto");
    expect(await browser.count("a[href='/register']")).toBe(1);

    await browser.open(`${baseUrl}/register`);
    expect(await browser.text("h1")).toBe("Załóż konto");
    expect(await browser.count("[data-testid=register-form]")).toBe(1);
    expect(await browser.text("[data-testid=register-form]")).toContain("Co najmniej 8 znaków");
  });

  it("registers, redirects to the home page and shows the player's name", async () => {
    const user = uniqueUser();
    await browser.open(`${baseUrl}/register`);

    await fillForm(user);
    await submit();

    await browser.waitFor("[data-testid=signed-in-as]");
    expect(await browser.url()).toBe(`${baseUrl}/`);
    expect(await browser.text("[data-testid=signed-in-as]")).toBe(`Zalogowano jako ${user.displayName}`);
    expect(await browser.count("a[href='/register']")).toBe(0);
  });

  it("redirects a signed-in player from /register to the home page", async () => {
    const user = uniqueUser();
    await browser.open(`${baseUrl}/register`);
    await fillForm(user);
    await submit();
    await browser.waitFor("[data-testid=signed-in-as]");

    await browser.open(`${baseUrl}/register?next=/invite/abc`);

    expect(await browser.url()).toBe(`${baseUrl}/`);
    expect(await browser.text("[data-testid=signed-in-as]")).toContain(user.displayName);
  });

  it("shows a taken display name at its field and keeps the other data", async () => {
    const taken = uniqueUser();
    await browser.open(`${baseUrl}/register`);
    await fillForm(taken);
    await submit();
    await browser.waitFor("[data-testid=signed-in-as]");
    await browser.clearCookies();

    const other = { ...uniqueUser(), displayName: taken.displayName.toUpperCase() };
    await browser.open(`${baseUrl}/register`);
    await fillForm(other);
    await submit();

    await browser.waitFor("#register-display-name-error");
    expect(await browser.text("#register-display-name-error")).toContain("zajęta");
    expect(await browser.url()).toBe(`${baseUrl}/register`);
    expect(await browser.count("[data-testid=register-error]")).toBe(0);
    expect(await browser.evaluate<string>("document.getElementById('register-email').value")).toBe(other.email);
    expect(await browser.evaluate<string>("document.getElementById('register-password').value")).toBe("");
    expect(await browser.evaluate<string>("document.activeElement.id")).toBe("register-display-name");
  });

  it("answers a taken e-mail with the uniform message and a login link, no field error", async () => {
    const taken = uniqueUser();
    await browser.open(`${baseUrl}/register`);
    await fillForm(taken);
    await submit();
    await browser.waitFor("[data-testid=signed-in-as]");
    await browser.clearCookies();

    await browser.open(`${baseUrl}/register`);
    await fillForm({ ...uniqueUser(), email: taken.email });
    await submit();

    await browser.waitFor("[data-testid=register-error]");
    expect(await browser.text("[data-testid=register-error]")).toContain("Jeśli masz już konto, zaloguj się.");
    expect(await browser.count("[data-testid=register-error] a[href='/login']")).toBe(1);
    expect(await browser.count("#register-email-error")).toBe(0);
    expect(await browser.count("#register-display-name-error")).toBe(0);
    expect(await browser.url()).toBe(`${baseUrl}/register`);
  });

  it("validates in the browser without a request and focuses the first invalid field", async () => {
    await browser.open(`${baseUrl}/register`);

    await fillForm({ email: "nie-email", displayName: "ab", password: "short" });
    await submit();

    await browser.waitFor("#register-email-error");
    expect(await browser.count("#register-display-name-error")).toBe(1);
    expect(await browser.count("#register-password-error")).toBe(1);
    expect(await browser.evaluate<string>("document.activeElement.id")).toBe("register-email");
    expect(await browser.url()).toBe(`${baseUrl}/register`);
  });

  it("follows a safe ?next= after registering and ignores an unsafe one", async () => {
    const user = uniqueUser();
    await browser.open(`${baseUrl}/register?next=/this-route-does-not-exist`);
    await fillForm(user);
    await submit();
    await browser.waitForFn("location.pathname === '/this-route-does-not-exist'");
    expect(await browser.url()).toBe(`${baseUrl}/this-route-does-not-exist`);

    await browser.clearCookies();
    await browser.open(`${baseUrl}/register?next=//evil.example.com`);
    await fillForm(uniqueUser());
    await submit();
    await browser.waitFor("[data-testid=signed-in-as]");
    expect(await browser.url()).toBe(`${baseUrl}/`);
  });

  it("fits a 360 px phone without horizontal scrolling", async () => {
    await browser.setViewport(360, 800);
    try {
      await browser.open(`${baseUrl}/register`);

      expect(
        await browser.evaluate<boolean>(
          "document.documentElement.scrollWidth <= window.innerWidth",
        ),
      ).toBe(true);
      expect(
        await browser.evaluate<boolean>(
          "(() => { const r = document.querySelector('[data-testid=register-form] button[type=submit]').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.height >= 44; })()",
        ),
      ).toBe(true);
    } finally {
      await browser.setViewport(1280, 720);
    }
  });
});
