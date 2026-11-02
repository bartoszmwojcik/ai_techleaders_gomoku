// Installation administrator on the built app and a real PostgreSQL (E08-S01, #156, #157): the real
// `npm run admin:create` process (password from stdin; only the Testcontainers database), login with
// the created account, takeover of an account a stranger registered earlier (A-11: sessions die, old
// password stops working, e-mail confirmed), registration on ADMIN_EMAIL answered like a taken
// e-mail, deletion refused, password reset by mail (A-12) and the sweep that keeps the account.
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { runCleanup } from "../../packages/db/src/cleanup/run-cleanup";
import { ADMIN_EMAIL } from "./admin";
import { waitForMessages } from "./outbox";

const baseUrl = inject("baseUrl");
const outbox = inject("emailOutboxPath");
const repoRoot = resolve(import.meta.dirname, "../..");
const PASSWORD = "secret123";

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await orm.close();
});
const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

// The tests share one account (the administrator's), so each one starts without it.
beforeEach(async () => {
  await run(`delete from users where email = ?`, [ADMIN_EMAIL]);
});

let addressCounter = 0;
const nextAddress = () => `198.31.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
let userCounter = 0;

function call(path: string, body: unknown, cookie?: string, address = nextAddress()) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      "x-gomoku-request": "1",
      "x-forwarded-for": address,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const login = (email: string, password: string) => call("/api/auth/login", { email, password });

/** The real command against the test database; the password goes through stdin. */
async function adminCreate(password: string, args: string[]) {
  const child = promisify(execFile)(
    "npm",
    ["run", "-s", "admin:create", "--", ...args],
    {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: inject("databaseUrl"), ADMIN_EMAIL, PASSWORD_HASH_COST: "4" },
    },
  );
  child.child.stdin?.end(`${password}\n`);
  return child;
}

describe("npm run admin:create", () => {
  it("creates the confirmed account, the administrator logs in, and a repeat is a takeover", async () => {
    const created = await adminCreate("Pierwsze-haslo-1", ["--name", "Szef_E2E"]);
    expect(JSON.parse(created.stdout.trim())).toMatchObject({ ok: true, action: "created", revokedSessions: 0 });
    expect(created.stdout + created.stderr).not.toContain("Pierwsze-haslo-1");

    const [row] = await run(`select email_verified_at, display_name from users where email = ?`, [ADMIN_EMAIL]);
    expect(row!.email_verified_at).not.toBeNull();
    expect(row!.display_name).toBe("Szef_E2E");

    const first = await login(ADMIN_EMAIL, "Pierwsze-haslo-1");
    expect(first.status).toBe(200);
    const sessionCookie = cookieOf(first);

    // Idempotent: the second run rotates the password and revokes the session above.
    const again = await adminCreate("Drugie-haslo-22", ["--yes"]);
    expect(JSON.parse(again.stdout.trim())).toMatchObject({ action: "taken_over", revokedSessions: 1 });
    expect((await call("/api/auth/logout", {}, sessionCookie)).status).not.toBe(500);
    expect((await login(ADMIN_EMAIL, "Pierwsze-haslo-1")).status).toBe(401);
    expect((await login(ADMIN_EMAIL, "Drugie-haslo-22")).status).toBe(200);
  });

  it("takes over an account a stranger registered earlier (A-11)", async () => {
    await run(`delete from users where email = ?`, [ADMIN_EMAIL]);
    const n = `${Date.now().toString(36)}${++userCounter}`;
    // Registered before the deployment (the rule stops new registrations only).
    const [stranger] = await run(
      `insert into users (email, display_name, display_name_key, password_hash) values (?, ?, ?, ?) returning id`,
      [ADMIN_EMAIL, `Obcy_${n}`, `obcy${n}`, "x".repeat(60)],
    );
    const strangerPassword = await (async () => {
      const bcrypt = (await import("bcryptjs")).default;
      const hash = await bcrypt.hash(PASSWORD, 4);
      await run(`update users set password_hash = ? where id = ?`, [hash, stranger!.id]);
      return PASSWORD;
    })();
    const strangerLogin = await login(ADMIN_EMAIL, strangerPassword);
    expect(strangerLogin.status).toBe(200);
    const strangerCookie = cookieOf(strangerLogin);

    const result = await adminCreate("Wlasciciel-haslo-3", ["--yes"]);

    expect(JSON.parse(result.stdout.trim())).toMatchObject({ action: "taken_over", userId: stranger!.id, revokedSessions: 1 });
    const [row] = await run(`select email_verified_at, display_name from users where id = ?`, [stranger!.id]);
    expect(row!.email_verified_at).not.toBeNull();
    expect(row!.display_name).toBe(`Obcy_${n}`);
    expect((await call("/api/account/delete", { password: "x", confirm: true }, strangerCookie)).status).toBe(401);
    expect((await login(ADMIN_EMAIL, strangerPassword)).status).toBe(401);
    expect((await login(ADMIN_EMAIL, "Wlasciciel-haslo-3")).status).toBe(200);
  });

  it("fails without a name when it has to create and does not write anything", async () => {
    await expect(adminCreate("Pierwsze-haslo-1", [])).rejects.toMatchObject({ code: 1 });
    expect(await run(`select 1 from users where email = ?`, [ADMIN_EMAIL])).toHaveLength(0);
  });
});

describe("the administrator's account on the website", () => {
  it.each([ADMIN_EMAIL, ADMIN_EMAIL.toUpperCase(), `  ${ADMIN_EMAIL}  `])(
    "registration on %j answers like a taken e-mail and writes nothing (A-11)",
    async (email) => {
      const n = `${Date.now().toString(36)}${++userCounter}`;
      const taken = await call("/api/auth/register", {
        email: `zajety-${n}@example.com`,
        displayName: `Zaj_${n}`,
        password: PASSWORD,
      });
      expect(taken.status).toBe(201);
      const second = await call("/api/auth/register", { email: `zajety-${n}@example.com`, displayName: `Inna_${n}`, password: PASSWORD });

      const response = await call("/api/auth/register", { email, displayName: `Adm_${n}`, password: PASSWORD });

      expect(response.status).toBe(second.status);
      expect(await response.json()).toEqual(await second.json());
      expect(await run(`select 1 from users where email = ?`, [ADMIN_EMAIL])).toHaveLength(0);
    },
  );

  it("cannot be deleted (403) and recovers access through the password reset mail (A-12)", async () => {
    await adminCreate("Pierwsze-haslo-1", ["--name", "Szef_E2E"]);
    const cookie = cookieOf(await login(ADMIN_EMAIL, "Pierwsze-haslo-1"));

    const refused = await call("/api/account/delete", { password: "Pierwsze-haslo-1", confirm: true }, cookie);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ ok: false, error: { code: "ADMIN_ACCOUNT_PROTECTED" } });
    expect(await run(`select 1 from users where email = ?`, [ADMIN_EMAIL])).toHaveLength(1);

    expect((await call("/api/auth/password-reset/request", { email: ADMIN_EMAIL })).status).toBe(200);
    const message = (await waitForMessages(outbox, ADMIN_EMAIL, 1)).at(-1)!;
    const link = /https?:\/\/\S+\/reset-password\?\S+/.exec(message.text)![0];
    const token = new URL(link).searchParams.get("token");
    expect((await call("/api/auth/password-reset/confirm", { token, newPassword: "Nowe-haslo-4444" })).status).toBe(200);
    expect((await login(ADMIN_EMAIL, "Nowe-haslo-4444")).status).toBe(200);
  });

  it("is kept by the sweep of unconfirmed accounts while a stranger's is removed", async () => {
    const n = `${Date.now().toString(36)}${++userCounter}`;
    const old = `now() - interval '15 days'`;
    await run(
      `insert into users (email, display_name, display_name_key, password_hash, created_at) values (?, ?, ?, ?, ${old}), (?, ?, ?, ?, ${old})`,
      [ADMIN_EMAIL, `Adm_${n}`, `adm${n}`, "x".repeat(60), `sweep-${n}@example.com`, `Sw_${n}`, `sw${n}`, "x".repeat(60)],
    );

    const stdout = { write: () => true };
    const code = await runCleanup({
      // Only the Testcontainers database, never the one from the environment.
      createOrm: (overrides) => createOrm({ ...overrides, clientUrl: inject("databaseUrl") }),
      protectedEmail: ADMIN_EMAIL,
      stdout,
      stderr: stdout,
    });

    expect(code).toBe(0);
    expect(await run(`select 1 from users where email = ?`, [ADMIN_EMAIL])).toHaveLength(1);
    expect(await run(`select 1 from users where email = ?`, [`sweep-${n}@example.com`])).toHaveLength(0);
  });
});
