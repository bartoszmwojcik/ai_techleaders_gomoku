import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, getCurrentUser, redirect } = vi.hoisted(() => ({
  connection: vi.fn(),
  getCurrentUser: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("./register-form", () => ({
  RegisterForm: ({ nextPath }: { nextPath: string }) => <form data-testid="register-form" data-next={nextPath} />,
}));
vi.mock("@/server/http/auth", () => ({ getCurrentUser }));

import RegisterPage from "./page";

const render = async (next?: string | string[]) =>
  renderToStaticMarkup(await RegisterPage({ searchParams: Promise.resolve({ next }) }));

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  getCurrentUser.mockReset().mockResolvedValue(null);
  redirect.mockReset().mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

describe("RegisterPage", () => {
  it("renders the heading and the form for a guest, dynamically", async () => {
    const html = await render();
    expect(connection).toHaveBeenCalledOnce();
    expect(html).toContain("Załóż konto</h1>");
    expect(html).toContain('data-testid="register-form"');
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects a signed-in player to the home page", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", displayName: "Ala_7", emailVerifiedAt: null });
    await expect(render("/invite/abc")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
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
