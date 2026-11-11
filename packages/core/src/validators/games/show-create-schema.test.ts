import { describe, expect, it } from "vitest";

import { SHOW_LAYOUTS, showCreateSchema, showLevels } from "./show-create-schema";

describe("showCreateSchema", () => {
  it("names both layouts of the spec", () => {
    expect(SHOW_LAYOUTS).toEqual(["bot-bot", "bot-agent"]);
  });

  it("accepts bot vs bot with a level per bot", () => {
    expect(showCreateSchema.parse({ layout: "bot-bot", levels: [1, 2] })).toEqual({ layout: "bot-bot", levels: [1, 2] });
  });

  it.each([1, 2])("accepts bot vs agent with the bot's level %i", (botLevel) => {
    expect(showCreateSchema.parse({ layout: "bot-agent", botLevel })).toEqual({ layout: "bot-agent", botLevel });
  });

  it.each([
    [{ layout: "agent-agent", levels: [1, 1] }, ["layout"]],
    [{ levels: [1, 1] }, ["layout"]],
    [{ layout: "bot-bot", levels: [1, 3] }, ["levels", 1]],
    [{ layout: "bot-bot", levels: [1] }, ["levels"]],
    [{ layout: "bot-bot", levels: [1, 1, 1] }, ["levels"]],
    [{ layout: "bot-bot", levels: ["1", 1] }, ["levels", 0]],
    [{ layout: "bot-bot", levels: [1, 1], extra: true }, []],
    [{ layout: "bot-bot" }, ["levels"]],
    [{ layout: "bot-bot", botLevel: 1 }, ["levels"]],
    [{ layout: "bot-agent" }, ["botLevel"]],
    [{ layout: "bot-agent", botLevel: 3 }, ["botLevel"]],
    [{ layout: "bot-agent", levels: [1, 1] }, ["botLevel"]],
    [{ layout: "bot-agent", botLevel: 1, levels: [1, 1] }, []],
  ])("refuses %j on %j", (body, path) => {
    const result = showCreateSchema.safeParse(body);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(path);
  });

  it("names a wrong layout and a body that is not an object", () => {
    expect(showCreateSchema.safeParse({ layout: "x" }).error?.issues[0]?.message).toBe("Nieprawidłowy układ pokazu.");
    expect(showCreateSchema.safeParse(null).success).toBe(false);
    expect(showCreateSchema.safeParse([1, 1]).success).toBe(false);
  });
});

describe("showLevels", () => {
  it("lists the bots' levels, seat 1 first", () => {
    expect(showLevels({ layout: "bot-bot", levels: [2, 1] })).toEqual([2, 1]);
    expect(showLevels({ layout: "bot-agent", botLevel: 2 })).toEqual([2]);
  });
});
