import { describe, expect, it } from "vitest";

import { failure, fakeContext, ok, ROOT } from "../test-helpers";
import { migrations, migrationsLabel } from "./migrations.mjs";

const URL = "postgresql://gomoku:pw@localhost:5432/gomoku";

function contextWith(pendingMigrations: number | undefined) {
  const context = fakeContext({ env: { PATH: "/bin" } });
  context.ctx.state = { databaseUrl: URL, pendingMigrations };
  return context;
}

describe("migrations step", () => {
  it("skips when nothing is pending", async () => {
    const { ctx, run } = contextWith(0);

    await expect(migrations.run(ctx)).resolves.toEqual({ status: "skipped", detail: "pominięto: brak oczekujących migracji" });
    expect(run).not.toHaveBeenCalled();
  });

  it("applies pending migrations to the resolved database", async () => {
    const { ctx, run } = contextWith(3);
    run.mockResolvedValue(ok());

    await expect(migrations.run(ctx)).resolves.toEqual({ status: "done", detail: "zastosowano 3 migracje" });
    expect(run).toHaveBeenCalledWith("npm", ["run", "db:migration:up"], {
      cwd: ROOT,
      env: { PATH: "/bin", DATABASE_URL: URL },
      timeoutMs: 300_000,
    });
  });

  it("runs the migrations when the pending count is unknown", async () => {
    const { ctx, run } = contextWith(undefined);
    run.mockResolvedValue(ok());

    await expect(migrations.run(ctx)).resolves.toEqual({ status: "done", detail: "zastosowano oczekujące migracje" });
  });

  it("reports a failing or hanging migration with masked output", async () => {
    const { ctx, run } = contextWith(1);
    run.mockResolvedValueOnce(failure(1, "relation exists in postgresql://gomoku:pw@localhost/gomoku"));

    await expect(migrations.run(ctx)).resolves.toEqual({
      status: "failed",
      detail: "db:migration:up zakończone błędem (kod 1)",
      hint: "relation exists in postgresql://gomoku:***@localhost/gomoku",
    });

    run.mockResolvedValueOnce(failure(null, "", { timedOut: true }));
    await expect(migrations.run(ctx)).resolves.toMatchObject({ detail: "migracje przekroczyły limit czasu" });
  });
});

describe("migrationsLabel", () => {
  it.each([
    [1, "1 migrację"],
    [2, "2 migracje"],
    [4, "4 migracje"],
    [5, "5 migracji"],
    [12, "12 migracji"],
    [22, "22 migracje"],
  ])("%i → %s", (count, label) => {
    expect(migrationsLabel(count)).toBe(label);
  });
});
