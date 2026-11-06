import { READY_DEADLINE_MS } from "@gomoku/core";
import { describe, expect, it } from "vitest";

import { gameDeadlineSql } from "./game-deadline-sql";

describe("gameDeadlineSql", () => {
  it("names the enclosing games row and falls back to the ready deadline", () => {
    const sql = gameDeadlineSql("g");
    expect(sql).toContain("where s.game_id = g.id");
    expect(sql).toContain(`started_at + ${READY_DEADLINE_MS} * interval '1 millisecond'`);
    expect(gameDeadlineSql("games")).toContain("where s.game_id = games.id");
  });
});
