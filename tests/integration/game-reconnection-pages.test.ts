// Returning to a game in real browsers (E02 phase 5A, #24 step 4): a game lost on time while the
// player was away shows the result and a read-only board on return (p06.3, p06.5); the same account
// from a second device sees the same; a guest sees the result in their own browser for an hour
// (p06.6) and gets the 404 text from another browser and an hour after the end (p06.7, p07.3).
// Time is moved by writing straight into the database. Screenshots go to $GOMOKU_SHOTS_DIR when set.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const session = inject("browserSession");
const first = new Browser(`${session}-recon-a`);
const second = new Browser(`${session}-recon-b`);
const third = new Browser(`${session}-recon-c`);
const browsers = [first, second, third];
const shotsDir = process.env.GOMOKU_SHOTS_DIR;
const NOT_FOUND_TEXT = "Ta partia nie istnieje albo nie masz do niej dostępu";
const RETURN_NOTE = "Powrót do zakończonej partii: wynik jest ten sam, ruch nie jest możliwy.";

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  for (const browser of browsers) await browser.clearCookies();
});
afterAll(async () => {
  await orm.close();
  for (const browser of browsers) {
    await browser.clearCookies();
    await browser.close();
  }
});
const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

let counter = 0;
const nextAddress = () => `198.54.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

async function api(method: "GET" | "POST", path: string, body?: unknown, cookie?: string) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      "x-gomoku-request": "1",
      "x-forwarded-for": nextAddress(),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Registers an account and returns its session cookie as `name=value`. */
async function register(label: string) {
  const n = `${Date.now().toString(36)}${++counter}`;
  const response = await api("POST", "/api/auth/register", {
    email: `recon-${label}-${n}@example.com`,
    displayName: `Rec_${label}${n}`.slice(0, 20),
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return (response.headers.get("set-cookie") ?? "").split(";")[0]!;
}

/** Makes the browser `cookie`'s owner (a fresh cookie jar: another device or another person). */
async function actAs(browser: Browser, cookie: string | null) {
  await browser.clearCookies();
  if (cookie) await browser.setCookie(cookie.slice(0, cookie.indexOf("=")), cookie.slice(cookie.indexOf("=") + 1), baseUrl);
}

const bodyHas = (browser: Browser, text: string) =>
  browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const bodyLacks = (browser: Browser, text: string) =>
  browser.evaluate<boolean>(`!document.body.innerText.includes(${JSON.stringify(text)})`);
const shot = async (browser: Browser, name: string) => {
  if (shotsDir) await browser.run("screenshot", `${shotsDir}/${name}.png`);
};
const horizontalOverflow = (browser: Browser) =>
  browser.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth");
const readOnly = (browser: Browser) =>
  browser.evaluate<string>("document.querySelector('[role=grid]').getAttribute('aria-readonly')");
const noteText = (browser: Browser, id: string) =>
  browser.evaluate<string>(`document.querySelector('[data-testid=${id}]').textContent`);

/** One game, both players seen (the clock runs): the creator's and the joiner's session cookie, `as` the joiner's kind. */
async function startedGame(as: "user" | "guest") {
  const creator = await register("c");
  const created = (await (await api("POST", "/api/games", {}, creator)).json()) as {
    data: { gameId: string; invitation: { code: string } };
  };
  let joiner: string;
  if (as === "guest") {
    const joined = await api("POST", `/api/invitations/${created.data.invitation.code}/accept`, {
      as: "guest",
      acknowledgedGuestWarning: true,
    });
    expect(joined.status).toBe(200);
    joiner = (joined.headers.getSetCookie?.() ?? []).find((line) => line.startsWith("gomoku_guest="))!.split(";")[0]!;
  } else {
    joiner = await register("j");
    expect((await api("POST", `/api/invitations/${created.data.invitation.code}/accept`, { as: "user" }, joiner)).status).toBe(200);
  }
  const { gameId } = created.data;
  // Opening the page (a read of the state) marks the player as seen; the second one starts the clock (#21 Q20).
  for (const cookie of [creator, joiner]) expect((await api("GET", `/api/games/${gameId}`, undefined, cookie)).status).toBe(200);
  const [row] = await run(`select black_seat from games where id = ?`, [gameId]);
  return { gameId, creator, joiner, blackSeat: row!.black_seat as 1 | 2 };
}

/** The tab goes to the background and comes back `awayMs` later by the page's clock (the hook reads `Date.now`). */
async function tabAway(browser: Browser, awayMs: number) {
  await browser.evaluate(`(() => {
    const realNow = Date.now.bind(Date);
    let skew = 0;
    Date.now = () => realNow() + skew;
    const show = (state) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    show("hidden");
    skew = ${awayMs};
    show("visible");
  })()`);
}

describe("returning to a game", () => {
  it("says 'Wróciłeś do partii' after a long absence with the server's time, not after a short one (p05.10)", async () => {
    const { gameId, creator, joiner, blackSeat } = await startedGame("user");
    const blackCookie = blackSeat === 1 ? creator : joiner;
    await actAs(first, blackCookie);
    await first.setViewport(360, 800);
    await first.open(`${baseUrl}/games/${gameId}`);
    await bodyHas(first, "Twój ruch (czarne)");

    await tabAway(first, 20_000);
    // Let the read at the return arrive before looking: a short absence leaves no notice.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await bodyLacks(first, "Wróciłeś do partii")).toBe(true);

    // Black's clock runs on the server meanwhile: the notice carries the server's value (below 10:00).
    await tabAway(first, 45_000);
    await first.waitForFn("document.body.innerText.includes('Wróciłeś do partii. Twój zegar: ')");
    const text = await first.evaluate<string>(
      "[...document.querySelectorAll('[role=status]')].map((el) => el.textContent).find((t) => t.startsWith('Wróciłeś'))",
    );
    expect(text).toMatch(/^Wróciłeś do partii\. Twój zegar: (9:[0-5]\d|10:00)\.$/);
    expect(await horizontalOverflow(first)).toBe(false);
    await shot(first, "p05-10-wrociles-360-light");
    await first.setCookie("gomoku_theme", "dark", baseUrl);
    await first.open(`${baseUrl}/games/${gameId}`);
    await bodyHas(first, "Twój ruch (czarne)");
    await tabAway(first, 45_000);
    await bodyHas(first, "Wróciłeś do partii");
    await shot(first, "p05-10-wrociles-360-dark");
    await first.setCookie("gomoku_theme", "light", baseUrl);
    // It goes by itself after a few seconds.
    await first.waitForFn("document.body.innerText.includes('Wróciłeś') === false");
  });


  it("shows a game lost on time while the player was away: on return and from a second device (p06.3, p06.5)", async () => {
    const { gameId, creator, joiner, blackSeat } = await startedGame("user");
    // Seat 1 is the creator; the player who is NOT on turn (white) was away and wins when black's time runs out.
    const [blackCookie, whiteCookie] = blackSeat === 1 ? [creator, joiner] : [joiner, creator];
    await actAs(first, whiteCookie);
    await first.setViewport(1280, 900);
    await first.open(`${baseUrl}/games/${gameId}`);
    await bodyHas(first, "Partia w toku");
    // The tab is gone (about:blank); black's turn began 11 minutes ago, nobody reads the state.
    await first.open("about:blank");
    await run(`update games set turn_started_at = now() - interval '11 minutes' where id = ?`, [gameId]);
    const [before] = await run(`select status from games where id = ?`, [gameId]);
    expect(before!.status).toBe("active");

    // Back: the first read settles the game (#23); the page shows the result, read-only, and no "Wróciłeś".
    await first.open(`${baseUrl}/games/${gameId}`);
    await bodyHas(first, "Wygrałeś — przeciwnikowi skończył się czas");
    await bodyHas(first, "Koniec partii");
    expect(await readOnly(first)).toBe("true");
    expect(await noteText(first, "reload-note")).toBe(RETURN_NOTE);
    expect(await bodyLacks(first, "Wróciłeś do partii. Twój zegar")).toBe(true);
    expect(await first.count("[data-testid=guest-until]")).toBe(0);
    await shot(first, "p06-5-powrot-po-koncu-1280-light");
    await first.setViewport(360, 800);
    expect(await horizontalOverflow(first)).toBe(false);
    await shot(first, "p06-5-powrot-po-koncu-360-light");
    await first.setCookie("gomoku_theme", "dark", baseUrl);
    await first.open(`${baseUrl}/games/${gameId}`);
    await bodyHas(first, RETURN_NOTE);
    expect(await horizontalOverflow(first)).toBe(false);
    await shot(first, "p06-5-powrot-po-koncu-360-dark");

    // The same account on a second device (another cookie jar): the same result, read-only.
    await actAs(third, whiteCookie);
    await third.open(`${baseUrl}/games/${gameId}`);
    await bodyHas(third, "Wygrałeś — przeciwnikowi skończył się czas");
    expect(await readOnly(third)).toBe("true");
    expect(await noteText(third, "reload-note")).toBe(RETURN_NOTE);

    // The opponent comes back too and reads the other side of the same end.
    await actAs(second, blackCookie);
    await second.open(`${baseUrl}/games/${gameId}`);
    await bodyHas(second, "Przegrałeś — skończył się Twój czas");
    expect(await readOnly(second)).toBe("true");
    const [ended] = await run(`select status, end_reason, winner_seat from games where id = ?`, [gameId]);
    expect(ended).toMatchObject({ status: "finished", end_reason: "timeout", winner_seat: blackSeat === 1 ? 2 : 1 });
    // An account sees a finished game without an hour limit.
    await run(`update games set finished_at = now() - interval '3 hours' where id = ?`, [gameId]);
    await third.open(`${baseUrl}/games/${gameId}`);
    await bodyHas(third, "Wygrałeś — przeciwnikowi skończył się czas");
  });

  it("gives a guest the result in their own browser for an hour, the 404 text elsewhere and after the hour (p06.6, p06.7, p07.3)", async () => {
    const { gameId, joiner } = await startedGame("guest");
    await actAs(first, joiner);
    await first.setViewport(1280, 900);
    await first.open(`${baseUrl}/games/${gameId}`);
    await bodyHas(first, "Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii");

    // The game ended ten minutes ago while the guest was away.
    await first.open("about:blank");
    await run(`update games set status = 'finished', end_reason = 'draw', finished_at = now() - interval '10 minutes' where id = ?`, [gameId]);
    await run(`update game_players set is_active = false where game_id = ?`, [gameId]);
    await first.open(`${baseUrl}/games/${gameId}`);
    await bodyHas(first, "Remis");
    expect(await readOnly(first)).toBe("true");
    expect(await noteText(first, "guest-until")).toBe("Wynik zobaczysz w tej przeglądarce do 1 godziny po zakończeniu partii.");
    expect(await noteText(first, "reload-note")).toBe(RETURN_NOTE);
    expect(await bodyLacks(first, "Grasz bez konta")).toBe(true);
    await shot(first, "p06-6-gosc-po-koncu-1280-light");
    await first.setViewport(360, 800);
    expect(await horizontalOverflow(first)).toBe(false);
    await shot(first, "p06-6-gosc-po-koncu-360-light");
    await first.setCookie("gomoku_theme", "dark", baseUrl);
    await first.open(`${baseUrl}/games/${gameId}`);
    await bodyHas(first, RETURN_NOTE);
    await shot(first, "p06-6-gosc-po-koncu-360-dark");

    // Another browser (no token): the 404 page and a real 404 status; the game does not exist for it.
    await actAs(second, null);
    await second.open(`${baseUrl}/games/${gameId}`);
    await bodyHas(second, NOT_FOUND_TEXT);
    expect((await fetch(`${baseUrl}/games/${gameId}`)).status).toBe(404);
    expect((await api("GET", `/api/games/${gameId}`)).status).toBe(404);

    // An hour after the end the token stops working: the same 404, the game stays in the database.
    await run(`update games set finished_at = now() - interval '61 minutes' where id = ?`, [gameId]);
    await first.open(`${baseUrl}/games/${gameId}`);
    await bodyHas(first, NOT_FOUND_TEXT);
    expect((await fetch(`${baseUrl}/games/${gameId}`, { headers: { cookie: joiner } })).status).toBe(404);
    const [row] = await run(`select status from games where id = ?`, [gameId]);
    expect(row!.status).toBe("finished");
  });
});
