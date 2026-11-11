import { NotFoundError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, requireAdminApi, read, scheduleBotTurn } = vi.hoisted(() => ({
  scheduleBotTurn: vi.fn(),
  connection: vi.fn(),
  requireAdminApi: vi.fn(),
  read: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/admin-gate", () => ({ requireAdminApi }));
vi.mock("@/server/http/bot-turn", () => ({ scheduleBotTurn }));
vi.mock("@/server/container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { showService: { read } } }),
}));

import { GET } from "./route";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";
const get = (query = "") => new Request(`https://gomoku.example/api/show/${GAME}${query}`);
const context = (id = GAME) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  requireAdminApi.mockReset().mockResolvedValue({ id: "admin-1" });
  scheduleBotTurn.mockReset();
  read.mockReset().mockResolvedValue({ status: "active", drive: { botOnTurn: false, stalled: false } });
});

describe("GET /api/show/[id]", () => {
  it("reads the show after the moves the client knows", async () => {
    const response = await GET(get("?after=4"), context());
    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { status: "active", drive: { botOnTurn: false, stalled: false } } });
    expect(read).toHaveBeenCalledWith(GAME, 4);
    await GET(get(), context());
    expect(read).toHaveBeenLastCalledWith(GAME, 0);
    expect(scheduleBotTurn).not.toHaveBeenCalled();
  });

  it("schedules the move of the bot on turn after the answer (show-mode, \"Driver\")", async () => {
    read.mockResolvedValue({ status: "active", drive: { botOnTurn: true, stalled: false } });
    const response = await GET(get(), context());
    expect(response.status).toBe(200);
    expect(scheduleBotTurn).toHaveBeenCalledExactlyOnceWith(GAME);
  });

  it("is a 404 for anybody else and for a bad id, a 400 for a bad after", async () => {
    expect((await GET(get(), context("nope"))).status).toBe(404);
    expect((await GET(get("?after=-1"), context())).status).toBe(400);
    requireAdminApi.mockRejectedValue(new NotFoundError("Nie znaleziono partii."));
    expect((await GET(get(), context())).status).toBe(404);
    expect(read).not.toHaveBeenCalled();
    expect(scheduleBotTurn).not.toHaveBeenCalled();
  });
});
