import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { failure, fakeContext, ok, ROOT } from "../test-helpers";
import { dependencies, lastLines, MARKER } from "./dependencies.mjs";

const LOCK = '{"lockfileVersion":3}';
const LOCK_HASH = createHash("sha256").update(LOCK).digest("hex");

describe("dependencies step", () => {
  it("skips when the marker matches the lockfile", async () => {
    const { ctx, run } = fakeContext({
      files: { "package-lock.json": LOCK, [MARKER]: JSON.stringify({ lockHash: LOCK_HASH }) },
    });

    await expect(dependencies.run(ctx)).resolves.toMatchObject({ status: "skipped" });
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    ["no marker", {}],
    ["a stale marker", { [MARKER]: JSON.stringify({ lockHash: "old" }) }],
    ["a corrupt marker", { [MARKER]: "{not json" }],
  ])("runs npm ci and writes the marker with %s", async (_, extra) => {
    const { ctx, run, file } = fakeContext({ files: { "package-lock.json": LOCK, ...extra }, env: { A: "1" } });
    run.mockResolvedValue(ok());

    await expect(dependencies.run(ctx)).resolves.toEqual({ status: "done", detail: "zainstalowano zależności (npm ci)" });
    expect(run).toHaveBeenCalledWith("npm", ["ci"], { cwd: ROOT, env: { A: "1" }, timeoutMs: 900_000 });
    expect(JSON.parse(file(MARKER)!)).toEqual({ lockHash: LOCK_HASH });
  });

  it("fails without writing the marker when npm ci fails", async () => {
    const { ctx, run, file } = fakeContext({ files: { "package-lock.json": LOCK } });
    run.mockResolvedValue(failure(1, "npm ERR! EPERM: operation not permitted"));

    const result = await dependencies.run(ctx);

    expect(result).toMatchObject({ status: "failed", detail: "npm ci zakończone błędem (kod 1)" });
    expect(result.hint).toContain("EPERM");
    expect(result.hint).toContain("npm run dev");
    expect(file(MARKER)).toBeUndefined();
  });

  it("reports a timeout", async () => {
    const { ctx, run } = fakeContext({ files: { "package-lock.json": LOCK } });
    run.mockResolvedValue(failure(null, "", { timedOut: true }));

    const result = await dependencies.run(ctx);

    expect(result).toMatchObject({ status: "failed", detail: "npm ci przekroczyło limit czasu" });
    expect(result.hint).not.toMatch(/^\n/);
  });
});

describe("lastLines", () => {
  it("keeps the tail of the output", () => {
    expect(lastLines("a\nb\nc\n", 2)).toBe("b\nc");
  });
});
