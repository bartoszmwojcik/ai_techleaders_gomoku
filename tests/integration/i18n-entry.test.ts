// Entering a game in French on the built app (E15-S03, package C1): the home page with the e-mail banner of an
// unconfirmed account, `/play`, `/join` and the invitation of a guest without a nickname ("Joueur 1 (invité)…").
import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

let addressCounter = 0;
const nextAddress = () => `198.43.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;

const FRENCH = { cookie: "gomoku_lang=fr" };
const get = (path: string, headers: Record<string, string> = {}) => fetch(`${baseUrl}${path}`, { headers, redirect: "manual" });
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": nextAddress(), ...headers },
    body: JSON.stringify(body),
  });
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const htmlLang = (html: string) => /<html lang="([^"]+)"/.exec(html)?.[1];
// The visible text of a page, without tags, so a check never trips over markup between words.
const textOf = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");

describe("entering a game in French", () => {
  it("words the visitor's home page", async () => {
    const page = await (await get("/", FRENCH)).text();

    expect(htmlLang(page)).toBe("fr");
    expect(page).toContain("Cinq alignés gagnent.");
    expect(page).toContain("Jouer avec un ami sans compte");
    expect(page).toContain("Créer un compte");
  });

  it("words the e-mail banner of a signed-in player with an unconfirmed address", async () => {
    const n = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    const input = { email: `entry-${n}@example.com`, displayName: `Entry_${n}`.slice(0, 24), password: "secret123" };
    expect((await post("/api/auth/register", input)).status).toBe(201);
    const session = cookieOf(await post("/api/auth/login", { email: input.email, password: input.password }));

    const page = await (await get("/", { cookie: `${session}; gomoku_lang=fr` })).text();

    expect(page).toContain("Confirmez votre adresse e-mail");
    expect(page).toContain(`Nous envoyons le lien à ${input.email}`);
    expect(page).toContain("Créer une invitation");

    // In Polish the client components use their bundled default: no catalog is serialised into the page.
    const polish = await (await get("/", { cookie: session })).text();
    expect(polish).toContain("Potwierdź adres e-mail");
    expect(polish).not.toContain("Confirmez votre adresse e-mail");
  });

  it("words /play and /join", async () => {
    const play = await (await get("/play", FRENCH)).text();
    expect(play).toContain("<title>Jouer avec un ami sans compte — Gomoku</title>");
    expect(textOf(play)).toContain("Laissez vide et vous serez");
    expect(play).toContain("J’ai compris, créer l’invitation");

    const join = await (await get("/join", FRENCH)).text();
    expect(join).toContain("Vous avez un code d’invitation");
    expect(join).toContain("Code d’invitation");
  });

  it("names a guest creator without a nickname in the reader's language", async () => {
    const created = await post("/api/games", { acknowledgedGuestWarning: true });
    expect(created.status).toBe(201);
    const { data } = (await created.json()) as { data: { invitation: { code: string } } };

    const invite = await (await get(`/invite/${data.invitation.code}`, FRENCH)).text();
    expect(invite).toContain("Joueur 1 (invité) vous invite à une partie de Gomoku");
    expect(invite).toContain("<title>Invitation à une partie — Gomoku</title>");
    expect(invite).toContain("Jouer en invité");

    const polish = await (await get(`/invite/${data.invitation.code}`)).text();
    expect(polish).toContain("Gracz 1 (gość) zaprasza Cię do partii Gomoku");
  });
});
