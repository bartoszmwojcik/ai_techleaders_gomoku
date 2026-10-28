import { ValidationError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, confirm, getContainer } = vi.hoisted(() => ({
  connection: vi.fn(),
  confirm: vi.fn(),
  getContainer: vi.fn(),
}));
const serverConfig = { appOrigin: "https://gomoku.example" };
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { emailVerificationService: { confirm } } }),
}));

import { POST } from "./route";

function post(body: unknown, headers: Record<string, string> = {}) {
  const sent: Record<string, string> = {
    origin: serverConfig.appOrigin,
    "x-gomoku-request": "1",
    ...headers,
  };
  for (const name of Object.keys(sent)) {
    if (sent[name] === "") delete sent[name];
  }
  return POST(
    new Request("https://gomoku.example/api/auth/email-verification/confirm", {
      method: "POST",
      headers: sent,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  confirm.mockReset().mockResolvedValue({ userId: "u1" });
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
});

describe("POST /api/auth/email-verification/confirm", () => {
  it("confirms the token without a session and returns a safe next path", async () => {
    const response = await post({ token: "tok", next: "/invite/abc" });

    expect(connection).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith("tok");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { next: "/invite/abc" },
    });
  });

  it.each([[undefined], ["//evil.com"], ["https://evil.com"]])(
    "falls back to / for next=%j",
    async (next) => {
      const response = await post({ token: "tok", next });
      expect((await response.json()).data).toEqual({ next: "/" });
    },
  );

  it("answers 400 INVALID_TOKEN with the uniform message", async () => {
    confirm.mockRejectedValue(
      new ValidationError("Link wygasł lub został już użyty.", {
        code: "INVALID_TOKEN",
      }),
    );

    const response = await post({ token: "used" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_TOKEN",
        message: "Link wygasł lub został już użyty.",
      },
    });
  });

  it.each([[{}], [{ token: "" }], ["not json"]])(
    "answers 400 VALIDATION for %j without touching the service",
    async (body) => {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION");
      expect(confirm).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["no CSRF header", { "x-gomoku-request": "" }],
    ["wrong origin", { origin: "https://evil.example" }],
  ])("answers 403 FORBIDDEN on %s", async (_name, headers) => {
    const response = await post({ token: "tok" }, headers);
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
    expect(confirm).not.toHaveBeenCalled();
  });
});
