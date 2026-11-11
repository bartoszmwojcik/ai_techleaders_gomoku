// Language of the player pages on the built app (E15-S01, #291): `?lang=` through the proxy (307 + cookie, the other
// parameters kept), the cookie, `Accept-Language`, Polish by default, the admin panel always Polish, and the language
// switch in the header of a real browser.
import { createOrm } from "@gomoku/db";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { ADMIN_EMAIL, adminCreate } from "./admin";
import { Browser } from "./browser";

const baseUrl = inject("baseUrl");

let addressCounter = 0;
const nextAddress = () => `198.42.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;

const get = (path: string, headers: Record<string, string> = {}) => fetch(`${baseUrl}${path}`, { headers, redirect: "manual" });
// Next sends a same-origin redirect of the proxy as a relative address; resolve it either way.
const location = (response: Response) => new URL(response.headers.get("location") ?? "", baseUrl).href;
const htmlLang = (html: string) => /<html lang="([^"]+)"/.exec(html)?.[1];
const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": nextAddress() },
    body: JSON.stringify(body),
  });
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

describe("?lang= on player pages", () => {
  it("stores the language and redirects 307 to the address without lang, keeping the other parameters", async () => {
    const response = await get("/?lang=fr&projektor=1");

    expect(response.status).toBe(307);
    expect(location(response)).toBe(`${baseUrl}/?projektor=1`);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^gomoku_lang=fr; Path=\/; /);
    expect(cookie).toContain("Max-Age=31536000");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toMatch(/SameSite=lax/i);

    const page = await (await get("/?projektor=1", { cookie: "gomoku_lang=fr" })).text();
    expect(htmlLang(page)).toBe("fr");
    expect(page).toContain('aria-label="Thème sombre"');
    expect(page).toContain('aria-label="Langue\u00a0: Français, changer de langue"');
    expect(page).toContain("plateau 15×15");
  });

  it("only drops an unsupported language", async () => {
    const response = await get("/lobby?lang=xx");

    expect(response.status).toBe(307);
    expect(location(response)).toBe(`${baseUrl}/lobby`);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("keeps a nested page and its parameters", async () => {
    const response = await get("/join?code=ABC&lang=en");

    expect(response.status).toBe(307);
    expect(location(response)).toBe(`${baseUrl}/join?code=ABC`);
    console.info(`[i18n] proxy Location header: ${response.headers.get("location")}`);
    expect(response.headers.get("set-cookie")).toMatch(/^gomoku_lang=en;/);
  });

  it("does not touch the API", async () => {
    const response = await get("/api/health?lang=fr");

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("language of a request", () => {
  it("is Polish without a cookie and a browser language", async () => {
    const page = await (await get("/")).text();

    expect(htmlLang(page)).toBe("pl");
    expect(page).toContain('aria-label="Ciemny motyw"');
    expect(page).toContain('aria-label="Język: Polski, zmień język"');
  });

  it("follows Accept-Language without a cookie", async () => {
    expect(htmlLang(await (await get("/", { "accept-language": "fr-CA,fr;q=0.9" })).text())).toBe("fr");
    expect(htmlLang(await (await get("/", { "accept-language": "zh-CN,*;q=0.5" })).text())).toBe("pl");
  });

  it("prefers the cookie and ignores a forged one", async () => {
    expect(htmlLang(await (await get("/", { cookie: "gomoku_lang=en", "accept-language": "fr" })).text())).toBe("en");
    expect(htmlLang(await (await get("/", { cookie: "gomoku_lang=../../x" })).text())).toBe("pl");
    expect(htmlLang(await (await get("/", { cookie: "gomoku_lang=PL", "accept-language": "de" })).text())).toBe("de");
  });

  it("names the account menu of a signed-in player in the language", async () => {
    const n = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    const input = { email: `i18n-${n}@example.com`, displayName: `I18n_${n}`.slice(0, 24), password: "secret123" };
    expect((await post("/api/auth/register", input)).status).toBe(201);
    const session = cookieOf(await post("/api/auth/login", { email: input.email, password: input.password }));

    const page = await (await get("/", { cookie: `${session}; gomoku_lang=fr` })).text();

    expect(page).toContain(`aria-label="Connecté en tant que ${input.displayName}, menu du compte"`);

    // In Polish the client components use their bundled default: no catalog is serialised into the page.
    const polish = await (await get("/", { cookie: session })).text();
    expect(polish).toContain(`aria-label="Zalogowano jako ${input.displayName}, menu konta"`);
    expect(polish).not.toContain("Trwa partia");
  });

  it("keeps the admin panel in Polish", async () => {
    const orm = await createOrm({ clientUrl: inject("databaseUrl") });
    await orm.em.fork().execute(`delete from users where email = ?`, [ADMIN_EMAIL]);
    await orm.close();
    await adminCreate("Admin-haslo-123", ["--name", "Szef_I18n"]);
    const login = await post("/api/auth/login", { email: ADMIN_EMAIL, password: "Admin-haslo-123" });
    expect(login.status).toBe(200);

    const panel = await get("/backend?lang=fr", { cookie: `${cookieOf(login)}; gomoku_lang=fr`, "accept-language": "fr" });

    expect(panel.status).toBe(200);
    expect(panel.headers.get("set-cookie")).toBeNull();
    expect(htmlLang(await panel.text())).toBe("pl");
  });
});

describe("language switch in the header", () => {
  const browser = new Browser(`${inject("browserSession")}-i18n`);
  const lang = () => browser.evaluate<string>("document.documentElement.lang");

  beforeAll(async () => {
    await browser.setViewport(1280, 800);
  });
  beforeEach(async () => {
    await browser.clearCookies();
  });
  afterAll(async () => {
    await browser.close();
  });

  it("switches the page to French, keeps a clean address and remembers the choice", async () => {
    await browser.open(`${baseUrl}/?projektor=1`);
    expect(await lang()).toBe("pl");

    await browser.click("[data-testid=language-switch]");
    await browser.waitFor("[data-testid=language-fr]");
    expect(await browser.evaluate<string[]>(`[...document.querySelectorAll("[role=menuitem]")].map((item) => item.textContent)`)).toEqual([
      "Polski",
      "English",
      "Français",
    ]);
    await browser.click("[data-testid=language-fr]");
    await browser.waitForFn(`document.documentElement.lang === "fr"`);

    expect(await browser.url()).toBe(`${baseUrl}/?projektor=1`);
    expect(await browser.evaluate<string>(`document.querySelector("[data-testid=theme-switch]").getAttribute("aria-label")`)).toMatch(/^Thème /);
    const cookie = (await browser.cookies()).find((each) => each.name === "gomoku_lang");
    expect(cookie).toMatchObject({ value: "fr", httpOnly: true, path: "/" });

    await browser.open(`${baseUrl}/lobby`);
    expect(await lang()).toBe("fr");
  });

  it("opens with the keyboard and fits a 320 px screen", async () => {
    await browser.setViewport(320, 640);
    await browser.open(`${baseUrl}/?lang=en`);
    expect(await lang()).toBe("en");

    expect(await browser.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
    await browser.evaluate(`document.querySelector("[data-testid=language-switch]").focus()`);
    await browser.press("Enter");
    await browser.waitFor("[data-testid=language-pl]");
    expect(await browser.evaluate<string | null>(`document.querySelector("[data-testid=language-en]").getAttribute("aria-current")`)).toBe("true");
    await browser.setViewport(1280, 800);
  });
});
