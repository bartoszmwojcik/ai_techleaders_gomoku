// The admin panel on the built app and a real PostgreSQL (E08-S02, #158): 404 for everybody but the
// installation administrator - indistinguishable from a page that does not exist -, the counters and the
// list of accounts for the administrator (search, sort, paging), no caching, no e-mail on player pages.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { ADMIN_EMAIL, adminCreate } from "./admin";

const baseUrl = inject("baseUrl");
const PASSWORD = "secret123";
const ADMIN_PASSWORD = "Admin-haslo-123";

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await orm.close();
});
const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

let addressCounter = 0;
const nextAddress = () => `198.41.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
let userCounter = 0;

const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": nextAddress() },
    body: JSON.stringify(body),
  });
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const login = async (email: string, password: string) => {
  const response = await post("/api/auth/login", { email, password });
  expect(response.status).toBe(200);
  return cookieOf(response);
};
const get = (path: string, cookie?: string) => fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });

async function signUp(prefix: string) {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  const input = { email: `${prefix}-${n}@example.com`, displayName: `${prefix}_${n}`.slice(0, 24), password: PASSWORD };
  expect((await post("/api/auth/register", input)).status).toBe(201);
  return { ...input, cookie: await login(input.email, PASSWORD) };
}

beforeEach(async () => {
  await run(`delete from users where email = ?`, [ADMIN_EMAIL]);
});

describe("GET /backend", () => {
  it("is a plain 404 for an anonymous visitor and for a player without the role, like a missing page", async () => {
    const missing = await get("/this-route-does-not-exist");
    const player = await signUp("panel-gracz");

    for (const cookie of [undefined, player.cookie, "gomoku_session=not-a-session"]) {
      for (const path of ["/backend", "/backend?page=2&q=a", "/backend/anything"]) {
        const response = await get(path, cookie);
        const body = await response.text();

        expect(response.status).toBe(404);
        expect(response.headers.get("location")).toBeNull();
        expect(body).not.toContain("Panel administracyjny");
        expect(body).not.toContain(player.email);
      }
    }
    // The same status and, apart from the document, nothing that tells the panel apart.
    expect((await get("/backend")).status).toBe(missing.status);
  });

  it("is 404 for the administrator's account with an unconfirmed e-mail", async () => {
    await adminCreate(ADMIN_PASSWORD, ["--name", "Szef_Panel"]);
    const cookie = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect((await get("/backend", cookie)).status).toBe(200);

    await run(`update users set email_verified_at = null where email = ?`, [ADMIN_EMAIL]);

    expect((await get("/backend", cookie)).status).toBe(404);
  });

  it("is 404 after a takeover has revoked the session", async () => {
    await adminCreate(ADMIN_PASSWORD, ["--name", "Szef_Panel"]);
    const cookie = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect((await get("/backend", cookie)).status).toBe(200);

    await adminCreate("Nowe-haslo-9999", ["--yes"]);

    expect((await get("/backend", cookie)).status).toBe(404);
  });

  it("shows the administrator the counters and the accounts, uncached", async () => {
    const player = await signUp("panel-lista");
    await run(`insert into users (email, display_name, display_name_key, password_hash) values (?, ?, ?, ?)`, [
      `niepotwierdzony-${Date.now()}@example.com`,
      "Niepotw_1",
      "niepotw1",
      "x".repeat(60),
    ]);
    await adminCreate(ADMIN_PASSWORD, ["--name", "Szef_Panel"]);
    const cookie = await login(ADMIN_EMAIL, ADMIN_PASSWORD);

    const response = await get("/backend", cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control") ?? "").toMatch(/no-store|no-cache/);
    expect(html).toContain("Panel administracyjny");
    expect(html).toContain("Partie w bazie teraz");
    expect(html).toContain("Zakończone wg pary typów");
    expect(html).toContain("konto – gość");
    expect(html).toContain("Konta graczy");
    expect(html).toContain(player.email);
    expect(html).toContain("Niepotw_1");
    expect(html).toMatch(/Administrator<\/span>/);
  });

  it("searches by player name, sorts and pages", async () => {
    const tag = `Szuk${Date.now().toString(36)}`.slice(0, 12);
    for (let index = 0; index < 27; index += 1) {
      const name = `${tag}_${String(index).padStart(2, "0")}`;
      await run(`insert into users (email, display_name, display_name_key, password_hash, email_verified_at) values (?, ?, ?, ?, now())`, [
        `${name.toLowerCase()}@example.com`,
        name,
        name.toLowerCase().replace(/[_-]/g, ""),
        "x".repeat(60),
      ]);
    }
    await adminCreate(ADMIN_PASSWORD, ["--name", "Szef_Panel"]);
    const cookie = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    const q = encodeURIComponent(tag);

    const first = await (await get(`/backend?q=${q}&sort=name`, cookie)).text();
    const second = await (await get(`/backend?q=${q}&sort=name&page=2`, cookie)).text();
    const beyond = await (await get(`/backend?q=${q}&sort=name&page=99`, cookie)).text();
    const descending = await (await get(`/backend?q=${q}&sort=name&dir=desc`, cookie)).text();
    const garbage = await get(`/backend?page=-1&sort=email&dir=up&q=%00%25`, cookie);

    expect(first).toContain("Strona 1 z 2 (27 kont)");
    expect(first).toContain(`${tag}_00`);
    expect(first).not.toContain(`${tag}_26`);
    expect(second).toContain("Strona 2 z 2");
    expect(second).toContain(`${tag}_26`);
    expect(beyond).toContain("Strona 2 z 2");
    expect(descending.indexOf(`${tag}_26`)).toBeLessThan(descending.indexOf(`${tag}_25`));
    expect(garbage.status).toBe(200);
    expect(await (await get(`/backend?q=nikt-takiego-${Date.now().toString(36)}`, cookie)).text()).toContain(
      "Brak kont pasujących do wyszukiwania.",
    );
  });

  it("does not let a player see another player's e-mail anywhere on the player pages", async () => {
    const other = await signUp("cudzy");
    const player = await signUp("widz");

    for (const path of ["/", "/history", "/account", "/lobby"]) {
      const html = await (await get(path, player.cookie)).text();
      expect(html).not.toContain(other.email);
    }
  });
});
