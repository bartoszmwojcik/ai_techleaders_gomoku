import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, getCurrentUser, redirect } = vi.hoisted(() => ({
  connection: vi.fn(),
  getCurrentUser: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("./login-form", () => ({
  LoginForm: ({ nextPath }: { nextPath: string }) => <form data-testid="login-form" data-next={nextPath} />,
}));
vi.mock("@/server/http/auth", () => ({ getCurrentUser }));

import LoginPage from "./page";

const render = async (next?: string | string[]) =>
  renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ next }) }));

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  getCurrentUser.mockReset().mockResolvedValue(null);
  redirect.mockReset().mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

describe("LoginPage", () => {
  it("renders the heading and the form for a guest, dynamically", async () => {
    const html = await render();
    expect(connection).toHaveBeenCalledOnce();
    expect(html).toContain("Zaloguj się</h1>");
    expect(html).toContain('data-testid="login-form"');
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["/invite/abc", "/invite/abc"],
    ["//evil.com", "/"],
    [undefined, "/"],
  ])("redirects a signed-in player (next=%j) to %s", async (next, expected) => {
    getCurrentUser.mockResolvedValue({ id: "u1", displayName: "Ala_7", emailVerifiedAt: null });
    await expect(render(next)).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(expected);
  });

  it.each([
    ["/invite/abc", "/invite/abc"],
    [["/invite/abc", "/other"], "/invite/abc"],
    ["//evil.com", "/"],
    ["https://evil.com", "/"],
    [undefined, "/"],
  ])("passes next=%j to the form as %s", async (next, expected) => {
    expect(await render(next)).toContain(`data-next="${expected}"`);
  });
});
