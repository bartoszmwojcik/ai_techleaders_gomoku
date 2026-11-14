// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall, push } = vi.hoisted(() => ({ apiCall: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/chat/chat-panel", () => ({ ChatPanel: () => <div data-testid="chat-stub" /> }));
vi.setConfig({ testTimeout: 20_000 });

import frCommon from "@/i18n/catalogs/fr/common";
import frGame from "@/i18n/catalogs/fr/game";
import { textsOf } from "@/i18n/client";
import { I18nProvider } from "@/i18n/context";
import { PL_GAME } from "@/lib/games/play";
import type { GameView } from "@/server/http/game-view";

import { AudienceClosedScreen } from "./audience-closed";
import { BotReplay } from "./bot-replay";
import { CloseAudience } from "./close-audience";
import { GameGate } from "./game-gate";
import { PlayField } from "./play-field";
import { PlayerLabel } from "./player-label";
import { PublicFlag } from "./public-flag";
import { PublicGameQr } from "./public-game-qr";
import { RematchPanel } from "./rematch-panel";

const fr = textsOf<"game">(frGame, { locale: "fr", dict: frGame });
const frc = textsOf<"common">(frCommon, { locale: "fr", dict: frCommon });
const inFrench = (tree: ReactNode) => (
  <I18nProvider locale="fr" dicts={{ game: frGame, common: frCommon }}>
    {tree}
  </I18nProvider>
);

const player = (seat: 1 | 2, name: string | null, kind: "account" | "guest" | "bot" = "account") => ({ seat, kind, displayName: name, seen: true });
const game = (over: Partial<GameView> = {}): GameView => ({
  status: "active",
  variant: "classic",
  timeControlMs: 600_000,
  you: { seat: 1, kind: "account" },
  players: [player(1, "Ala_7"), player(2, "Gracz 2", "guest")],
  moveCount: 0,
  blackSeat: 1,
  turnSeat: 1,
  moves: [],
  result: null,
  clock: { remainingMs: [600_000, 600_000] as [number, number], running: null, now: 0 },
  ...over,
});
const noop = () => {};
const field = (over: Partial<GameView> = {}, pollFails = 0) =>
  inFrench(<PlayField gameId="g1" game={game(over)} pollFails={pollFails} onState={noop} onRefresh={noop} onAccepting={noop} onGone={noop} />);

beforeEach(() => {
  apiCall.mockReset();
  push.mockReset();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
});
afterEach(cleanup);

describe("the game room's leaves in French (E15-S04)", () => {
  it("words the gate, the closed audience, the flag and the QR code; Polish without a translator", () => {
    expect(renderToStaticMarkup(<GameGate t={fr} />)).toContain("Cette partie n’existe pas");
    expect(renderToStaticMarkup(<AudienceClosedScreen t={fr} />)).toContain("Le créateur a fermé le public");
    expect(renderToStaticMarkup(<PublicFlag audience={{ spectators: 3 }} t={fr} />)).toContain("Partie publique · spectateurs : ");
    expect(renderToStaticMarkup(<PublicGameQr gameId="g1" audience={{ spectators: 0 }} t={fr} />)).toContain("Montrer la partie à d’autres");
    expect(renderToStaticMarkup(<GameGate t={PL_GAME} />)).toContain("Ta partia nie istnieje");
  });

  it("labels a participant: you, a guest and a declared agent", () => {
    const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);
    expect(html(<PlayerLabel name={{ nick: "Ala_7", guest: false, label: "Ala_7" }} you t={frc} />)).toBe("Vous (Ala_7)");
    const guest = html(<PlayerLabel name={{ nick: "Joueur 2", guest: true, label: "Joueur 2 (invité)" }} you t={frc} />);
    expect(guest).toContain("Vous : ");
    expect(guest).toContain(" (invité)");
    const agent = html(<PlayerLabel name={{ nick: "Agent", guest: false, label: "Agent · C (déclaré)", agent: { declared: "C" } }} t={frc} />);
    expect(agent).toContain(" (déclaré)");
  });
});

describe("PlayField in French (E15-S04)", () => {
  it("words the turn, the clocks, the guest's default name and the resignation", () => {
    render(field());
    expect(screen.getByText("Partie en cours")).toBeTruthy();
    expect(screen.getByText("À vous de jouer (noirs)")).toBeTruthy();
    expect(document.body.textContent).toContain("Joueur 2");
    expect(document.body.textContent).toContain("Tirage au sort : vous jouez les noirs.");
    expect(document.querySelector('[aria-label="Colonne H, rangée 8, vide"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abandonner la partie" })).toBeTruthy();
  });

  it("words a refused move and the poll problems", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "CELL_OCCUPIED", message: "x" } });
    render(field({}, 3));
    expect(screen.getByText("Impossible de vérifier l’état de la partie. Nouvelles tentatives en cours.")).toBeTruthy();
    await act(async () => document.querySelector<HTMLElement>('[aria-label="Colonne H, rangée 8, vide"]')!.click());
    expect(await screen.findByText("Cette intersection est déjà occupée")).toBeTruthy();
  });

  it("words the result, the paper game and the bot", () => {
    const finished = renderToStaticMarkup(
      field({ status: "finished", turnSeat: null, result: { reason: "five_in_row", winnerSeat: 1, winLine: null } as GameView["result"] }),
    );
    expect(finished).toContain("Fin de la partie");
    expect(finished).toContain("Vous avez gagné");
    expect(finished).toContain("Revanche");

    const paper = renderToStaticMarkup(
      field({
        variant: "paper",
        paper: { moves: [], scores: [2, 1], fives: [], autoSeat: null },
      } as unknown as Partial<GameView>),
    );
    expect(paper).toContain("À vous de jouer (croix)");
    expect(paper).toContain(" · points : 2");

    const bot = renderToStaticMarkup(
      field({
        turnSeat: 2,
        players: [player(1, "Ala_7"), { ...player(2, "Bot · poziom 2 · 16 MB", "bot"), bot: { level: 2, memoryMb: 768, tableMb: 16 } }],
      }),
    );
    expect(bot).toContain("Le bot réfléchit…");
    expect(bot).toContain("Bot · niveau 2 · 16 Mo");
  });
});

describe("the end of a game in French (E15-S04)", () => {
  it("words the bot replay and its refusals", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "network", message: "x" } });
    render(inFrench(<BotReplay level={2} guest={false} />));
    expect(screen.getByText("Partie suivante")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Rejouer contre le bot" }));
    expect(await screen.findByText("Impossible de joindre le serveur. Réessayez.")).toBeTruthy();
  });

  it("words the rematch offer of the opponent", () => {
    const html = renderToStaticMarkup(
      inFrench(
        <RematchPanel
          gameId="g1"
          game={game({ status: "finished", turnSeat: null, rematch: { state: "pending", offeredBy: 2, expiresAt: 60_000 } as unknown as GameView["rematch"] })}
          reopened={false}
          onState={noop}
          onRefresh={noop}
          onAccepting={noop}
          onGone={noop}
        />,
      ),
    );
    expect(html).toContain("Revanche");
    expect(html).toContain("Accepter");
    expect(html).toContain("Refuser");
    expect(html).toContain("Retour à la page principale");
  });

  it("words closing the audience", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "network", message: "x" } });
    render(inFrench(<CloseAudience gameId="g1" game={{ canCloseAudience: true }} onState={noop} onRefresh={noop} onGone={noop} />));
    await userEvent.click(screen.getByRole("button", { name: "Fermer le public" }));
    expect(await screen.findByRole("alertdialog", { name: /^Fermer le public.\?$/ })).toBeTruthy();
    const closedNote = renderToStaticMarkup(inFrench(<CloseAudience gameId="g1" game={{ audienceClosed: true }} onState={noop} onRefresh={noop} onGone={noop} />));
    expect(closedNote).toContain("Public fermé par le créateur");
  });
});
