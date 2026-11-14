// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push, apiCall } = vi.hoisted(() => ({ push: vi.fn(), apiCall: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api-client", () => ({ apiCall }));
// A value unlike the real one, so the text must come from the constant, not be typed in.
vi.mock("@gomoku/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@gomoku/core")>()),
  CREATE_GAME_LIMIT: 7,
}));

import frHome from "@/i18n/catalogs/fr/home";

import { CreateGameButton } from "./create-game-button";
import { HomeRulesLine, HomeRulesProvider } from "./home-rules";

const failure = (error: { code: string; retryAfterSeconds?: number }) => ({
  ok: false,
  error: { message: "x", ...error },
});
const click = () => userEvent.setup().click(screen.getByRole("button", { name: "Utwórz zaproszenie" }));

beforeEach(() => {
  push.mockReset();
  apiCall.mockReset();
});
afterEach(cleanup);

describe("CreateGameButton", () => {
  it("creates the game, opens its page and stays busy while navigating", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { gameId: "g1" } });
    render(<CreateGameButton heldGame={null} />);
    await click();
    expect(apiCall).toHaveBeenCalledWith("/api/games", {});
    expect(push).toHaveBeenCalledWith("/games/g1");
    const busy = screen.getByRole("button", { name: "Tworzenie zaproszenia…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
  });

  it("makes the create button the large main action, set apart from the settings", () => {
    render(<CreateGameButton heldGame={null} />);
    const button = screen.getByRole("button", { name: "Utwórz zaproszenie" });
    expect(button.className).toContain("min-h-target-large");
    expect(button.className).toContain("w-full");
    expect(button.parentElement?.className).toContain("border-t");
  });

  it("offers 'Partia publiczna', unticked, and sends isPublic only when it is ticked (BR-40)", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { gameId: "g1" } });
    render(<CreateGameButton heldGame={null} />);
    const box = screen.getByRole("checkbox", { name: /Partia publiczna/ });
    expect(box.getAttribute("aria-checked")).toBe("false");
    const u = userEvent.setup();
    await u.click(box);
    await u.click(screen.getByRole("button", { name: "Utwórz zaproszenie" }));
    expect(apiCall).toHaveBeenCalledWith("/api/games", { body: { isPublic: true } });
  });

  it("sends only one request while busy", async () => {
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<CreateGameButton heldGame={null} />);
    const button = screen.getByRole("button", { name: "Utwórz zaproszenie" });
    await act(async () => {
      // Two clicks in one batch: React has not re-rendered the disabled state between them.
      button.click();
      button.click();
    });
    expect(apiCall).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, data: { gameId: "g1" } }));
  });

  it("takes a player who already waits in a game to that game, with a notice (L01)", async () => {
    apiCall.mockResolvedValue(failure({ code: "ACTIVE_GAME_EXISTS" }));
    render(<CreateGameButton heldGame={{ gameId: "g9", status: "waiting" }} />);
    await click();
    expect(push).toHaveBeenCalledWith("/games/g9?notice=own-waiting");
  });

  it("tells a player with a game in progress to finish it first, with a link", async () => {
    apiCall.mockResolvedValue(failure({ code: "ACTIVE_GAME_EXISTS" }));
    render(<CreateGameButton heldGame={{ gameId: "g9", status: "active" }} />);
    await click();
    expect(screen.getByText("Masz już partię")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Przejdź do partii" }).getAttribute("href")).toBe("/games/g9");
    expect(push).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Utwórz zaproszenie" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("omits the link when the page does not know the game", async () => {
    apiCall.mockResolvedValue(failure({ code: "ACTIVE_GAME_EXISTS" }));
    render(<CreateGameButton heldGame={null} />);
    await click();
    expect(screen.getByText("Masz już partię")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it.each([
    [90, "Spróbuj ponownie za 2 min."],
    [undefined, "Spróbuj ponownie za jakiś czas."],
  ])("shows the creation limit with Retry-After %s", async (retryAfterSeconds, text) => {
    apiCall.mockResolvedValue(failure({ code: "RATE_LIMITED", retryAfterSeconds }));
    render(<CreateGameButton heldGame={null} />);
    await click();
    expect(screen.getByText("Zbyt wiele zaproszeń")).toBeTruthy();
    expect(screen.getByText(new RegExp(`Limit to 7 utworzeń na godzinę. ${text}`))).toBeTruthy();
  });

  it("asks an expired session to sign in again", async () => {
    apiCall.mockResolvedValue(failure({ code: "UNAUTHORIZED" }));
    render(<CreateGameButton heldGame={null} />);
    await click();
    expect(screen.getByRole("link", { name: "Zaloguj się ponownie" }).getAttribute("href")).toBe("/login?next=%2F");
  });

  it.each([
    ["network", "Brak połączenia"],
    ["INTERNAL", "Nie udało się utworzyć partii"],
  ])("offers a retry after %s", async (code, title) => {
    apiCall.mockResolvedValueOnce(failure({ code }));
    render(<CreateGameButton heldGame={null} />);
    await click();
    expect(screen.getByText(title)).toBeTruthy();
    apiCall.mockResolvedValueOnce({ ok: true, data: { gameId: "g2" } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(push).toHaveBeenCalledWith("/games/g2");
  });

  it("clears the previous failure when trying again", async () => {
    apiCall.mockResolvedValueOnce(failure({ code: "INTERNAL" }));
    render(<CreateGameButton heldGame={null} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Utwórz zaproszenie" }));
    expect(screen.getByText("Nie udało się utworzyć partii")).toBeTruthy();
    apiCall.mockResolvedValueOnce({ ok: true, data: { gameId: "g2" } });
    await user.click(screen.getByRole("button", { name: "Utwórz zaproszenie" }));
    expect(screen.queryByText("Nie udało się utworzyć partii")).toBeNull();
  });
});

describe("CreateGameButton, game settings (E11)", () => {
  it("offers the variant, classic by default", () => {
    render(<CreateGameButton heldGame={null} />);
    expect(screen.getByRole("radio", { name: "Klasyczny" }).getAttribute("aria-checked")).toBe("true");
  });

  it("switches the rules line next to the picker with the chosen variant", async () => {
    render(
      <HomeRulesProvider>
        <HomeRulesLine />
        <CreateGameButton heldGame={null} />
      </HomeRulesProvider>,
    );
    const u = userEvent.setup();
    expect(screen.getByTestId("home-rules").textContent).toContain("Swobodne zasady");
    await u.click(screen.getByRole("radio", { name: "Papier i ołówek" }));
    expect(screen.getByTestId("home-rules").textContent).toBe("Kółko i krzyżyk na kartce papieru, 5 w linii, gra na czas.");
    await u.click(screen.getByRole("radio", { name: "Klasyczny" }));
    expect(screen.getByTestId("home-rules").textContent).toContain("Swobodne zasady");
  });

  it("sends the paper variant and the picked clock, with isPublic when ticked", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { gameId: "g2" } });
    render(<CreateGameButton heldGame={null} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole("radio", { name: "Papier i ołówek" }));
    await u.click(screen.getByRole("radio", { name: "2 min" }));
    await u.click(screen.getByRole("button", { name: "Utwórz zaproszenie" }));
    expect(apiCall).toHaveBeenCalledWith("/api/games", { body: { variant: "paper", timeControlMs: 120_000 } });

    apiCall.mockClear();
    cleanup();
    render(<CreateGameButton heldGame={null} />);
    await u.click(screen.getByRole("radio", { name: "Papier i ołówek" }));
    await u.click(screen.getByRole("checkbox", { name: /Partia publiczna/ }));
    await u.click(screen.getByRole("button", { name: "Utwórz zaproszenie" }));
    expect(apiCall).toHaveBeenCalledWith("/api/games", { body: { isPublic: true, variant: "paper", timeControlMs: 180_000 } });
  });
});

describe("CreateGameButton with the bot (hosted-bot UI/UX)", () => {
  it("hides the opponent while the bot is switched off (R19)", () => {
    render(<CreateGameButton heldGame={null} />);
    expect(screen.queryByRole("radiogroup", { name: "Przeciwnik" })).toBeNull();
  });

  it("creates a game with the bot at the picked level, private, and opens it", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { gameId: "g-bot" } });
    render(<CreateGameButton heldGame={null} botEnabled />);
    const u = userEvent.setup();
    await u.click(screen.getByRole("radio", { name: "Bot" }));
    // A game with the bot cannot be public (R14): the box is gone.
    expect(screen.queryByRole("checkbox", { name: /Partia publiczna/ })).toBeNull();
    await u.click(screen.getByRole("radio", { name: "Poziom 2" }));
    await u.click(screen.getByRole("button", { name: "Zagraj z botem" }));
    expect(apiCall).toHaveBeenCalledWith("/api/games", { body: { opponent: "bot", botLevel: 2 } });
    expect(push).toHaveBeenCalledWith("/games/g-bot");
    expect((screen.getByRole("button", { name: "Tworzenie partii…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("goes back to an invitation when the paper game is picked (BR-56)", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { gameId: "g1" } });
    render(<CreateGameButton heldGame={null} botEnabled />);
    const u = userEvent.setup();
    await u.click(screen.getByRole("radio", { name: "Bot" }));
    await u.click(screen.getByRole("radio", { name: "Papier i ołówek" }));
    expect(screen.getByText("Bot gra tylko w klasyka.")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Utwórz zaproszenie" }));
    expect(apiCall).toHaveBeenCalledWith("/api/games", { body: { variant: "paper", timeControlMs: 180_000 } });
  });

  it("says the bot is unavailable on 503 and lets the player try again", async () => {
    apiCall.mockResolvedValue(failure({ code: "BOT_UNAVAILABLE" }));
    render(<CreateGameButton heldGame={null} botEnabled />);
    const u = userEvent.setup();
    await u.click(screen.getByRole("radio", { name: "Bot" }));
    await u.click(screen.getByRole("button", { name: "Zagraj z botem" }));
    expect(screen.getByRole("alert").textContent).toContain("Bot jest teraz niedostępny. Spróbuj za chwilę albo zaproś osobę.");
    expect((screen.getByRole("button", { name: "Zagraj z botem" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("CreateGameButton in French (E15-S03)", () => {
  const fr = { locale: "fr", dict: frHome } as const;
  const create = () => userEvent.setup().click(screen.getByRole("button", { name: "Créer une invitation" }));

  it("labels the settings and words every refusal", async () => {
    render(<CreateGameButton heldGame={{ gameId: "g1", status: "active" }} botEnabled {...fr} />);
    expect(screen.getByRole("radiogroup", { name: "Variante" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Adversaire" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Partie publique/ })).toBeTruthy();
    for (const [error, text] of [
      [{ code: "ACTIVE_GAME_EXISTS" }, "Terminez d’abord votre partie en cours."],
      [{ code: "RATE_LIMITED", retryAfterSeconds: 60 }, "La limite est de 7 parties par heure."],
      [{ code: "UNAUTHORIZED" }, "Reconnectez-vous pour créer une invitation."],
      [{ code: "BOT_UNAVAILABLE" }, "Le bot est indisponible pour le moment."],
      [{ code: "INTERNAL" }, "Erreur du serveur. Réessayez."],
      [{ code: "network" }, "Impossible de joindre le serveur. Réessayez."],
    ] as const) {
      apiCall.mockResolvedValue(failure(error));
      await create();
      expect(document.body.textContent).toContain(text);
    }
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  });

  it("names the bot game and the busy states", async () => {
    apiCall.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<CreateGameButton heldGame={null} botEnabled {...fr} />);
    await user.click(screen.getByRole("radio", { name: "Bot" }));
    expect(screen.getByRole("radiogroup", { name: "Niveau du bot" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Jouer contre le bot" }));
    expect(screen.getByRole("button", { name: "Création de la partie…" })).toBeTruthy();
  });
});
