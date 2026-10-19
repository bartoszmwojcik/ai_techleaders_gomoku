import { describe, expect, it } from "vitest";

import { fakeContext } from "../test-helpers";
import { envLocal } from "./env-local.mjs";

describe("env-local step", () => {
  it("never touches an existing .env.local", async () => {
    const { ctx, fs, file } = fakeContext({ files: { ".env.local": "DATABASE_URL=mine", ".env.example": "X=1" } });

    await expect(envLocal.run(ctx)).resolves.toMatchObject({ status: "skipped" });
    expect(fs.copyFileSync).not.toHaveBeenCalled();
    expect(file(".env.local")).toBe("DATABASE_URL=mine");
  });

  it("creates .env.local from .env.example", async () => {
    const { ctx, file } = fakeContext({ files: { ".env.example": "DATABASE_URL=example" } });

    await expect(envLocal.run(ctx)).resolves.toEqual({ status: "done", detail: "utworzono .env.local z .env.example" });
    expect(file(".env.local")).toBe("DATABASE_URL=example");
  });

  it("fails when .env.example is missing", async () => {
    const { ctx } = fakeContext();

    await expect(envLocal.run(ctx)).resolves.toMatchObject({ status: "failed", detail: "brak .env.example" });
  });
});
