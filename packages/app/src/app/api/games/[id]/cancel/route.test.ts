import { ConflictError, NotFoundError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, cancel, resolveParticipant, getContainer } = vi.hoisted(() => ({
  connection: vi.fn(),
  cancel: vi.fn(),
  resolveParticipant: vi.fn(),
  getContainer: vi.fn(),
}));
const serverConfig = { appOrigin: "https://gomoku.example" };
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/participant", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/http/participant")>()),
  resolveParticipant,
}));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { gameService: { cancel } } }),
}));

import { POST } from "./route";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";

function post(headers: Record<string, string> = {}) {
  const sent: Record<string, string> = {
    origin: serverConfig.appOrigin,
    "x-gomoku-request": "1",
    ...headers,
  };
  for (const name of Object.keys(sent)) if (sent[name] === "") delete sent[name];
  return new Request(`https://gomoku.example/api/games/${GAME}/cancel`, { method: "POST", headers: sent });
}
const context = (id = GAME) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  cancel.mockReset().mockResolvedValue(undefined);
  resolveParticipant
    .mockReset()
    .mockResolvedValue({ gameId: GAME, participant: { playerId: "player-1" } });
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
});

describe("POST /api/games/[id]/cancel", () => {
  it("cancels the caller's waiting game (an account or a guest creator)", async () => {
    const response = await POST(post(), context());
    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: null });
    expect(resolveParticipant).toHaveBeenCalledWith(GAME);
    expect(cancel).toHaveBeenCalledWith({ playerId: "player-1" }, GAME);
  });

  it("answers 404 for a stranger, with or without a session or a guest token", async () => {
    resolveParticipant.mockRejectedValue(new NotFoundError("Nie znaleziono partii."));
    expect((await POST(post(), context())).status).toBe(404);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("answers 404 for a malformed id without touching the service", async () => {
    resolveParticipant.mockRejectedValue(new NotFoundError("Nie znaleziono partii."));
    expect((await POST(post(), context("nope"))).status).toBe(404);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("answers 403 without the CSRF header", async () => {
    expect((await POST(post({ "x-gomoku-request": "" }), context())).status).toBe(403);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("passes on 409 GAME_NOT_CANCELLABLE", async () => {
    cancel.mockRejectedValue(new ConflictError("Nie.", { code: "GAME_NOT_CANCELLABLE" }));
    const response = await POST(post(), context());
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("GAME_NOT_CANCELLABLE");
  });
});
