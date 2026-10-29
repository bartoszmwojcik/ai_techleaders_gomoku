import { NotFoundError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, getState, resolveParticipant } = vi.hoisted(() => ({
  connection: vi.fn(),
  getState: vi.fn(),
  resolveParticipant: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/participant", () => ({ resolveParticipant }));
vi.mock("@/server/container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { gameService: { getState } } }),
}));

import { GET } from "./route";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";
const state = { status: "waiting", you: { seat: 1, kind: "account" }, players: [] };
const context = { params: Promise.resolve({ id: GAME }) };

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  getState.mockReset().mockResolvedValue(state);
  resolveParticipant
    .mockReset()
    .mockResolvedValue({ gameId: GAME, participant: { playerId: "player-1" } });
});

describe("GET /api/games/[id]", () => {
  it("returns the state for the participant", async () => {
    const response = await GET(new Request(`https://gomoku.example/api/games/${GAME}`), context);

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: state });
    expect(resolveParticipant).toHaveBeenCalledWith(GAME);
    expect(getState).toHaveBeenCalledWith({ playerId: "player-1" }, GAME);
  });

  it("answers 404 for a stranger and reads nothing", async () => {
    resolveParticipant.mockRejectedValue(new NotFoundError("Nie znaleziono partii."));
    const response = await GET(new Request("https://gomoku.example/api/games/x"), context);
    expect(response.status).toBe(404);
    expect(getState).not.toHaveBeenCalled();
  });
});
