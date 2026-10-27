import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, getCurrentUser } = vi.hoisted(() => ({
  connection: vi.fn(),
  getCurrentUser: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ getCurrentUser }));

import HomePage from "./page";

const count = (html: string, fragment: string) => html.split(fragment).length - 1;

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  getCurrentUser.mockReset().mockResolvedValue(null);
});

describe("HomePage", () => {
  it("is dynamic: waits for the request before reading the session", async () => {
    await HomePage();
    expect(connection).toHaveBeenCalledOnce();
    expect(getCurrentUser).toHaveBeenCalledOnce();
  });

  it("introduces the game and its rules", async () => {
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("<h1");
    expect(html).toContain("Gomoku</h1>");
    expect(html).toContain("Pięć w linii wygrywa.");
    expect(html).toContain("plansza 15×15");
  });

  it("renders a decorative 15×15 board preview with three stones of each colour", async () => {
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain('aria-hidden="true" data-testid="board"');
    expect(html).toContain("grid-template-columns:repeat(15, minmax(0, 1fr))");
    expect(count(html, "relative flex items-center justify-center")).toBe(225);
    expect(count(html, "bg-piece-black")).toBe(3);
    expect(count(html, "bg-piece-white")).toBe(3);
  });

  it("offers registration to a guest", async () => {
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain('href="/register"');
    expect(html).toContain("Załóż konto");
    expect(html).not.toContain("Zalogowano jako");
  });

  it("shows the name of a signed-in player instead of the registration link", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", displayName: "Ala_7", emailVerifiedAt: null });
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("Zalogowano jako <strong");
    expect(html).toContain("Ala_7");
    expect(html).not.toContain("/register");
  });
});
