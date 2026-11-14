import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const i18nRequest = vi.hoisted(() => ({ lang: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "gomoku_lang" && i18nRequest.lang ? { name, value: i18nRequest.lang } : undefined) }),
  headers: async () => new Headers(),
}));

const { connection, requirePageSession, withRequestScope, currentGame, availableAt } = vi.hoisted(() => ({
  availableAt: vi.fn(),
  connection: vi.fn(),
  requirePageSession: vi.fn(),
  withRequestScope: vi.fn(),
  currentGame: vi.fn(),
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

vi.mock("@/components/auth/verify-email-banner", () => ({
  VerifyEmailNotice: ({ userId, email }: { userId: string; email: string }) => (
    <aside data-testid="banner" data-user={userId}>
      {email}
    </aside>
  ),
}));

vi.mock("./delete-account-form", () => ({
  DeleteAccountForm: (props: { displayName: string; currentGame: unknown }) => (
    <section data-testid="delete-account" data-name={props.displayName} data-game={JSON.stringify(props.currentGame)} />
  ),
}));

vi.mock("./change-display-name-form", () => ({
  ChangeDisplayNameForm: (props: { displayName: string; availableAt: string | null }) => (
    <form data-testid="change-name-form" data-name={props.displayName} data-available={String(props.availableAt)} />
  ),
}));

vi.mock("./change-email-form", () => ({
  ChangeEmailForm: () => <form data-testid="change-email-form" />,
}));

vi.mock("./change-password-form", () => ({
  ChangePasswordForm: () => <form data-testid="change-password-form" />,
}));

import AccountPage from "./page";

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  requirePageSession
    .mockReset()
    .mockResolvedValue({ id: "u1", displayName: "Ala_7", email: "ala@example.com", emailVerifiedAt: null });
  currentGame.mockReset().mockResolvedValue(null);
  availableAt.mockReset().mockResolvedValue(null);
  withRequestScope
    .mockReset()
    .mockImplementation(async (fn: (scope: unknown) => unknown) =>
      fn({ cradle: { gameParticipation: { currentGame }, userService: { displayNameChangeAvailableAt: availableAt } } }),
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

  it("marks an unconfirmed address and shows the banner above the account data", async () => {
    const html = renderToStaticMarkup(await AccountPage());
    expect(html).toContain("Niepotwierdzony");
    expect(html).not.toContain("Potwierdzony<");
    expect(html).toContain('data-testid="banner" data-user="u1"');
    expect(html.indexOf('data-testid="banner"')).toBeLessThan(html.indexOf("Dane konta"));
  });

  it("marks a confirmed address and shows no banner", async () => {
    requirePageSession.mockResolvedValue({
      id: "u1",
      displayName: "Ala_7",
      email: "ala@example.com",
      emailVerifiedAt: new Date(),
    });
    const html = renderToStaticMarkup(await AccountPage());
    expect(html).toContain("Potwierdzony");
    expect(html).not.toContain("Niepotwierdzony");
    expect(html).not.toContain('data-testid="banner"');
  });

  it("has a change password section", async () => {
    const html = renderToStaticMarkup(await AccountPage());
    expect(html).toContain("Zmień hasło</h2>");
    expect(html).toContain('data-testid="change-password-form"');
  });

  it("passes no active game to the logout button", async () => {
    const html = renderToStaticMarkup(await AccountPage());
    expect(currentGame).toHaveBeenCalledWith("u1");
    expect(html).toContain('data-active="false"');
  });

  it("passes an active game to the logout button", async () => {
    currentGame.mockResolvedValue({ gameId: "g1", status: "active", seat: 1 });
    const html = renderToStaticMarkup(await AccountPage());
    expect(html).toContain('data-active="true"');
  });

  it("does not treat a waiting game as a game in progress for the logout button", async () => {
    currentGame.mockResolvedValue({ gameId: "g1", status: "waiting", seat: 1 });
    const html = renderToStaticMarkup(await AccountPage());
    expect(html).toContain('data-active="false"');
  });

  it("puts the account deletion below the password change, with the name and the held game", async () => {
    currentGame.mockResolvedValue({ gameId: "g1", status: "waiting", seat: 1 });
    const html = renderToStaticMarkup(await AccountPage());
    expect(html).toContain('data-name="Ala_7"');
    expect(html).toContain("data-game=\"{&quot;gameId&quot;:&quot;g1&quot;,&quot;status&quot;:&quot;waiting&quot;}\"");
    expect(html.indexOf('data-testid="change-password-form"')).toBeLessThan(html.indexOf('data-testid="delete-account"'));
  });

  it("passes no game to the account deletion when the account holds none", async () => {
    const html = renderToStaticMarkup(await AccountPage());
    expect(html).toContain("data-game=\"null\"");
  });

  it("does not render for a guest: the guard redirects", async () => {
    requirePageSession.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(AccountPage()).rejects.toThrow("NEXT_REDIRECT");
  });

  it("offers the name and e-mail forms, the name form open when a rename is possible", async () => {
    const html = renderToStaticMarkup(await AccountPage());
    expect(html).toContain("Zmień nazwę gracza");
    expect(html).toContain("Zmień adres e-mail");
    expect(html).toContain('data-name="Ala_7"');
    expect(html).toContain('data-available="null"');
    expect(html).toContain('data-testid="change-email-form"');
    expect(availableAt).toHaveBeenCalledWith("u1");
  });

  it("hands the end of the 24 h window to the name form", async () => {
    availableAt.mockResolvedValue(new Date("2026-11-03T04:00:00.000Z"));
    const html = renderToStaticMarkup(await AccountPage());
    expect(html).toContain('data-available="2026-11-03T04:00:00.000Z"');
  });
});
