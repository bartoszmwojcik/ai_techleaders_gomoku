import { describe, expect, it } from "vitest";

import * as db from "./index";

describe("@gomoku/db public API", () => {
  it("exposes the ORM factory, the configuration and the entity registry", () => {
    expect(db).toMatchObject({
      createOrm: expect.any(Function),
      createOrmConfig: expect.any(Function),
      entities: expect.arrayContaining([]),
    });
  });
});
