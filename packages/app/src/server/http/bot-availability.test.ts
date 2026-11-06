import { describe, expect, it, vi } from "vitest";

const { getContainer } = vi.hoisted(() => ({ getContainer: vi.fn() }));
vi.mock("../container", () => ({ getContainer }));

import { isBotEnabled } from "./bot-availability";

describe("isBotEnabled", () => {
  it("reads BOT_ENABLED from the server configuration", async () => {
    getContainer.mockResolvedValue({ cradle: { serverConfig: { botEnabled: true } } });
    await expect(isBotEnabled()).resolves.toBe(true);
    getContainer.mockResolvedValue({ cradle: { serverConfig: { botEnabled: false } } });
    await expect(isBotEnabled()).resolves.toBe(false);
  });
});
