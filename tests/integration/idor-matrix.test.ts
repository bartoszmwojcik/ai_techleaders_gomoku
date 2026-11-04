// T-03: an outsider (another account, a guest, nobody) gets exactly the same answer for somebody else's game as for
// a game that does not exist, on every participant route of /api/games/[id], so game ids cannot be probed.
import { randomUUID } from "node:crypto";

import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

let counter = 0;
const call = (method: string, path: string, body?: unknown, cookie?: string) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      origin: baseUrl,
      "x-gomoku-request": "1",
      "x-forwarded-for": `198.75.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`,
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0]!;

async function account(): Promise<string> {
  const n = `${Date.now().toString(36)}${counter}`;
  const response = await call("POST", "/api/auth/register", { email: `idor-${n}@example.com`, displayName: `Idor_${n}`, password: "secret123" });
  expect(response.status).toBe(201);
  return cookieOf(response);
}

const ROUTES: [method: string, suffix: string, body?: unknown][] = [
  ["GET", ""],
  ["POST", "/moves", { x: 7, y: 7, moveNumber: 1 }],
  ["POST", "/resign"],
  ["POST", "/cancel"],
  ["GET", "/chat"],
  ["POST", "/chat", { text: "hej" }],
  ["PUT", "/chat/settings", { enabled: false }],
  ["POST", "/rematch"],
  ["POST", "/rematch/accept"],
  ["POST", "/rematch/decline"],
  ["POST", "/audience/close"],
  ["GET", "/qr"],
];

describe("an outsider's answers about a foreign game", () => {
  it("equal the answers about a game that does not exist, on every route", async () => {
    const owner = await account();
    const created = await call("POST", "/api/games", { isPublic: false }, owner);
    const { data } = (await created.json()) as { data: { gameId: string } };

    const guestResponse = await call("POST", "/api/games", { acknowledgedGuestWarning: true, nickname: "Gosc" });
    const guest = cookieOf(guestResponse);
    expect(guest).not.toBe("");
    const outsiders: [string, string | undefined][] = [
      ["another account", await account()],
      ["a guest of another game", guest],
      ["nobody", undefined],
    ];

    for (const [who, cookie] of outsiders) {
      for (const [method, suffix, body] of ROUTES) {
        const foreign = await call(method, `/api/games/${data.gameId}${suffix}`, body, cookie);
        const missing = await call(method, `/api/games/${randomUUID()}${suffix}`, body, cookie);
        const label = `${who}: ${method} ${suffix || "/"}`;
        expect(foreign.status, label).toBe(missing.status);
        expect(await foreign.text(), label).toBe(await missing.text());
        expect(foreign.status, label).not.toBe(200);
      }
    }
  });
});
