import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const i18nRequest = vi.hoisted(() => ({ lang: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "gomoku_lang" && i18nRequest.lang ? { name, value: i18nRequest.lang } : undefined) }),
  headers: async () => new Headers(),
}));

const { connection } = vi.hoisted(() => ({ connection: vi.fn() }));
vi.mock("next/server", () => ({ connection }));
vi.mock("./reset-password-form", () => ({
  ResetPasswordForm: ({ token }: { token?: string }) => <form data-testid="reset-form" data-token={token ?? ""} />,
}));

import ResetPasswordPage from "./page";

const render = async (token?: string | string[]) =>
  renderToStaticMarkup(await ResetPasswordPage({ searchParams: Promise.resolve({ token }) }));

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
});

describe("ResetPasswordPage", () => {
  it("renders the heading and the form, dynamically", async () => {
    const html = await render("abc");
    expect(connection).toHaveBeenCalledOnce();
    expect(html).toContain("Ustaw nowe hasło</h1>");
    expect(html).toContain('data-testid="reset-form"');
  });

  it.each([
    ["abc", "abc"],
    [["first", "second"], "first"],
    ["", ""],
    [undefined, ""],
  ])("passes token=%j to the form as %j", async (token, expected) => {
    expect(await render(token)).toContain(`data-token="${expected}"`);
  });
});
