import { describe, expect, it } from "vitest";

import { entities } from "./index";
import { Session } from "./auth/session";

describe("entities registry", () => {
  it("lists the account entities with their tables", () => {
    const tables = entities.map((entity) => entity.meta.tableName);
    expect(tables).toEqual(["users", "sessions", "rate_limit_buckets"]);
  });

  it("declares the unique keys for e-mail, display-name key and token hash", () => {
    const [user, session] = entities;
    expect(user.meta.properties.email.unique).toBe(true);
    expect(user.meta.properties.displayNameKey.unique).toBe(true);
    expect(user.meta.properties.emailVerifiedAt.nullable).toBe(true);
    expect(session.meta.properties.tokenHash.unique).toBe(true);
  });
});

describe("entity discovery", () => {
  it("is accepted by MikroORM and maps the session to its user", async () => {
    const { createOrm } = await import("../orm");
    const orm = await createOrm();
    try {
      const sessionMeta = orm.getMetadata().get(Session.class);
      expect(sessionMeta.properties.user?.deleteRule).toBe("cascade");
      expect(sessionMeta.properties.tokenHash?.columnTypes[0]).toBe("char(64)");
    } finally {
      await orm.close();
    }
  });
});
