// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountMenu } from "@/components/auth/account-menu";
import { LogoutButton } from "@/components/auth/logout-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import fr from "@/i18n/catalogs/fr/header";

const { replace, apiCall, connection, getCurrentUser } = vi.hoisted(() => ({
  replace: vi.fn(),
  apiCall: vi.fn(),
  connection: vi.fn(),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiCall }));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ getCurrentUser }));

beforeEach(() => {
  replace.mockReset();
  vi.stubGlobal("location", { replace, origin: "https://gomoku.example" });
  apiCall.mockReset();
  connection.mockReset().mockResolvedValue(undefined);
  getCurrentUser.mockReset();
});
afterEach(cleanup);

// The pilot of the pattern (spec I3, I25): the server hands the namespace down, the components default to Polish.
describe("header components in French", () => {
  it("labels the theme switch", () => {
    expect(renderToStaticMarkup(<ThemeToggle initialTheme="light" dict={fr} />)).toContain('aria-label="Thème clair"');
    expect(renderToStaticMarkup(<ThemeToggle initialTheme="dark" dict={fr} />)).toContain('aria-label="Thème sombre"');
  });

  it("names the account menu and its items, and asks before logging out during a game", async () => {
    apiCall.mockImplementation(async (path: string) =>
      path === "/api/lobby" ? { ok: true, data: { currentGame: { status: "active" } } } : { ok: false, error: { code: "X" } },
    );
    render(<AccountMenu displayName="Ala_7" locale="fr" dict={fr} />);

    await userEvent.click(screen.getByRole("button", { name: "Connecté en tant que Ala_7, menu du compte" }));
    expect(screen.getByRole("menuitem", { name: "Compte" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Historique" })).toBeTruthy();
    await userEvent.click(screen.getByRole("menuitem", { name: "Se déconnecter" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Se déconnecter ?" });
    expect(dialog.textContent).toContain(fr.logout.gameRunning);
    expect(within(dialog).getByRole("button", { name: "Rester connecté" })).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Se déconnecter" }));
    expect(await within(dialog).findByText(fr.logout.failed)).toBeTruthy();
  });

  it("labels the logout button, its failure and its question", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "X" } });
    const { unmount } = render(<LogoutButton dict={fr} />);
    await userEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    expect((await screen.findByTestId("logout-error")).textContent).toBe("La déconnexion a échouéRéessayez.");
    unmount();

    render(<LogoutButton hasActiveGame dict={fr} />);
    await userEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Se déconnecter ?" });
    expect(within(dialog).getByRole("button", { name: "Rester connecté" })).toBeTruthy();
  });

  it("passes the language and the namespace from the session menu to the account menu", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", displayName: "Ala_7" });
    const { SessionMenu } = await import("@/components/auth/session-menu");

    render(await SessionMenu({ locale: "fr", dict: fr }));

    expect(screen.getByRole("button", { name: "Connecté en tant que Ala_7, menu du compte" })).toBeTruthy();
  });
});
