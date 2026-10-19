import { describe, expect, it } from "vitest";

import { failure, fakeContext, ok, ROOT } from "../test-helpers";
import { browser } from "./browser.mjs";

describe("browser step", () => {
  it("is opt-in", async () => {
    const { ctx, run } = fakeContext();

    await expect(browser.run(ctx)).resolves.toEqual({ status: "skipped", detail: "pominięto (bez --with-browser)" });
    expect(run).not.toHaveBeenCalled();
  });

  it("installs Chrome for agent-browser with --with-browser", async () => {
    const { ctx, run } = fakeContext({ options: { withBrowser: true }, env: { PATH: "/bin" } });
    run.mockResolvedValue(ok());

    await expect(browser.run(ctx)).resolves.toEqual({ status: "done", detail: "Chrome dla agent-browser gotowy" });
    expect(run).toHaveBeenCalledWith("npx", ["agent-browser", "install"], { cwd: ROOT, env: { PATH: "/bin" }, timeoutMs: 600_000 });
  });

  it("reports a failed install with a hint about system libraries", async () => {
    const { ctx, run } = fakeContext({ options: { withBrowser: true } });
    run.mockResolvedValueOnce(failure(1, "download failed"));

    const result = await browser.run(ctx);
    expect(result).toMatchObject({ status: "failed", detail: "agent-browser install zakończone błędem" });
    expect(result.hint).toBe("download failed\nNa Linuksie brakujące biblioteki doinstaluje: npx agent-browser install --with-deps");

    run.mockResolvedValueOnce(failure(1));
    expect((await browser.run(ctx)).hint).toBe("Na Linuksie brakujące biblioteki doinstaluje: npx agent-browser install --with-deps");
  });
});
