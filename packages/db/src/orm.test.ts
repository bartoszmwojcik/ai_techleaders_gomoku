import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";

import { createOrm } from "./orm";

describe("createOrm", () => {
  it("creates an ORM with the shared configuration without connecting to the database", async () => {
    // Port 1 is never a PostgreSQL server: init must not open a connection (MikroORM v7 is lazy).
    const orm = await createOrm({ clientUrl: "postgresql://nobody:nothing@127.0.0.1:1/none" });
    try {
      expect(orm).toBeInstanceOf(MikroORM);
      expect(orm.config.get("clientUrl")).toBe("postgresql://nobody:nothing@127.0.0.1:1/none");
      expect(orm.config.get("pool")).toMatchObject({ min: 0, max: 10 });
    } finally {
      await orm.close();
    }
  });
});
