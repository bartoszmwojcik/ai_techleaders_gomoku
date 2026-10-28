import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, getCurrentUser, redirect } = vi.hoisted(() => ({
  connection: vi.fn(),
  getCurrentUser: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("./forgot-password-form", () => ({
  ForgotPasswordForm: () => <form data-testid="forgot-form" />,
}));
vi.mock("@/server/http/auth", () => ({ getCurrentUser }));

import ForgotPasswordPage from "./page";

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  getCurrentUser.mockReset().mockResolvedValue(null);
  redirect.mockReset().mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

describe("ForgotPasswordPage", () => {
  it("renders the heading and the form for a guest, dynamically", async () => {
    const html = renderToStaticMarkup(await ForgotPasswordPage());
    expect(connection).toHaveBeenCalledOnce();
    expect(html).toContain("Nie pamiętasz hasła?</h1>");
    expect(html).toContain('data-testid="forgot-form"');
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends a signed-in player to the account page", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", displayName: "Ala_7", emailVerifiedAt: null });
    await expect(ForgotPasswordPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/account");
  });
});
