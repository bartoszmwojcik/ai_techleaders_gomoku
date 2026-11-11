import { ConflictError, NotFoundError } from "@gomoku/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { connection, requireAdminApi, getContainer, showService } = vi.hoisted(() => ({
  connection: vi.fn(),
  requireAdminApi: vi.fn(),
  getContainer: vi.fn(),
  showService: { overview: vi.fn(), create: vi.fn() },
}));
const serverConfig = { appOrigin: "https://gomoku.example" };
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/admin-gate", () => ({ requireAdminApi }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { showService } }),
}));

import { GET, POST } from "./route";

const URL_ = "https://gomoku.example/api/show";
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(URL_, {
    method: "POST",
    headers: { origin: serverConfig.appOrigin, "x-gomoku-request": "1", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const notFound = () => new NotFoundError("Nie znaleziono partii.");

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  requireAdminApi.mockReset().mockResolvedValue({ id: "admin-1" });
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
  showService.overview.mockReset().mockResolvedValue({ enabled: true, current: null });
  showService.create.mockReset().mockResolvedValue({ gameId: "g-1", layout: "bot-bot", bots: [] });
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe("GET /api/show", () => {
  it("gives the administrator the overview, uncached", async () => {
    const response = await GET(new Request(URL_));
    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: true, data: { enabled: true, current: null } });
  });

  it("is the 404 of a missing game for anybody else, before anything is read", async () => {
    requireAdminApi.mockRejectedValue(notFound());
    const response = await GET(new Request(URL_));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
    expect(showService.overview).not.toHaveBeenCalled();
  });
});

describe("POST /api/show", () => {
  it("creates a show for the administrator (201) and logs it without the game id", async () => {
    const response = await POST(post({ layout: "bot-bot", levels: [1, 1] }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, data: { gameId: "g-1", layout: "bot-bot", bots: [] } });
    expect(showService.create).toHaveBeenCalledWith("admin-1", { layout: "bot-bot", levels: [1, 1] });
    const line = String(warn.mock.calls.at(-1)![0]);
    expect(JSON.parse(line)).toMatchObject({ event: "security.show_created" });
    expect(line).not.toContain("g-1");
  });

  it("checks the gate before CSRF: a stranger's cross-site request is a 404 too", async () => {
    requireAdminApi.mockRejectedValue(notFound());
    const response = await POST(post({ layout: "bot-bot", levels: [1, 1] }, { origin: "https://evil.example" }));
    expect(response.status).toBe(404);
    expect(showService.create).not.toHaveBeenCalled();
  });

  it("checks CSRF before the body, and the body before the service", async () => {
    expect((await POST(post({ layout: "bot-bot", levels: [1, 1] }, { origin: "https://evil.example" }))).status).toBe(403);
    const invalid = await POST(post({ layout: "bot-bot", levels: [1, 3], extra: 1 }));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("VALIDATION");
    expect(showService.create).not.toHaveBeenCalled();
  });

  it("passes on the service's refusal", async () => {
    showService.create.mockRejectedValue(new ConflictError("Trwa już pokaz.", { code: "SHOW_RUNNING", data: { gameId: "g-0" } }));
    const response = await POST(post({ layout: "bot-bot", levels: [1, 1] }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({ code: "SHOW_RUNNING", data: { gameId: "g-0" } });
  });
});
