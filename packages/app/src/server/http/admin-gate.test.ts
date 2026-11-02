import { beforeEach, describe, expect, it, vi } from "vitest";

const { notFound, getCurrentUserWith } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  getCurrentUserWith: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("./auth", () => ({ getCurrentUserWith }));

import { requireAdmin } from "./admin-gate";

const user = (over: object = {}) => ({
  id: "u-1",
  displayName: "Szef",
  email: "Admin@Example.com",
  emailVerifiedAt: new Date("2026-11-01T00:00:00Z"),
  ...over,
});

beforeEach(() => {
  notFound.mockClear();
  getCurrentUserWith.mockReset();
});

describe("requireAdmin", () => {
  it("returns the administrator (the address compared after normalization)", async () => {
    getCurrentUserWith.mockResolvedValue({ user: user(), data: "admin@example.com" });

    await expect(requireAdmin()).resolves.toMatchObject({ id: "u-1" });
    expect(notFound).not.toHaveBeenCalled();
  });

  it("reads ADMIN_EMAIL from the configuration of the request scope", async () => {
    getCurrentUserWith.mockResolvedValue({ user: user(), data: "admin@example.com" });
    await requireAdmin();

    const read = getCurrentUserWith.mock.calls[0]![0] as (...args: unknown[]) => Promise<unknown>;
    await expect(read(user(), { serverConfig: { adminEmail: "a@b.pl" } }, { id: "s" })).resolves.toBe("a@b.pl");
  });

  it.each([
    ["no session", null],
    ["another player", { user: user({ email: "ala@example.com" }), data: "admin@example.com" }],
    ["an unconfirmed e-mail", { user: user({ emailVerifiedAt: null }), data: "admin@example.com" }],
    ["no ADMIN_EMAIL configured", { user: user(), data: undefined }],
  ])("answers 404 for %s", async (_label, current) => {
    getCurrentUserWith.mockResolvedValue(current);

    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
