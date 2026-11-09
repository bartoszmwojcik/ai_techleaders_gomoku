// Choice vs action on the home page (issue 273): the option groups are neutral segments (a tick, never the
// action colour), the main action is the large button and the two lower actions are equal buttons.
// Checked at the phone widths 320/360/390 px: nothing scrolls sideways, also with the paper game's four times.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const browser = new Browser(`${inject("browserSession")}-choice-action`);

let counter = 0;
const nextAddress = () => `198.54.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

beforeAll(async () => {
  await browser.clearCookies();
});
afterAll(async () => {
  await browser.setHeaders({});
  await browser.clearCookies();
  await browser.close();
});

const overflow = () =>
  browser.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth");
const box = (selector: string) =>
  browser.evaluate<{ w: number; h: number; left: number; top: number }>(
    `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), top: Math.round(r.top) }; })()`,
  );
const style = (selector: string, property: string) =>
  browser.evaluate<string>(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).${property}`);

describe("home page: choice versus action", () => {
  it("draws neutral segments, a large main action and two equal lower buttons without sideways scroll", async () => {
    await browser.setHeaders({ "x-forwarded-for": nextAddress() });
    const n = `${Date.now().toString(36)}${++counter}`;
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        "x-gomoku-request": "1",
        "x-forwarded-for": nextAddress(),
      },
      body: JSON.stringify({ email: `choice-${n}@example.com`, displayName: `Choice_${n}`, password: "secret123" }),
    });
    expect(response.status).toBe(201);
    const pair = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
    await browser.setCookie(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1), baseUrl);

    for (const width of [320, 360, 390]) {
      await browser.setViewport(width, 800);
      await browser.open(`${baseUrl}/`);
      await browser.waitFor("[data-testid=create-game]");

      // The checked segment: a tick, a strong border, and the action colour only on the main button.
      const checked = "[data-testid=settings-variant-classic]";
      expect(await browser.evaluate<string>(`document.querySelector(${JSON.stringify(checked)}).getAttribute('aria-checked')`)).toBe("true");
      expect(await browser.count(`${checked} svg`)).toBe(1);
      expect(await browser.count("[data-testid=settings-variant-paper] svg")).toBe(0);
      expect(await browser.evaluate<string>(`document.querySelector(${JSON.stringify(checked)}).className`)).not.toContain("action-primary");
      const action = await style("[data-testid=create-game]", "backgroundColor");
      expect(await style(checked, "backgroundColor")).not.toBe(action);
      expect(await style(checked, "borderTopWidth")).toBe("2px");

      // The main action is large (56 px) and spans the column; the two lower actions are equal buttons.
      const main = await box("[data-testid=create-game]");
      expect(main.h).toBeGreaterThanOrEqual(52);
      const lobby = await box('a[href="/lobby"]');
      const join = await box('a[href="/join"]');
      expect(Math.abs(lobby.w - join.w)).toBeLessThanOrEqual(1);
      expect(lobby.h).toBe(join.h);
      expect(lobby.top).toBe(join.top);
      expect(join.left).toBeGreaterThan(lobby.left);
      expect(await style('a[href="/join"]', "borderTopWidth")).toBe("1px");

      // Paper game: four times in joined rows, still inside the window.
      await browser.click("[data-testid=settings-variant-paper]");
      await browser.waitFor("[data-testid=settings-time-300000]");
      expect(await overflow()).toBe(false);
      await browser.click("[data-testid=settings-variant-classic]");

      await browser.open(`${baseUrl}/lobby`);
      await browser.waitFor("[data-testid=settings-variant]");
      expect(await overflow()).toBe(false);
    }
  });

  it("keeps the guest form inside the window too, with the create button large", async () => {
    await browser.clearCookies();
    for (const width of [320, 360, 390]) {
      await browser.setViewport(width, 800);
      await browser.open(`${baseUrl}/play`);
      await browser.waitFor("[data-testid=guest-create]");
      expect((await box("[data-testid=guest-create]")).h).toBeGreaterThanOrEqual(52);
      expect(await overflow()).toBe(false);
    }
  });
});
