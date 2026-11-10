import { NotFoundError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, requireAdminApi, getContainer, preflight } = vi.hoisted(() => ({
  connection: vi.fn(),
  requireAdminApi: vi.fn(),
  getContainer: vi.fn(),
  preflight: vi.fn(),
}));
const serverConfig = { appOrigin: "https://gomoku.example" };
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/admin-gate", () => ({ requireAdminApi }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { showService: { preflight } } }),
}));

import { POST } from "./route";

const post = (body: unknown) =>
  new Request("https://gomoku.example/api/show/preflight", {
    method: "POST",
    headers: { origin: serverConfig.appOrigin, "x-gomoku-request": "1" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  requireAdminApi.mockReset().mockResolvedValue({ id: "admin-1" });
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
  preflight.mockReset().mockResolvedValue({ ok: true, checks: [] });
});

describe("POST /api/show/preflight", () => {
  it("runs the cheap checks for the chosen levels", async () => {
    const response = await POST(post({ layout: "bot-bot", levels: [2, 1] }));
    expect(connection).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({ ok: true, data: { ok: true, checks: [] } });
    expect(preflight).toHaveBeenCalledWith({ layout: "bot-bot", levels: [2, 1] });
  });

  it("is a 404 for anybody else and a 400 for a bad body", async () => {
    expect((await POST(post({ layout: "bot-bot" }))).status).toBe(400);
    requireAdminApi.mockRejectedValue(new NotFoundError("Nie znaleziono partii."));
    expect((await POST(post({ layout: "bot-bot", levels: [1, 1] }))).status).toBe(404);
    expect(preflight).not.toHaveBeenCalled();
  });
});
