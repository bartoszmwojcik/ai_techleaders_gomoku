import { ConflictError, TooManyRequestsError, UnauthorizedError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, hit, changeDisplayName, requireSession, serverConfig } = vi.hoisted(() => ({
  serverConfig: {
    production: true,
    trustProxyHops: 1,
    clientIpHeader: "x-forwarded-for",
    appOrigin: "https://gomoku.example",
    sessionCookieSecure: true,
  },
  connection: vi.fn(),
  hit: vi.fn(),
  changeDisplayName: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ requireSession }));
vi.mock("@/server/container", () => ({
  getContainer: vi.fn().mockResolvedValue({ cradle: { serverConfig } }),
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { serverConfig, rateLimiter: { hit }, userService: { changeDisplayName } } }),
}));

import { DISPLAY_NAME_CHANGE_LIMIT, DISPLAY_NAME_CHANGE_WINDOW_MS, PATCH } from "./route";

function patch(body: unknown, headers: Record<string, string> = {}) {
  const sent: Record<string, string> = { origin: serverConfig.appOrigin, "x-gomoku-request": "1", ...headers };
  for (const name of Object.keys(sent)) if (sent[name] === "") delete sent[name];
  return new Request("https://gomoku.example/api/auth/display-name", {
    method: "PATCH",
    headers: sent,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  hit.mockReset().mockResolvedValue(undefined);
  changeDisplayName.mockReset().mockResolvedValue("Nowa_7");
  requireSession.mockReset().mockResolvedValue({ id: "u1" });
});

describe("PATCH /api/auth/display-name", () => {
  it("counts the attempt, renames and answers 200 with the name", async () => {
    const response = await PATCH(patch({ displayName: " Nowa_7 " }));
    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { displayName: "Nowa_7" } });
    expect(hit).toHaveBeenCalledWith("display-name-change:user:u1", DISPLAY_NAME_CHANGE_LIMIT, DISPLAY_NAME_CHANGE_WINDOW_MS);
    expect(changeDisplayName).toHaveBeenCalledWith("u1", "Nowa_7");
    expect(DISPLAY_NAME_CHANGE_LIMIT).toBe(20);
    expect(DISPLAY_NAME_CHANGE_WINDOW_MS).toBe(3_600_000);
  });

  it("answers 401 without a session", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("Zaloguj."));
    expect((await PATCH(patch({ displayName: "Nowa_7" }))).status).toBe(401);
    expect(changeDisplayName).not.toHaveBeenCalled();
  });

  it("answers 400 for a reserved name without spending an attempt", async () => {
    const response = await PATCH(patch({ displayName: "Agent" }));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { fieldErrors: Record<string, string[]> } }).error.fieldErrors.displayName).toBeDefined();
    expect(hit).not.toHaveBeenCalled();
  });

  it("answers 409 for a taken name", async () => {
    changeDisplayName.mockRejectedValue(new ConflictError("Zajęta.", { fieldErrors: { displayName: ["Zajęta."] } }));
    expect((await PATCH(patch({ displayName: "Zajeta_7" }))).status).toBe(409);
  });

  it("answers 429 with Retry-After inside the window", async () => {
    changeDisplayName.mockRejectedValue(new TooManyRequestsError("Raz na dobę.", { code: "DISPLAY_NAME_COOLDOWN", retryAfterSeconds: 90 }));
    const response = await PATCH(patch({ displayName: "Nowa_7" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("90");
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("DISPLAY_NAME_COOLDOWN");
  });

  it("answers 429 over the attempt limit", async () => {
    hit.mockRejectedValue(new TooManyRequestsError("Za dużo prób.", { retryAfterSeconds: 30 }));
    expect((await PATCH(patch({ displayName: "Nowa_7" }))).status).toBe(429);
    expect(changeDisplayName).not.toHaveBeenCalled();
  });

  it("answers 403 without the CSRF header", async () => {
    expect((await PATCH(patch({ displayName: "Nowa_7" }, { "x-gomoku-request": "" }))).status).toBe(403);
    expect(requireSession).not.toHaveBeenCalled();
  });
});
