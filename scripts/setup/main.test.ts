import { describe, expect, it, vi } from "vitest";

import { formatLine, main, parseArgs, USAGE, type Step } from "./main.mjs";
import type { Deps } from "./system.mjs";

function fakeDeps() {
  const lines: string[] = [];
  return { deps: { log: (line: string) => lines.push(line) } as unknown as Deps, lines };
}

const step = (label: string, result: Awaited<ReturnType<Step["run"]>>): Step => ({
  label,
  run: vi.fn().mockResolvedValue(result),
});

describe("parseArgs", () => {
  it("defaults every option to off", () => {
    expect(parseArgs([])).toEqual({ help: false, options: { withBrowser: false, dbFromEnv: false } });
  });

  it("reads the flags", () => {
    expect(parseArgs(["--with-browser", "--db-from-env"])).toEqual({
      help: false,
      options: { withBrowser: true, dbFromEnv: true },
    });
  });

  it("recognises help and rejects unknown options", () => {
    expect(parseArgs(["--with-browser", "-h"])).toEqual({ help: true });
    expect(parseArgs(["--help"])).toEqual({ help: true });
    expect(parseArgs(["--yes"])).toEqual({ error: "Nieznana opcja: --yes" });
  });
});

describe("formatLine", () => {
  it("prefixes the step with its status symbol", () => {
    expect(formatLine("Zależności", { status: "done", detail: "npm ci" })).toBe("✓ Zależności — npm ci");
    expect(formatLine("Zależności", { status: "skipped", detail: "pominięto" })).toBe("– Zależności — pominięto");
    expect(formatLine("Cel bazy", { status: "info", detail: "x" })).toBe("ℹ Cel bazy — x");
    expect(formatLine("Baza", { status: "failed", detail: "y" })).toBe("✗ Baza — y");
  });
});

describe("main", () => {
  it("runs every step in order with the parsed options and finishes with the next step", async () => {
    const { deps, lines } = fakeDeps();
    const first = step("Pierwszy", { status: "done", detail: "zrobione" });
    const second = step("Drugi", { status: "skipped", detail: "pominięto" });

    await expect(main(["--with-browser"], deps, [first, second])).resolves.toBe(0);

    expect(first.run).toHaveBeenCalledWith({ deps, options: { withBrowser: true, dbFromEnv: false }, state: {} });
    expect(lines).toEqual([
      "✓ Pierwszy — zrobione",
      "– Drugi — pominięto",
      "\nGotowe. Uruchom aplikację: npm run dev  (http://localhost:3000)",
    ]);
  });

  it("stops at the first failure and prints its hint", async () => {
    const { deps, lines } = fakeDeps();
    const later = step("Później", { status: "done", detail: "-" });

    const code = await main([], deps, [step("Baza", { status: "failed", detail: "brak", hint: "Uruchom PostgreSQL." }), later]);

    expect(code).toBe(1);
    expect(later.run).not.toHaveBeenCalled();
    expect(lines).toEqual([
      "✗ Baza — brak",
      "\nUruchom PostgreSQL.",
      "\nInstalator przerwany. Po usunięciu przyczyny uruchom ponownie: npm run setup",
    ]);
  });

  it("stops at a failure without a hint", async () => {
    const { deps, lines } = fakeDeps();

    await expect(main([], deps, [step("Krok", { status: "failed", detail: "błąd" })])).resolves.toBe(1);
    expect(lines).toHaveLength(2);
  });

  it("prints usage for --help and for an unknown option", async () => {
    const { deps, lines } = fakeDeps();

    await expect(main(["--help"], deps, [])).resolves.toBe(0);
    await expect(main(["--nope"], deps, [])).resolves.toBe(1);
    expect(lines).toEqual([USAGE, `Nieznana opcja: --nope\n\n${USAGE}`]);
  });

  it("uses the real dependencies and steps by default", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(main(["--help"])).resolves.toBe(0);
    expect(log).toHaveBeenCalledWith(USAGE);
    log.mockRestore();
  });
});
