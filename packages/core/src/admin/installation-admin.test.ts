import { describe, expect, it } from "vitest";

import { isInstallationAdmin } from "./installation-admin";

describe("isInstallationAdmin", () => {
  it.each(["admin@example.com", "Admin@Example.COM", "  admin@example.com  ", "ADMIN@EXAMPLE.COM"])(
    "recognizes %j",
    (email) => {
      expect(isInstallationAdmin(email, "admin@example.com")).toBe(true);
      expect(isInstallationAdmin("admin@example.com", ` ${email.toUpperCase()} `)).toBe(true);
    },
  );

  it("rejects another address", () => {
    expect(isInstallationAdmin("other@example.com", "admin@example.com")).toBe(false);
  });

  it("nobody is an administrator without a configured address", () => {
    expect(isInstallationAdmin("admin@example.com", undefined)).toBe(false);
    expect(isInstallationAdmin("admin@example.com", "")).toBe(false);
  });
});
