import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, getCurrentUser } = vi.hoisted(() => ({
  connection: vi.fn(),
  getCurrentUser: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ getCurrentUser }));
vi.mock("./confirm-email", () => ({
  ConfirmEmail: (props: Record<string, unknown>) => (
    <div data-testid="confirm" data-props={JSON.stringify(props)} />
  ),
}));

import VerifyEmailPage from "./page";

async function props(params: { token?: string | string[]; next?: string | string[] }) {
  const html = renderToStaticMarkup(
    await VerifyEmailPage({ searchParams: Promise.resolve(params) }),
  );
  const raw = /data-props="([^"]*)"/.exec(html)?.[1] as string;
  return JSON.parse(raw.replaceAll("&quot;", '"')) as Record<string, unknown>;
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  getCurrentUser.mockReset().mockResolvedValue(null);
});

describe("VerifyEmailPage", () => {
  it("is dynamic and only passes data on: reading the page confirms nothing", async () => {
    expect(await props({ token: "tok" })).toEqual({
      token: "tok",
      nextPath: "/",
      signedIn: false,
      alreadyVerified: false,
    });
    expect(connection).toHaveBeenCalledOnce();
  });

  it.each([
    [undefined, undefined],
    ["", undefined],
    [["a", "b"], "a"],
  ])("takes the first token (%j)", async (token, expected) => {
    expect((await props({ token }) as { token?: string }).token).toBe(expected);
  });

  it.each([
    ["/invite/abc", "/invite/abc"],
    [["/invite/abc", "/other"], "/invite/abc"],
    ["//evil.com", "/"],
    ["https://evil.com", "/"],
    [undefined, "/"],
  ])("passes next=%j as %s", async (next, expected) => {
    expect((await props({ token: "t", next })).nextPath).toBe(expected);
  });

  it("tells the form whether the visitor is signed in and already confirmed", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", emailVerifiedAt: null });
    expect(await props({ token: "t" })).toMatchObject({ signedIn: true, alreadyVerified: false });

    getCurrentUser.mockResolvedValue({ id: "u1", emailVerifiedAt: new Date() });
    expect(await props({ token: "t" })).toMatchObject({ signedIn: true, alreadyVerified: true });
  });
});
