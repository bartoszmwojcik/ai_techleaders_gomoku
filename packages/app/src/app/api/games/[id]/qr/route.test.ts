import { NotFoundError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, resolveParticipant, resolveSpectator, svgFor } = vi.hoisted(() => ({
  connection: vi.fn(),
  resolveParticipant: vi.fn(),
  resolveSpectator: vi.fn(),
  svgFor: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/participant", () => ({ resolveParticipant }));
vi.mock("@/server/http/spectator", () => ({ resolveSpectator }));
vi.mock("@/server/container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { inviteQrService: { svgFor } } }),
}));

import { GET } from "./route";

const get = () => GET(new Request("https://gomoku.example/api/games/g1/qr"), { params: Promise.resolve({ id: "g1" }) });

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  resolveParticipant.mockReset().mockResolvedValue({ gameId: "g1", participant: { playerId: "p1" } });
  resolveSpectator.mockReset().mockRejectedValue(new NotFoundError("Nie znaleziono."));
  svgFor.mockReset().mockResolvedValue("<svg/>");
});

describe("GET /api/games/[id]/qr", () => {
  it("answers a player with an SVG image that no cache keeps", async () => {
    const response = await get();

    expect(connection).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<svg/>");
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(svgFor).toHaveBeenCalledWith("g1");
    expect(resolveSpectator).not.toHaveBeenCalled();
  });

  it("answers a spectator too", async () => {
    resolveParticipant.mockRejectedValue(new NotFoundError("Nie znaleziono."));
    resolveSpectator.mockResolvedValue({ gameId: "g1", spectator: { spectatorId: "s1" } });

    expect((await get()).status).toBe(200);
  });

  it("answers 404 to anybody else, in JSON, without making a code", async () => {
    resolveParticipant.mockRejectedValue(new NotFoundError("Nie znaleziono."));

    const response = await get();

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false });
    expect(svgFor).not.toHaveBeenCalled();
  });

  it("does not take another failure of the player guard for a stranger", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    resolveParticipant.mockRejectedValue(new Error("database down"));

    expect((await get()).status).toBe(500);
    expect(resolveSpectator).not.toHaveBeenCalled();
  });

  it("answers 404 when the game has no code to show any more", async () => {
    svgFor.mockRejectedValue(new NotFoundError("Nie znaleziono."));

    expect((await get()).status).toBe(404);
  });
});
