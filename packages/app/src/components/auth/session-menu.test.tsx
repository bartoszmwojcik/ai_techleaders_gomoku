import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, getCurrentUser } = vi.hoisted(() => ({ connection: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ getCurrentUser }));
vi.mock("./account-menu", () => ({
  AccountMenu: ({ displayName }: { displayName: string }) => <button data-testid="menu">{displayName}</button>,
}));

import { SessionMenu } from "./session-menu";

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  getCurrentUser.mockReset();
});

describe("SessionMenu", () => {
  it("shows the menu of the signed-in player, read per request", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", displayName: "Ala_7" });

    expect(renderToStaticMarkup(await SessionMenu())).toBe('<button data-testid="menu">Ala_7</button>');
    expect(connection).toHaveBeenCalledOnce();
  });

  it("shows nothing to a guest", async () => {
    getCurrentUser.mockResolvedValue(null);

    expect(await SessionMenu()).toBeNull();
  });
});
