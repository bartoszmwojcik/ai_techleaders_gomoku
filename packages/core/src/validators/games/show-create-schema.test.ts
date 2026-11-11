import { describe, expect, it } from "vitest";

import { SHOW_LAYOUTS, showCreateSchema } from "./show-create-schema";

describe("showCreateSchema", () => {
  it("names both layouts of the spec", () => {
    expect(SHOW_LAYOUTS).toEqual(["bot-bot", "bot-agent"]);
  });

  it("accepts bot vs bot with a level per bot", () => {
    expect(showCreateSchema.parse({ layout: "bot-bot", levels: [1, 2] })).toEqual({ layout: "bot-bot", levels: [1, 2] });
  });

  it.each([
    [{ layout: "bot-agent", botLevel: 1 }, ["layout"]],
    [{ layout: "agent-agent", levels: [1, 1] }, ["layout"]],
    [{ layout: "bot-bot", levels: [1, 3] }, ["levels", 1]],
    [{ layout: "bot-bot", levels: [1] }, ["levels"]],
    [{ layout: "bot-bot", levels: [1, 1, 1] }, ["levels"]],
    [{ layout: "bot-bot", levels: ["1", 1] }, ["levels", 0]],
    [{ layout: "bot-bot", levels: [1, 1], extra: true }, []],
    [{ layout: "bot-bot" }, ["levels"]],
  ])("refuses %j on %j", (body, path) => {
    const result = showCreateSchema.safeParse(body);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(path);
  });

  it("refuses a body that is not an object", () => {
    expect(showCreateSchema.safeParse(null).success).toBe(false);
    expect(showCreateSchema.safeParse([1, 1]).success).toBe(false);
  });
});
