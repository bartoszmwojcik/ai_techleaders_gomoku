import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, notFound, loadGameView } = vi.hoisted(() => ({
  connection: vi.fn(),
  notFound: vi.fn(),
  loadGameView: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/server/http/game-view", () => ({ loadGameView }));
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

  it("answers 404 for a game that is missing or not the visitor's", async () => {
    loadGameView.mockResolvedValue(null);
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
