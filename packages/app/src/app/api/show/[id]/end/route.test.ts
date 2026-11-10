import { ConflictError, NotFoundError } from "@gomoku/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { connection, requireAdminApi, getContainer, end } = vi.hoisted(() => ({
  connection: vi.fn(),
  requireAdminApi: vi.fn(),
  getContainer: vi.fn(),
  end: vi.fn(),
}));
const serverConfig = { appOrigin: "https://gomoku.example" };
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/admin-gate", () => ({ requireAdminApi }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { showService: { end } } }),
}));

import { POST } from "./route";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";
const post = (headers: Record<string, string> = {}) =>
  new Request(`https://gomoku.example/api/show/${GAME}/end`, {
    method: "POST",
    headers: { origin: serverConfig.appOrigin, "x-gomoku-request": "1", ...headers },
  });
const context = (id = GAME) => ({ params: Promise.resolve({ id }) });

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  requireAdminApi.mockReset().mockResolvedValue({ id: "admin-1" });
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
  end.mockReset().mockResolvedValue({ status: "cancelled", closedReason: "ended" });
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe("POST /api/show/[id]/end", () => {
  it("ends the show and logs it", async () => {
    const response = await POST(post(), context());
    expect(connection).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({ ok: true, data: { status: "cancelled", closedReason: "ended" } });
    expect(end).toHaveBeenCalledWith(GAME);
    expect(JSON.parse(String(warn.mock.calls.at(-1)![0]))).toMatchObject({ event: "security.show_ended" });
  });

  it("is a 404 for anybody else (also cross-site) and for a bad id, 403 without CSRF, 409 once finished", async () => {
    expect((await POST(post(), context("nope"))).status).toBe(404);
    expect((await POST(post({ origin: "https://evil.example" }), context())).status).toBe(403);
    end.mockRejectedValueOnce(new ConflictError("Ten pokaz już się zakończył.", { code: "GAME_NOT_ACTIVE" }));
    expect((await POST(post(), context())).status).toBe(409);
    requireAdminApi.mockRejectedValue(new NotFoundError("Nie znaleziono partii."));
    expect((await POST(post({ origin: "https://evil.example" }), context())).status).toBe(404);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
