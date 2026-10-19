import { describe, expect, it } from "vitest";

import * as core from "./index";

describe("@gomoku/core public API", () => {
  it("exposes the DI helpers and the game rules", () => {
    expect(core).toMatchObject({
      createAppContainer: expect.any(Function),
      asClass: expect.any(Function),
      asFunction: expect.any(Function),
      asValue: expect.any(Function),
      BOARD_SIZE: 15,
      WIN_LENGTH: 5,
    });
  });
});
