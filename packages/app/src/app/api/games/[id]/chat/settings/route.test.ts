import { ConflictError, ForbiddenError, NotFoundError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, setEnabled, resolveParticipant } = vi.hoisted(() => ({
  connection: vi.fn(),
  setEnabled: vi.fn(),
  resolveParticipant: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/participant", () => ({ resolveParticipant }));
vi.mock("@/server/container", () => ({
  getContainer: async () => ({ cradle: { serverConfig: { sessionCookieSecure: false } } }),
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { chatService: { setEnabled } } }),
}));

import { PUT } from "./route";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";
const PARTICIPANT = { playerId: "player-1" };
const context = { params: Promise.resolve({ id: GAME }) };

function put(body: unknown, { csrf = true }: { csrf?: boolean } = {}) {
  return new Request(`http://localhost:3000/api/games/${GAME}/chat/settings`, {
    method: "PUT",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
      ...(csrf ? { "x-gomoku-request": "1" } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  setEnabled.mockReset().mockResolvedValue({ state: "disabled_by_you" });
  resolveParticipant.mockReset().mockResolvedValue({ gameId: GAME, participant: PARTICIPANT });
});

describe("PUT /api/games/[id]/chat/settings", () => {
  it("sets the chat for the participant and answers only with the state, never cached", async () => {
    const response = await PUT(put({ enabled: false }), context);

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, data: { state: "disabled_by_you" } });
    expect(resolveParticipant).toHaveBeenCalledWith(GAME);
    expect(setEnabled).toHaveBeenCalledWith(PARTICIPANT, GAME, false);
  });

  it.each([{}, { enabled: "false" }, { enabled: 0 }, { enabled: true, extra: 1 }, "not json"])(
    "answers 400 to %j without echoing it and before looking the game up",
    async (body) => {
      const response = await PUT(put(body), context);
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(resolveParticipant).not.toHaveBeenCalled();
      expect(setEnabled).not.toHaveBeenCalled();
    },
  );

  it("answers 403 without the request header", async () => {
    const response = await PUT(put({ enabled: false }, { csrf: false }), context);
    expect(response.status).toBe(403);
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it("answers the same 404 to a stranger", async () => {
    resolveParticipant.mockRejectedValue(new NotFoundError("Nie znaleziono partii."));
    expect((await PUT(put({ enabled: false }), context)).status).toBe(404);
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it("passes on 409 CHAT_UNAVAILABLE and 403 for an agent", async () => {
    setEnabled.mockRejectedValueOnce(new ConflictError("Czat jest niedostępny.", { code: "CHAT_UNAVAILABLE" }));
    const conflict = await PUT(put({ enabled: true }), context);
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe("CHAT_UNAVAILABLE");
    setEnabled.mockRejectedValueOnce(new ForbiddenError("Nie."));
    expect((await PUT(put({ enabled: true }), context)).status).toBe(403);
  });
});
