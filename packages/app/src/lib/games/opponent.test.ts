import { describe, expect, it } from "vitest";

import {
  BOT_LEVEL_OPTIONS,
  DEFAULT_OPPONENT,
  OPPONENT_OPTIONS,
  BOT_UNAVAILABLE_TEXT,
  botLevelOf,
  guestNickname,
  opponentBody,
  opponentOf,
  playsBot,
} from "./opponent";

describe("opponent setting (hosted-bot UI/UX)", () => {
  it("offers a person and the bot, and one chip per level", () => {
    expect(OPPONENT_OPTIONS.map(({ label }) => label)).toEqual(["Osoba (zaproszenie)", "Bot"]);
    expect(BOT_LEVEL_OPTIONS).toEqual([
      { value: "1", label: "Poziom 1" },
      { value: "2", label: "Poziom 2" },
    ]);
    expect(DEFAULT_OPPONENT).toEqual({ opponent: "human", botLevel: 1 });
  });

  it("plays the bot only in the classic game and sends it only then", () => {
    const bot = { opponent: "bot" as const, botLevel: 2 as const };
    expect(playsBot(bot, "classic")).toBe(true);
    expect(playsBot(bot, "paper")).toBe(false);
    expect(playsBot(DEFAULT_OPPONENT, "classic")).toBe(false);
    expect(opponentBody(bot, "classic")).toEqual({ opponent: "bot", botLevel: 2 });
    expect(opponentBody(bot, "paper")).toEqual({});
    expect(opponentBody(DEFAULT_OPPONENT, "classic")).toEqual({});
  });

  it("reads the picked chips", () => {
    expect(opponentOf("bot")).toBe("bot");
    expect(opponentOf("human")).toBe("human");
    expect(opponentOf("x")).toBe("human");
    expect(botLevelOf("2")).toBe(2);
    expect(botLevelOf("1")).toBe(1);
    expect(botLevelOf("x")).toBe(1);
  });

  it("shares the refusal text with the server", () => {
    expect(BOT_UNAVAILABLE_TEXT).toBe("Bot jest teraz niedostępny. Spróbuj za chwilę albo zaproś osobę.");
  });

  it("keeps only a guest's own nickname for the next game with the bot", () => {
    expect(guestNickname("guest", "Ala", 1)).toBe("Ala");
    expect(guestNickname("guest", "Gracz 1", 1)).toBeUndefined();
    expect(guestNickname("guest", undefined, 1)).toBeUndefined();
    expect(guestNickname("guest", null, 1)).toBeUndefined();
    expect(guestNickname("account", "Ala", 1)).toBeUndefined();
  });
});
