// The "Potwierdź adres e-mail" banner on / and /account: shown for an unconfirmed address, resend,
// closing (remembered in the browser), disappearing after the confirmation, and the 360 px layout.
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";
import { verificationLink, waitForMessages } from "./outbox";

const baseUrl = inject("baseUrl");
const outbox = inject("emailOutboxPath");
const browser = new Browser(inject("browserSession"));

// 100.66.0.0/16 is used by no other test file; every test gets its own client address.
let addressCounter = 0;
let userCounter = 0;
const nextAddress = () =>
  `100.66.${Math.floor(addressCounter / 250)}.${(++addressCounter % 250) + 1}`;
const uniqueUser = () => {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  return { email: `vb-${n}@example.com`, displayName: `Vb_${n}`, password: "secret123" };
};

const apiHeaders = { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1" };

/** HTML of a page as the server sends it (before any script runs) for a freshly registered account. */
async function serverHtmlFor(paths: string[]) {
  const user = uniqueUser();
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { ...apiHeaders, "x-forwarded-for": nextAddress() },
    body: JSON.stringify(user),
  });
  expect(response.status).toBe(201);
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  return Promise.all(
    paths.map(async (path) => (await fetch(`${baseUrl}${path}`, { headers: { cookie } })).text()),
  );
}

const BANNER = "[data-testid=verify-email-banner]";

async function registerInBrowser(user: ReturnType<typeof uniqueUser>) {
  await browser.open(`${baseUrl}/register`);
  await browser.fill("#register-email", user.email);
  await browser.fill("#register-display-name", user.displayName);
  await browser.fill("#register-password", user.password);
  await browser.click("[data-testid=register-form] button[type=submit]");
  await browser.waitFor("[data-testid=signed-in-as]");
}

const clickBannerButton = (label: string) =>
  browser.evaluate(
    `[...document.querySelectorAll('${BANNER} button')].find((b) => b.textContent.trim() === '${label}').click()`,
  );

beforeEach(async () => {
  await browser.setHeaders({ "x-forwarded-for": nextAddress() });
  await browser.clearCookies();
  await browser.setViewport(1280, 720);
});

afterAll(async () => {
  await browser.setHeaders({});
  await browser.clearCookies();
  await browser.setViewport(1280, 720);
});

describe("verify email banner", () => {
  it("shows on / and /account, resends, closes for good and disappears after the confirmation", async () => {
    const user = uniqueUser();
    await registerInBrowser(user);
    const [first] = await waitForMessages(outbox, user.email);

    // On the home page, right after registering.
    await browser.waitFor(BANNER);
    const text = await browser.text(BANNER);
    expect(text).toContain("Potwierdź adres e-mail");
    expect(text).toContain("Bez potwierdzonego adresu nie odzyskasz konta, jeśli zapomnisz hasła.");
    expect(text).toContain(user.email);
    // It blocks nothing: the page actions stay usable.
    expect(await browser.count("a[href='/account']")).toBe(1);

    // On the account page, with the status mark.
    await browser.open(`${baseUrl}/account`);
    await browser.waitFor(BANNER);
    expect(await browser.text("main")).toContain("Niepotwierdzony");

    // Resend: a new message lands in the mailbox.
    await clickBannerButton("Wyślij ponownie");
    await browser.waitForFn(`!!document.querySelector("${BANNER} p[role=status]")`);
    expect(await browser.text(`${BANNER} p[role=status]`)).toBe("Wysłano. Nowy link zastępuje poprzedni.");
    expect(
      await browser.evaluate<boolean>(`document.activeElement === document.querySelector("${BANNER} p[role=status]")`),
    ).toBe(true);
    const messages = await waitForMessages(outbox, user.email, 2);
    expect(verificationLink(messages[1]!).token).not.toBe(verificationLink(first!).token);

    // Closing is remembered: after a refresh and on the other page the banner stays away.
    await clickBannerButton("Zamknij");
    expect(await browser.count(BANNER)).toBe(0);
    await browser.open(`${baseUrl}/account`);
    await browser.waitFor("[data-testid=account-email]");
    await new Promise((r) => setTimeout(r, 500));
    expect(await browser.count(BANNER)).toBe(0);
    await browser.open(`${baseUrl}/`);
    await browser.waitFor("[data-testid=signed-in-as]");
    await new Promise((r) => setTimeout(r, 500));
    expect(await browser.count(BANNER)).toBe(0);

    // The server sends the banner open; a closed one is hidden only after hydration.
    await browser.open(`${baseUrl}/`);
    await browser.waitForFn(`document.querySelector("${BANNER}") === null`);

    // A closing older than 7 days no longer counts: the banner is back.
    await browser.evaluate(
      `Object.keys(localStorage).forEach((k) => { if (k.startsWith('gomoku:verify-email-banner-closed:')) localStorage.setItem(k, String(Date.now() - 8 * 24 * 3600 * 1000)); })`,
    );
    await browser.open(`${baseUrl}/`);
    await browser.waitFor(BANNER);

    // Confirmation with the link from the mailbox: no banner, status "Potwierdzony".
    await browser.open(verificationLink(messages[1]!).link);
    await browser.click("main button");
    await browser.waitFor("[data-testid=verify-done]");
    await browser.open(`${baseUrl}/account`);
    await browser.waitFor("[data-testid=account-email]");
    await new Promise((r) => setTimeout(r, 500));
    expect(await browser.count(BANNER)).toBe(0);
    expect(await browser.text("main")).toContain("Potwierdzony");
    expect(await browser.text("main")).not.toContain("Niepotwierdzony");
    await browser.open(`${baseUrl}/`);
    await browser.waitFor("[data-testid=signed-in-as]");
    await new Promise((r) => setTimeout(r, 500));
    expect(await browser.count(BANNER)).toBe(0);
  });

  it("is in the HTML sent by the server on / and /account, so the page has nothing to shift", async () => {
    const [home, account] = await serverHtmlFor(["/", "/account"]);
    for (const html of [home!, account!]) {
      expect(html).toContain("data-testid=\"verify-email-banner\"");
      expect(html).toContain("Potwierdź adres e-mail");
    }
  });

  it("does not shift the layout while hydrating when the banner stays", async () => {
    const user = uniqueUser();
    await registerInBrowser(user);
    for (const path of ["/", "/account"]) {
      await browser.open(`${baseUrl}${path}`);
      await browser.waitFor(BANNER);
      const shift = await browser.evaluate<number>(
        `new Promise((resolve) => { let total = 0; new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) total += e.value; resolve(total); }).observe({ type: 'layout-shift', buffered: true }); setTimeout(() => resolve(total), 300); })`,
      );
      expect(shift).toBe(0);
    }
  });

  it("shows the banner when the browser storage cannot be read", async () => {
    const user = uniqueUser();
    await registerInBrowser(user);
    await browser.waitFor(BANNER);
    await browser.evaluate(
      `Storage.prototype.getItem = () => { throw new Error('denied'); }; window.dispatchEvent(new Event('storage')); 0`,
    );
    expect(await browser.count(BANNER)).toBe(1);
  });

  it("fits a 360 px screen with touch-sized buttons on / and /account", async () => {
    const user = uniqueUser();
    await registerInBrowser(user);
    await browser.setViewport(360, 800);

    for (const path of ["/", "/account"]) {
      await browser.open(`${baseUrl}${path}`);
      await browser.waitFor(BANNER);
      expect(
        await browser.evaluate<boolean>(
          "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
        ),
      ).toBe(true);
      const heights = await browser.evaluate<number[]>(
        `[...document.querySelectorAll('${BANNER} button')].map((b) => b.getBoundingClientRect().height)`,
      );
      expect(heights).toHaveLength(2);
      for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
    }
  });
});
