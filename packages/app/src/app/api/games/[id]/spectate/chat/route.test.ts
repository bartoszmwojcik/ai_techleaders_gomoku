import { ConflictError, ForbiddenError, NotFoundError, TooManyRequestsError, ValidationError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, readAsSpectator, sendAsSpectator, resolveSpectator } = vi.hoisted(() => ({
  connection: vi.fn(),
  readAsSpectator: vi.fn(),
  sendAsSpectator: vi.fn(),
  resolveSpectator: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/spectator", () => ({ resolveSpectator }));
vi.mock("@/server/container", () => ({
  getContainer: async () => ({ cradle: { serverConfig: { sessionCookieSecure: false } } }),
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { chatService: { readAsSpectator, sendAsSpectator } } }),
}));

import { GET, POST } from "./route";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";
const CLIENT_ID = "3f1c1d1e-4a4b-4c4d-8e8f-0a0b0c0d0e0f";
const SPECTATOR = { spectatorId: "s1" };
const context = { params: Promise.resolve({ id: GAME }) };
const message = { id: 1, seat: null, spectatorName: "Ala", text: "hej", createdAt: "2026-11-02T10:00:00.000Z" };
const readData = { state: "open", messages: [message], lastId: 1, limits: { maxLength: 200, minIntervalMs: 2000 } };

const get = (query = "") => new Request(`http://localhost:3000/api/games/${GAME}/spectate/chat${query}`);
function post(body: unknown) {
  return new Request(`http://localhost:3000/api/games/${GAME}/spectate/chat`, {
    method: "POST",
    headers: { origin: "http://localhost:3000", "x-gomoku-request": "1", "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  readAsSpectator.mockReset().mockResolvedValue(readData);
  sendAsSpectator.mockReset().mockResolvedValue({ message, retryAfterMs: 2000, created: true });
  resolveSpectator.mockReset().mockResolvedValue({ gameId: GAME, spectator: SPECTATOR });
});

describe("GET /api/games/[id]/spectate/chat", () => {
  it("reads for the spectator, never cached", async () => {
    const response = await GET(get("?after_id=3&limit=10"), context);
    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, data: readData });
    expect(resolveSpectator).toHaveBeenCalledWith(GAME);
    expect(readAsSpectator).toHaveBeenCalledWith(SPECTATOR, GAME, { afterId: 3, limit: 10 });
  });

  it("asks for the latest page by default", async () => {
    await GET(get(), context);
    expect(readAsSpectator).toHaveBeenCalledWith(SPECTATOR, GAME, { afterId: undefined, limit: 50 });
  });

  it.each(["?after_id=-1", "?limit=0", "?limit=101"])("answers 400 to %s before looking the game up", async (query) => {
    const response = await GET(get(query), context);
    expect(response.status).toBe(400);
    expect(resolveSpectator).not.toHaveBeenCalled();
  });

  it("answers the same 404 to somebody who does not watch the game", async () => {
    resolveSpectator.mockRejectedValue(new NotFoundError("Nie znaleziono partii."));
    const response = await GET(get(), context);
    expect(response.status).toBe(404);
    expect(readAsSpectator).not.toHaveBeenCalled();
  });
});

describe("POST /api/games/[id]/spectate/chat", () => {
  it("answers 201 for a new message and 200 for a retry, without the internal flag", async () => {
    const created = await POST(post({ text: "hej", clientId: CLIENT_ID }), context);
    expect(created.status).toBe(201);
    expect(created.headers.get("Cache-Control")).toBe("no-store");
    expect(await created.json()).toEqual({ ok: true, data: { message, retryAfterMs: 2000 } });
    expect(sendAsSpectator).toHaveBeenCalledWith(SPECTATOR, GAME, { text: "hej", clientId: CLIENT_ID });

    sendAsSpectator.mockResolvedValue({ message, retryAfterMs: 1000, created: false });
    expect((await POST(post({ text: "hej", clientId: CLIENT_ID }), context)).status).toBe(200);
  });

  it("refuses a malformed body with 400 before looking the game up", async () => {
    const response = await POST(post({ text: "hej" }), context);
    expect(response.status).toBe(400);
    expect(resolveSpectator).not.toHaveBeenCalled();
    expect(sendAsSpectator).not.toHaveBeenCalled();
  });

  it.each([
    [new ValidationError("Za długa.", { fieldErrors: { text: ["Za długa."] } }), 400],
    [new ForbiddenError("Aby pisać na czacie, wejdź z nickiem."), 403],
    [new NotFoundError("Nie znaleziono partii."), 404],
    [new ConflictError("Czat niedostępny.", { code: "CHAT_UNAVAILABLE" }), 409],
    [new TooManyRequestsError("Poczekaj.", { retryAfterSeconds: 2, data: { retryAfterMs: 1500 } }), 429],
  ])("passes the service's refusal through (%#)", async (error, status) => {
    sendAsSpectator.mockRejectedValue(error);
    const response = await POST(post({ text: "hej", clientId: CLIENT_ID }), context);
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 404 to somebody who does not watch the game", async () => {
    resolveSpectator.mockRejectedValue(new NotFoundError("Nie znaleziono partii."));
    expect((await POST(post({ text: "hej", clientId: CLIENT_ID }), context)).status).toBe(404);
  });
});
