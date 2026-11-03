// @vitest-environment jsdom
import type { GameReview } from "@gomoku/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReviewView } from "./review-view";

const review = (over: Partial<GameReview> = {}): GameReview => ({
  gameId: "g1",
  variant: "classic",
  finishedAt: "2026-11-02T10:00:00.000Z",
  blackSeat: 1,
  moves: [112, 113, 127],
  result: { winnerSeat: 1, reason: "five_in_row", winLine: [112, 127] },
  players: [
    { seat: 1, kind: "account", displayName: "Ala" },
    { seat: 2, kind: "guest", displayName: "Bob" },
  ],
  viewerSeat: 1,
  ...over,
});
const back = { href: "/history", label: "Wróć do historii" };
const press = (name: string) => act(async () => void fireEvent.click(screen.getByRole("button", { name })));
const step = () => screen.getByTestId("review-step").textContent;
const stones = () => document.querySelectorAll('[role="gridcell"] button[aria-label*="kamień"]').length;

afterEach(cleanup);

// Every render is a 225-button board in jsdom: slow on a loaded machine, so the limit is explicit.
describe("ReviewView", { timeout: 30_000 }, () => {
  it("opens on the final position with the result, how it ended and who played which colour", () => {
    render(<ReviewView review={review()} back={back} />);

    expect(screen.getByRole("heading", { name: "Przegląd partii" })).toBeTruthy();
    expect(screen.getByText("Wygrałeś").closest('[role="status"]')?.textContent).toContain("5 w linii");
    expect(screen.getByTestId("review-finished-at").textContent).toContain("2 listopada 2026, 11:00 CET");
    expect(screen.getByTestId("review-players").textContent).toBe("Czarne: Ty (Ala)Białe: Bob (gość)");
    expect(step()).toBe("Ruch 3 z 3: czarny, kolumna H, rząd 9");
    expect(stones()).toBe(3);
    expect(screen.getByRole("link", { name: "Wróć do historii" }).getAttribute("href")).toBe("/history");
    // No chat (BR-34) and no way to play.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector('[role="grid"]')?.getAttribute("aria-readonly")).toBe("true");
  });

  it("steps back and forward one move at a time and jumps to the start and the end", async () => {
    render(<ReviewView review={review()} back={back} />);

    await press("Poprzedni");
    expect(step()).toBe("Ruch 2 z 3: biały, kolumna I, rząd 8");
    expect(stones()).toBe(2);
    await press("Początek");
    expect(step()).toBe("Początek partii — plansza jest pusta");
    expect(stones()).toBe(0);
    await press("Następny");
    expect(step()).toBe("Ruch 1 z 3: czarny, kolumna H, rząd 8");
    await press("Koniec");
    expect(step()).toBe("Ruch 3 z 3: czarny, kolumna H, rząd 9");
    expect(stones()).toBe(3);
  });

  it("disables the buttons that would go past the ends", async () => {
    render(<ReviewView review={review()} back={back} />);
    const disabled = (name: string) => (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;

    expect([disabled("Początek"), disabled("Poprzedni"), disabled("Następny"), disabled("Koniec")]).toEqual([false, false, true, true]);
    await press("Początek");
    expect([disabled("Początek"), disabled("Poprzedni"), disabled("Następny"), disabled("Koniec")]).toEqual([true, true, false, false]);
  });

  it("marks the winning line and the last move only where they belong", async () => {
    render(<ReviewView review={review()} back={back} />);
    const winMarks = () => document.querySelectorAll("span.outline-4").length;
    const lastMarks = () => document.querySelectorAll("span.outline-2").length;

    // The last stone is in the line, so the thicker outline replaces the thinner one.
    expect([winMarks(), lastMarks()]).toEqual([2, 0]);
    await press("Poprzedni");
    expect([winMarks(), lastMarks()]).toEqual([0, 1]);
    await press("Początek");
    expect([winMarks(), lastMarks()]).toEqual([0, 0]);
  });

  it("speaks to the loser, to a draw and to a reader who did not play", () => {
    const { rerender } = render(<ReviewView review={review({ viewerSeat: 2 })} back={back} />);
    expect(screen.getByText("Przegrałeś")).toBeTruthy();

    rerender(<ReviewView review={review({ result: { winnerSeat: null, reason: "draw", winLine: null } })} back={back} />);
    expect(screen.getByText("Remis").closest('[role="status"]')?.textContent).toContain("Plansza pełna");

    rerender(<ReviewView review={review({ viewerSeat: null })} back={back} />);
    expect(screen.getByText("Wygrały czarne: Ala")).toBeTruthy();
    expect(screen.getByTestId("review-players").textContent).toBe("Czarne: AlaBiałe: Bob (gość)");
  });

  it("names the players by mark, with the marks, in a paper game", () => {
    render(<ReviewView review={review({ variant: "paper", moves: [], viewerSeat: null, result: { winnerSeat: 2, reason: "points", winLine: null } })} back={back} />);
    expect(screen.getByTestId("review-players").textContent).toBe("Krzyżyk: AlaKółko: Bob (gość)");
    expect(screen.getByTestId("review-players").querySelectorAll("path")).toHaveLength(1);
    expect(screen.getByTestId("review-players").querySelectorAll("circle")).toHaveLength(1);
    expect(screen.getByText("Wygrało kółko: Bob (gość)")).toBeTruthy();
    expect(document.querySelector("main")?.textContent).not.toMatch(/czarn|biał/i);
  });

  it("treats a paper game ended by resignation as a paper game, not as an empty classic board", () => {
    render(<ReviewView review={review({ variant: "paper", moves: [], result: { winnerSeat: 2, reason: "resignation", winLine: null } })} back={back} />);
    expect(screen.getByTestId("review-players").textContent).toBe("Krzyżyk: Ty (Ala)Kółko: Bob (gość)");
    expect(screen.getByTestId("review-paper-note")).toBeTruthy();
    expect(document.querySelector("main")?.textContent).not.toMatch(/czarn|biał/i);
  });

  it("reviews a game that ended without a move on the board", () => {
    render(<ReviewView review={review({ moves: [], result: { winnerSeat: 2, reason: "resignation", winLine: null } })} back={back} />);

    expect(step()).toBe("Początek partii — plansza jest pusta");
    expect((screen.getByRole("button", { name: "Następny" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Poprzedni" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("ReviewView, the paper game (E11)", () => {
  it("shows the result and an explanation instead of an empty board", () => {
    render(<ReviewView review={review({ variant: "paper", moves: [], result: { winnerSeat: 1, reason: "points", winLine: null } })} back={back} />);

    expect(screen.getByText("Wygrałeś na punkty")).toBeTruthy();
    expect(screen.getByTestId("review-paper-note").textContent).toContain("Podgląd ruch po ruchu jest niedostępny");
    expect(screen.queryByTestId("review-step")).toBeNull();
    expect(screen.queryByRole("button", { name: "Następny" })).toBeNull();
  });
});
