// @vitest-environment jsdom
// The lobby, the history and the review in French (E15-S05, package C3); the Polish tests stay next to each screen.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall, push } = vi.hoisted(() => ({ apiCall: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.setConfig({ testTimeout: 30_000 });

import type { GameReview, HistoryEntry } from "@gomoku/core";

import frCommon from "@/i18n/catalogs/fr/common";
import frGame from "@/i18n/catalogs/fr/game";
import frHistory from "@/i18n/catalogs/fr/history";
import frHome from "@/i18n/catalogs/fr/home";
import frLobby from "@/i18n/catalogs/fr/lobby";
import frReview from "@/i18n/catalogs/fr/review";
import { textsOf } from "@/i18n/client";
import { I18nProvider } from "@/i18n/context";
import { historyDetailOf, opponentNameOf } from "@/lib/games/history";
import { sinceLabel } from "@/lib/games/lobby";
import { neutralOutcomeOf, stepStatus } from "@/lib/games/review";

import { ReviewView } from "./games/[gameId]/review/review-view";
import { HistoryView } from "./history/history-view";
import { LobbyPanel } from "./lobby/lobby-panel";

const common = textsOf<"common">(frCommon, { locale: "fr", dict: frCommon });
const game = textsOf<"game">(frGame, { locale: "fr", dict: frGame });
const history = textsOf<"history">(frHistory, { locale: "fr", dict: frHistory });
const home = textsOf<"home">(frHome, { locale: "fr", dict: frHome });
const lobbyT = textsOf<"lobby">(frLobby, { locale: "fr", dict: frLobby });
const reviewT = textsOf<"review">(frReview, { locale: "fr", dict: frReview });

const review = (over: Partial<GameReview> = {}): GameReview => ({
  gameId: "g1",
  variant: "classic",
  finishedAt: "2026-07-15T09:00:00.000Z",
  blackSeat: 1,
  moves: [112, 113, 127],
  result: { winnerSeat: 1, reason: "five_in_row", winLine: [112, 127] },
  players: [
    { seat: 1, kind: "account", displayName: "Ala" },
    { seat: 2, kind: "bot", displayName: "Bot · poziom 2 · 16 MB", bot: { level: 2, memoryMb: 768, tableMb: 16 } },
  ],
  viewerSeat: null,
  ...over,
});
const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  gameId: "g1",
  finishedAt: "2026-07-15T09:00:00.000Z",
  result: "win",
  reason: "five_in_row",
  opponent: { kind: "guest", name: "Gracz 2" },
  variant: "classic",
  ...over,
});

beforeEach(() => {
  apiCall.mockReset();
  push.mockReset();
});
afterEach(cleanup);

describe("the C3 helpers in French", () => {
  it("words the lobby's waiting time, the history's details and the review's steps", () => {
    expect(sinceLabel(30_000, lobbyT)).toBe("cherche depuis un instant");
    expect(sinceLabel(185_000, lobbyT)).toBe("cherche depuis 3 min");
    expect(historyDetailOf(entry(), history, home)).toBe("5 alignés");
    expect(historyDetailOf(entry({ variant: "paper", scores: [7, 5], reason: "points" }), history, home)).toBe("Papier et crayon · 7 : 5");
    expect(historyDetailOf(entry({ variant: "paper", reason: "timeout" }), history, home)).toBe("Papier et crayon · 0 : 0 · Temps écoulé");
    expect(opponentNameOf({ kind: "guest", name: "Gracz 2" }, common).label).toBe("Joueur 2 (invité)");
    expect(opponentNameOf({ kind: "bot", name: "Bot · poziom 2 · 16 MB", bot: { level: 2, memoryMb: 768, tableMb: 16 } }, common).label).toBe(
      "Bot · niveau 2 · 16 Mo",
    );
    expect(opponentNameOf({ kind: "agent", name: "Claude" }, common).label).toBe("Agent · Claude (déclaré)");
    expect(stepStatus(review(), 0, reviewT)).toBe("Début de la partie — le plateau est vide");
    expect(stepStatus(review(), 2, reviewT)).toBe("Coup 2 sur 3 : blanc, colonne I, rangée 8");
  });

  it("words the outcome for somebody who did not play", () => {
    expect(neutralOutcomeOf(review(), game, common).title).toBe("Les noirs gagnent : Ala");
    expect(neutralOutcomeOf(review({ result: { winnerSeat: null, reason: "draw", winLine: null } }), game, common)).toEqual({
      result: "draw",
      title: "Match nul",
      detail: "Le plateau est plein, personne n’a aligné cinq pierres.",
    });
    const paper = neutralOutcomeOf(
      { ...review({ variant: "paper" }), result: { winnerSeat: 2, reason: "points", winLine: null, scores: [5, 7] } },
      game,
      common,
    );
    expect(paper.title).toBe("Le rond gagne : Bot · niveau 2 · 16 Mo · 7 : 5");
    const equal = neutralOutcomeOf({ ...review(), result: { winnerSeat: null, reason: "points", winLine: null, scores: [5, 5] } }, game, common);
    expect(equal).toEqual({ result: "draw", title: "Match nul 5 : 5", detail: "Les points étaient égaux." });
  });
});

describe("the C3 screens in French", () => {
  it("words the lobby", () => {
    render(
      <LobbyPanel
        initial={{ me: null, currentGame: null, seekers: [{ id: "s1", displayName: "Ala", sinceMs: 185_000, expiresInMs: 60_000, variant: "classic", timeControlMs: 600_000 }] }}
        locale="fr"
        dict={frLobby}
        homeTexts={{ locale: "fr", dict: frHome }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Salon" })).toBeTruthy();
    expect(screen.getByText(/^Classique · 10.min · cherche depuis 3.min$/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Jouer avec Ala" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Je cherche un adversaire" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("radiogroup", { name: "Variante" })).toBeTruthy();
  });

  it("words the history, its rows and an expired session", async () => {
    apiCall.mockResolvedValue({ ok: false, error: { code: "UNAUTHORIZED", message: "x" } });
    render(
      <HistoryView
        initial={{ entries: [entry()], nextCursor: "c1" }}
        locale="fr"
        dict={frHistory}
        commonTexts={{ locale: "fr", dict: frCommon }}
        homeTexts={{ locale: "fr", dict: frHome }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Historique des parties" })).toBeTruthy();
    expect(document.body.textContent).toContain("Joueur 2 (invité)");
    expect(document.body.textContent).toContain("Victoire");
    expect(document.body.textContent).toContain("15 juillet 2026, 11:00 CEST");
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Afficher les plus anciennes" })));
    expect(await screen.findByText("Session expirée")).toBeTruthy();
    expect(document.body.textContent).toContain("Reconnectez-vous pour voir les parties plus anciennes.");
  });

  it("names the history's added rows in French", async () => {
    apiCall.mockResolvedValue({ ok: true, data: { entries: [entry({ gameId: "g2" })], nextCursor: null } });
    render(<HistoryView initial={{ entries: [], nextCursor: "c1" }} locale="fr" dict={frHistory} />);
    expect(screen.getByText("Vous n’avez encore joué aucune partie")).toBeTruthy();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Afficher les plus anciennes" })));
    expect(screen.getByTestId("history-added").textContent).toBe("1 partie plus ancienne ajoutée.");
  });

  it("words the review from the providers of the page and the segment", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="fr" dicts={{ common: frCommon, game: frGame, review: frReview, history: frHistory }}>
        <ReviewView review={review()} back={{ href: "/", label: "Retour à l’accueil" }} />
      </I18nProvider>,
    );
    expect(html).toContain("Revue de la partie");
    expect(html).toContain("5 alignés. Cinq pierres alignées.");
    expect(html).toContain("Terminée : 15 juillet 2026, 11:00 CEST");
    expect(html).toContain("Bot · niveau 2 · 16 Mo");
    expect(html).toContain("Coup 3 sur 3");
    expect(html).toContain(">Début<");
    const paper = renderToStaticMarkup(
      <I18nProvider locale="fr" dicts={{ common: frCommon, game: frGame, review: frReview, history: frHistory }}>
        <ReviewView review={review({ variant: "paper", viewerSeat: 1 })} back={{ href: "/", label: "x" }} />
      </I18nProvider>,
    );
    expect(paper).toContain("La vue coup par coup n’est pas disponible");
    expect(paper).toContain("Vous avez gagné");
  });
});
