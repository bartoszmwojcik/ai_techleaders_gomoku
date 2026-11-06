import { beforeEach, describe, expect, it, vi } from "vitest";

const { after, playDueMove } = vi.hoisted(() => ({ after: vi.fn(), playDueMove: vi.fn() }));
vi.mock("next/server", () => ({ after }));
vi.mock("../container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { botTurnService: { playDueMove } } }),
}));

import { botOnTurn, scheduleBotTurn } from "./bot-turn";

const account = { seat: 1 as const, kind: "account" as const, displayName: "Ala", seen: true };
const bot = { seat: 2 as const, kind: "bot" as const, displayName: "Bot · poziom 1", seen: true };

beforeEach(() => {
  after.mockReset();
  playDueMove.mockReset().mockResolvedValue("played");
});

describe("botOnTurn", () => {
  it("is true only in a game in progress whose seat on turn is the bot's", () => {
    expect(botOnTurn({ status: "active", turnSeat: 2, players: [account, bot] })).toBe(true);
    expect(botOnTurn({ status: "active", turnSeat: 1, players: [account, bot] })).toBe(false);
    expect(botOnTurn({ status: "finished", turnSeat: null, players: [account, bot] })).toBe(false);
    expect(botOnTurn({ status: "active", turnSeat: 2, players: [account, { ...bot, kind: "guest" }] })).toBe(false);
  });
});

describe("scheduleBotTurn", () => {
  it("runs the bot's move after the answer, in a request scope of its own", async () => {
    scheduleBotTurn("game-1");
    expect(after).toHaveBeenCalledOnce();
    expect(playDueMove).not.toHaveBeenCalled();
    await after.mock.calls[0]![0]();
    expect(playDueMove).toHaveBeenCalledWith("game-1");
  });
});
