// The public flag of a game (E10-S01) over HTTP against the built app and a real PostgreSQL:
// `POST /api/games` for an account and for a guest, private by default, the invite page telling
// the invitee about a public game before joining (BR-45), and a joined public game listed
// nowhere (N-13: the history of the invitee does not mark it, the home page does not list it).
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");
const PUBLIC_NOTICE = "Partia publiczna: może ją oglądać każdy z kodem";

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await orm.close();
});
const run = (text: string, params: unknown[] = []) => orm.em.fork().execute<Record<string, unknown>[]>(text, params);

let counter = 0;
const nextAddress = () => `198.30.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

function call(method: "GET" | "POST", path: string, body?: unknown, cookie?: string, rawBody?: string) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined || rawBody !== undefined ? { "content-type": "application/json" } : {}),
      origin: baseUrl,
      "x-gomoku-request": "1",
      "x-forwarded-for": nextAddress(),
      ...(cookie ? { cookie } : {}),
    },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}
type Created = { gameId: string; code: string; cookie: string };
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

async function signedUp(): Promise<string> {
  const n = `${Date.now().toString(36)}${++counter}`;
  const response = await call("POST", "/api/auth/register", {
    email: `pubflag-${n}@example.com`,
    displayName: `Pub_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return cookieOf(response);
}
async function create(cookie: string | undefined, body?: unknown, rawBody?: string): Promise<Created> {
  const response = await call("POST", "/api/games", cookie ? body : { acknowledgedGuestWarning: true, ...(body as object) }, cookie, rawBody);
  expect(response.status).toBe(201);
  const { data } = (await response.json()) as { data: { gameId: string; invitation: { code: string } } };
  return { gameId: data.gameId, code: data.invitation.code, cookie: cookie ?? cookieOf(response) };
}
const isPublic = async (gameId: string) =>
  (await run(`select is_public from games where id = ?`, [gameId]))[0]!.is_public;
const invitePage = async (code: string) => {
  const response = await call("GET", `/invite/${code}`);
  return { status: response.status, html: await response.text() };
};

describe("public flag on a game (E10-S01)", () => {
  it("an account creates a private game with no body and a public one with isPublic", async () => {
    const cookie = await signedUp();
    const privateGame = await create(cookie);
    expect(await isPublic(privateGame.gameId)).toBe(false);
    expect((await call("POST", `/api/games/${privateGame.gameId}/cancel`, undefined, cookie)).status).toBe(200);

    const publicGame = await create(cookie, { isPublic: true });
    expect(await isPublic(publicGame.gameId)).toBe(true);
  });

  it("answers 400 for a malformed flag and creates nothing", async () => {
    const cookie = await signedUp();
    const bad = await call("POST", "/api/games", { isPublic: "yes" }, cookie);
    expect(bad.status).toBe(400);
    const garbage = await call("POST", "/api/games", undefined, cookie, "{nope");
    expect(garbage.status).toBe(400);
  });

  it("a guest creates a public game only when asked", async () => {
    const privateGame = await create(undefined, {});
    expect(await isPublic(privateGame.gameId)).toBe(false);
    const publicGame = await create(undefined, { isPublic: true });
    expect(await isPublic(publicGame.gameId)).toBe(true);
  });

  it("the invite page names a public game before joining and says nothing for a private one (BR-45)", async () => {
    const owner = await signedUp();
    const publicGame = await create(owner, { isPublic: true });
    const page = await invitePage(publicGame.code);
    expect(page.status).toBe(200);
    expect(page.html).toContain(PUBLIC_NOTICE);

    const other = await create(undefined, {});
    const privatePage = await invitePage(other.code);
    expect(privatePage.status).toBe(200);
    expect(privatePage.html).not.toContain("Partia publiczna");
  });

  it("a game created from the lobby is private (BR-40)", async () => {
    const [row] = await run(
      `insert into games (origin, status) values ('lobby', 'waiting') returning id, is_public`,
    );
    expect(row!.is_public).toBe(false);
  });

  it("lists a public game nowhere: not on the home page of a stranger", async () => {
    const owner = await signedUp();
    const publicGame = await create(owner, { isPublic: true });
    const stranger = await signedUp();
    const home = await (await call("GET", "/", undefined, stranger)).text();
    expect(home).not.toContain(publicGame.code);
    expect(home).not.toContain(publicGame.gameId);
  });
});
