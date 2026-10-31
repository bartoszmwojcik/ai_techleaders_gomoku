import { UnauthorizedError, ValidationError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, requireSession, list, getContainer } = vi.hoisted(() => ({
  connection: vi.fn(),
  requireSession: vi.fn(),
  list: vi.fn(),
  getContainer: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ requireSession }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { gameHistoryService: { list } } }),
}));

import { GET } from "./route";

const page = { entries: [], nextCursor: null };

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  requireSession.mockReset().mockResolvedValue({ id: "user-1" });
  list.mockReset().mockResolvedValue(page);
});

describe("GET /api/history", () => {
  it("answers 200 with the first page of the signed-in user", async () => {
    const response = await GET(new Request("https://gomoku.example/api/history"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: page });
    expect(connection).toHaveBeenCalledOnce();
    expect(list).toHaveBeenCalledExactlyOnceWith("user-1", { cursor: undefined });
  });

  it("passes the cursor on", async () => {
    await GET(new Request("https://gomoku.example/api/history?cursor=abc"));

    expect(list).toHaveBeenCalledExactlyOnceWith("user-1", { cursor: "abc" });
  });

  it("answers 400 for a cursor that is too long and reads nothing", async () => {
    const response = await GET(new Request(`https://gomoku.example/api/history?cursor=${"a".repeat(201)}`));

    expect(response.status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });

  it("answers 400 when the service refuses the cursor", async () => {
    list.mockRejectedValue(new ValidationError("Nieprawidłowy parametr cursor."));

    expect((await GET(new Request("https://gomoku.example/api/history?cursor=x"))).status).toBe(400);
  });

  it("answers 401 without a session and reads nothing", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("Zaloguj się, aby kontynuować."));

    const response = await GET(new Request("https://gomoku.example/api/history"));

    expect(response.status).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });
});
