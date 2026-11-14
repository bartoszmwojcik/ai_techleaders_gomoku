// Signing in and the account in French on the built app (E15-S06, package C4): labels, hints and refusals by code.
// Field messages from the schemas of `core` stay Polish until E15-S07 (C5).
import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

let addressCounter = 0;
const nextAddress = () => `198.46.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;

const FRENCH = { cookie: "gomoku_lang=fr" };
const get = (path: string, headers: Record<string, string> = {}) => fetch(`${baseUrl}${path}`, { headers, redirect: "manual" });
const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": nextAddress() },
    body: JSON.stringify(body),
  });
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

describe("signing in and the account in French", () => {
  it("words the login, the registration and the password pages", async () => {
    const login = await (await get("/login", FRENCH)).text();
    expect(login).toContain("Se connecter");
    expect(login).toContain("Mot de passe oublié");

    const register = await (await get("/register", FRENCH)).text();
    expect(register).toContain("Créer un compte");
    expect(register).toContain("Vos adversaires le voient.");

    expect(await (await get("/forgot-password", FRENCH)).text()).toContain("Envoyer le lien");
    expect(await (await get("/reset-password", FRENCH)).text()).toContain("Ce lien est incomplet");
  });

  it("words the account page of a signed-in player", async () => {
    const n = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    const input = { email: `acc-${n}@example.com`, displayName: `Acc_${n}`.slice(0, 24), password: "secret123" };
    expect((await post("/api/auth/register", input)).status).toBe(201);
    const session = cookieOf(await post("/api/auth/login", { email: input.email, password: input.password }));

    const page = await (await get("/account", { cookie: `${session}; gomoku_lang=fr` })).text();
    expect(page).toContain("Données du compte");
    expect(page).toContain("Changer le nom de joueur");
    expect(page).toContain("Supprimer le compte");
    expect(page).toContain("Confirmez votre adresse e-mail");

    const polish = await (await get("/account", { cookie: session })).text();
    expect(polish).toContain("Dane konta");
    expect(polish).not.toContain("Données du compte");
  });
});
