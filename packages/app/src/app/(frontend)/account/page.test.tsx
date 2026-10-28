import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, requirePageSession, withRequestScope, hasActiveGame } = vi.hoisted(() => ({
  connection: vi.fn(),
  requirePageSession: vi.fn(),
  withRequestScope: vi.fn(),
  hasActiveGame: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ requirePageSession }));
vi.mock("@/server/container", () => ({ withRequestScope }));
vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: ({ hasActiveGame }: { hasActiveGame: boolean }) => (
    <button data-testid="logout" data-active={String(hasActiveGame)}>
      Wyloguj
    </button>
  ),
}));

import AccountPage from "./page";

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  requirePageSession
    .mockReset()
    .mockResolvedValue({ id: "u1", displayName: "Ala_7", email: "ala@example.com", emailVerifiedAt: null });
  hasActiveGame.mockReset().mockResolvedValue(false);
  withRequestScope
    .mockReset()
    .mockImplementation(async (fn: (scope: unknown) => unknown) =>
      fn({ cradle: { gameParticipation: { hasActiveGame } } }),
    );
});

describe("AccountPage", () => {
  it("is dynamic and guards itself with its own path", async () => {
    await AccountPage();
    expect(connection).toHaveBeenCalledOnce();
    expect(requirePageSession).toHaveBeenCalledWith("/account");
  });

  it("shows the player name and e-mail", async () => {
    const html = renderToStaticMarkup(await AccountPage());
    expect(html).toContain("Konto</h1>");
    expect(html).toContain("Ala_7");
    expect(html).toContain("ala@example.com");
  });

  it("passes no active game to the logout button", async () => {
    const html = renderToStaticMarkup(await AccountPage());
    expect(hasActiveGame).toHaveBeenCalledWith("u1");
    expect(html).toContain('data-active="false"');
  });

  it("passes an active game to the logout button", async () => {
    hasActiveGame.mockResolvedValue(true);
    const html = renderToStaticMarkup(await AccountPage());
    expect(html).toContain('data-active="true"');
  });

  it("does not render for a guest: the guard redirects", async () => {
    requirePageSession.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(AccountPage()).rejects.toThrow("NEXT_REDIRECT");
  });
});
