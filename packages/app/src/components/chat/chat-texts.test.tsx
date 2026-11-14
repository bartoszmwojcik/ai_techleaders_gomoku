// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useChat } = vi.hoisted(() => ({ useChat: vi.fn() }));
vi.mock("./use-chat", () => ({ useChat }));

import frChat from "@/i18n/catalogs/fr/chat";
import frCommon from "@/i18n/catalogs/fr/common";
import { I18nProvider } from "@/i18n/context";
import type { GameView } from "@/server/http/game-view";

import { ChatComposer } from "./chat-composer";
import { ChatPanel } from "./chat-panel";
import { SpectatorChat } from "./spectator-chat";

const inFrench = (tree: ReactNode) => (
  <I18nProvider locale="fr" dicts={{ chat: frChat, common: frCommon }}>
    {tree}
  </I18nProvider>
);
const send = vi.fn();
const chat = (over: Record<string, unknown> = {}) => ({
  loaded: true,
  state: "open",
  messages: [],
  limits: { maxLength: 120, minIntervalMs: 2000 },
  fails: 0,
  pending: null,
  switching: false,
  opponentDisabled: false,
  refresh: vi.fn(),
  send,
  setEnabled: vi.fn(),
  ...over,
});
const players: GameView["players"] = [
  { seat: 1, kind: "account", displayName: "Ala_7", seen: true },
  { seat: 2, kind: "guest", displayName: "Gracz 2", seen: true },
];

beforeEach(() => {
  send.mockReset();
  useChat.mockReset().mockReturnValue(chat());
});
afterEach(cleanup);

describe("ChatComposer in French (E15-S04)", () => {
  const composer = () => render(inFrench(<ChatComposer maxLength={10} blockedReason={null} send={send} />));
  const field = () => screen.getByLabelText(/Message/) as HTMLInputElement;

  it("counts with French plurals and refuses a web address before sending", async () => {
    const user = userEvent.setup();
    composer();
    expect(screen.getByText("10 caractères restants")).toBeTruthy();
    await user.type(field(), "x.com/abcdefgh");
    expect(screen.getByText("4 caractères de trop")).toBeTruthy();
    await user.clear(field());
    await user.type(field(), "a.pl/x");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(screen.getByText("Le message ne peut pas contenir d’adresses web.")).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it("words the server's refusals by their reason and code, the server's sentence otherwise", async () => {
    const user = userEvent.setup();
    composer();
    await user.type(field(), "hej");
    for (const [outcome, text] of [
      [{ ok: false, kind: "field", message: "Wiadomość jest za długa.", reason: "too_long" }, "Le message est trop long."],
      [{ ok: false, kind: "field", message: "Inny komunikat." }, "Inny komunikat."],
      [{ ok: false, kind: "refused", message: "x", code: "CHAT_FULL" }, "Cette partie a déjà atteint le nombre maximal de messages."],
      [{ ok: false, kind: "refused", message: "Komunikat serwera.", code: "CHAT_OTHER" }, "Komunikat serwera."],
      [{ ok: false, kind: "network" }, "Non envoyé : pas de connexion."],
    ] as const) {
      send.mockResolvedValueOnce(outcome);
      await user.click(screen.getByRole("button", { name: "Envoyer" }));
      expect(document.body.textContent).toContain(text);
    }
    expect(screen.getByRole("button", { name: "Renvoyer" })).toBeTruthy();
  });

  it("asks to wait in French", async () => {
    const user = userEvent.setup();
    composer();
    await user.type(field(), "hej");
    send.mockResolvedValueOnce({ ok: false, kind: "wait", message: "x", retryAfterMs: 50 });
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(screen.getByText("Patientez un instant avant le prochain message.")).toBeTruthy();
  });
});

describe("the chat panels in French (E15-S04)", () => {
  it("names the player's panel, the other side and the empty conversation", () => {
    render(inFrench(<ChatPanel gameId="g1" game={{ status: "active", you: { seat: 1, kind: "account" }, players }} onGone={() => {}} />));
    expect(screen.getByText("Discussion")).toBeTruthy();
    expect(document.body.textContent).toContain("avecJoueur 2 (invité)");
    expect(screen.getByText("Personne n’a encore rien écrit. Soyez le premier.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Désactiver la discussion" })).toBeTruthy();
  });

  it("says a waiting game has no chat yet", () => {
    render(inFrench(<ChatPanel gameId="g1" game={{ status: "waiting", you: { seat: 1, kind: "account" }, players }} onGone={() => {}} />));
    expect(screen.getByText("La discussion sera disponible quand l’adversaire aura rejoint la partie.")).toBeTruthy();
  });

  it("tells a spectator without a nickname how to write", () => {
    render(inFrench(<SpectatorChat gameId="g1" players={players} canWrite={false} onGone={() => {}} />));
    expect(screen.getByTestId("chat-read-only").textContent).toContain("Pour écrire dans la discussion");
    expect(screen.getByRole("button", { name: "Réduire la discussion" })).toBeTruthy();
  });
});
