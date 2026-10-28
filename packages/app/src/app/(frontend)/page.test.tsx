import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, getCurrentUserWith, hasActiveGame } = vi.hoisted(() => ({
  connection: vi.fn(),
  getCurrentUserWith: vi.fn(),
  hasActiveGame: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ getCurrentUserWith }));
vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: ({ hasActiveGame }: { hasActiveGame: boolean }) => (
    <button data-testid="logout" data-active={String(hasActiveGame)}>
      Wyloguj
    </button>
  ),
}));

vi.mock("@/components/auth/verify-email-banner", () => ({
  VerifyEmailNotice: ({ userId, email }: { userId: string; email: string }) => (
    <aside data-testid="banner" data-user={userId}>
      {email}
    </aside>
  ),
}));

import HomePage from "./page";

let current: { id: string; displayName: string; email: string; emailVerifiedAt: Date | null } | null = null;
function signedOut() {
  current = null;
  getCurrentUserWith.mockReset().mockImplementation(async (read: (u: unknown, c: unknown) => Promise<boolean>) =>
    current ? { user: current, data: await read(current, { gameParticipation: { hasActiveGame } }) } : null,
  );
}
function signedIn() {
  current = { id: "u1", displayName: "Ala_7", email: "ala@example.com", emailVerifiedAt: null };
}

const count = (html: string, fragment: string) => html.split(fragment).length - 1;

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  hasActiveGame.mockReset().mockResolvedValue(false);
  signedOut();
});

describe("HomePage", () => {
  it("is dynamic: waits for the request before reading the session", async () => {
    await HomePage();
    expect(connection).toHaveBeenCalledOnce();
    expect(getCurrentUserWith).toHaveBeenCalledOnce();
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
    expect(html).toContain('href="/login"');
    expect(html).toContain("Zaloguj się");
    expect(html).not.toContain("Zalogowano jako");
    expect(html).not.toContain("Wyloguj");
    expect(hasActiveGame).not.toHaveBeenCalled();
  });

  it("shows the name of a signed-in player instead of the registration link", async () => {
    signedIn();
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("Zalogowano jako <strong");
    expect(html).toContain("Ala_7");
    expect(html).not.toContain("/register");
    expect(html).not.toContain("/login");
  });

  it("links a signed-in player to the account and offers logout", async () => {
    signedIn();
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain('href="/account"');
    expect(html).toContain("Konto</a>");
    expect(html).toContain('data-testid="logout" data-active="false"');
    expect(hasActiveGame).toHaveBeenCalledWith("u1");
  });

  it("tells the logout button about a running game", async () => {
    signedIn();
    hasActiveGame.mockResolvedValue(true);
    expect(renderToStaticMarkup(await HomePage())).toContain('data-active="true"');
  });

  it("shows the e-mail banner to a player with an unconfirmed address", async () => {
    signedIn();
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain('data-testid="banner" data-user="u1">ala@example.com');
  });

  it("shows no banner to a player with a confirmed address", async () => {
    signedIn();
    current!.emailVerifiedAt = new Date();
    expect(renderToStaticMarkup(await HomePage())).not.toContain('data-testid="banner"');
  });

  it("shows no banner to a guest", async () => {
    expect(renderToStaticMarkup(await HomePage())).not.toContain('data-testid="banner"');
  });
});
