// The administrator's show on the built app and a real PostgreSQL (E14-S01, #280; spec 2026-11-09-show-mode, phase a):
// the 404 for everybody else on every page and route, creating a bot vs bot show, one show at a time (also for two
// concurrent creations), ending it, the counters left untouched, a show's code refused in the browser path and
// `?lang=` with `?projektor=1`. `SHOW_ENABLED`, `SHOW_BOT_VS_BOT_ENABLED` and `BOT_ENABLED` are on in global-setup.ts.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { InvitationCodes } from "../../packages/app/src/server/services/games/invitation-codes";
import { ADMIN_EMAIL, adminCreate } from "./admin";

const baseUrl = inject("baseUrl");
const ADMIN_PASSWORD = "Admin-pokaz-123";
const PASSWORD = "secret123";
const MISSING = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";

let orm: Orm;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (text: string, params: unknown[] = []) => orm.em.fork().execute<Record<string, any>[]>(text, params);

let addressCounter = 0;
const nextAddress = () => `198.51.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
const headers = (cookie?: string, origin = baseUrl): Record<string, string> => ({
  "content-type": "application/json",
  origin,
  "x-gomoku-request": "1",
  "x-forwarded-for": nextAddress(),
  ...(cookie ? { cookie } : {}),
});
const post = (path: string, body?: unknown, cookie?: string, origin?: string) =>
  fetch(`${baseUrl}${path}`, { method: "POST", headers: headers(cookie, origin), body: body === undefined ? undefined : JSON.stringify(body) });
const get = (path: string, cookie?: string, extra: Record<string, string> = {}) =>
  fetch(`${baseUrl}${path}`, { headers: { ...(cookie ? { cookie } : {}), ...extra }, redirect: "manual" });
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const login = async (email: string, password: string) => {
  const response = await post("/api/auth/login", { email, password });
  expect(response.status).toBe(200);
  return cookieOf(response);
};
let userCounter = 0;
async function signUp(prefix: string) {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  const input = { email: `${prefix}-${n}@example.com`, displayName: `${prefix}_${n}`.slice(0, 24), password: PASSWORD };
  expect((await post("/api/auth/register", input)).status).toBe(201);
  return { ...input, cookie: await login(input.email, PASSWORD) };
}

const BOT_BOT = { layout: "bot-bot", levels: [1, 1] };
let admin = "";

beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  await run(`delete from users where email = ?`, [ADMIN_EMAIL]);
  await adminCreate(ADMIN_PASSWORD, ["--name", "Szef_Pokazu"]);
  admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
});
afterAll(async () => {
  await run(`update games set status = 'cancelled' where origin = 'show' and status in ('waiting', 'active')`);
  await orm.close();
});
beforeEach(async () => {
  // One show at a time across the files too: close what an earlier test left open, and give the pool back.
  await run(`update games set status = 'cancelled' where origin = 'show' and status in ('waiting', 'active')`);
  await run(`delete from rate_limit_buckets where "key" like 'show-create:%'`);
});

async function createShow(): Promise<string> {
  const response = await post("/api/show", BOT_BOT, admin);
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: { gameId: string } }).data.gameId;
}

describe("the gate (B1, B3)", () => {
  it("answers 404 indistinguishable from a missing page or game to anybody but a confirmed administrator", async () => {
    const player = await signUp("pokaz-gracz");
    const show = await createShow();
    const missingPage = await get("/this-route-does-not-exist");
    const missingApi = await (await get(`/api/games/${MISSING}`)).json();

    for (const cookie of [undefined, player.cookie, "gomoku_session=not-a-session"]) {
      for (const path of ["/show", `/show/${show}`, `/show/${show}?projektor=1`, "/show/nope"]) {
        const response = await get(path, cookie);
        const html = await response.text();
        expect(response.status, `${path} ${cookie}`).toBe(missingPage.status);
        expect(response.headers.get("location")).toBeNull();
        expect(html).not.toContain("Pokaz");
        expect(html).not.toContain("Bot · poziom");
      }
      const reads = [get("/api/show", cookie), get(`/api/show/${show}`, cookie)];
      // A write without CSRF and from another site is a 404 too: the gate runs before CSRF.
      const writes = [
        post("/api/show", BOT_BOT, cookie),
        post("/api/show/preflight", BOT_BOT, cookie),
        post(`/api/show/${show}/end`, undefined, cookie),
        post(`/api/show/${show}/end`, undefined, cookie, "https://evil.example"),
      ];
      for (const response of await Promise.all([...reads, ...writes])) {
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual(missingApi);
      }
    }
    expect((await run(`select status from games where id = ?`, [show]))[0]!.status).toBe("active");
  });

  it("answers 404 to the administrator's account with an unconfirmed e-mail", async () => {
    const show = await createShow();
    await run(`update users set email_verified_at = null where email = ?`, [ADMIN_EMAIL]);
    try {
      expect((await get("/show", admin)).status).toBe(404);
      expect((await get(`/show/${show}`, admin)).status).toBe(404);
      expect((await get(`/api/show/${show}`, admin)).status).toBe(404);
      expect((await post("/api/show", BOT_BOT, admin)).status).toBe(404);
    } finally {
      await run(`update users set email_verified_at = now() where email = ?`, [ADMIN_EMAIL]);
    }
  });

  it("never reads a game that is not a show, nor a missing one", async () => {
    const player = await signUp("pokaz-obcy");
    const created = await post("/api/games", {}, player.cookie);
    const { gameId } = ((await created.json()) as { data: { gameId: string } }).data;

    for (const id of [gameId, MISSING, "nope"]) {
      expect((await get(`/api/show/${id}`, admin)).status).toBe(404);
      expect((await post(`/api/show/${id}/end`, undefined, admin)).status).toBe(404);
      expect((await get(`/show/${id}`, admin)).status).toBe(404);
    }
    expect((await run(`select status from games where id = ?`, [gameId]))[0]!.status).toBe("waiting");
  });
});

describe("creating a show (bot vs bot, phase a)", () => {
  it("writes a private active game with two bots and no human seat, readable by the administrator", async () => {
    const overview = await (await get("/api/show", admin)).json();
    expect(overview.data).toMatchObject({ enabled: true, botVsBotEnabled: true, current: null, preflight: { ok: true } });

    const response = await post("/api/show", { layout: "bot-bot", levels: [1, 1] }, admin);
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data).toMatchObject({ layout: "bot-bot", bots: [{ seat: 1, level: 1, tableMb: null }, { seat: 2, level: 1 }] });

    const [game] = await run(
      `select origin, status, is_public, started_at is not null as started, turn_started_at is not null as clock, black_seat from games where id = ?`,
      [data.gameId],
    );
    expect(game).toMatchObject({ origin: "show", status: "active", is_public: false, started: true, clock: true });
    const seats = await run(`select seat, kind, user_id, bot_level, is_active from game_players where game_id = ? order by seat`, [data.gameId]);
    expect(seats).toEqual([
      { seat: 1, kind: "bot", user_id: null, bot_level: 1, is_active: true },
      { seat: 2, kind: "bot", user_id: null, bot_level: 1, is_active: true },
    ]);

    const state = await (await get(`/api/show/${data.gameId}`, admin)).json();
    expect(state.data).toMatchObject({ status: "active", layout: "bot-bot", moveCount: 0, turnSeat: game!.black_seat });
    expect(state.data.players[0]).toEqual({ seat: 1, kind: "bot", displayName: "Bot · poziom 1", bot: { level: 1, memoryMb: null, tableMb: null } });
    expect(JSON.stringify(state)).not.toMatch(/seen|token|email/);
    expect((await (await get("/api/show", admin)).json()).data.current).toEqual({ gameId: data.gameId, status: "active", layout: "bot-bot" });
  });

  it("refuses a second show with 409 SHOW_RUNNING and the running show's id", async () => {
    const first = await createShow();

    const response = await post("/api/show", BOT_BOT, admin);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({ code: "SHOW_RUNNING", data: { gameId: first } });
  });

  it("creates exactly one show from two concurrent requests (advisory lock on PostgreSQL)", async () => {
    for (let round = 0; round < 3; round += 1) {
      await run(`update games set status = 'cancelled' where origin = 'show' and status in ('waiting', 'active')`);
      const responses = await Promise.all([post("/api/show", BOT_BOT, admin), post("/api/show", BOT_BOT, admin)]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const [open] = await run(`select count(*)::int as n from games where origin = 'show' and status in ('waiting', 'active')`);
      expect(open!.n).toBe(1);
    }
  });

  it("refuses an unknown layout, a level outside 1-2, an extra field and level 2 while its switch is off", async () => {
    for (const body of [{ layout: "bot-agent", botLevel: 1 }, { layout: "bot-bot", levels: [1, 3] }, { ...BOT_BOT, extra: true }]) {
      const response = await post("/api/show", body, admin);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION");
    }
    const level2 = await post("/api/show", { layout: "bot-bot", levels: [1, 2] }, admin);
    expect(level2.status).toBe(503);
    expect((await level2.json()).error).toMatchObject({ code: "BOT_UNAVAILABLE", data: { reason: "level2_not_allowed" } });
    expect((await run(`select count(*)::int as n from games where origin = 'show' and status = 'active'`))[0]!.n).toBe(0);
  });

  it("answers the preflight with the cheap checks", async () => {
    const response = await post("/api/show/preflight", { layout: "bot-bot", levels: [2, 1] }, admin);
    const { data } = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.checks.find((check: { id: string }) => check.id === "level2_enabled")).toEqual({ id: "level2_enabled", ok: false });
    expect(data.checks.find((check: { id: string }) => check.id === "engine")).toEqual({ id: "engine", ok: null });
  });
});

describe("ending a show (P7)", () => {
  it("cancels it, frees its seats, is harmless to repeat and lets the next show start", async () => {
    const show = await createShow();

    const response = await post(`/api/show/${show}/end`, undefined, admin);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ status: "cancelled", closedReason: "ended" });
    expect((await run(`select count(*)::int as n from game_players where game_id = ? and is_active`, [show]))[0]!.n).toBe(0);
    expect((await post(`/api/show/${show}/end`, undefined, admin)).status).toBe(200);

    await createShow();
  });
});

describe("counters and history (B6, P15)", () => {
  it("a show finished on time changes neither game_pair_counters nor the panel's counters", async () => {
    const show = await createShow();
    const pairs = async () => (await run(`select coalesce(sum(finished_count), 0)::int as n from game_pair_counters`))[0]!.n as number;
    const panel = async () => {
      const html = await (await get("/backend", admin)).text();
      return /<section aria-labelledby="counters-heading"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    };
    const before = { pairs: await pairs(), panel: await panel() };
    expect(before.panel).toContain("Partie w bazie teraz");

    // The clock of the bot on turn ran out: the administrator's read settles it.
    await run(`update games set turn_started_at = now() - interval '11 minutes' where id = ?`, [show]);
    const state = await (await get(`/api/show/${show}`, admin)).json();
    expect(state.data).toMatchObject({ status: "finished", result: { reason: "timeout" } });
    expect(state.data.finishedAt).toEqual(expect.any(String));

    expect(await pairs()).toBe(before.pairs);
    // The panel counts games of the players only: the finished show adds nothing (active ones were cancelled above).
    expect(await panel()).toBe(before.panel);
    const ended = await post(`/api/show/${show}/end`, undefined, admin);
    expect(ended.status).toBe(409);
    expect((await ended.json()).error.code).toBe("GAME_NOT_ACTIVE");
  });
});

describe("a show's invitation code in the browser path (P13)", () => {
  it("is an unknown code for a person, in the page and in the accept", async () => {
    const show = await createShow();
    const code = new InvitationCodes().generate();
    await run(`insert into invitations (game_id, code, created_at, expires_at) values (?, ?, now(), now() + interval '30 minutes')`, [show, code]);
    const player = await signUp("pokaz-kod");

    const accept = await post(`/api/invitations/${code}/accept`, { as: "user" }, player.cookie);
    expect(accept.status).toBe(410);
    expect((await accept.json()).error.code).toBe("INVALID_INVITATION");
    expect(await (await get(`/invite/${code}`, player.cookie)).text()).toContain("To zaproszenie jest już nieważne");
    expect((await run(`select count(*)::int as n from game_players where game_id = ?`, [show]))[0]!.n).toBe(2);
  });
});

describe("the language of the show (E15 note on #280)", () => {
  it("keeps ?projektor=1 through the ?lang= redirect and renders the view in French", async () => {
    const show = await createShow();

    const redirect = await get(`/show/${show}?lang=fr&projektor=1`, admin);
    expect(redirect.status).toBe(307);
    expect(new URL(redirect.headers.get("location") ?? "", baseUrl).href).toBe(`${baseUrl}/show/${show}?projektor=1`);
    expect(redirect.headers.get("set-cookie")).toMatch(/^gomoku_lang=fr;/);

    const html = await (await get(`/show/${show}?projektor=1`, `${admin}; gomoku_lang=fr`)).text();
    expect(/<html lang="([^"]+)"/.exec(html)?.[1]).toBe("fr");
    expect(html).toContain("Démonstration : Bot contre bot");
    expect(html).toContain("Vue pour projecteur");
    expect(html).toContain("Trait aux");
    expect(html).toContain('data-projector="true"');
    expect(html).toContain('aria-label="Thème sombre"');
    expect(html).not.toContain("Widok pod projektor");

    const console_ = await (await get("/show", `${admin}; gomoku_lang=en`)).text();
    expect(/<html lang="([^"]+)"/.exec(console_)?.[1]).toBe("en");
    expect(console_).toContain("A show is in progress");
  });
});
