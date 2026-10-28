import { describe, expect, it } from "vitest";

import { entities } from "./index";
import { EmailVerificationToken } from "./auth/email-verification-token";
import { PasswordResetToken } from "./auth/password-reset-token";
import { Session } from "./auth/session";

describe("entities registry", () => {
  it("lists the account entities with their tables", () => {
    const tables = entities.map((entity) => entity.meta.tableName);
    expect(tables).toEqual([
      "users",
      "sessions",
      "email_verification_tokens",
      "password_reset_tokens",
      "rate_limit_buckets",
    ]);
  });

  it("declares the unique keys for e-mail, display-name key and token hash", () => {
    const [user, session, verification, reset] = entities;
    expect(user.meta.properties.email.unique).toBe(true);
    expect(user.meta.properties.displayNameKey.unique).toBe(true);
    expect(user.meta.properties.emailVerifiedAt.nullable).toBe(true);
    expect(session.meta.properties.tokenHash.unique).toBe(true);
    expect(verification.meta.properties.tokenHash.unique).toBe(true);
    expect(reset.meta.properties.tokenHash.unique).toBe(true);
  });

  it("keeps the verification token usage marker nullable", () => {
    const { usedAt, expiresAt } = entities[2].meta.properties;
    expect(usedAt.nullable).toBe(true);
    expect(expiresAt.nullable).toBeFalsy();
  });

  it("keeps the reset token usage marker nullable and expiry required", () => {
    const { usedAt, expiresAt } = entities[3].meta.properties;
    expect(usedAt.nullable).toBe(true);
    expect(expiresAt.nullable).toBeFalsy();
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
      const tokenMeta = orm.getMetadata().get(EmailVerificationToken.class);
      expect(tokenMeta.properties.user?.deleteRule).toBe("cascade");
      expect(tokenMeta.properties.tokenHash?.columnTypes[0]).toBe("char(64)");
      const resetMeta = orm.getMetadata().get(PasswordResetToken.class);
      expect(resetMeta.properties.user?.deleteRule).toBe("cascade");
      expect(resetMeta.properties.tokenHash?.columnTypes[0]).toBe("char(64)");
    } finally {
      await orm.close();
    }
  });
});
