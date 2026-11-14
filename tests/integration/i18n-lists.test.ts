// The lobby, the history and the review in French on the built app (E15-S05, package C3).
import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

let addressCounter = 0;
const nextAddress = () => `198.45.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;

const get = (path: string, headers: Record<string, string> = {}) => fetch(`${baseUrl}${path}`, { headers, redirect: "manual" });
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": nextAddress(), ...headers },
    body: JSON.stringify(body),
  });
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

async function signedUp(prefix: string): Promise<string> {
  const n = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const input = { email: `${prefix}-${n}@example.com`, displayName: `${prefix}_${n}`.slice(0, 24), password: "secret123" };
  expect((await post("/api/auth/register", input)).status).toBe(201);
  return cookieOf(await post("/api/auth/login", { email: input.email, password: input.password }));
}

describe("lists in other languages", () => {
  it("words the lobby in English", async () => {
    const session = await signedUp("lobby");
    const page = await (await get("/lobby", { cookie: `${session}; gomoku_lang=en` })).text();
    expect(page).toContain("<title>Lobby — Gomoku</title>");
    expect(page).toContain("I am looking for an opponent");
    expect(page).toContain("Players looking for a game");
  });

  it("words an empty history and a missing review in French", async () => {
    const session = await signedUp("hist");
    const history = await (await get("/history", { cookie: `${session}; gomoku_lang=fr` })).text();
    expect(history).toContain("<title>Historique des parties — Gomoku</title>");
    expect(history).toContain("Vous n’avez encore joué aucune partie");

    const review = await get("/games/00000000-0000-4000-8000-000000000000/review", { cookie: `${session}; gomoku_lang=fr` });
    expect(review.status).toBe(404);
    expect(await review.text()).toContain("Impossible d’ouvrir cette partie");
  });
});
