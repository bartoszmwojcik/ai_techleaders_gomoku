// The game room in French on the built app (E15-S04, package C2): two guests without nicknames ("Joueur 1"/"Joueur 2"),
// the room's own texts, the 404 of a missing game, and the Polish page without a catalog in its payload.
import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

let addressCounter = 0;
const nextAddress = () => `198.44.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;

const get = (path: string, headers: Record<string, string> = {}) => fetch(`${baseUrl}${path}`, { headers, redirect: "manual" });
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": nextAddress(), ...headers },
    body: JSON.stringify(body),
  });
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

describe("the game room in French", () => {
  it("names two guests without nicknames in the reader's language", async () => {
    const created = await post("/api/games", { acknowledgedGuestWarning: true });
    expect(created.status).toBe(201);
    const creator = cookieOf(created);
    const { data } = (await created.json()) as { data: { gameId: string; invitation: { code: string } } };

    const waiting = await (await get(`/games/${data.gameId}`, { cookie: `${creator}; gomoku_lang=fr` })).text();
    expect(waiting).toContain("La partie attend un adversaire");
    expect(waiting).toContain("Inviter un ami");

    const joined = await post(`/api/invitations/${data.invitation.code}/accept`, { as: "guest", acknowledgedGuestWarning: true });
    expect(joined.status).toBe(200);

    const room = await (await get(`/games/${data.gameId}`, { cookie: `${creator}; gomoku_lang=fr` })).text();
    expect(room).toContain("Joueur 2");
    expect(room).toContain("(invité)");
    expect(room).toContain("<title>Partie — Gomoku</title>");

    // In Polish no catalog reaches the page: the client components use their bundled default.
    const polish = await (await get(`/games/${data.gameId}`, { cookie: creator })).text();
    expect(polish).toContain("Gracz 2");
    expect(polish).not.toContain("Inviter un ami");
    expect(polish).not.toContain("La discussion");
  });

  it("answers 404 for a missing game in French", async () => {
    const response = await get("/games/00000000-0000-4000-8000-000000000000", { cookie: "gomoku_lang=fr" });
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Cette partie n’existe pas ou vous n’y avez pas accès");
  });
});
