import { GoneError, TooManyRequestsError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUser, readGuestTokenHash, preview, headers } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  readGuestTokenHash: vi.fn(),
  preview: vi.fn(),
  headers: vi.fn(),
}));
const serverConfig = { production: false, trustProxyHops: 0, clientIpHeader: "x-forwarded-for", sessionCookieSecure: false };
vi.mock("next/headers", () => ({ headers }));
vi.mock("./auth", () => ({ getCurrentUser }));
vi.mock("./guest-cookie", () => ({ readGuestTokenHash }));
vi.mock("../container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { serverConfig, invitationService: { preview } } }),
}));

import { loadInvitationView } from "./invitation-view";

beforeEach(() => {
  getCurrentUser.mockReset().mockResolvedValue(null);
  readGuestTokenHash.mockReset().mockResolvedValue(undefined);
  headers.mockReset().mockResolvedValue(new Headers());
  preview.mockReset().mockResolvedValue({ creatorName: "Ala", state: "joinable" });
});

describe("loadInvitationView", () => {
  it("previews the code for an anonymous visitor with the pool of the request", async () => {
    const view = await loadInvitationView("ABCD-EFGH");
    expect(view).toEqual({ kind: "joinable", creatorName: "Ala", gameId: undefined, signedIn: false });
    expect(preview).toHaveBeenCalledWith(
      "ABCD-EFGH",
      { userId: undefined, guestTokenHash: undefined },
      expect.objectContaining({ key: expect.stringContaining("invitation-lookup:") }),
    );
  });

  it("passes the account and the guest token of the viewer", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    readGuestTokenHash.mockResolvedValue("hash");
    expect(await loadInvitationView("x")).toMatchObject({ kind: "joinable", signedIn: true });
    expect(preview.mock.calls[0]![1]).toEqual({ userId: "u1", guestTokenHash: "hash" });
  });

  it.each([["has-active-game"], ["has-own-waiting-game"]])("keeps the viewer's other game for %s", async (state) => {
    preview.mockResolvedValue({ creatorName: null, state, gameId: "g7" });
    expect(await loadInvitationView("x")).toEqual({ kind: state, creatorName: null, gameId: "g7", signedIn: false });
  });

  it.each([["own-invitation"], ["participant"]])("sends the %s viewer to the game", async (state) => {
    preview.mockResolvedValue({ creatorName: "Ala", state, gameId: "g1" });
    expect(await loadInvitationView("x")).toEqual({ kind: "redirect", gameId: "g1" });
  });

  it("answers invalid for the uniform 410", async () => {
    preview.mockRejectedValue(new GoneError("x", { code: "INVALID_INVITATION" }));
    expect(await loadInvitationView("x")).toEqual({ kind: "invalid" });
  });

  it("answers limit for a spent pool", async () => {
    preview.mockRejectedValue(new TooManyRequestsError("x"));
    expect(await loadInvitationView("x")).toEqual({ kind: "limit" });
  });

  it("lets other errors through", async () => {
    preview.mockRejectedValue(new Error("db down"));
    await expect(loadInvitationView("x")).rejects.toThrow("db down");
  });
});
