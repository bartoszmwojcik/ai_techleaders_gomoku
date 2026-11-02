import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, notFound, loadGameView, loadSpectatorView } = vi.hoisted(() => ({
  loadSpectatorView: vi.fn(),
  connection: vi.fn(),
  notFound: vi.fn(),
  loadGameView: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/server/http/game-view", () => ({ loadGameView }));
vi.mock("@/server/http/spectator-view", () => ({ loadSpectatorView }));
vi.mock("./spectator-room", () => ({
  SpectatorRoom: (props: { gameId: string; initial: { status: string } }) => (
    <div data-testid="spectator-room" data-id={props.gameId} data-status={props.initial.status} />
  ),
}));
vi.mock("./game-room", () => ({
  GameRoom: (props: { gameId: string; ownWaitingNotice: boolean; initial: { status: string } }) => (
    <div data-testid="room" data-id={props.gameId} data-notice={String(props.ownWaitingNotice)} data-status={props.initial.status} />
  ),
}));

import GamePage, { metadata } from "./page";

const render = async (notice?: string | string[]) =>
  renderToStaticMarkup(await GamePage({ params: Promise.resolve({ gameId: "g1" }), searchParams: Promise.resolve({ notice }) }));

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  loadGameView.mockReset().mockResolvedValue({ status: "waiting" });
  loadSpectatorView.mockReset().mockResolvedValue(null);
  notFound.mockReset().mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

describe("GamePage", () => {
  it("stays out of search engines", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("is dynamic and hands the game to the room", async () => {
    const html = await render();
    expect(connection).toHaveBeenCalledOnce();
    expect(loadGameView).toHaveBeenCalledWith("g1");
    expect(html).toContain('data-id="g1"');
    expect(html).toContain('data-status="waiting"');
    expect(html).toContain('data-notice="false"');
  });

  it.each([["own-waiting"], [["own-waiting", "x"]]])("passes the own-waiting notice %j on", async (notice) => {
    expect(await render(notice)).toContain('data-notice="true"');
  });

  it("ignores an unknown notice", async () => {
    expect(await render("other")).toContain('data-notice="false"');
  });

  it("shows the spectator room to somebody who watches the game and is not a player (E10-S02)", async () => {
    loadGameView.mockResolvedValue(null);
    loadSpectatorView.mockResolvedValue({ status: "active" });

    const html = await render();

    expect(loadSpectatorView).toHaveBeenCalledWith("g1");
    expect(html).toContain('data-testid="spectator-room"');
    expect(html).toContain('data-id="g1"');
    expect(html).toContain('data-status="active"');
    expect(notFound).not.toHaveBeenCalled();
  });

  it("does not look for a spectator when the visitor plays", async () => {
    await render();
    expect(loadSpectatorView).not.toHaveBeenCalled();
  });

  it("answers 404 for a game that is missing or not the visitor's", async () => {
    loadGameView.mockResolvedValue(null);
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
