import { ValidationError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, confirm, serverConfig } = vi.hoisted(() => ({
  connection: vi.fn(),
  confirm: vi.fn(),
  serverConfig: { production: true, trustProxyHops: 1, clientIpHeader: "x-forwarded-for", appOrigin: "https://gomoku.example" },
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/container", () => ({
  getContainer: vi.fn().mockResolvedValue({ cradle: { serverConfig } }),
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { serverConfig, emailChangeService: { confirm } } }),
}));

import { POST } from "./route";

function post(body: unknown, headers: Record<string, string> = {}) {
  const sent: Record<string, string> = { origin: serverConfig.appOrigin, "x-gomoku-request": "1", ...headers };
  for (const name of Object.keys(sent)) if (sent[name] === "") delete sent[name];
  return POST(
    new Request("https://gomoku.example/api/auth/email-change/confirm", { method: "POST", headers: sent, body: JSON.stringify(body) }),
  );
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  confirm.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/auth/email-change/confirm", () => {
  it("applies the change and answers 200", async () => {
    const response = await post({ token: "raw" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: null });
    expect(confirm).toHaveBeenCalledWith("raw");
  });

  it("answers 400 INVALID_TOKEN for a link that does not work", async () => {
    confirm.mockRejectedValue(new ValidationError("Link wygasł lub został już użyty.", { code: "INVALID_TOKEN" }));
    const response = await post({ token: "raw" });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("INVALID_TOKEN");
  });

  it("answers 400 for a missing token", async () => {
    expect((await post({})).status).toBe(400);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("answers 403 without the CSRF header", async () => {
    expect((await post({ token: "raw" }, { "x-gomoku-request": "" })).status).toBe(403);
  });
});
