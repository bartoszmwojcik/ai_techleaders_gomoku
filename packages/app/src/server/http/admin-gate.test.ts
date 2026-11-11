import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { notFound, getCurrentUserWith } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  getCurrentUserWith: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("./auth", () => ({ getCurrentUserWith }));

import { isAdminSession, requireAdmin, requireAdminApi } from "./admin-gate";

const user = (over: object = {}) => ({
  id: "u-1",
  displayName: "Szef",
  email: "Admin@Example.com",
  emailVerifiedAt: new Date("2026-11-01T00:00:00Z"),
  ...over,
});

afterEach(() => vi.restoreAllMocks());

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

describe("requireAdmin security log", () => {
  it("logs a denial without the account", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    getCurrentUserWith.mockResolvedValue({ user: user({ email: "ala@example.com" }), data: "admin@example.com" });

    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");

    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0]![0] as string;
    expect(JSON.parse(line)).toMatchObject({ event: "security.admin_denied" });
    expect(line).not.toContain("ala@example.com");
  });

  it("logs nothing for the administrator", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    getCurrentUserWith.mockResolvedValue({ user: user(), data: "admin@example.com" });

    await requireAdmin();

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("isAdminSession", () => {
  it("is the administrator, or null for anybody else", async () => {
    getCurrentUserWith.mockResolvedValueOnce({ user: user(), data: "admin@example.com" });
    await expect(isAdminSession()).resolves.toMatchObject({ id: "u-1" });

    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    getCurrentUserWith.mockResolvedValueOnce(null);
    await expect(isAdminSession()).resolves.toBeNull();
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("requireAdminApi", () => {
  it("returns the administrator", async () => {
    getCurrentUserWith.mockResolvedValue({ user: user(), data: "admin@example.com" });

    await expect(requireAdminApi()).resolves.toMatchObject({ id: "u-1" });
  });

  it.each([
    ["no session", null],
    ["another player", { user: user({ email: "ala@example.com" }), data: "admin@example.com" }],
    ["an unconfirmed e-mail", { user: user({ emailVerifiedAt: null }), data: "admin@example.com" }],
    ["no ADMIN_EMAIL configured", { user: user(), data: undefined }],
  ])("throws the 404 of a missing game for %s, never notFound()", async (_label, current) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    getCurrentUserWith.mockResolvedValue(current);

    await expect(requireAdminApi()).rejects.toMatchObject({ status: 404, code: "NOT_FOUND", message: "Nie znaleziono partii." });
    expect(notFound).not.toHaveBeenCalled();
    expect(JSON.parse(warn.mock.calls[0]![0] as string)).toMatchObject({ event: "security.admin_denied" });
  });
});
