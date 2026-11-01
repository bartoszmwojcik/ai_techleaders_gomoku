import { ConflictError, NotFoundError, TooManyRequestsError, ValidationError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, read, send, resolveParticipant } = vi.hoisted(() => ({
  connection: vi.fn(),
  read: vi.fn(),
  send: vi.fn(),
  resolveParticipant: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/participant", () => ({ resolveParticipant }));
vi.mock("@/server/container", () => ({
  getContainer: async () => ({ cradle: { serverConfig: { sessionCookieSecure: false } } }),
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { chatService: { read, send } } }),
}));

import { GET, POST } from "./route";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";
const CLIENT_ID = "3f1c1d1e-4a4b-4c4d-8e8f-0a0b0c0d0e0f";
const PARTICIPANT = { playerId: "player-1" };
const context = { params: Promise.resolve({ id: GAME }) };
const message = { id: 1, seat: 1, text: "hej", createdAt: "2026-11-01T10:00:00.000Z" };
const readData = { state: "open", messages: [message], lastId: 1, limits: { maxLength: 200, minIntervalMs: 2000 } };

const get = (query = "") => new Request(`http://localhost:3000/api/games/${GAME}/chat${query}`);
function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000/api/games/${GAME}/chat`, {
    method: "POST",
    headers: { origin: "http://localhost:3000", "x-gomoku-request": "1", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  read.mockReset().mockResolvedValue(readData);
  send.mockReset().mockResolvedValue({ message, retryAfterMs: 2000, created: true });
  resolveParticipant.mockReset().mockResolvedValue({ gameId: GAME, participant: PARTICIPANT });
});

describe("GET /api/games/[id]/chat", () => {
  it("reads for the participant, never cached", async () => {
    const response = await GET(get("?after_id=3&limit=10"), context);

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("ETag")).toBeNull();
    expect(await response.json()).toEqual({ ok: true, data: readData });
    expect(resolveParticipant).toHaveBeenCalledWith(GAME);
    expect(read).toHaveBeenCalledWith(PARTICIPANT, GAME, { afterId: 3, limit: 10 });
  });

  it("asks for the latest page by default", async () => {
    await GET(get(), context);
    expect(read).toHaveBeenCalledWith(PARTICIPANT, GAME, { afterId: undefined, limit: 50 });
  });

  it.each(["?after_id=-1", "?after_id=abc", "?after_id=2147483648", "?limit=0", "?limit=101"])(
    "answers 400 to %s before looking the game up",
    async (query) => {
      const response = await GET(get(query), context);
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(resolveParticipant).not.toHaveBeenCalled();
    },
  );

  it("answers the same 404 to a stranger", async () => {
    resolveParticipant.mockRejectedValue(new NotFoundError("Nie znaleziono partii."));
    const response = await GET(get(), context);
    expect(response.status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });
});

describe("POST /api/games/[id]/chat", () => {
  it("answers 201 with the message and the wait for a new one, without the internal flag", async () => {
    const response = await POST(post({ text: "hej", clientId: CLIENT_ID }), context);

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, data: { message, retryAfterMs: 2000 } });
    expect(send).toHaveBeenCalledWith(PARTICIPANT, GAME, { text: "hej", clientId: CLIENT_ID });
  });

  it("answers 200 to a retry of the same attempt", async () => {
    send.mockResolvedValue({ message, retryAfterMs: 0, created: false });
    const response = await POST(post({ text: "hej", clientId: CLIENT_ID }), context);
    expect(response.status).toBe(200);
  });

  it("rejects a request without the CSRF header or with a foreign origin", async () => {
    const noHeader = new Request(`http://localhost:3000/api/games/${GAME}/chat`, {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: "{}",
    });
    expect((await POST(noHeader, context)).status).toBe(403);
    expect((await POST(post({}, { origin: "https://evil.example" }), context)).status).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["not json"],
    [{ text: "hej" }],
    [{ clientId: CLIENT_ID }],
    [{ text: "hej", clientId: "nope" }],
    [{ text: "hej", clientId: CLIENT_ID, userId: "x" }],
    [{ text: "a".repeat(1001), clientId: CLIENT_ID }],
  ])("answers 400 to invalid input %j before looking the game up", async (body) => {
    const response = await POST(post(body), context);
    expect(response.status).toBe(400);
    expect(resolveParticipant).not.toHaveBeenCalled();
  });

  it("answers 404 to a stranger without calling the service", async () => {
    resolveParticipant.mockRejectedValue(new NotFoundError("Nie znaleziono partii."));
    expect((await POST(post({ text: "hej", clientId: CLIENT_ID }), context)).status).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });

  it("maps the service refusals: 400 with the field error, 409 with its code, 429 with Retry-After", async () => {
    send.mockRejectedValueOnce(
      new ValidationError("Wiadomość jest za długa.", { fieldErrors: { text: ["Wiadomość jest za długa."] }, data: { reason: "too_long" } }),
    );
    const refused = await POST(post({ text: "x", clientId: CLIENT_ID }), context);
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toMatchObject({ fieldErrors: { text: ["Wiadomość jest za długa."] }, data: { reason: "too_long" } });

    send.mockRejectedValueOnce(new ConflictError("Czat jest wyłączony.", { code: "CHAT_DISABLED" }));
    const disabled = await POST(post({ text: "x", clientId: CLIENT_ID }), context);
    expect(disabled.status).toBe(409);
    expect((await disabled.json()).error.code).toBe("CHAT_DISABLED");

    send.mockRejectedValueOnce(
      new TooManyRequestsError("Poczekaj.", { retryAfterSeconds: 2, data: { retryAfterMs: 1500 } }),
    );
    const limited = await POST(post({ text: "x", clientId: CLIENT_ID }), context);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("2");
    expect((await limited.json()).error).toMatchObject({ code: "RATE_LIMITED", data: { retryAfterMs: 1500 } });
  });

  it("logs nothing with the text of the message when the service fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    send.mockRejectedValue(new Error("insert into chat_messages values ('sekretna tresc')"));
    const response = await POST(post({ text: "sekretna tresc", clientId: CLIENT_ID }), context);

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("sekretna");
    for (const call of [...error.mock.calls, ...log.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain("sekretna");
      expect(JSON.stringify(call)).not.toContain(CLIENT_ID);
    }
    error.mockRestore();
    log.mockRestore();
  });
});
