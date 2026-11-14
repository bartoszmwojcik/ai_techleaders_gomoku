import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, getCurrentUserWith, currentGame, loadGuestCurrentGame, request } = vi.hoisted(() => ({
  request: { lang: undefined as string | undefined },
  loadGuestCurrentGame: vi.fn(),
  connection: vi.fn(),
  getCurrentUserWith: vi.fn(),
  currentGame: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "gomoku_lang" && request.lang ? { name, value: request.lang } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("@/server/http/auth", () => ({ getCurrentUserWith }));
vi.mock("@/server/http/guest-game", () => ({ loadGuestCurrentGame }));
vi.mock("@/server/http/bot-availability", () => ({ isBotEnabled: async () => true }));
vi.mock("@/components/games/create-game-button", () => ({
  CreateGameButton: ({ heldGame, botEnabled, locale }: { heldGame: unknown; botEnabled?: boolean; locale?: string }) => (
    <button data-testid="create" data-held={JSON.stringify(heldGame)} data-bot={String(botEnabled)} data-locale={locale}>
      Utwórz zaproszenie
    </button>
  ),
}));
vi.mock("@/components/games/dismissible-notice", () => ({
  DismissibleNotice: ({ title }: { title: string }) => <aside data-testid="notice">{title}</aside>,
}));

vi.mock("@/components/auth/verify-email-banner", () => ({
  VerifyEmailNotice: ({ userId, email, locale }: { userId: string; email: string; locale?: string }) => (
    <aside data-testid="banner" data-user={userId} data-locale={locale}>
      {email}
    </aside>
  ),
}));

import HomePage from "./page";

let current: { id: string; displayName: string; email: string; emailVerifiedAt: Date | null } | null = null;
function signedOut() {
  current = null;
  getCurrentUserWith.mockReset().mockImplementation(async (read: (u: unknown, c: unknown) => Promise<boolean>) =>
    current ? { user: current, data: await read(current, { gameParticipation: { currentGame } }) } : null,
  );
}
function signedIn() {
  current = { id: "u1", displayName: "Ala_7", email: "ala@example.com", emailVerifiedAt: null };
}

const count = (html: string, fragment: string) => html.split(fragment).length - 1;

beforeEach(() => {
  request.lang = undefined;
  connection.mockReset().mockResolvedValue(undefined);
  currentGame.mockReset().mockResolvedValue(null);
  loadGuestCurrentGame.mockReset().mockResolvedValue(null);
  signedOut();
});

describe("HomePage", () => {
  it("is dynamic: waits for the request before reading the session", async () => {
    await HomePage({ searchParams: Promise.resolve({}) });
    expect(connection).toHaveBeenCalledOnce();
    expect(getCurrentUserWith).toHaveBeenCalledOnce();
  });

  it("introduces the game and its rules", async () => {
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("<h1");
    expect(html).toContain("Gomoku</h1>");
    expect(html).toContain("Pięć w linii wygrywa.");
    expect(html).toContain("plansza 15×15");
  });

  it("renders a decorative 15×15 board preview with three stones of each colour", async () => {
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('aria-hidden="true" data-testid="board"');
    expect(html).toContain("grid-template-columns:repeat(15, minmax(0, 1fr))");
    expect(count(html, "relative flex items-center justify-center")).toBe(225);
    expect(count(html, "bg-piece-black")).toBe(3);
    expect(count(html, "bg-piece-white")).toBe(3);
  });

  it("offers registration to a guest", async () => {
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('href="/register"');
    expect(html).toContain("Załóż konto");
    expect(html).toContain('href="/login"');
    expect(html).toContain("Zaloguj się");
    expect(html).not.toContain("Zalogowano jako");
    expect(html).not.toContain("Wyloguj");
    expect(currentGame).not.toHaveBeenCalled();
    expect(html).toContain('href="/join"');
    expect(html).not.toContain("Utwórz zaproszenie");
  });

  it("shows a signed-in player no sentence about the session and no registration link", async () => {
    signedIn();
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain("Zalogowano jako");
    expect(html).not.toContain("signed-in-as");
    expect(html).not.toContain("/register");
    expect(html).not.toContain("/login");
  });

  it("offers no lobby link to a visitor without an account", async () => {
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain("/lobby");
    // A guest or a visitor has no history (BR-24).
    expect(html).not.toContain("/history");
  });

  it("leaves a signed-in player three actions: the menu in the bar has the account, the history and logout", async () => {
    signedIn();
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    // The lobby is for accounts only (BR-22): the link is there for a signed-in player (#25 Q11).
    expect(html).toContain('href="/lobby"');
    expect(html).toContain("Lobby</a>");
    expect(html).toContain('data-testid="create" data-held="null" data-bot="true"');
    // Two equal secondary buttons side by side, "Masz kod?" no longer a text link.
    expect(html).toContain("grid grid-cols-2");
    expect(html).toMatch(/<a [^>]*href="\/join"[^>]*>Masz kod\?<\/a>/);
    expect(html).not.toMatch(/<a [^>]*href="\/join"[^>]*underline/);
    expect(html).not.toContain('href="/account"');
    expect(html).not.toContain('href="/history"');
    expect(html).not.toContain("Wyloguj");
    expect(currentGame).toHaveBeenCalledWith("u1");
    expect(html).not.toContain("Masz partię");
  });

  it("points a player in a running game back to it", async () => {
    signedIn();
    currentGame.mockResolvedValue({ gameId: "g1", status: "active", seat: 1 });
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("W toku.");
    expect(html).toContain('href="/games/g1"');
    expect(html).toContain('data-held="{&quot;gameId&quot;:&quot;g1&quot;,&quot;status&quot;:&quot;active&quot;}"');
  });

  it("points a player who waits for an opponent to the waiting game", async () => {
    signedIn();
    currentGame.mockResolvedValue({ gameId: "g2", status: "waiting", seat: 1 });
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Czeka na przeciwnika.");
    expect(html).toContain('href="/games/g2"');
  });

  it("confirms a cancelled invitation to the player who came back after cancelling", async () => {
    signedIn();
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({ notice: ["cancelled", "x"] }) }));
    expect(html).toContain('data-testid="notice">Zaproszenie anulowane');
  });

  it.each([[{}], [{ notice: "other" }]])("shows no notice for %j", async (params) => {
    signedIn();
    expect(renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve(params) }))).not.toContain(
      'data-testid="notice"',
    );
  });

  it("confirms the deletion of the account to a visitor without a session (E01-S06)", async () => {
    const html = renderToStaticMarkup(
      await HomePage({ searchParams: Promise.resolve({ notice: "account-deleted" }) }),
    );
    expect(html).toContain('data-testid="notice">Konto zostało usunięte');
  });

  it("does not show the deletion notice to a signed-in player", async () => {
    signedIn();
    const html = renderToStaticMarkup(
      await HomePage({ searchParams: Promise.resolve({ notice: "account-deleted" }) }),
    );
    expect(html).not.toContain('data-testid="notice"');
  });

  it("confirms a cancelled invitation to a guest creator too (E02-S08)", async () => {
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({ notice: "cancelled" }) }));
    expect(html).toContain('data-testid="notice">Zaproszenie anulowane');
  });

  it("offers a visitor the guest game as a secondary button below the main actions (p01.8, L34)", async () => {
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('href="/play"');
    expect(html).toContain("Zagraj ze znajomym bez konta");
    expect(html.indexOf("/register")).toBeLessThan(html.indexOf("/play"));
    expect(html).not.toContain("Masz partię");
  });

  it("does not offer a signed-in player the guest game nor looks for a guest game", async () => {
    signedIn();
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain('href="/play"');
    expect(loadGuestCurrentGame).not.toHaveBeenCalled();
  });

  it.each([
    ["waiting", "Czekasz na przeciwnika."],
    ["active", "Partia w toku."],
  ])("reminds a guest of the %s game (p01.9, L27)", async (status, text) => {
    loadGuestCurrentGame.mockResolvedValue({ gameId: "g5", status, seat: 1 });
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Masz partię");
    expect(html).toContain(text);
    expect(html).toContain('href="/games/g5"');
    expect(html).toContain('href="/play"');
  });

  it("shows the e-mail banner to a player with an unconfirmed address", async () => {
    signedIn();
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('data-testid="banner" data-user="u1">ala@example.com');
  });

  it("shows no banner to a player with a confirmed address", async () => {
    signedIn();
    current!.emailVerifiedAt = new Date();
    expect(renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))).not.toContain('data-testid="banner"');
  });

  it("shows no banner to a guest", async () => {
    expect(renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }))).not.toContain('data-testid="banner"');
  });
});

describe("HomePage in French (E15-S03)", () => {
  beforeEach(() => {
    request.lang = "fr";
  });

  it("words the visitor's page and hands nothing Polish to it", async () => {
    loadGuestCurrentGame.mockResolvedValue({ gameId: "g7", status: "waiting" });
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({ notice: "account-deleted" }) }));
    expect(html).toContain("Cinq alignés gagnent.");
    expect(html).toContain("Règles libres · plateau 15×15");
    expect(html).toContain("Vous attendez un adversaire.");
    expect(html).toContain("Créer un compte");
    expect(html).toContain("Jouer avec un ami sans compte");
    expect(html).toContain('data-testid="notice">Le compte a été supprimé');
    expect(html).not.toMatch(/[ąćęłńóśźż]/);
  });

  it("words the player's page and passes the language to the client components", async () => {
    signedIn();
    currentGame.mockResolvedValue({ gameId: "g1", status: "active" });
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({ notice: "cancelled" }) }));
    expect(html).toContain("Vous avez une partie");
    expect(html).toContain("En cours.");
    expect(html).toContain("Revenir à la partie");
    expect(html).toContain("Salon</a>");
    expect(html).toContain('data-testid="notice">Invitation annulée');
    expect(html).toContain('data-testid="create" data-held="{&quot;gameId&quot;:&quot;g1&quot;,&quot;status&quot;:&quot;active&quot;}" data-bot="true" data-locale="fr"');
    expect(html).toContain('data-testid="banner" data-user="u1" data-locale="fr"');
  });

  it("passes no language to the client components in Polish", async () => {
    request.lang = undefined;
    signedIn();
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain("data-locale");
  });
});
